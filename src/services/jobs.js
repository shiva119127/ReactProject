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
    changesRequested: jobs.filter((j) => j.status === 'changes_requested').length,
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

// ---------------------------------------------------------------------------
// Proof Submissions Management Services (Step 5)
// ---------------------------------------------------------------------------

/**
 * Fetches all proof submissions for a job, ordered descending by creation date.
 */
export async function getProofSubmissions(jobId) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  if (!jobId) {
    throw new Error('Job ID is required to fetch submissions.');
  }

  const { data, error } = await supabase
    .from('proof_submissions')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  if (error) {
    if (error.code === 'PGRST205' || error.message?.includes('proof_submissions')) {
      throw new Error(
        "Database table 'proof_submissions' is not available. Please run the Step 5 database migration in your Supabase SQL Editor."
      );
    }
    throw error;
  }

  return data || [];
}

/**
 * Submits a selected proof version for customer review using the atomic database RPC.
 * Atomically supersedes previous pending submissions, creates a new pending submission,
 * and updates job status to 'awaiting_customer'.
 */
export async function submitProofForReview({ jobId, proofVersionId }) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Please check your environment variables.');
  }

  if (!jobId || !proofVersionId) {
    throw new Error('Both Job ID and Proof Version ID are required to submit a proof.');
  }

  const { data, error } = await supabase.rpc('submit_proof_for_review', {
    p_job_id: jobId,
    p_proof_version_id: proofVersionId,
  });

  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      error.message?.includes('submit_proof_for_review')
    ) {
      throw new Error(
        "Database function 'submit_proof_for_review' is not available. Please run the Step 5 database migration (20261011000002_create_proof_submissions.sql) in your Supabase SQL Editor."
      );
    }
    throw new Error(error.message || 'Failed to submit design proof for review.');
  }

  return data;
}

// ---------------------------------------------------------------------------
// Customer Review Links Services (Step 6)
// ---------------------------------------------------------------------------

/**
 * Fetches all review links for a job (ordered by created_at DESC).
 */
export async function getProofReviewLinks(jobId) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  if (!jobId) {
    throw new Error('Job ID is required to fetch review links.');
  }

  const { data, error } = await supabase
    .from('proof_review_links')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  if (error) {
    if (error.code === 'PGRST205' || error.message?.includes('proof_review_links')) {
      throw new Error(
        "Database table 'proof_review_links' is not available. Please run the Step 6 database migration in your Supabase SQL Editor."
      );
    }
    throw error;
  }

  return data || [];
}

/**
 * Creates a cryptographically secure customer review link via atomic RPC.
 * Automatically revokes any previous active review links for this job,
 * hashes the token, and returns the raw token ONCE to the owner.
 */
export async function createProofReviewLink({ submissionId, expiresInDays = 7 }) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  if (!submissionId) {
    throw new Error('Submission ID is required to generate a review link.');
  }

  const { data, error } = await supabase.rpc('create_proof_review_link', {
    p_submission_id: submissionId,
    p_expires_in_days: expiresInDays,
  });

  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      error.message?.includes('create_proof_review_link')
    ) {
      throw new Error(
        "Database function 'create_proof_review_link' is not available. Please run the Step 6 database migration (20261011000003_create_proof_review_links.sql) in your Supabase SQL Editor."
      );
    }
    throw new Error(error.message || 'Failed to generate review link.');
  }

  return data;
}

/**
 * Explicitly revokes an active customer review link.
 */
export async function revokeProofReviewLink(linkId) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  if (!linkId) {
    throw new Error('Review Link ID is required.');
  }

  const { data, error } = await supabase.rpc('revoke_proof_review_link', {
    p_link_id: linkId,
  });

  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      error.message?.includes('revoke_proof_review_link')
    ) {
      throw new Error(
        "Database function 'revoke_proof_review_link' is not available. Please run the Step 6 database migration in your Supabase SQL Editor."
      );
    }
    throw new Error(error.message || 'Failed to revoke review link.');
  }

  return data;
}

/**
 * Validates a customer's raw review token against its stored hash.
 * Returns safe customer-facing metadata only if the link is active, unrevoked, unexpired,
 * and the submission is still pending_review.
 */
export async function validateCustomerReviewToken(rawToken) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  if (!rawToken || !rawToken.trim()) {
    return {
      valid: false,
      status: 'invalid',
      error: 'A review token is required.',
    };
  }

  const { data, error } = await supabase.rpc('validate_customer_review_token', {
    p_raw_token: rawToken.trim(),
  });

  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      error.message?.includes('validate_customer_review_token')
    ) {
      throw new Error(
        "Database function 'validate_customer_review_token' is not available. Please run the Step 6 database migration in your Supabase SQL Editor."
      );
    }
    throw new Error(error.message || 'Failed to validate customer review token.');
  }

  return data;
}

/**
 * Generates a short-lived signed URL for a customer viewing a verified proof.
 */
