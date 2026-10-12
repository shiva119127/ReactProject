-- ============================================================================
-- ProofLoop: Step 7 & Step 8 Migrations (Decisions & Revision Management)
-- Run this in your Supabase Dashboard: SQL Editor -> New Query -> Paste & Run
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Ensure composite unique constraint on proof_submissions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_proof_submissions_id_job_proof'
  ) THEN
    ALTER TABLE public.proof_submissions ADD CONSTRAINT uq_proof_submissions_id_job_proof UNIQUE (id, job_id, proof_version_id);
  END IF;
END $$;

-- 2. Create the proof_decisions table
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

-- 3. Indexes for proof_decisions
CREATE INDEX IF NOT EXISTS idx_proof_decisions_submission_id ON public.proof_decisions (submission_id);
CREATE INDEX IF NOT EXISTS idx_proof_decisions_job_id ON public.proof_decisions (job_id);
CREATE INDEX IF NOT EXISTS idx_proof_decisions_proof_version_id ON public.proof_decisions (proof_version_id);
CREATE INDEX IF NOT EXISTS idx_proof_decisions_decision ON public.proof_decisions (decision);
CREATE INDEX IF NOT EXISTS idx_proof_decisions_created_at ON public.proof_decisions (created_at DESC);

-- 4. Enable Row Level Security (RLS) on proof_decisions
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

-- 5. Storage Access Policy for Customers
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

-- 6. Atomic RPC Function: record_customer_proof_decision
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

-- 7. Enhanced validate_customer_review_token RPC (Returns decision state if present)
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

-- 8. Enhanced submit_proof_for_review RPC (Step 8: revokes previous links upon resubmission)
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

  UPDATE public.proof_submissions
  SET status = 'superseded'
  WHERE job_id = p_job_id
    AND status = 'pending_review';

  UPDATE public.proof_review_links
  SET revoked_at = NOW()
  WHERE job_id = p_job_id
    AND revoked_at IS NULL;

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

-- 9. Helper RPC: get_job_revision_history(p_job_id) (Step 8)
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
