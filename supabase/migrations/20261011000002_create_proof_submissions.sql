-- ProofLoop Step 5: Proof Submissions for Customer Review Migration
-- Creates the proof_submissions table, constraints, partial unique index, RLS policies,
-- and the atomic submit_proof_for_review() RPC function.

-- 1. Ensure composite unique constraint on proof_versions so foreign key can enforce job and owner consistency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_proof_version_id_job_owner'
  ) THEN
    ALTER TABLE public.proof_versions ADD CONSTRAINT uq_proof_version_id_job_owner UNIQUE (id, job_id, owner_id);
  END IF;
END $$;

-- 2. Create the proof_submissions table
CREATE TABLE IF NOT EXISTS public.proof_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  proof_version_id UUID NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (
    status IN ('pending_review', 'superseded')
  ),
  -- Relational foreign keys enforcing identical owner and job reference:
  -- A submission, its job, and its proof version must belong to the same owner.
  -- A proof version must belong to the job referenced by the submission.
  CONSTRAINT fk_submission_job_owner FOREIGN KEY (job_id, owner_id)
    REFERENCES public.jobs(id, owner_id) ON DELETE CASCADE,
  CONSTRAINT fk_submission_proof_job_owner FOREIGN KEY (proof_version_id, job_id, owner_id)
    REFERENCES public.proof_versions(id, job_id, owner_id) ON DELETE CASCADE
);

-- 3. Partial Unique Index:
-- Prevent multiple active pending-review submissions for the same job unless the previous submission has been explicitly superseded.
CREATE UNIQUE INDEX IF NOT EXISTS uq_idx_one_pending_submission_per_job
ON public.proof_submissions (job_id)
WHERE (status = 'pending_review');

-- 4. Helpful indexes for querying and performance
CREATE INDEX IF NOT EXISTS idx_proof_submissions_job_id ON public.proof_submissions (job_id);
CREATE INDEX IF NOT EXISTS idx_proof_submissions_owner_id ON public.proof_submissions (owner_id);
CREATE INDEX IF NOT EXISTS idx_proof_submissions_proof_version_id ON public.proof_submissions (proof_version_id);
CREATE INDEX IF NOT EXISTS idx_proof_submissions_job_created ON public.proof_submissions (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proof_submissions_status ON public.proof_submissions (status);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.proof_submissions ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
-- Authenticated owners can read only their own submissions
DROP POLICY IF EXISTS "Owners can view their own proof submissions" ON public.proof_submissions;
CREATE POLICY "Owners can view their own proof submissions"
ON public.proof_submissions
FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

-- Only authenticated owners can create submissions for their own jobs
DROP POLICY IF EXISTS "Owners can insert their own proof submissions" ON public.proof_submissions;
CREATE POLICY "Owners can insert their own proof submissions"
ON public.proof_submissions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

-- Note: We intentionally do NOT grant UPDATE or DELETE policies to authenticated users.
-- This ensures ordinary users cannot alter or tamper with submission history.
-- Status changes (e.g. superseding) are handled exclusively via the atomic SECURITY DEFINER function.

-- 7. Atomic Database Submission Function (Supabase RPC)
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

  -- 8. Insert new submission record
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

  -- 9. Update job status to awaiting_customer
  UPDATE public.jobs
  SET status = 'awaiting_customer',
      updated_at = NOW()
  WHERE id = p_job_id
  RETURNING * INTO v_updated_job;

  -- 10. Return atomic result containing the new submission and updated job
  RETURN jsonb_build_object(
    'submission', row_to_json(v_new_submission),
    'job', row_to_json(v_updated_job)
  );
END;
$$;

-- Restrict execution privileges: unauthenticated users cannot execute
REVOKE ALL ON FUNCTION public.submit_proof_for_review(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_proof_for_review(UUID, UUID) TO authenticated;