export async function getCustomerProofSignedUrl(storagePath, expiresIn = 3600) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  if (!storagePath) {
    throw new Error('Storage path is required.');
  }

  const { data, error } = await supabase.storage
    .from('proof-files')
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    throw new Error(`Unable to generate temporary viewing link: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * Records a customer's proof decision (approved or changes_requested) atomically.
 * Calls RPC 'record_customer_proof_decision'.
 * Validates the raw token, ensures no duplicate decision, records proof decision in proof_decisions,
 * and updates job status to 'approved' or 'changes_requested'.
 */
export async function recordCustomerProofDecision({ token, decision, feedback = null }) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  if (!token || !token.trim()) {
    throw new Error('Review token is required.');
  }

  if (!decision || !['approved', 'changes_requested'].includes(decision)) {
    throw new Error('Invalid decision. Must be "approved" or "changes_requested".');
  }

  const trimmedFeedback = feedback ? feedback.trim() : null;

  if (decision === 'changes_requested') {
    if (!trimmedFeedback) {
      throw new Error('Please provide feedback describing what changes you would like made.');
    }
    if (trimmedFeedback.length > 2000) {
      throw new Error('Revision feedback cannot exceed 2,000 characters.');
    }
  }

  const { data, error } = await supabase.rpc('record_customer_proof_decision', {
    p_raw_token: token.trim(),
    p_decision: decision,
    p_feedback: trimmedFeedback,
  });

  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      error.message?.includes('record_customer_proof_decision')
    ) {
      throw new Error(
        "Database function 'record_customer_proof_decision' is not available. Please run the Step 7 database migration in your Supabase SQL Editor."
      );
    }
    throw new Error(error.message || 'Failed to record proof decision.');
  }

  return data;
}

/**
 * Fetches proof decisions for a specific job (owner only via RLS).
 * Includes submission and proof version info.
 */
export async function getProofDecisions(jobId) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  if (!jobId) {
    throw new Error('Job ID is required.');
  }

  const { data, error } = await supabase
    .from('proof_decisions')
    .select(`
      id,
      submission_id,
      job_id,
      proof_version_id,
      decision,
      feedback,
      created_at,
      proof_versions:proof_version_id (
        id,
        version_number,
        original_filename
      )
    `)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load proof decisions: ${error.message}`);
  }

  return data || [];
}

/**
 * Fetches consolidated revision history for a job.
 * Combines proof versions, latest submission statuses, and customer decisions/feedback.
 * Uses get_job_revision_history RPC if available, or synthesizes from database queries.
 */
export async function getRevisionHistory(jobId) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  if (!jobId) {
    throw new Error('Job ID is required.');
  }

  // 1. Try RPC first
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_job_revision_history', {
    p_job_id: jobId,
  });

  if (!rpcError && Array.isArray(rpcData)) {
    return rpcData.map((item) => ({
      id: item.id,
      jobId: item.job_id,
      versionNumber: item.version_number,
      originalFilename: item.original_filename,
      mimeType: item.mime_type,
      fileSize: item.file_size,
      storagePath: item.storage_path,
      createdAt: item.created_at,
      isCurrent: Boolean(item.is_current),
      submission: item.submission
        ? {
            id: item.submission.id,
            status: item.submission.status,
            createdAt: item.submission.created_at,
          }
        : null,
      decision: item.decision
        ? {
            id: item.decision.id,
            decision: item.decision.decision,
            feedback: item.decision.feedback,
            createdAt: item.decision.created_at,
          }
        : null,
    }));
  }

  // 2. Fallback to client-side synthesis from real database records
  const [versions, submissions, decisions] = await Promise.all([
    getProofVersions(jobId),
    getProofSubmissions(jobId),
    getProofDecisions(jobId),
  ]);

  if (!versions || versions.length === 0) {
    return [];
  }

  const maxVersion = Math.max(...versions.map((v) => v.version_number));

  return versions.map((version) => {
    const versionSubmissions = submissions.filter((s) => s.proof_version_id === version.id);
    const latestSubmission = versionSubmissions[0] || null;

    const versionDecisions = decisions.filter((d) => d.proof_version_id === version.id);
    const latestDecision = versionDecisions[0] || null;

    return {
      id: version.id,
      jobId: version.job_id,
      versionNumber: version.version_number,
      originalFilename: version.original_filename,
      mimeType: version.mime_type,
      fileSize: version.file_size,
      storagePath: version.storage_path,
      createdAt: version.created_at,
      isCurrent: version.version_number === maxVersion,
      submission: latestSubmission
        ? {
            id: latestSubmission.id,
            status: latestSubmission.status,
            createdAt: latestSubmission.created_at,
          }
        : null,
      decision: latestDecision
        ? {
            id: latestDecision.id,
            decision: latestDecision.decision,
            feedback: latestDecision.feedback,
            createdAt: latestDecision.created_at,
          }
        : null,
    };
  });
}



