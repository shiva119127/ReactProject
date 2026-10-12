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

-- ----------------------------------------------------------------------------
-- 4. Create Proof Submissions Table & Atomic Review Function (Step 5)
-- ----------------------------------------------------------------------------

-- Ensure composite unique constraint on proof_versions for foreign key integrity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_proof_version_id_job_owner'
  ) THEN
    ALTER TABLE public.proof_versions ADD CONSTRAINT uq_proof_version_id_job_owner UNIQUE (id, job_id, owner_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.proof_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  proof_version_id UUID NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (
    status IN ('pending_review', 'superseded')
  ),
  CONSTRAINT fk_submission_job_owner FOREIGN KEY (job_id, owner_id)
    REFERENCES public.jobs(id, owner_id) ON DELETE CASCADE,
  CONSTRAINT fk_submission_proof_job_owner FOREIGN KEY (proof_version_id, job_id, owner_id)
    REFERENCES public.proof_versions(id, job_id, owner_id) ON DELETE CASCADE
);

-- Partial Unique Index: enforce at most ONE active pending_review submission per job
CREATE UNIQUE INDEX IF NOT EXISTS uq_idx_one_pending_submission_per_job
ON public.proof_submissions (job_id)
WHERE (status = 'pending_review');

-- Submissions indexes
CREATE INDEX IF NOT EXISTS idx_proof_submissions_job_id ON public.proof_submissions (job_id);
CREATE INDEX IF NOT EXISTS idx_proof_submissions_owner_id ON public.proof_submissions (owner_id);
CREATE INDEX IF NOT EXISTS idx_proof_submissions_proof_version_id ON public.proof_submissions (proof_version_id);
CREATE INDEX IF NOT EXISTS idx_proof_submissions_job_created ON public.proof_submissions (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proof_submissions_status ON public.proof_submissions (status);

-- Submissions RLS
ALTER TABLE public.proof_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view their own proof submissions" ON public.proof_submissions;
CREATE POLICY "Owners can view their own proof submissions"
ON public.proof_submissions FOR SELECT TO authenticated
USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can insert their own proof submissions" ON public.proof_submissions;
CREATE POLICY "Owners can insert their own proof submissions"
ON public.proof_submissions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id);

