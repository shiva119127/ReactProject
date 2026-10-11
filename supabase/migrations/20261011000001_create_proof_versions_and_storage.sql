-- ProofLoop Step 4: Proof Versions and Private Storage Migration
-- Creates the proof_versions table and configures the private 'proof-files' bucket

-- 1. Ensure compound unique constraint on jobs for composite foreign key integrity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_jobs_id_owner'
  ) THEN
    ALTER TABLE public.jobs ADD CONSTRAINT uq_jobs_id_owner UNIQUE (id, owner_id);
  END IF;
END $$;

-- 2. Create the proof_versions table
CREATE TABLE IF NOT EXISTS public.proof_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  storage_path TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_proof_job_owner FOREIGN KEY (job_id, owner_id) REFERENCES public.jobs(id, owner_id) ON DELETE CASCADE,
  CONSTRAINT uq_job_version UNIQUE (job_id, version_number)
);

-- 3. Trigger to assign sequential version numbers safely on concurrent requests
CREATE OR REPLACE FUNCTION public.assign_proof_version_number()
RETURNS TRIGGER AS $$
DECLARE
  max_v INTEGER;
BEGIN
  IF NEW.version_number IS NULL OR NEW.version_number <= 0 THEN
    -- Serialize concurrent inserts for this job
    PERFORM 1 FROM public.jobs WHERE id = NEW.job_id FOR UPDATE;

    SELECT COALESCE(MAX(version_number), 0) INTO max_v
    FROM public.proof_versions
    WHERE job_id = NEW.job_id;

    NEW.version_number := max_v + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_assign_proof_version ON public.proof_versions;
CREATE TRIGGER trigger_assign_proof_version
BEFORE INSERT ON public.proof_versions
FOR EACH ROW
EXECUTE FUNCTION public.assign_proof_version_number();

-- 4. Indexes for proof_versions table
CREATE INDEX IF NOT EXISTS idx_proof_versions_job_id ON public.proof_versions (job_id);
CREATE INDEX IF NOT EXISTS idx_proof_versions_owner_id ON public.proof_versions (owner_id);
CREATE INDEX IF NOT EXISTS idx_proof_versions_job_version ON public.proof_versions (job_id, version_number DESC);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.proof_versions ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies on proof_versions (Only read and insert allowed)
DROP POLICY IF EXISTS "Owners can view their own proof versions" ON public.proof_versions;
CREATE POLICY "Owners can view their own proof versions"
ON public.proof_versions
FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can insert their own proof versions" ON public.proof_versions;
CREATE POLICY "Owners can insert their own proof versions"
ON public.proof_versions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

-- Note: No UPDATE or DELETE policies are provided to prevent overwriting or deleting proof records.

-- 7. Configure Private Storage Bucket 'proof-files'
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'proof-files',
  'proof-files',
  false,
  20971520, -- 20 MB limit
  ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY['application/pdf', 'image/png', 'image/jpeg'];

-- 8. Storage RLS Policies for proof-files bucket
DROP POLICY IF EXISTS "Authenticated owners can upload proof files" ON storage.objects;
CREATE POLICY "Authenticated owners can upload proof files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'proof-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Authenticated owners can view proof files" ON storage.objects;
CREATE POLICY "Authenticated owners can view proof files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'proof-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Authenticated owners can delete proof files for cleanup" ON storage.objects;
CREATE POLICY "Authenticated owners can delete proof files for cleanup"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'proof-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
