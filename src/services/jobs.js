import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Creates a new job record in Supabase.
 * Maps frontend camelCase form properties to snake_case database columns.
 */
export async function createJob(formData, ownerId) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Please check your environment variables.');
  }

  if (!ownerId) {
    throw new Error('Authentication required: owner ID is missing.');
  }

  const payload = {
    owner_id: ownerId,
    customer_name: formData.customerName.trim(),
    customer_phone: formData.phoneNumber?.trim() || null,
    customer_email: formData.email?.trim() || null,
    job_title: formData.jobTitle.trim(),
    requirements: formData.requirements.trim(),
    quantity: parseInt(formData.quantity, 10),
    due_date: formData.dueDate?.trim() || null,
    internal_notes: formData.internalNotes?.trim() || null,
    status: 'awaiting_proof',
  };

  const { data, error } = await supabase
    .from('jobs')
    .insert([payload])
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Fetches all jobs owned by the authenticated user with optional search and status filters.
 */
export async function getJobs({ search = '', status = 'all' } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Please check your environment variables.');
  }

  let query = supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  if (search && search.trim()) {
    const term = search.trim();
    query = query.or(
      `job_number.ilike.%${term}%,job_title.ilike.%${term}%,customer_name.ilike.%${term}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Fetches a single job by its UUID.
 */
export async function getJobById(id) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Please check your environment variables.');
  }

  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Fetches dashboard statistics and recent jobs for the authenticated owner.
 */
export async function getDashboardData() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Please check your environment variables.');
  }

  // Fetch recent jobs and all job statuses to compute accurate metrics
  const { data: allJobs, error } = await supabase
    .from('jobs')
    .select('id, job_number, job_title, customer_name, quantity, status, due_date, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  const jobs = allJobs || [];

  const stats = {
    total: jobs.length,
    awaitingProof: jobs.filter((j) => j.status === 'awaiting_proof').length,
    awaitingCustomer: jobs.filter((j) => j.status === 'awaiting_customer').length,
    approved: jobs.filter((j) => j.status === 'approved').length,
  };

  const recentJobs = jobs.slice(0, 5);

  return { stats, recentJobs };
}
