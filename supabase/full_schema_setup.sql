-- ============================================================================
-- ProofLoop: Full Database & Storage Setup Script
-- Project: https://jttdwdzvivyubytnlipy.supabase.co
-- Run this in your Supabase SQL Editor: Dashboard -> SQL Editor -> New Query
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Create Jobs Sequence and Table
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS job_number_seq START WITH 1001;

CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_number TEXT NOT NULL UNIQUE DEFAULT ('JOB-' || LPAD(nextval('job_number_seq')::TEXT, 5, '0')),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,
  job_title TEXT NOT NULL,
  requirements TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  due_date DATE,
  internal_notes TEXT,
  status TEXT NOT NULL DEFAULT 'awaiting_proof' CHECK (
    status IN (
      'awaiting_proof',
      'awaiting_customer',
      'changes_requested',
      'approved',
      'in_production',
      'quality_check',
      'ready_for_delivery',
      'completed',
      'cancelled'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_jobs_id_owner UNIQUE (id, owner_id)
);

-- Trigger: assign job_number if missing
CREATE OR REPLACE FUNCTION public.set_job_number_if_missing()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.job_number IS NULL OR NEW.job_number = '' THEN
    NEW.job_number := 'JOB-' || LPAD(nextval('job_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_job_number ON public.jobs;
CREATE TRIGGER trigger_set_job_number
BEFORE INSERT ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_job_number_if_missing();

-- Trigger: auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_jobs_timestamp ON public.jobs;
CREATE TRIGGER trigger_update_jobs_timestamp
BEFORE UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

-- Jobs indexes
CREATE INDEX IF NOT EXISTS idx_jobs_owner_id ON public.jobs (owner_id);
CREATE INDEX IF NOT EXISTS idx_jobs_owner_status ON public.jobs (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_owner_created_at ON public.jobs (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_job_number ON public.jobs (job_number);

-- Jobs RLS
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can select their own jobs" ON public.jobs;
CREATE POLICY "Owners can select their own jobs"
ON public.jobs FOR SELECT TO authenticated
USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can insert their own jobs" ON public.jobs;
CREATE POLICY "Owners can insert their own jobs"
ON public.jobs FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can update their own jobs" ON public.jobs;
CREATE POLICY "Owners can update their own jobs"
ON public.jobs FOR UPDATE TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can delete their own jobs" ON public.jobs;
CREATE POLICY "Owners can delete their own jobs"
ON public.jobs FOR DELETE TO authenticated
USING (auth.uid() = owner_id);

-- ----------------------------------------------------------------------------
-- 2. Create Proof Versions Table & Trigger
-- ----------------------------------------------------------------------------
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

-- Trigger: assign sequential version numbers safely
CREATE OR REPLACE FUNCTION public.assign_proof_version_number()
RETURNS TRIGGER AS $$
DECLARE
  max_v INTEGER;
BEGIN
  IF NEW.version_number IS NULL OR NEW.version_number <= 0 THEN
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

-- Proof Versions indexes
CREATE INDEX IF NOT EXISTS idx_proof_versions_job_id ON public.proof_versions (job_id);
CREATE INDEX IF NOT EXISTS idx_proof_versions_owner_id ON public.proof_versions (owner_id);
CREATE INDEX IF NOT EXISTS idx_proof_versions_job_version ON public.proof_versions (job_id, version_number DESC);

-- Proof Versions RLS
ALTER TABLE public.proof_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view their own proof versions" ON public.proof_versions;
CREATE POLICY "Owners can view their own proof versions"
ON public.proof_versions FOR SELECT TO authenticated
USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can insert their own proof versions" ON public.proof_versions;
CREATE POLICY "Owners can insert their own proof versions"
ON public.proof_versions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id);

-- ----------------------------------------------------------------------------
-- 3. Configure Private Storage Bucket 'proof-files' & Storage Policies
-- ----------------------------------------------------------------------------
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

DROP POLICY IF EXISTS "Authenticated owners can upload proof files" ON storage.objects;
CREATE POLICY "Authenticated owners can upload proof files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'proof-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Authenticated owners can view proof files" ON storage.objects;
CREATE POLICY "Authenticated owners can view proof files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'proof-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Authenticated owners can delete proof files for cleanup" ON storage.objects;
CREATE POLICY "Authenticated owners can delete proof files for cleanup"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'proof-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
