-- ProofLoop Step 8: Revision Management and Proof Resubmission Migration
-- Updates the submit_proof_for_review() RPC function to atomically revoke review links
-- associated with superseded submissions, ensuring old review tokens cannot view or
-- authorize decisions on newer submissions. Also provides get_job_revision_history() RPC.

-- 1. Atomic Database Submission Function with Review-Link Revocation (Supabase RPC)
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
  -- 1. Derive authenticated owner from auth.uid() rather than trusting caller-supplied owner ID
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: session is invalid or user is not signed in.';
  END IF;

  IF p_job_id IS NULL OR p_proof_version_id IS NULL THEN
    RAISE EXCEPTION 'Job ID and Proof Version ID are required.';
  END IF;

  -- 2. Lock and retrieve the job record to serialize concurrent operations
  SELECT * INTO v_job
  FROM public.jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  -- 3. Verify job ownership
  IF v_job.owner_id <> v_owner_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not have permission to submit proofs for this job.';
  END IF;

  -- 4. Verify job status (cannot submit for cancelled or completed jobs)
  IF v_job.status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'Cannot submit proof for customer review: job is %.', v_job.status;
  END IF;

  -- 5. Retrieve and verify the proof version record
  SELECT * INTO v_proof
  FROM public.proof_versions
  WHERE id = p_proof_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected proof version not found.';
  END IF;

  -- 6. Verify proof ownership and job association
  IF v_proof.owner_id <> v_owner_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not have permission to submit this proof version.';
  END IF;

  IF v_proof.job_id <> p_job_id THEN
    RAISE EXCEPTION 'Selected proof version does not belong to this job.';
  END IF;

  -- 7. Atomically supersede any existing pending_review submissions for this job
  UPDATE public.proof_submissions
  SET status = 'superseded'
  WHERE job_id = p_job_id
    AND status = 'pending_review';

  -- 8. Atomically revoke any existing review links for this job to prevent stale links from accessing the new proof
  UPDATE public.proof_review_links
  SET revoked_at = NOW()
  WHERE job_id = p_job_id
    AND revoked_at IS NULL;

  -- 9. Insert new submission record
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

  -- 10. Update job status to awaiting_customer atomically
  UPDATE public.jobs
  SET status = 'awaiting_customer',
      updated_at = NOW()
  WHERE id = p_job_id
  RETURNING * INTO v_updated_job;

  -- 11. Return atomic result containing the new submission and updated job
  RETURN jsonb_build_object(
    'submission', row_to_json(v_new_submission),
    'job', row_to_json(v_updated_job)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_proof_for_review(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_proof_for_review(UUID, UUID) TO authenticated;

-- 2. Helper RPC: get_job_revision_history(p_job_id)
-- Returns consolidated revision history for an authenticated job owner
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
