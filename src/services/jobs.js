import { supabase, isSupabaseConfigured } from '../lib/supabase.js';


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

// ---------------------------------------------------------------------------
// Design Proof Management & Storage Services
// ---------------------------------------------------------------------------

export const MAX_PROOF_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
export const ALLOWED_PROOF_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
];
export const ALLOWED_PROOF_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg'];

/**
 * Validates file type, MIME type, and size for proof uploads.
 */
export function validateProofFile(file) {
  if (!file) {
    return { valid: false, error: 'No file selected. Please choose a design proof.' };
  }

  // Check file size
  if (file.size > MAX_PROOF_FILE_SIZE) {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size (${sizeInMB} MB) exceeds the maximum limit of 20 MB.`,
    };
  }

  // Check extension
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !ALLOWED_PROOF_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `Unsupported file format (.${extension || 'unknown'}). Only PDF, PNG, and JPEG files are permitted.`,
    };
  }

  // Check MIME type
  if (!ALLOWED_PROOF_MIME_TYPES.includes(file.type)) {
    // If browser reported empty type or mismatch, verify if extension is valid
    if (file.type && !ALLOWED_PROOF_MIME_TYPES.includes(file.type)) {
      return {
        valid: false,
        error: `Invalid file content type (${file.type}). Only PDF, PNG, and JPEG files are permitted.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Fetches all proof versions for a job, ordered descending by version number.
 */
export async function getProofVersions(jobId) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await supabase
    .from('proof_versions')
    .select('*')
    .eq('job_id', jobId)
    .order('version_number', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Uploads a proof file to the private 'proof-files' bucket and inserts a version record.
 * Performs automatic cleanup if database insertion fails after storage upload.
 */
export async function uploadProofVersion({ jobId, ownerId, file }) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Please check your environment variables.');
  }

  if (!jobId || !ownerId) {
    throw new Error('Job ID and authenticated Owner ID are required.');
  }

  // Client validation
  const validation = validateProofFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Generate unique file ID and structured path: {owner_id}/{job_id}/{unique_file_id}.{extension}
  const extension = file.name.split('.').pop().toLowerCase();
  const uniqueFileId = crypto.randomUUID();
  const storagePath = `${ownerId}/${jobId}/${uniqueFileId}.${extension}`;

  // 1. Upload to Supabase private storage bucket
  const { error: uploadError } = await supabase.storage
    .from('proof-files')
    .upload(storagePath, file, {
      contentType: file.type || (extension === 'pdf' ? 'application/pdf' : `image/${extension}`),
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  // 2. Insert proof version record into database
  try {
    const { data: proofRecord, error: insertError } = await supabase
      .from('proof_versions')
      .insert([
        {
          job_id: jobId,
          owner_id: ownerId,
          storage_path: storagePath,
          original_filename: file.name,
          mime_type: file.type || (extension === 'pdf' ? 'application/pdf' : `image/${extension}`),
          file_size: file.size,
        },
      ])
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return proofRecord;
  } catch (dbErr) {
    // Attempt orphaned storage object cleanup
    try {
      await supabase.storage.from('proof-files').remove([storagePath]);
    } catch (cleanupErr) {
      console.error('Storage cleanup failed after DB error:', cleanupErr);
    }

    throw new Error(
      `Database record creation failed: ${dbErr.message || 'Unknown database error'}. Any uploaded temporary files were cleaned up.`
    );
  }
}

/**
 * Generates a short-lived signed URL for securely viewing private proof files.
 */
export async function getSignedProofUrl(storagePath, expiresIn = 3600) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await supabase.storage
    .from('proof-files')
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    throw error;
  }

  return data.signedUrl;
}

