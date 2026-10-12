import React from 'react';
import {
  CheckCircle2,
  RotateCcw,
  Clock,
  MessageSquare,
  Calendar,
  ShieldCheck,
} from 'lucide-react';
import StatusBadge from '../ui/StatusBadge';

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

export default function CustomerDecisionSection({
  job,
  decisions = [],
  loading = false,
  proofs = [],
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 animate-pulse space-y-4">
        <div className="h-5 w-44 bg-slate-200 rounded" />
        <div className="h-16 bg-slate-100 rounded-xl" />
      </div>
    );
  }

  const latestDecision = decisions[0] || null;

  // Find associated proof version
  const associatedProof = latestDecision
    ? proofs.find((p) => p.id === latestDecision.proof_version_id) ||
      latestDecision.proof_versions
    : null;

  return (
    <section
      aria-labelledby="customer-decision-heading"
      id="customer-decision-section"
      className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-5"
    >
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              latestDecision?.decision === 'approved'
                ? 'bg-emerald-50 text-emerald-600'
                : latestDecision?.decision === 'changes_requested'
                ? 'bg-rose-50 text-rose-600'
                : 'bg-blue-50 text-blue-600'
            }`}
          >
            {latestDecision?.decision === 'approved' ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : latestDecision?.decision === 'changes_requested' ? (
              <RotateCcw className="w-5 h-5" />
            ) : (
              <Clock className="w-5 h-5" />
            )}
          </div>
          <div>
            <h2
              id="customer-decision-heading"
              className="text-base font-bold text-slate-900 tracking-tight"
            >
              Customer Proof Decision
            </h2>
            <p className="text-xs text-slate-500">
              Recorded client approval and revision requests
            </p>
          </div>
        </div>

        {latestDecision ? (
          <StatusBadge status={latestDecision.decision} />
        ) : (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            {job?.status === 'awaiting_customer'
              ? 'Pending Review'
              : 'No Decision Yet'}
          </span>
        )}
      </div>

      {/* Decision Display */}
      {latestDecision ? (
        <div className="space-y-4">
          <div
            className={`p-5 rounded-xl border space-y-3 ${
              latestDecision.decision === 'approved'
                ? 'bg-emerald-50/60 border-emerald-200/80 text-emerald-950'
                : 'bg-rose-50/60 border-rose-200/80 text-rose-950'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    latestDecision.decision === 'approved'
                      ? 'bg-emerald-500'
                      : 'bg-rose-500'
                  }`}
                />
                <span className="font-bold text-sm">
                  {latestDecision.decision === 'approved'
                    ? 'Design Approved by Customer'
                    : 'Customer Requested Revisions'}
                </span>
              </div>

              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>
                  Recorded on {formatDateTime(latestDecision.created_at)}
                </span>
              </div>
            </div>

            {/* Proof Version Reference */}
            <div className="pt-2 border-t border-slate-200/60 flex items-center gap-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Proof Version:</span>
              <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200 font-bold text-slate-900">
                v{associatedProof?.version_number || '—'}
              </span>
              {associatedProof?.original_filename && (
                <span className="text-slate-500 truncate max-w-xs">
                  ({associatedProof.original_filename})
                </span>
              )}
            </div>

            {/* Revision Feedback Block */}
            {latestDecision.decision === 'changes_requested' && (
              <div className="pt-3 border-t border-rose-200/80 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-800">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Customer Revision Feedback</span>
                </div>
                <div
                  id="owner-revision-feedback-display"
                  className="p-4 rounded-xl bg-white border border-rose-200/90 text-slate-800 text-sm whitespace-pre-wrap leading-relaxed shadow-2xs font-normal"
                >
                  {latestDecision.feedback || 'No written explanation provided.'}
                </div>
              </div>
            )}

            {/* Approved Note */}
            {latestDecision.decision === 'approved' && (
              <div className="pt-2 border-t border-emerald-200/80 text-xs text-emerald-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Artwork confirmed by client. Ready for printing team to review and advance to production.
                </span>
              </div>
            )}
          </div>

          {/* Past Decisions List if multiple exist */}
          {decisions.length > 1 && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Previous Decisions ({decisions.length - 1})
              </p>
              <div className="space-y-2">
                {decisions.slice(1).map((dec) => (
                  <div
                    key={dec.id}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between text-slate-600"
                  >
                    <div className="flex items-center gap-2">
                      <StatusBadge status={dec.decision} />
                      <span>
                        Version {dec.proof_versions?.version_number || '—'}
                      </span>
                    </div>
                    <span className="text-slate-400">
                      {formatDateTime(dec.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Empty / Pending State */
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-1">
          <p className="font-semibold text-slate-800">
            {job?.status === 'awaiting_customer'
              ? 'Awaiting Customer Response'
              : 'No Customer Decision Recorded'}
          </p>
          <p className="text-slate-500 leading-relaxed">
            {job?.status === 'awaiting_customer'
              ? 'A review link is active. When the client approves the design or requests revisions, their decision and notes will appear here.'
              : 'Submit a design proof and generate a customer review link to collect approval or revision requests.'}
          </p>
        </div>
      )}
    </section>
  );
}
