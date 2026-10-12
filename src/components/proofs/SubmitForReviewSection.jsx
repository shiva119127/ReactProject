import React, { useState, useEffect, useId } from 'react';
import {
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileText,
  Image as ImageIcon,
  Eye,
  ExternalLink,
  Loader2,
  History,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Upload,
  Calendar,
  MessageSquare,
  RotateCcw,
} from 'lucide-react';
import Button from '../ui/Button';
import {
  getProofSubmissions,
  submitProofForReview,
  getSignedProofUrl,
} from '../../services/jobs';
import { useAuth } from '../../context/useAuth';

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function SubmitForReviewSection({
  job,
  proofs = [],
  decisions = [],
  onJobUpdated,
  onRequestUpload,
}) {
  const { user, isConfigured } = useAuth();
  const selectId = useId();

  const jobId = job?.id;

  // Submissions state
  const [submissions, setSubmissions] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(Boolean(jobId));
  const [submissionsError, setSubmissionsError] = useState(null);

  // Form & selection state
  const [userSelectedProofId, setUserSelectedProofId] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  // Signed URL viewing state
  const [viewingId, setViewingId] = useState(null);
  const [viewError, setViewError] = useState('');

  // Fetch submissions from Supabase
  const loadSubmissions = React.useCallback(async () => {
    if (!jobId) return;
    setLoadingSubmissions(true);
    setSubmissionsError(null);
    try {
      const data = await getProofSubmissions(jobId);
      setSubmissions(data);
    } catch (err) {
      setSubmissionsError(err.message || 'Failed to fetch proof submissions.');
    } finally {
      setLoadingSubmissions(false);
    }
  }, [jobId]);

  useEffect(() => {
    let ignore = false;
    if (!jobId) return;

    getProofSubmissions(jobId)
      .then((data) => {
        if (!ignore) {
          setSubmissions(data);
          setLoadingSubmissions(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setSubmissionsError(err.message || 'Failed to fetch proof submissions.');
          setLoadingSubmissions(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [jobId]);

  // Derive active pending submission
  const activePendingSubmission = submissions.find(
    (s) => s.status === 'pending_review'
  );

  // Job status rules
  const isCancelledOrCompleted =
    job?.status === 'cancelled' || job?.status === 'completed';
  const isChangesRequested = job?.status === 'changes_requested';

  // Derive default and effective selected proof ID without cascading render effects
  // When revisions were requested, if a newer proof has been uploaded, prefer it as the default
  const defaultProofId =
    isChangesRequested && proofs.length > 0 && proofs[0].id !== activePendingSubmission?.proof_version_id
      ? proofs[0].id
      : activePendingSubmission?.proof_version_id || (proofs.length > 0 ? proofs[0].id : '');

  const selectedProofId = userSelectedProofId || defaultProofId;

  // Selected proof version object
  const selectedProof = proofs.find((p) => p.id === selectedProofId);

  // Active submission's proof version object
  const activeProofVersion = activePendingSubmission
    ? proofs.find((p) => p.id === activePendingSubmission.proof_version_id)
    : null;

  // Check if selected proof is already the pending one
  const isSelectedAlreadyPending = Boolean(
    activePendingSubmission &&
      activePendingSubmission.proof_version_id === selectedProofId
  );

  // Check if this submission will supersede an existing pending submission
  const isSuperseding = Boolean(
    activePendingSubmission &&
      selectedProofId &&
      activePendingSubmission.proof_version_id !== selectedProofId
  );

  // View proof securely with signed URL
  const handleViewProof = async (proof) => {
    if (!proof) return;
    setViewingId(proof.id);
    setViewError('');

    try {
      const signedUrl = await getSignedProofUrl(proof.storage_path, 3600);
      if (signedUrl) {
        window.open(signedUrl, '_blank', 'noopener,noreferrer');
      } else {
        throw new Error('Unable to generate secure viewing link.');
      }
    } catch (err) {
      setViewError(`Failed to view proof: ${err.message}`);
    } finally {
      setViewingId(null);
    }
  };

  // Submission handler
  const handleConfirmSubmit = async () => {
    if (!selectedProofId) {
      setSubmitError('Please select a design proof version to submit.');
      return;
    }

    if (!user || user.id !== job?.owner_id) {
      setSubmitError('Authentication required: only the job owner can submit proofs.');
      return;
    }

    if (isCancelledOrCompleted) {
      setSubmitError(
        `Cannot submit proof: This job is marked as ${job.status} and cannot receive submissions.`
      );
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');

    try {
      // Call atomic Supabase RPC
      const result = await submitProofForReview({
        jobId: job.id,
        proofVersionId: selectedProofId,
      });

      // Update parent job status and details
      if (result?.job && onJobUpdated) {
        onJobUpdated(result.job);
      }

      setSubmitSuccess(
        `Version ${selectedProof?.version_number || ''} submitted successfully for customer review!`
      );
      setIsConfirming(false);

      // Refresh submissions list from Supabase source of truth
      await loadSubmissions();
    } catch (err) {
      // Preserve selectedProofId and do not fake success
      setSubmitError(err.message || 'Failed to submit proof for review.');
      setIsConfirming(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      aria-labelledby="submit-for-review-heading"
      className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <h2
              id="submit-for-review-heading"
              className="text-lg font-bold text-slate-900 tracking-tight"
            >
              Submit for Customer Review
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select an uploaded design proof to prepare for customer review and approval.
            </p>
          </div>
        </div>

        {/* Status indicator badge */}
        {activePendingSubmission ? (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold shrink-0">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span>Awaiting Customer Review</span>
          </div>
        ) : isCancelledOrCompleted ? (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-xs font-medium shrink-0">
            <span>Job {job.status}</span>
          </div>
        ) : null}
      </div>

      {/* Database Error / Status Alerts */}
      {submissionsError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-3"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Submissions Query Notice</p>
            <p className="mt-0.5">{submissionsError}</p>
          </div>
        </div>
      )}

      {submitError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-3"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Submission Failed</p>
            <p className="mt-0.5">{submitError}</p>
          </div>
        </div>
      )}

      {submitSuccess && (
        <div
          role="status"
          className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-3 animate-in fade-in"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-medium">{submitSuccess}</span>
        </div>
      )}

      {viewError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-3"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{viewError}</span>
        </div>
      )}

      {/* Active Pending Submission Banner */}
      {activePendingSubmission && (
        <div className="rounded-xl bg-blue-50/70 border border-blue-200 p-4 sm:p-5 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-blue-800 bg-blue-100/80 px-2 py-0.5 rounded">
                  Version {activeProofVersion?.version_number || '—'}
                </span>
                <span className="text-xs font-semibold text-blue-900">
                  Currently Awaiting Review
                </span>
              </div>
              <p className="text-xs text-blue-800/90 font-medium truncate max-w-md">
                {activeProofVersion?.original_filename || 'Submitted Proof'}
              </p>
            </div>

            {activeProofVersion && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={viewingId === activeProofVersion.id ? Loader2 : Eye}
                disabled={viewingId === activeProofVersion.id}
                onClick={() => handleViewProof(activeProofVersion)}
                id="view-active-submission-proof-btn"
                className="shrink-0 bg-white"
              >
                {viewingId === activeProofVersion.id ? 'Loading...' : 'View Proof'}
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-blue-700 pt-1 border-t border-blue-200/60">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
              <span>
                Submitted on{' '}
                {new Date(activePendingSubmission.created_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </span>
            <span className="text-blue-400">•</span>
            <span className="text-blue-600 font-medium">
              Awaiting customer feedback. Not approved yet.
            </span>
          </div>
        </div>
      )}

      {/* Empty State: No Proofs Uploaded */}
      {proofs.length === 0 ? (
        <div className="text-center py-8 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 space-y-3">
          <div className="w-11 h-11 rounded-2xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center mx-auto shadow-xs">
            <Upload className="w-5 h-5 text-blue-500" />
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="text-sm font-semibold text-slate-800">
              A design proof must be uploaded first
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Upload an initial artwork proof in PDF, PNG, or JPEG format before preparing a version for customer review.
            </p>
          </div>
          {onRequestUpload && (
            <div className="pt-1">
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={Upload}
                onClick={onRequestUpload}
                id="empty-state-go-to-upload-btn"
              >
                Upload Design Proof
              </Button>
            </div>
          )}
        </div>
      ) : (
        /* Proof Selection & Submission Flow */
        <div className="space-y-5">
          {/* Version Selector */}
          <div className="space-y-2">
            <label
              htmlFor={selectId}
              className="block text-xs font-bold text-slate-700 uppercase tracking-wider"
            >
              Select Proof Version to Submit
            </label>
            <div className="relative">
              <select
                id={selectId}
                value={selectedProofId}
                onChange={(e) => {
                  setUserSelectedProofId(e.target.value);
                  setSubmitError('');
                  setSubmitSuccess('');
                  setIsConfirming(false);
                }}
                disabled={submitting || isCancelledOrCompleted}
                className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 font-medium focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {proofs.map((proof, idx) => {
                  const uploadDate = new Date(proof.created_at).toLocaleDateString(
                    undefined,
                    {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }
                  );
                  const isCurrentPending =
                    activePendingSubmission?.proof_version_id === proof.id;
                  const isLatest = idx === 0;

                  return (
                    <option key={proof.id} value={proof.id}>
                      Version {proof.version_number} — {proof.original_filename} (
                      {uploadDate})
                      {isCurrentPending
                        ? ' [Currently Submitted]'
                        : isLatest
                        ? ' [Latest]'
                        : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Selected Proof Summary Card */}
          {selectedProof && (
            <div className="bg-slate-50/80 rounded-xl border border-slate-200/90 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start gap-3.5 overflow-hidden">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-600 flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  {selectedProof.mime_type.includes('pdf') ||
                  selectedProof.original_filename.endsWith('.pdf') ? (
                    <FileText className="w-5 h-5 text-red-500" />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-blue-500" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-900 bg-white border border-slate-200 px-2 py-0.5 rounded">
                      Version {selectedProof.version_number}
                    </span>
                    {isSelectedAlreadyPending && (
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Active Submission
                      </span>
                    )}
                  </div>
                  <p
                    className="text-sm font-semibold text-slate-900 truncate mt-1"
                    title={selectedProof.original_filename}
                  >
                    {selectedProof.original_filename}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                    <span>{formatFileSize(selectedProof.file_size)}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>
                        Uploaded{' '}
                        {new Date(selectedProof.created_at).toLocaleDateString(
                          undefined,
                          {
                            month: 'short',
                            day: 'numeric',
                          }
                        )}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* View Proof Action */}
              <div className="shrink-0 self-end sm:self-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={viewingId === selectedProof.id ? Loader2 : Eye}
                  disabled={viewingId === selectedProof.id}
                  onClick={() => handleViewProof(selectedProof)}
                  id="view-selected-proof-preview-btn"
                  className="bg-white"
                >
                  {viewingId === selectedProof.id ? (
                    'Generating Link...'
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <span>View Proof</span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </span>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Context Alerts */}
          {isCancelledOrCompleted && (
            <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-slate-500 shrink-0" />
              <span>
                This job is marked as <strong>{job.status}</strong>. Submissions are disabled for completed or cancelled orders.
              </span>
            </div>
          )}

          {isSuperseding && !isCancelledOrCompleted && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Replaces Pending Review</p>
                <p className="mt-0.5 leading-relaxed">
                  Submitting <strong>Version {selectedProof?.version_number}</strong> will supersede{' '}
                  <strong>Version {activeProofVersion?.version_number || 'current'}</strong>. The previous submission will be archived as superseded in history.
                </p>
              </div>
            </div>
          )}

          {isSelectedAlreadyPending && !isCancelledOrCompleted && (
            <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200/70 text-xs text-blue-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                <strong>Version {selectedProof?.version_number}</strong> is already the active pending submission.
              </span>
            </div>
          )}

          {/* Submission Action & Confirmation Step */}
          {!isConfirming ? (
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                Job status will transition to{' '}
                <span className="font-semibold text-slate-700">Awaiting Customer</span>.
              </p>

              <Button
                type="button"
                variant="primary"
                size="md"
                icon={isChangesRequested ? RotateCcw : Send}
                disabled={
                  !selectedProofId ||
                  submitting ||
                  isCancelledOrCompleted ||
                  isSelectedAlreadyPending ||
                  !isConfigured
                }
                onClick={() => setIsConfirming(true)}
                id={isChangesRequested ? 'submit-revised-proof-btn' : 'prepare-submission-btn'}
              >
                {isChangesRequested ? 'Submit Revised Proof' : 'Submit for Review'}
              </Button>
            </div>
          ) : (
            /* Explicit Confirmation Modal / Step */
            <div className="p-5 rounded-2xl bg-slate-50 border-2 border-blue-200 space-y-4 animate-in fade-in">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">
                  {isChangesRequested
                    ? 'Confirm Resubmission of Revised Proof'
                    : 'Confirm Submission for Customer Review'}
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Are you ready to submit{' '}
                  <span className="font-bold text-slate-900">
                    Version {selectedProof?.version_number} ({selectedProof?.original_filename})
                  </span>{' '}
                  for customer review?
                </p>
              </div>

              {isSuperseding && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                  <p>
                    <strong>Notice:</strong> This action will mark Version{' '}
                    {activeProofVersion?.version_number || 'previous'} as superseded and revoke earlier review links for this job.
                  </p>
                  <p className="text-[11px] text-amber-700">
                    You can generate a fresh customer review link once this revised submission is confirmed.
                  </p>
                </div>
              )}

              <p className="text-[11px] text-slate-500 italic">
                Note: Updating the status to Awaiting Customer records this proof as ready for customer review. Customer review links and notifications will be managed in subsequent steps.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={submitting}
                  onClick={() => setIsConfirming(false)}
                  id="cancel-confirm-submission-btn"
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={submitting}
                  onClick={handleConfirmSubmit}
                  id="confirm-submit-for-review-btn"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting...</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <Send className="w-4 h-4" />
                      <span>Confirm Submission</span>
                    </span>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Submission History Section */}
      {submissions.length > 0 && (
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <button
            type="button"
            onClick={() => setShowHistory((prev) => !prev)}
            className="w-full flex items-center justify-between text-left py-1 text-xs font-bold text-slate-600 uppercase tracking-wider hover:text-slate-900 transition-colors cursor-pointer"
            id="toggle-submission-history-btn"
          >
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-slate-400" />
              <span>
                Submission History ({submissions.length}{' '}
                {submissions.length === 1 ? 'record' : 'records'})
              </span>
            </div>
            {showHistory ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {showHistory && (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
              {loadingSubmissions ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  Loading history...
                </div>
              ) : (
                submissions.map((sub) => {
                  const proof = proofs.find((p) => p.id === sub.proof_version_id);
                  const subDecision = decisions.find((d) => d.submission_id === sub.id);
                  const isSuperseded = sub.status === 'superseded';

                  let statusBadge = {
                    label: 'Awaiting Customer',
                    classes: 'bg-blue-50 text-blue-700 border-blue-200',
                    dot: 'bg-blue-500',
                  };

                  if (isSuperseded) {
                    statusBadge = {
                      label: 'Superseded',
                      classes: 'bg-slate-100 text-slate-500 border border-slate-200',
                      dot: 'bg-slate-300',
                    };
                  } else if (subDecision?.decision === 'approved') {
                    statusBadge = {
                      label: 'Approved',
                      classes: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
                      dot: 'bg-emerald-500',
                    };
                  } else if (subDecision?.decision === 'changes_requested') {
                    statusBadge = {
                      label: 'Changes Requested',
                      classes: 'bg-rose-50 text-rose-700 border border-rose-200',
                      dot: 'bg-rose-500',
                    };
                  }

                  const dateStr = new Date(sub.created_at).toLocaleDateString(
                    undefined,
                    {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }
                  );

                  return (
                    <div
                      key={sub.id}
                      className="p-3.5 sm:p-4 space-y-2 text-xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${statusBadge.dot}`}
                          />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-900">
                                Version {proof?.version_number || '—'}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${statusBadge.classes}`}
                              >
                                {statusBadge.label}
                              </span>
                            </div>
                            <p className="text-slate-500 mt-0.5 truncate max-w-xs">
                              {proof?.original_filename || 'Artwork File'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 self-end sm:self-center">
                          <span className="text-slate-400">{dateStr}</span>
                          {proof && (
                            <button
                              type="button"
                              onClick={() => handleViewProof(proof)}
                              disabled={viewingId === proof.id}
                              className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <span>View</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Display revision feedback if attached to this submission */}
                      {subDecision?.decision === 'changes_requested' && subDecision.feedback && (
                        <div className="ml-5 mt-1 p-2.5 rounded-lg bg-rose-50/50 border border-rose-200/70 text-slate-700 text-xs flex items-start gap-2">
                          <MessageSquare className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <span className="font-bold text-rose-800 block text-[11px] uppercase tracking-wider">
                              Customer Feedback:
                            </span>
                            <p className="whitespace-pre-wrap text-slate-700">
                              {subDecision.feedback}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
