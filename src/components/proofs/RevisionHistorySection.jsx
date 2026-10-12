import React, { useState } from 'react';
import {
  History,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  RotateCcw,
  MessageSquare,
  ExternalLink,
  Loader2,
  Upload,
  AlertCircle,
  Eye,
} from 'lucide-react';
import Button from '../ui/Button';
import { getSignedProofUrl } from '../../services/jobs';

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

export default function RevisionHistorySection({
  job,
  revisions = [],
  loading = false,
  onUploadRevisedProof,
}) {
  const [viewingId, setViewingId] = useState(null);
  const [viewError, setViewError] = useState('');

  // Find latest revision feedback if job is currently changes_requested
  const isChangesRequested = job?.status === 'changes_requested';
  const latestRevisionWithFeedback = revisions.find(
    (r) => r.decision?.decision === 'changes_requested' && r.decision?.feedback
  );
  const activeFeedback = latestRevisionWithFeedback?.decision?.feedback || null;

  const handleViewProof = async (revision) => {
    if (!revision?.storagePath) return;
    setViewingId(revision.id);
    setViewError('');

    try {
      const signedUrl = await getSignedProofUrl(revision.storagePath, 3600);
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

  if (loading) {
    return (
      <section
        id="revision-history-section"
        aria-labelledby="revision-history-heading"
        className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-4 animate-pulse"
      >
        <div className="h-6 w-44 bg-slate-200 rounded" />
        <div className="h-24 bg-slate-100 rounded-xl" />
      </section>
    );
  }

  return (
    <section
      id="revision-history-section"
      aria-labelledby="revision-history-heading"
      className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2
                id="revision-history-heading"
                className="text-lg font-bold text-slate-900 tracking-tight"
              >
                Revision History
              </h2>
              {revisions.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                  {revisions.length} {revisions.length === 1 ? 'version' : 'versions'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Track proof versions, customer feedback, and approval lifecycle
            </p>
          </div>
        </div>

        {isChangesRequested && onUploadRevisedProof && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={Upload}
            onClick={onUploadRevisedProof}
            id="revision-history-upload-revised-btn"
          >
            Upload Revised Proof
          </Button>
        )}
      </div>

      {/* Prominent Revision Feedback Banner when changes are requested */}
      {isChangesRequested && activeFeedback && (
        <div
          id="active-changes-requested-banner"
          className="p-5 rounded-xl bg-rose-50/80 border border-rose-200 text-rose-950 space-y-3 shadow-2xs"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0">
                <RotateCcw className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-rose-900">
                Action Required: Customer Requested Revisions
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-200/80 text-rose-900">
              Changes Requested
            </span>
          </div>

          <div className="pl-9 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-800">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Customer's Feedback</span>
            </div>
            <div className="p-3.5 rounded-xl bg-white border border-rose-200/90 text-slate-800 text-sm whitespace-pre-wrap leading-relaxed">
              {activeFeedback}
            </div>
            <p className="text-xs text-rose-800/90 leading-relaxed pt-1">
              Upload an updated artwork proof addressing these notes, then submit it for customer review to restart the approval cycle.
            </p>
          </div>
        </div>
      )}

      {/* Error alert for signed URL generation */}
      {viewError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{viewError}</span>
        </div>
      )}

      {/* Revision Records List */}
      {revisions.length === 0 ? (
        /* Empty State */
        <div
          id="revision-history-empty"
          className="p-8 rounded-xl border border-dashed border-slate-200 text-center space-y-3 bg-slate-50/50"
        >
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <History className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-800">
              No Revision History Recorded
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Upload an initial design proof to begin tracking versions, submissions, and customer review decisions.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {revisions.map((rev) => {
            const isPdf =
              rev.mimeType?.includes('pdf') ||
              rev.originalFilename?.toLowerCase().endsWith('.pdf');

            const hasDecision = Boolean(rev.decision);
            const isApproved = rev.decision?.decision === 'approved';
            const isChangesReq = rev.decision?.decision === 'changes_requested';

            return (
              <div
                key={rev.id}
                className={`rounded-xl border transition-all p-4 sm:p-5 space-y-3.5 ${
                  rev.isCurrent
                    ? 'bg-blue-50/20 border-blue-200 shadow-2xs'
                    : 'bg-white border-slate-200'
                }`}
              >
                {/* Top Row: Version Header & Badges */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
                      {isPdf ? (
                        <FileText className="w-5 h-5 text-red-500" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-blue-500" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-slate-900">
                          Version {rev.versionNumber}
                        </span>

                        {rev.isCurrent && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
                            Current Version
                          </span>
                        )}

                        {/* Submission status badge */}
                        {rev.submission ? (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                              rev.submission.status === 'pending_review'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                            }`}
                          >
                            {rev.submission.status === 'pending_review'
                              ? 'Pending Review'
                              : 'Superseded'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                            Not Submitted
                          </span>
                        )}

                        {/* Customer Decision badge */}
                        {hasDecision && (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                              isApproved
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            {isApproved ? 'Approved' : 'Changes Requested'}
                          </span>
                        )}
                      </div>

                      <p
                        className="text-xs text-slate-600 mt-1 truncate max-w-md font-medium"
                        title={rev.originalFilename}
                      >
                        {rev.originalFilename}
                      </p>
                    </div>
                  </div>

                  {/* Actions & Timestamp */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 self-end sm:self-center">
                    <span className="text-xs text-slate-400">
                      Uploaded {formatDateTime(rev.createdAt)}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleViewProof(rev)}
                      disabled={viewingId === rev.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
                      title="View private proof via temporary signed URL"
                    >
                      {viewingId === rev.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Opening...</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5 text-slate-500" />
                          <span>View Proof</span>
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* File Metadata line */}
                <div className="pt-2 border-t border-slate-100 flex items-center gap-3 text-[11px] text-slate-400">
                  <span>Size: {formatFileSize(rev.fileSize)}</span>
                  <span>•</span>
                  <span>Type: {isPdf ? 'PDF Document' : 'Raster Image'}</span>
                  {rev.submission?.createdAt && (
                    <>
                      <span>•</span>
                      <span>
                        Submitted on {formatDateTime(rev.submission.createdAt)}
                      </span>
                    </>
                  )}
                </div>

                {/* Customer Decision & Revision Feedback callout */}
                {isChangesReq && rev.decision?.feedback && (
                  <div className="p-3.5 rounded-lg bg-rose-50/60 border border-rose-200/80 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-rose-800 text-[11px]">
                      <MessageSquare className="w-3.5 h-3.5 text-rose-600" />
                      <span>Customer Feedback on Version {rev.versionNumber}:</span>
                      <span className="text-slate-400 font-normal">
                        ({formatDateTime(rev.decision.createdAt)})
                      </span>
                    </div>
                    <p className="p-2.5 rounded bg-white border border-rose-100 text-slate-800 whitespace-pre-wrap leading-relaxed font-normal">
                      {rev.decision.feedback}
                    </p>
                  </div>
                )}

                {isApproved && (
                  <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200/80 text-xs text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Customer officially approved Version {rev.versionNumber} on{' '}
                      {formatDateTime(rev.decision.createdAt)}.
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
