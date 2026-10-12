import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  FileText,
  Image as ImageIcon,
  Clock,
  Eye,
  ExternalLink,
  AlertCircle,
  Ban,
  ShieldCheck,
  Loader2,
  Calendar,
  Sparkles,
  Layers,
  CheckCircle2,
  RotateCcw,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react';
import {
  validateCustomerReviewToken,
  getCustomerProofSignedUrl,
  recordCustomerProofDecision,
} from '../services/jobs';
import Button from '../components/ui/Button';

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export default function CustomerProofReview() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [reviewData, setReviewData] = useState(null);
  const [stateStatus, setStateStatus] = useState('loading'); // 'active' | 'expired' | 'revoked' | 'superseded' | 'invalid' | 'closed'
  const [errorMessage, setErrorMessage] = useState('');

  // Signed URL viewing state
  const [viewing, setViewing] = useState(false);
  const [signedProofUrl, setSignedProofUrl] = useState(null);
  const [viewError, setViewError] = useState('');

  // Decision flow states: null | 'approve' | 'revisions'
  const [activeMode, setActiveMode] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackError, setFeedbackError] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function validateToken() {
      if (!token) {
        if (isMounted) {
          setStateStatus('invalid');
          setErrorMessage('No review token provided in URL.');
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setViewError('');

      try {
        const result = await validateCustomerReviewToken(token);
        if (!isMounted) return;

        if (result?.valid) {
          setReviewData(result);
          setStateStatus('active');

          if (result.job?.job_title) {
            document.title = `Design Proof: ${result.job.job_title} | ProofLoop`;
          }
        } else {
          setStateStatus(result?.status || 'invalid');
          setErrorMessage(
            result?.error || 'This design proof review link is unavailable or invalid.'
          );
        }
      } catch (err) {
        if (isMounted) {
          setStateStatus('invalid');
          setErrorMessage(err.message || 'Unable to validate review link.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    validateToken();

    return () => {
      isMounted = false;
    };
  }, [token]);

  // Request temporary signed URL and view file
  const handleViewProof = async () => {
    if (!reviewData?.proof_version?.storage_path) {
      setViewError('Proof file storage reference is unavailable.');
      return;
    }

    setViewing(true);
    setViewError('');

    try {
      const url = await getCustomerProofSignedUrl(
        reviewData.proof_version.storage_path,
        3600
      );

      if (url) {
        setSignedProofUrl(url);
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        throw new Error('Failed to obtain secure viewing link.');
      }
    } catch (err) {
      setViewError(
        err.message || 'Unable to open design proof. Please try again or refresh.'
      );
    } finally {
      setViewing(false);
    }
  };

  // Submit Approval
  const handleConfirmApprove = async () => {
    if (!token) return;
    setSubmittingDecision(true);
    setDecisionError('');

    try {
      const result = await recordCustomerProofDecision({
        token,
        decision: 'approved',
      });

      if (result?.success) {
        setReviewData((prev) => ({
          ...prev,
          has_decision: true,
          decision: result.decision,
        }));
        setActiveMode(null);
      }
    } catch (err) {
      if (err.message?.includes('already been recorded')) {
        try {
          const freshData = await validateCustomerReviewToken(token);
          if (freshData?.valid) {
            setReviewData(freshData);
          }
        } catch {
          // ignore
        }
        setDecisionError('A decision has already been recorded for this proof submission.');
        setActiveMode(null);
      } else {
        setDecisionError(err.message || 'Unable to record approval. Please try again.');
      }
    } finally {
      setSubmittingDecision(false);
    }
  };

  // Submit Revisions Request
  const handleConfirmRevisions = async () => {
    if (!token) return;
    const trimmed = feedbackText.trim();
    if (!trimmed) {
      setFeedbackError('Please describe the changes you would like made before submitting.');
      return;
    }
    if (trimmed.length > 2000) {
      setFeedbackError('Revision feedback cannot exceed 2,000 characters.');
      return;
    }

    setSubmittingDecision(true);
    setDecisionError('');
    setFeedbackError('');

    try {
      const result = await recordCustomerProofDecision({
        token,
        decision: 'changes_requested',
        feedback: trimmed,
      });

      if (result?.success) {
        setReviewData((prev) => ({
          ...prev,
          has_decision: true,
          decision: result.decision,
        }));
        setActiveMode(null);
      }
    } catch (err) {
      if (err.message?.includes('already been recorded')) {
        try {
          const freshData = await validateCustomerReviewToken(token);
          if (freshData?.valid) {
            setReviewData(freshData);
          }
        } catch {
          // ignore
        }
        setDecisionError('A decision has already been recorded for this proof submission.');
        setActiveMode(null);
      } else {
        setDecisionError(err.message || 'Unable to submit revision request. Please try again.');
      }
    } finally {
      setSubmittingDecision(false);
    }
  };

  // Render Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 shadow-xs text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Validating Review Link
          </h2>
          <p className="text-xs text-slate-500">
            Checking token security and retrieving your artwork proof...
          </p>
        </div>
      </div>
    );
  }

  // Render Unavailable / Error States
  if (stateStatus !== 'active' || !reviewData) {
    const errorConfigs = {
      expired: {
        icon: Clock,
        title: 'Review Link Expired',
        color: 'text-amber-600 bg-amber-50 ring-amber-50/50',
        description:
          'This proof review link has expired. Please contact the print shop to request a fresh review link.',
      },
      revoked: {
        icon: Ban,
        title: 'Review Link Revoked',
        color: 'text-rose-600 bg-rose-50 ring-rose-50/50',
        description:
          'This review link has been revoked by the print shop. Please contact your print coordinator for assistance.',
      },
      superseded: {
        icon: Layers,
        title: 'Newer Proof Version Prepared',
        color: 'text-blue-600 bg-blue-50 ring-blue-50/50',
        description:
          'This design proof version has been superseded by an updated version. Please request the latest review link from the print shop.',
      },
      closed: {
        icon: AlertCircle,
        title: 'Job Closed or Cancelled',
        color: 'text-slate-600 bg-slate-100 ring-slate-100/50',
        description:
          'This print job is no longer accepting review feedback.',
      },
      invalid: {
        icon: AlertCircle,
        title: 'Invalid Review Link',
        color: 'text-slate-600 bg-slate-100 ring-slate-100/50',
        description:
          errorMessage ||
          'The review link you opened could not be found or has expired. Please verify the link or contact the shop.',
      },
    };

    const config = errorConfigs[stateStatus] || errorConfigs.invalid;
    const IconComponent = config.icon;

    return (
      <div className="min-h-screen bg-slate-50/80 flex flex-col items-center justify-center p-4">
        <div className="mb-6 flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-sm">
            PL
          </div>
          <span className="font-extrabold text-slate-900 tracking-tight text-lg">
            ProofLoop
          </span>
        </div>

        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200/90 p-8 shadow-xs text-center space-y-4">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ring-8 ${config.color}`}
          >
            <IconComponent className="w-7 h-7" />
          </div>

          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            {config.title}
          </h1>

          <p className="text-sm text-slate-600 leading-relaxed">
            {config.description}
          </p>

          <div className="pt-4 border-t border-slate-100 text-xs text-slate-400">
            Need assistance? Reach out to your printing company representative.
          </div>
        </div>
      </div>
    );
  }

  // Active Review State
  const { job, proof_version, expires_at, has_decision, decision } = reviewData;
  const isPdf =
    proof_version.mime_type?.includes('pdf') ||
    proof_version.original_filename?.endsWith('.pdf');

  const formattedExpiration = formatDateTime(expires_at);

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-800 flex flex-col">
      {/* Top Customer Navigation Bar */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-extrabold text-xs flex items-center justify-center tracking-tight shadow-xs">
              PL
            </div>
            <div>
              <span className="font-bold text-slate-900 text-sm tracking-tight block">
                ProofLoop
              </span>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                Customer Proof Review
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Secure Review</span>
          </div>
        </div>
      </header>

      {/* Main Review Body */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Banner Alert */}
        <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-blue-900">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              Please inspect the design proof below carefully for layout, spelling, and colors.
            </span>
          </div>
          <span className="text-blue-700 shrink-0 flex items-center gap-1 font-medium">
            <Clock className="w-3.5 h-3.5" />
            <span>Link active until {formattedExpiration}</span>
          </span>
        </div>

        {/* View Error Notification */}
        {viewError && (
          <div
            role="alert"
            className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2.5"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{viewError}</span>
          </div>
        )}

        {/* Main Proof Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          {/* Card Header */}
          <div className="p-6 sm:p-8 border-b border-slate-100 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded">
                Version {proof_version.version_number}
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs text-slate-500 font-medium">
                Artwork Design Proof
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              {job.job_title}
            </h1>

            {job.customer_name && (
              <p className="text-sm text-slate-600">
                Prepared for: <strong className="text-slate-800">{job.customer_name}</strong>
              </p>
            )}
          </div>

          {/* Artwork Specs & File Info */}
          <div className="p-6 sm:p-8 space-y-6">
            <div className="bg-slate-50/80 rounded-xl border border-slate-200/80 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start gap-3.5 overflow-hidden">
                <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 text-slate-600 flex items-center justify-center shrink-0 shadow-xs">
                  {isPdf ? (
                    <FileText className="w-6 h-6 text-red-500" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-blue-500" />
                  )}
                </div>

                <div className="min-w-0">
                  <p
                    className="text-base font-semibold text-slate-900 truncate"
                    title={proof_version.original_filename}
                  >
                    {proof_version.original_filename}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                    <span>{formatFileSize(proof_version.file_size)}</span>
                    <span>•</span>
                    <span className="uppercase text-[10px] font-bold tracking-wider px-1.5 py-0.2 rounded bg-slate-200/70 text-slate-600">
                      {isPdf ? 'PDF Document' : 'High-Res Image'}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-slate-500">
                      <Calendar className="w-3 h-3" />
                      <span>
                        Uploaded {formatDateTime(proof_version.created_at)}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* View Design Proof Primary Action */}
              <div className="shrink-0 self-end sm:self-center">
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  icon={viewing ? Loader2 : Eye}
                  disabled={viewing}
                  onClick={handleViewProof}
                  id="customer-view-proof-btn"
                >
                  {viewing ? (
                    <span>Opening Proof...</span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <span>View Design Proof</span>
                      <ExternalLink className="w-4 h-4 ml-0.5 text-blue-200" />
                    </span>
                  )}
                </Button>
              </div>
            </div>

            {/* Design Brief / Requirements Summary */}
            {job.requirements && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Artwork Brief & Specifications
                </h3>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {job.requirements}
                </div>
              </div>
            )}

            {/* Embedded Preview Banner */}
            {signedProofUrl && (
              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Artwork Proof Link Generated
                  </span>
                  <a
                    href={signedProofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    <span>Re-open in new tab</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {!isPdf ? (
                  <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-100/50 p-2 flex items-center justify-center">
                    <img
                      src={signedProofUrl}
                      alt={proof_version.original_filename}
                      className="max-h-96 w-auto object-contain rounded-lg shadow-xs"
                    />
                  </div>
                ) : (
                  <div className="p-6 rounded-xl border border-slate-200 bg-slate-50 text-center space-y-3">
                    <FileText className="w-10 h-10 text-red-500 mx-auto" />
                    <p className="text-sm font-semibold text-slate-800">
                      PDF proof is ready to view
                    </p>
                    <a
                      href={signedProofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors"
                    >
                      <span>Open PDF in New Window</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Notice */}
          <div className="bg-slate-50/80 p-5 sm:p-6 border-t border-slate-100 text-xs text-slate-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span>
              ProofLoop secure artwork verification. No account or login required.
            </span>
            <span className="font-medium text-slate-600">
              {has_decision ? 'Decision Recorded' : 'Awaiting your review'}
            </span>
          </div>
        </div>

        {/* Customer Decision Area (Step 7) */}
        {has_decision && decision ? (
          /* READ-ONLY CONFIRMATION STATE */
          <div
            id="customer-decision-recorded-panel"
            className={`rounded-2xl border p-6 sm:p-8 space-y-4 shadow-xs ${
              decision.decision === 'approved'
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                : 'bg-rose-50/80 border-rose-200 text-rose-950'
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
                  decision.decision === 'approved'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-rose-600 text-white'
                }`}
              >
                {decision.decision === 'approved' ? (
                  <CheckCircle2 className="w-6 h-6" />
                ) : (
                  <RotateCcw className="w-6 h-6" />
                )}
              </div>

              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border ${
                      decision.decision === 'approved'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-rose-100 text-rose-800 border-rose-300'
                    }`}
                  >
                    {decision.decision === 'approved' ? 'Approved' : 'Changes Requested'}
                  </span>
                  <span className="text-xs text-slate-500">
                    Recorded {formatDateTime(decision.created_at)}
                  </span>
                </div>

                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
                  {decision.decision === 'approved'
                    ? 'Design Approved'
                    : 'Revision Request Recorded'}
                </h2>

                <p className="text-sm text-slate-700 leading-relaxed pt-1">
                  {decision.decision === 'approved'
                    ? 'Design approved successfully. The printing team can now review your approval and proceed with the next steps.'
                    : 'Your revision request has been recorded and shared with the printing team.'}
                </p>
              </div>
            </div>

            {decision.decision === 'changes_requested' && decision.feedback && (
              <div className="pt-3 border-t border-rose-200/80">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-800 mb-2">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Your Requested Changes</span>
                </div>
                <div className="p-4 rounded-xl bg-white border border-rose-200 text-slate-800 text-sm whitespace-pre-wrap leading-relaxed shadow-2xs font-normal">
                  {decision.feedback}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs text-slate-500">
              <span>Decision finalized & recorded in database.</span>
              <span className="font-semibold text-slate-700">Read-Only</span>
            </div>
          </div>
        ) : (
          /* ACTIVE DECISION ACTION PANEL */
          <div
            id="customer-decision-action-panel"
            className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-8 space-y-6 shadow-xs"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  Your Decision Needed
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
                Proof Approval & Revision Requests
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Please inspect the artwork proof above. If everything is accurate and ready for print, select <strong>Approve Design</strong>. If any adjustments, corrections, or updates are needed, select <strong>Request Revisions</strong>.
              </p>
            </div>

            {/* General Decision Error Banner */}
            {decisionError && (
              <div
                role="alert"
                className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold">Unable to record decision</p>
                  <p>{decisionError}</p>
                </div>
              </div>
            )}

            {/* Initial Decision Selection Buttons */}
            {activeMode === null && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveMode('approve');
                    setDecisionError('');
                  }}
                  id="approve-design-btn"
                  className="w-full flex items-center justify-center gap-2.5 py-4 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-xs hover:shadow transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                >
                  <CheckCircle2 className="w-5 h-5 text-emerald-100" />
                  <span>Approve Design</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveMode('revisions');
                    setDecisionError('');
                    setFeedbackError('');
                  }}
                  id="request-revisions-btn"
                  className="w-full flex items-center justify-center gap-2.5 py-4 px-6 rounded-xl bg-white hover:bg-rose-50/60 text-rose-700 border border-rose-300 font-bold text-sm shadow-xs hover:shadow transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
                >
                  <RotateCcw className="w-5 h-5 text-rose-600" />
                  <span>Request Revisions</span>
                </button>
              </div>
            )}

            {/* Approve Confirmation Panel */}
            {activeMode === 'approve' && (
              <div
                id="approve-confirmation-panel"
                className="rounded-xl bg-emerald-50/70 border border-emerald-200 p-5 sm:p-6 space-y-4"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-emerald-950">
                      Confirm Design Approval
                    </h3>
                    <p className="text-xs sm:text-sm text-emerald-900/90 leading-relaxed">
                      By approving, you confirm that you have inspected the proof above for spelling, layout, and visual details, and that the design is ready for the printing business to proceed to its next stage.
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    disabled={submittingDecision}
                    onClick={() => setActiveMode(null)}
                    id="cancel-approve-btn"
                  >
                    Cancel
                  </Button>

                  <button
                    type="button"
                    disabled={submittingDecision}
                    onClick={handleConfirmApprove}
                    id="confirm-approve-btn"
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold text-xs sm:text-sm shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                  >
                    {submittingDecision ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Submitting Approval...</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Confirm & Approve Design</span>
                      </span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Request Revisions Form Panel */}
            {activeMode === 'revisions' && (
              <form
                id="revisions-form-panel"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleConfirmRevisions();
                }}
                className="rounded-xl bg-rose-50/50 border border-rose-200 p-5 sm:p-6 space-y-4"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <RotateCcw className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-rose-950">
                      Request Design Revisions
                    </h3>
                    <p className="text-xs sm:text-sm text-rose-900/90 leading-relaxed">
                      Describe the adjustments needed below. Your feedback will be recorded and shared directly with the printing team.
                    </p>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <label
                    htmlFor="revision-feedback-textarea"
                    id="revision-feedback-label"
                    className="block text-xs font-bold text-slate-800 uppercase tracking-wider"
                  >
                    What would you like changed? <span className="text-rose-600">*</span>
                  </label>

                  <textarea
                    id="revision-feedback-textarea"
                    name="feedback"
                    rows={4}
                    maxLength={2000}
                    value={feedbackText}
                    onChange={(e) => {
                      setFeedbackText(e.target.value);
                      if (feedbackError) setFeedbackError('');
                      if (decisionError) setDecisionError('');
                    }}
                    placeholder="Please be specific about copy edits, font adjustments, color changes, or layout updates..."
                    className="w-full rounded-xl border border-slate-300 bg-white p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-y min-h-[100px]"
                  />

                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={
                        feedbackText.trim().length > 1900
                          ? 'text-rose-600 font-semibold'
                          : 'text-slate-400'
                      }
                    >
                      {feedbackText.trim().length} / 2,000 characters
                    </span>

                    {feedbackError && (
                      <span
                        role="alert"
                        className="text-rose-600 font-semibold flex items-center gap-1"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>{feedbackError}</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    disabled={submittingDecision}
                    onClick={() => {
                      setActiveMode(null);
                      setFeedbackError('');
                    }}
                    id="cancel-revisions-btn"
                  >
                    Cancel
                  </Button>

                  <button
                    type="submit"
                    disabled={submittingDecision}
                    id="confirm-submit-revisions-btn"
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white font-bold text-xs sm:text-sm shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
                  >
                    {submittingDecision ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Submitting Revisions...</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <RotateCcw className="w-4 h-4" />
                        <span>Confirm & Submit Revisions</span>
                      </span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
