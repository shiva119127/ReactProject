-- ProofLoop Step 6: Secure Customer Review Links Migration
-- Creates the proof_review_links table, constraints, RLS policies,
-- storage access policy for review links, and atomic RPC functions:
--   1. create_proof_review_link()
--   2. revoke_proof_review_link()
--   3. validate_customer_review_token()

-- 1. Ensure composite unique constraint on proof_submissions so foreign key can enforce job and owner consistency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_proof_submissions_id_job_owner'
  ) THEN
    ALTER TABLE public.proof_submissions ADD CONSTRAINT uq_proof_submissions_id_job_owner UNIQUE (id, job_id, owner_id);
  END IF;
END $$;

-- 2. Create the proof_review_links table
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

-- 3. Indexes for performance and lookup
CREATE INDEX IF NOT EXISTS idx_proof_review_links_submission_id ON public.proof_review_links (submission_id);
CREATE INDEX IF NOT EXISTS idx_proof_review_links_job_id ON public.proof_review_links (job_id);
CREATE INDEX IF NOT EXISTS idx_proof_review_links_owner_id ON public.proof_review_links (owner_id);
CREATE INDEX IF NOT EXISTS idx_proof_review_links_token_hash ON public.proof_review_links (token_hash);
CREATE INDEX IF NOT EXISTS idx_proof_review_links_expires_at ON public.proof_review_links (expires_at);
CREATE INDEX IF NOT EXISTS idx_proof_review_links_created_at ON public.proof_review_links (created_at DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.proof_review_links ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies on proof_review_links
-- Authenticated owners can select only their own review links
DROP POLICY IF EXISTS "Owners can view their own review links" ON public.proof_review_links;
CREATE POLICY "Owners can view their own review links"
ON public.proof_review_links
FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

-- Authenticated owners can insert review links for their own jobs
DROP POLICY IF EXISTS "Owners can insert their own review links" ON public.proof_review_links;
CREATE POLICY "Owners can insert their own review links"
ON public.proof_review_links
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

-- Authenticated owners can update review links for their own jobs (e.g. revoking)
DROP POLICY IF EXISTS "Owners can update their own review links" ON public.proof_review_links;
CREATE POLICY "Owners can update their own review links"
ON public.proof_review_links
FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

-- Note: Anonymous users do NOT have direct access to proof_review_links table.

-- 6. Storage Access Policy for Customers with Active Review Links
-- Allows unauthenticated clients to read the specific submitted proof file ONLY IF
-- there is an active, unexpired, unrevoked review link for a pending submission.
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
      AND ps.status = 'pending_review'
      AND prl.revoked_at IS NULL
      AND prl.expires_at > NOW()
      AND j.status NOT IN ('cancelled', 'completed')
  )
);

-- 7. Atomic RPC Function: create_proof_review_link
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
  -- Derive authenticated owner
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

  -- Lock and verify submission record
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

  -- Verify job status
  SELECT * INTO v_job
  FROM public.jobs
  WHERE id = v_submission.job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated job not found.';
  END IF;

  IF v_job.status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'Cannot create review link: job is %.', v_job.status;
  END IF;

  -- Atomically revoke previous active review links for this job
  UPDATE public.proof_review_links
  SET revoked_at = NOW()
  WHERE job_id = v_submission.job_id
    AND revoked_at IS NULL
    AND expires_at > NOW();

  -- Cryptographically secure token (32 bytes = 256 bits of entropy)
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

  -- Return raw token ONCE to owner; never stored in plaintext
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

-- 8. Atomic RPC Function: revoke_proof_review_link
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

-- 9. Atomic RPC Function: validate_customer_review_token
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

  -- Minimal customer-safe metadata
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
