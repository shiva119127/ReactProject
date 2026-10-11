-- ProofLoop Step 3: Jobs Table Migration
-- Creates the jobs table with human-readable job numbers, RLS policies, and triggers

-- 1. Sequence for human-readable, concurrency-safe job numbers (e.g. JOB-01001)
CREATE SEQUENCE IF NOT EXISTS job_number_seq START WITH 1001;

-- 2. Create the jobs table
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Trigger to generate job_number if omitted during insert
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

-- 4. Trigger to automatically update updated_at on record changes
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

-- 5. Helpful indexes for performance and search
CREATE INDEX IF NOT EXISTS idx_jobs_owner_id ON public.jobs (owner_id);
CREATE INDEX IF NOT EXISTS idx_jobs_owner_status ON public.jobs (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_owner_created_at ON public.jobs (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_job_number ON public.jobs (job_number);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
-- Owners can select only their own jobs
DROP POLICY IF EXISTS "Owners can select their own jobs" ON public.jobs;
CREATE POLICY "Owners can select their own jobs"
ON public.jobs
FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

-- Owners can insert jobs only when owner_id matches auth.uid()
DROP POLICY IF EXISTS "Owners can insert their own jobs" ON public.jobs;
CREATE POLICY "Owners can insert their own jobs"
ON public.jobs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

-- Owners can update only their own jobs, and cannot change ownership to another user
DROP POLICY IF EXISTS "Owners can update their own jobs" ON public.jobs;
CREATE POLICY "Owners can update their own jobs"
ON public.jobs
FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

-- Owners can delete only their own jobs
DROP POLICY IF EXISTS "Owners can delete their own jobs" ON public.jobs;
CREATE POLICY "Owners can delete their own jobs"
ON public.jobs
FOR DELETE
TO authenticated
USING (auth.uid() = owner_id);