-- Atomic RPC function: submit_proof_for_review
CREATE OR REPLACE FUNCTION public.submit_proof_for_review(
  p_job_id UUID,
  p_proof_version_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id UUID;
  v_job RECORD;
  v_proof RECORD;
  v_new_submission RECORD;
  v_updated_job RECORD;
BEGIN
  -- Derive authenticated owner from auth.uid()
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: session is invalid or user is not signed in.';
  END IF;

  IF p_job_id IS NULL OR p_proof_version_id IS NULL THEN
    RAISE EXCEPTION 'Job ID and Proof Version ID are required.';
  END IF;

  -- Lock and retrieve job record
  SELECT * INTO v_job
  FROM public.jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  -- Verify job ownership
  IF v_job.owner_id <> v_owner_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not have permission to submit proofs for this job.';
  END IF;

  -- Verify job status
  IF v_job.status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'Cannot submit proof for customer review: job is %.', v_job.status;
  END IF;

  -- Verify proof version record
  SELECT * INTO v_proof
  FROM public.proof_versions
  WHERE id = p_proof_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected proof version not found.';
  END IF;

  -- Verify proof ownership and job association
  IF v_proof.owner_id <> v_owner_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not have permission to submit this proof version.';
  END IF;

  IF v_proof.job_id <> p_job_id THEN
    RAISE EXCEPTION 'Selected proof version does not belong to this job.';
  END IF;

  -- Supersede existing pending_review submissions for this job atomically
  UPDATE public.proof_submissions
  SET status = 'superseded'
  WHERE job_id = p_job_id
    AND status = 'pending_review';

  -- Insert new submission record
  INSERT INTO public.proof_submissions (
    job_id,
    proof_version_id,
    owner_id,
    status
  )
  VALUES (
    p_job_id,
    p_proof_version_id,
    v_owner_id,
    'pending_review'
  )
  RETURNING * INTO v_new_submission;

  -- Update job status to awaiting_customer
  UPDATE public.jobs
  SET status = 'awaiting_customer',
      updated_at = NOW()
  WHERE id = p_job_id
  RETURNING * INTO v_updated_job;

  RETURN jsonb_build_object(
    'submission', row_to_json(v_new_submission),
    'job', row_to_json(v_updated_job)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_proof_for_review(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_proof_for_review(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Create Secure Customer Review Links & Verification (Step 6)
-- ----------------------------------------------------------------------------

-- Ensure composite unique constraint on proof_submissions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_proof_submissions_id_job_owner'
  ) THEN
    ALTER TABLE public.proof_submissions ADD CONSTRAINT uq_proof_submissions_id_job_owner UNIQUE (id, job_id, owner_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.proof_review_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL,
  job_id UUID NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_review_link_submission_job_owner FOREIGN KEY (submission_id, job_id, owner_id)
    REFERENCES public.proof_submissions(id, job_id, owner_id) ON DELETE CASCADE,
  CONSTRAINT fk_review_link_job_owner FOREIGN KEY (job_id, owner_id)
    REFERENCES public.jobs(id, owner_id) ON DELETE CASCADE
);

-- Review links indexes
CREATE INDEX IF NOT EXISTS idx_proof_review_links_submission_id ON public.proof_review_links (submission_id);
CREATE INDEX IF NOT EXISTS idx_proof_review_links_job_id ON public.proof_review_links (job_id);
CREATE INDEX IF NOT EXISTS idx_proof_review_links_owner_id ON public.proof_review_links (owner_id);
CREATE INDEX IF NOT EXISTS idx_proof_review_links_token_hash ON public.proof_review_links (token_hash);
CREATE INDEX IF NOT EXISTS idx_proof_review_links_expires_at ON public.proof_review_links (expires_at);
CREATE INDEX IF NOT EXISTS idx_proof_review_links_created_at ON public.proof_review_links (created_at DESC);

-- Review links RLS
ALTER TABLE public.proof_review_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view their own review links" ON public.proof_review_links;
CREATE POLICY "Owners can view their own review links"
ON public.proof_review_links FOR SELECT TO authenticated
USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can insert their own review links" ON public.proof_review_links;
CREATE POLICY "Owners can insert their own review links"
ON public.proof_review_links FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can update their own review links" ON public.proof_review_links;
CREATE POLICY "Owners can update their own review links"
ON public.proof_review_links FOR UPDATE TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

-- Storage access policy for active review links
DROP POLICY IF EXISTS "Customers with active review link can view submitted proof file" ON storage.objects;
CREATE POLICY "Customers with active review link can view submitted proof file"
ON storage.objects FOR SELECT TO anon
USING (
  bucket_id = 'proof-files' AND
  EXISTS (
    SELECT 1
    FROM public.proof_versions pv
    JOIN public.proof_submissions ps ON ps.proof_version_id = pv.id
    JOIN public.proof_review_links prl ON prl.submission_id = ps.id
    JOIN public.jobs j ON j.id = ps.job_id
    WHERE pv.storage_path = storage.objects.name
      AND ps.status = 'pending_review'
      AND prl.revoked_at IS NULL
      AND prl.expires_at > NOW()
      AND j.status NOT IN ('cancelled', 'completed')
  )
);

-- Function: create_proof_review_link
CREATE OR REPLACE FUNCTION public.create_proof_review_link(
  p_submission_id UUID,
  p_expires_in_days INT DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_owner_id UUID;
  v_submission RECORD;
  v_job RECORD;
  v_raw_token TEXT;
  v_token_hash TEXT;
  v_expires_at TIMESTAMPTZ;
  v_new_link RECORD;
  v_valid_days INT;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: session is invalid or user is not signed in.';
  END IF;

  IF p_submission_id IS NULL THEN
    RAISE EXCEPTION 'Submission ID is required.';
  END IF;

  v_valid_days := COALESCE(p_expires_in_days, 7);
  IF v_valid_days < 1 OR v_valid_days > 30 THEN
    v_valid_days := 7;
  END IF;

  SELECT * INTO v_submission
  FROM public.proof_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proof submission not found.';
  END IF;

  IF v_submission.owner_id <> v_owner_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not own this proof submission.';
  END IF;

  IF v_submission.status <> 'pending_review' THEN
    RAISE EXCEPTION 'Cannot create review link: submission is %, only pending_review submissions can receive review links.', v_submission.status;
  END IF;

  SELECT * INTO v_job
  FROM public.jobs
  WHERE id = v_submission.job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated job not found.';
  END IF;

  IF v_job.status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'Cannot create review link: job is %.', v_job.status;
  END IF;

  UPDATE public.proof_review_links
  SET revoked_at = NOW()
  WHERE job_id = v_submission.job_id
    AND revoked_at IS NULL
    AND expires_at > NOW();

  v_raw_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');
  v_expires_at := NOW() + (v_valid_days || ' days')::INTERVAL;

  INSERT INTO public.proof_review_links (
    submission_id,
    job_id,
    owner_id,
    token_hash,
    expires_at
  )
  VALUES (
    v_submission.id,
    v_submission.job_id,
    v_owner_id,
    v_token_hash,
    v_expires_at
  )
  RETURNING * INTO v_new_link;

  RETURN jsonb_build_object(
    'id', v_new_link.id,
    'submission_id', v_new_link.submission_id,
    'job_id', v_new_link.job_id,
    'raw_token', v_raw_token,
    'expires_at', v_new_link.expires_at,
    'created_at', v_new_link.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_proof_review_link(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_proof_review_link(UUID, INT) TO authenticated;

-- Function: revoke_proof_review_link
CREATE OR REPLACE FUNCTION public.revoke_proof_review_link(
  p_link_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id UUID;
  v_link RECORD;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_link_id IS NULL THEN
    RAISE EXCEPTION 'Link ID is required.';
  END IF;

  SELECT * INTO v_link
  FROM public.proof_review_links
  WHERE id = p_link_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review link not found.';
  END IF;

  IF v_link.owner_id <> v_owner_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not own this review link.';
  END IF;

  UPDATE public.proof_review_links
  SET revoked_at = NOW()
  WHERE id = p_link_id
  RETURNING * INTO v_link;

  RETURN jsonb_build_object(
    'id', v_link.id,
    'revoked_at', v_link.revoked_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_proof_review_link(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_proof_review_link(UUID) TO authenticated;

-- Function: validate_customer_review_token
CREATE OR REPLACE FUNCTION public.validate_customer_review_token(
  p_raw_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token_hash TEXT;
  v_link RECORD;
  v_submission RECORD;
  v_job RECORD;
  v_proof RECORD;
BEGIN
  IF p_raw_token IS NULL OR trim(p_raw_token) = '' THEN
    RETURN jsonb_build_object('valid', false, 'status', 'invalid', 'error', 'Missing or empty review token.');
  END IF;

  v_token_hash := encode(digest(trim(p_raw_token), 'sha256'), 'hex');

  SELECT * INTO v_link
  FROM public.proof_review_links
  WHERE token_hash = v_token_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'status', 'invalid', 'error', 'Invalid or unrecognised review link.');
  END IF;

  IF v_link.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('valid', false, 'status', 'revoked', 'error', 'This review link has been revoked.');
  END IF;

  IF v_link.expires_at <= NOW() THEN
    RETURN jsonb_build_object('valid', false, 'status', 'expired', 'error', 'This review link has expired.');
  END IF;

  SELECT * INTO v_submission
  FROM public.proof_submissions
  WHERE id = v_link.submission_id;

  IF NOT FOUND OR v_submission.status <> 'pending_review' THEN
    RETURN jsonb_build_object('valid', false, 'status', 'superseded', 'error', 'This proof has been superseded by a newer version.');
  END IF;

  SELECT * INTO v_job
  FROM public.jobs
  WHERE id = v_link.job_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'status', 'invalid', 'error', 'Associated job not found.');
  END IF;

  IF v_job.status IN ('cancelled', 'completed') THEN
    RETURN jsonb_build_object('valid', false, 'status', 'closed', 'error', 'This job has been closed or cancelled.');
  END IF;

  SELECT * INTO v_proof
  FROM public.proof_versions
  WHERE id = v_submission.proof_version_id
    AND job_id = v_job.id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'status', 'invalid', 'error', 'Proof version not found.');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'status', 'active',
    'expires_at', v_link.expires_at,
    'created_at', v_link.created_at,
    'job', jsonb_build_object(
      'job_title', v_job.job_title,
      'requirements', v_job.requirements
    ),
    'proof_version', jsonb_build_object(
      'version_number', v_proof.version_number,
      'original_filename', v_proof.original_filename,
      'mime_type', v_proof.mime_type,
      'file_size', v_proof.file_size,
      'storage_path', v_proof.storage_path,
      'created_at', v_proof.created_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_customer_review_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_customer_review_token(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. Proof Decisions & Revision Requests (Step 7)
-- ----------------------------------------------------------------------------

-- Ensure composite unique constraint on proof_submissions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_proof_submissions_id_job_proof'
  ) THEN
    ALTER TABLE public.proof_submissions ADD CONSTRAINT uq_proof_submissions_id_job_proof UNIQUE (id, job_id, proof_version_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.proof_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL,
  job_id UUID NOT NULL,
  proof_version_id UUID NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'changes_requested')),
  feedback TEXT CHECK (feedback IS NULL OR length(feedback) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_proof_decisions_submission UNIQUE (submission_id),
  CONSTRAINT fk_decision_submission_job_proof FOREIGN KEY (submission_id, job_id, proof_version_id)
    REFERENCES public.proof_submissions(id, job_id, proof_version_id) ON DELETE CASCADE,
  CONSTRAINT fk_decision_job FOREIGN KEY (job_id)
    REFERENCES public.jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_decision_proof_version FOREIGN KEY (proof_version_id)
    REFERENCES public.proof_versions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_proof_decisions_submission_id ON public.proof_decisions (submission_id);
CREATE INDEX IF NOT EXISTS idx_proof_decisions_job_id ON public.proof_decisions (job_id);
CREATE INDEX IF NOT EXISTS idx_proof_decisions_proof_version_id ON public.proof_decisions (proof_version_id);
CREATE INDEX IF NOT EXISTS idx_proof_decisions_decision ON public.proof_decisions (decision);
CREATE INDEX IF NOT EXISTS idx_proof_decisions_created_at ON public.proof_decisions (created_at DESC);

ALTER TABLE public.proof_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view decisions for their own jobs" ON public.proof_decisions;
CREATE POLICY "Owners can view decisions for their own jobs"
ON public.proof_decisions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = proof_decisions.job_id
      AND j.owner_id = auth.uid()
  )
);

-- Update storage policy to allow anon reading for unrevoked, unexpired links as long as submission is not superseded
DROP POLICY IF EXISTS "Customers with active review link can view submitted proof file" ON storage.objects;
CREATE POLICY "Customers with active review link can view submitted proof file"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'proof-files' AND
  EXISTS (
    SELECT 1
    FROM public.proof_versions pv
    JOIN public.proof_submissions ps ON ps.proof_version_id = pv.id
    JOIN public.proof_review_links prl ON prl.submission_id = ps.id
    JOIN public.jobs j ON j.id = ps.job_id
    WHERE pv.storage_path = storage.objects.name
      AND ps.status <> 'superseded'
      AND prl.revoked_at IS NULL
      AND prl.expires_at > NOW()
      AND j.status NOT IN ('cancelled', 'completed')
  )
);

-- RPC: record_customer_proof_decision
CREATE OR REPLACE FUNCTION public.record_customer_proof_decision(
  p_raw_token TEXT,
  p_decision TEXT,
  p_feedback TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token_hash TEXT;
  v_link RECORD;
  v_submission RECORD;
  v_job RECORD;
  v_proof RECORD;
  v_existing_decision RECORD;
  v_clean_feedback TEXT;
  v_new_decision RECORD;
  v_new_job_status TEXT;
  v_updated_job RECORD;
BEGIN
  IF p_raw_token IS NULL OR trim(p_raw_token) = '' THEN
    RAISE EXCEPTION 'Review token is required.';
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'changes_requested') THEN
    RAISE EXCEPTION 'Decision must be either "approved" or "changes_requested".';
  END IF;

  v_clean_feedback := NULLIF(trim(p_feedback), '');
  IF p_decision = 'changes_requested' THEN
    IF v_clean_feedback IS NULL OR v_clean_feedback = '' THEN
      RAISE EXCEPTION 'Please provide feedback describing what changes you would like made.';
    END IF;
    IF length(v_clean_feedback) > 2000 THEN
      RAISE EXCEPTION 'Revision feedback cannot exceed 2,000 characters.';
    END IF;
  END IF;

  v_token_hash := encode(digest(trim(p_raw_token), 'sha256'), 'hex');

  SELECT * INTO v_link
  FROM public.proof_review_links
  WHERE token_hash = v_token_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid review link token.';
  END IF;

  IF v_link.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This review link has been revoked.';
  END IF;

  IF v_link.expires_at <= NOW() THEN
    RAISE EXCEPTION 'This review link has expired.';
  END IF;

  SELECT * INTO v_submission
  FROM public.proof_submissions
  WHERE id = v_link.submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated proof submission not found.';
  END IF;

  IF v_submission.status <> 'pending_review' THEN
    RAISE EXCEPTION 'Cannot record decision: This proof submission has been superseded by a newer version.';
  END IF;

  SELECT * INTO v_existing_decision
  FROM public.proof_decisions
  WHERE submission_id = v_submission.id;

  IF FOUND THEN
    RAISE EXCEPTION 'A decision has already been recorded for this proof submission.';
  END IF;

  SELECT * INTO v_job
  FROM public.jobs
  WHERE id = v_submission.job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated job not found.';
  END IF;

  IF v_job.status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'Cannot record decision: Job is %.', v_job.status;
  END IF;

  SELECT * INTO v_proof
  FROM public.proof_versions
  WHERE id = v_submission.proof_version_id
    AND job_id = v_job.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated proof version not found.';
  END IF;

  INSERT INTO public.proof_decisions (
    submission_id,
    job_id,
    proof_version_id,
    decision,
    feedback
  )
  VALUES (
    v_submission.id,
    v_job.id,
    v_proof.id,
    p_decision,
    v_clean_feedback
  )
  RETURNING * INTO v_new_decision;

  IF p_decision = 'approved' THEN
    v_new_job_status := 'approved';
  ELSE
    v_new_job_status := 'changes_requested';
  END IF;

  UPDATE public.jobs
  SET status = v_new_job_status,
      updated_at = NOW()
  WHERE id = v_job.id
  RETURNING * INTO v_updated_job;

  RETURN jsonb_build_object(
    'success', true,
    'decision', jsonb_build_object(
      'id', v_new_decision.id,
      'submission_id', v_new_decision.submission_id,
      'decision', v_new_decision.decision,
      'feedback', v_new_decision.feedback,
      'created_at', v_new_decision.created_at
    ),
    'job_status', v_updated_job.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_customer_proof_decision(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_customer_proof_decision(TEXT, TEXT, TEXT) TO anon, authenticated;

-- Enhanced validate_customer_review_token (includes decision status)
CREATE OR REPLACE FUNCTION public.validate_customer_review_token(
  p_raw_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token_hash TEXT;
  v_link RECORD;
  v_submission RECORD;
  v_job RECORD;
  v_proof RECORD;
  v_decision RECORD;
BEGIN
  IF p_raw_token IS NULL OR trim(p_raw_token) = '' THEN
    RETURN jsonb_build_object('valid', false, 'status', 'invalid', 'error', 'Missing or empty review token.');
  END IF;

  v_token_hash := encode(digest(trim(p_raw_token), 'sha256'), 'hex');

  SELECT * INTO v_link
  FROM public.proof_review_links
  WHERE token_hash = v_token_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'status', 'invalid', 'error', 'Invalid or unrecognised review link.');
  END IF;

  IF v_link.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('valid', false, 'status', 'revoked', 'error', 'This review link has been revoked.');
  END IF;

  IF v_link.expires_at <= NOW() THEN
    RETURN jsonb_build_object('valid', false, 'status', 'expired', 'error', 'This review link has expired.');
  END IF;

  SELECT * INTO v_submission
  FROM public.proof_submissions
  WHERE id = v_link.submission_id;

  IF NOT FOUND OR v_submission.status = 'superseded' THEN
    RETURN jsonb_build_object('valid', false, 'status', 'superseded', 'error', 'This proof has been superseded by a newer version.');
  END IF;

  SELECT * INTO v_job
  FROM public.jobs
  WHERE id = v_link.job_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'status', 'invalid', 'error', 'Associated job not found.');
  END IF;

  IF v_job.status IN ('cancelled', 'completed') THEN
    RETURN jsonb_build_object('valid', false, 'status', 'closed', 'error', 'This job has been closed or cancelled.');
  END IF;

  SELECT * INTO v_proof
  FROM public.proof_versions
  WHERE id = v_submission.proof_version_id
    AND job_id = v_job.id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'status', 'invalid', 'error', 'Proof version not found.');
  END IF;

  SELECT * INTO v_decision
  FROM public.proof_decisions
  WHERE submission_id = v_submission.id;

  RETURN jsonb_build_object(
    'valid', true,
    'status', 'active',
    'has_decision', FOUND,
    'decision', CASE WHEN FOUND THEN jsonb_build_object(
      'decision', v_decision.decision,
      'feedback', v_decision.feedback,
      'created_at', v_decision.created_at
    ) ELSE NULL END,
    'expires_at', v_link.expires_at,
    'created_at', v_link.created_at,
    'job', jsonb_build_object(
      'job_title', v_job.job_title,
      'requirements', v_job.requirements
    ),
    'proof_version', jsonb_build_object(
      'version_number', v_proof.version_number,
      'original_filename', v_proof.original_filename,
      'mime_type', v_proof.mime_type,
      'file_size', v_proof.file_size,
      'storage_path', v_proof.storage_path,
      'created_at', v_proof.created_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_customer_review_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_customer_review_token(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. Revision Management and Resubmission (Step 8)
-- ----------------------------------------------------------------------------

-- Updated submit_proof_for_review() with atomic review-link revocation
CREATE OR REPLACE FUNCTION public.submit_proof_for_review(
  p_job_id UUID,
  p_proof_version_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id UUID;
  v_job RECORD;
  v_proof RECORD;
  v_new_submission RECORD;
  v_updated_job RECORD;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: session is invalid or user is not signed in.';
  END IF;

  IF p_job_id IS NULL OR p_proof_version_id IS NULL THEN
    RAISE EXCEPTION 'Job ID and Proof Version ID are required.';
  END IF;

  SELECT * INTO v_job
  FROM public.jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  IF v_job.owner_id <> v_owner_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not have permission to submit proofs for this job.';
  END IF;

  IF v_job.status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'Cannot submit proof for customer review: job is %.', v_job.status;
  END IF;

  SELECT * INTO v_proof
  FROM public.proof_versions
  WHERE id = p_proof_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected proof version not found.';
  END IF;

  IF v_proof.owner_id <> v_owner_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not have permission to submit this proof version.';
  END IF;

  IF v_proof.job_id <> p_job_id THEN
    RAISE EXCEPTION 'Selected proof version does not belong to this job.';
  END IF;

  -- Atomically supersede any existing pending_review submissions for this job
  UPDATE public.proof_submissions
  SET status = 'superseded'
  WHERE job_id = p_job_id
    AND status = 'pending_review';

  -- Atomically revoke existing review links for this job
  UPDATE public.proof_review_links
  SET revoked_at = NOW()
  WHERE job_id = p_job_id
    AND revoked_at IS NULL;

  -- Insert new submission record
  INSERT INTO public.proof_submissions (
    job_id,
    proof_version_id,
    owner_id,
    status
  )
  VALUES (
    p_job_id,
    p_proof_version_id,
    v_owner_id,
    'pending_review'
  )
  RETURNING * INTO v_new_submission;

  -- Update job status to awaiting_customer atomically
  UPDATE public.jobs
  SET status = 'awaiting_customer',
      updated_at = NOW()
  WHERE id = p_job_id
  RETURNING * INTO v_updated_job;

  RETURN jsonb_build_object(
    'submission', row_to_json(v_new_submission),
    'job', row_to_json(v_updated_job)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_proof_for_review(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_proof_for_review(UUID, UUID) TO authenticated;

-- Helper RPC: get_job_revision_history
CREATE OR REPLACE FUNCTION public.get_job_revision_history(
  p_job_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id UUID;
  v_job RECORD;
  v_history JSONB;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_job_id IS NULL THEN
    RAISE EXCEPTION 'Job ID is required.';
  END IF;

  SELECT * INTO v_job
  FROM public.jobs
  WHERE id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  IF v_job.owner_id <> v_owner_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not own this job.';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', pv.id,
      'job_id', pv.job_id,
      'version_number', pv.version_number,
      'original_filename', pv.original_filename,
      'mime_type', pv.mime_type,
      'file_size', pv.file_size,
      'storage_path', pv.storage_path,
      'created_at', pv.created_at,
      'is_current', (pv.version_number = (
        SELECT MAX(version_number) FROM public.proof_versions WHERE job_id = p_job_id
      )),
      'submission', CASE WHEN sub.id IS NOT NULL THEN jsonb_build_object(
        'id', sub.id,
        'status', sub.status,
        'created_at', sub.created_at
      ) ELSE NULL END,
      'decision', CASE WHEN dec.id IS NOT NULL THEN jsonb_build_object(
        'id', dec.id,
        'decision', dec.decision,
        'feedback', dec.feedback,
        'created_at', dec.created_at
      ) ELSE NULL END
    ) ORDER BY pv.version_number DESC
  ) INTO v_history
  FROM public.proof_versions pv
  LEFT JOIN LATERAL (
    SELECT id, status, created_at
    FROM public.proof_submissions
    WHERE proof_version_id = pv.id
    ORDER BY created_at DESC
    LIMIT 1
  ) sub ON true
  LEFT JOIN LATERAL (
    SELECT id, decision, feedback, created_at
    FROM public.proof_decisions
    WHERE proof_version_id = pv.id
    ORDER BY created_at DESC
    LIMIT 1
  ) dec ON true
  WHERE pv.job_id = p_job_id;

  RETURN COALESCE(v_history, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_job_revision_history(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_job_revision_history(UUID) TO authenticated;


