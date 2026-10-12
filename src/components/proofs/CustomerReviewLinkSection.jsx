import React, { useState, useEffect } from 'react';
import {
  Link2,
  Copy,
  Check,
  AlertCircle,
  Clock,
  Ban,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import Button from '../ui/Button';
import {
  getProofReviewLinks,
  createProofReviewLink,
  revokeProofReviewLink,
} from '../../services/jobs';
import { useAuth } from '../../context/useAuth';

export default function CustomerReviewLinkSection({
  job,
  pendingSubmission,
}) {
  const { user, isConfigured } = useAuth();
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(Boolean(job?.id));
  const [error, setError] = useState(null);

  // Raw token saved only during the active creation session
  const [sessionRawToken, setSessionRawToken] = useState(null);
  const [sessionLinkId, setSessionLinkId] = useState(null);

  // Operations state
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [copied, setCopied] = useState(false);

  // Confirmation modals / steps
  const [isConfirmingGenerate, setIsConfirmingGenerate] = useState(false);
  const [isConfirmingRevoke, setIsConfirmingRevoke] = useState(false);

  const jobId = job?.id;

  const loadLinks = React.useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getProofReviewLinks(jobId);
      setLinks(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch review links.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    let ignore = false;
    if (!jobId) return;

    getProofReviewLinks(jobId)
      .then((data) => {
        if (!ignore) {
          setLinks(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message || 'Failed to fetch review links.');
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [jobId]);

  // Stable timestamp initialized cleanly
  const [nowTimestamp] = useState(() => Date.now());

  // Derive active link: unrevoked and not expired
  const activeLink = links.find(
    (l) => !l.revoked_at && new Date(l.expires_at).getTime() > nowTimestamp
  );

  // Most recent link regardless of status
  const latestLink = links[0] || null;

  // Determine current display link
  const currentLink = activeLink || latestLink;

  const isLinkActive = Boolean(
    currentLink &&
      !currentLink.revoked_at &&
      new Date(currentLink.expires_at).getTime() > nowTimestamp
  );

  const isLinkRevoked = Boolean(currentLink?.revoked_at);
  const isLinkExpired = Boolean(
    currentLink &&
      !currentLink.revoked_at &&
      new Date(currentLink.expires_at).getTime() <= nowTimestamp
  );

  // Full review URL if session token is available
  const fullReviewUrl =
    sessionRawToken && sessionLinkId === currentLink?.id
      ? `${window.location.origin}/review/${sessionRawToken}`
      : null;

  // Masked URL when viewing a previously generated active link
  const maskedDisplayUrl = isLinkActive
    ? fullReviewUrl || `${window.location.origin}/review/••••••••••••••••••••••••••••••••`
    : null;

  // Copy URL with clipboard API and textarea fallback
  const handleCopyLink = async () => {
    if (!fullReviewUrl && !sessionRawToken) {
      // If raw token is not in memory, inform user
      setActionError(
        'For security, the full link with token was only shown when created. Generate a new link to copy the URL directly.'
      );
      return;
    }

    const urlToCopy = fullReviewUrl;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(urlToCopy);
      } else {
        // Fallback for restricted clipboard contexts
        const textArea = document.createElement('textarea');
        textArea.value = urlToCopy;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      setCopied(true);
      setActionSuccess('Review link copied to clipboard!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setActionError('Failed to copy link automatically. Please select and copy manually.');
    }
  };

  // Generate Link Handler
  const handleGenerateLink = async () => {
    if (!pendingSubmission) {
      setActionError('Cannot generate link: No pending proof submission found for this job.');
      return;
    }

    if (!user || user.id !== job?.owner_id) {
      setActionError('Authentication required: Only the job owner can generate review links.');
      return;
    }

    setGenerating(true);
    setActionError('');
    setActionSuccess('');

    try {
      // 7 days expiration period
      const result = await createProofReviewLink({
        submissionId: pendingSubmission.id,
        expiresInDays: 7,
      });

      if (!result?.raw_token) {
        throw new Error('Server did not return a valid review token.');
      }

      setSessionRawToken(result.raw_token);
      setSessionLinkId(result.id);
      setIsConfirmingGenerate(false);
      setActionSuccess(
        'Secure customer review link created! It will remain active for 7 days.'
      );

      // Refresh links from server
      await loadLinks();
    } catch (err) {
      setActionError(err.message || 'Failed to generate review link.');
      setIsConfirmingGenerate(false);
    } finally {
      setGenerating(false);
    }
  };

  // Revoke Link Handler
  const handleRevokeLink = async () => {
    if (!currentLink) return;

    if (!user || user.id !== job?.owner_id) {
      setActionError('Authentication required: Only the job owner can revoke review links.');
      return;
    }

    setRevoking(true);
    setActionError('');
    setActionSuccess('');

    try {
      await revokeProofReviewLink(currentLink.id);
      setSessionRawToken(null);
      setSessionLinkId(null);
      setIsConfirmingRevoke(false);
      setActionSuccess('Review link successfully revoked. Customers can no longer access the proof with this link.');

      await loadLinks();
    } catch (err) {
      setActionError(err.message || 'Failed to revoke review link.');
      setIsConfirmingRevoke(false);
    } finally {
      setRevoking(false);
    }
  };

  return (
    <section
      aria-labelledby="customer-review-link-heading"
      className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-6"
    >
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Link2 className="w-5 h-5" />
          </div>
          <div>
            <h2
              id="customer-review-link-heading"
              className="text-lg font-bold text-slate-900 tracking-tight"
            >
              Customer Review Link
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Generate a secure, tokenized URL allowing your customer to view the submitted proof without signing in.
            </p>
          </div>
        </div>

        {/* Link Status Pill */}
        {isLinkActive ? (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Link Active</span>
          </div>
        ) : isLinkRevoked ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold shrink-0">
            <Ban className="w-3.5 h-3.5" />
            <span>Link Revoked</span>
          </div>
        ) : isLinkExpired ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold shrink-0">
            <Clock className="w-3.5 h-3.5" />
            <span>Link Expired</span>
          </div>
        ) : null}
      </div>

      {/* Notifications */}
      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-3"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Review Links Query Notice</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-3"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Action Notice</p>
            <p className="mt-0.5">{actionError}</p>
          </div>
        </div>
      )}

      {actionSuccess && (
        <div
          role="status"
          className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-3 animate-in fade-in"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-medium">{actionSuccess}</span>
        </div>
      )}

      {/* Main Content */}
      {loading ? (
        <div className="space-y-3 py-4">
          <div className="h-14 bg-slate-100 rounded-xl animate-pulse" />
        </div>
      ) : !pendingSubmission ? (
        /* Empty State: No Pending Submission */
        <div className="text-center py-8 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 space-y-2">
          <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center mx-auto shadow-xs">
            <Link2 className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">
            No pending proof submission
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            Review links are generated for proof versions submitted for customer review. Select and submit an uploaded proof above to enable link generation.
          </p>
        </div>
      ) : (
        /* Active / Configured Link Area */
        <div className="space-y-5">
          {isLinkActive ? (
            /* Active Link Card */
            <div className="rounded-xl bg-slate-50/80 border border-slate-200 p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Customer Review URL
                  </span>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Valid for 7 days. Only customer-safe proof details are revealed.
                  </p>
                </div>

                <div className="text-xs text-slate-500 flex items-center gap-1.5 shrink-0">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    Expires:{' '}
                    <strong className="text-slate-700">
                      {new Date(currentLink.expires_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </strong>
                  </span>
                </div>
              </div>

              {/* URL Display and Action Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="flex-1 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 font-mono text-xs text-slate-700 truncate select-all flex items-center justify-between">
                  <span className="truncate" title={fullReviewUrl || 'Review URL Active'}>
                    {maskedDisplayUrl}
                  </span>
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 ml-2" />
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {fullReviewUrl && (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      icon={copied ? Check : Copy}
                      onClick={handleCopyLink}
                      id="copy-review-link-btn"
                    >
                      {copied ? 'Copied!' : 'Copy Link'}
                    </Button>
                  )}

                  {fullReviewUrl && (
                    <a
                      href={fullReviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                      title="Open review page in new tab"
                      id="open-review-link-new-tab-btn"
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}

                  {!fullReviewUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      icon={RefreshCw}
                      onClick={() => setIsConfirmingGenerate(true)}
                      id="replace-active-review-link-btn"
                    >
                      Regenerate Link
                    </Button>
                  )}
                </div>
              </div>

              {!fullReviewUrl && (
                <p className="text-[11px] text-slate-500 italic">
                  Note: The raw security token is only displayed when generated. To copy or send a new link, click <strong>Regenerate Link</strong>.
                </p>
              )}

              {/* Link Management Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 text-xs">
                <span className="text-slate-400">
                  Default validity: 7 days
                </span>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsConfirmingRevoke(true)}
                    className="text-rose-600 hover:text-rose-800 font-medium transition-colors cursor-pointer"
                    id="trigger-revoke-link-btn"
                  >
                    Revoke Link
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* No Active Link (Expired, Revoked, or Not Yet Created) */
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-900">
                    {isLinkRevoked
                      ? 'Previous Review Link Revoked'
                      : isLinkExpired
                      ? 'Previous Review Link Expired'
                      : 'Generate Customer Review Link'}
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed max-w-lg">
                    {isLinkRevoked || isLinkExpired
                      ? 'The previous review link is no longer accessible. Generate a new 7-day review link for this pending proof submission.'
                      : 'Generate a private, cryptographically secure review link. Your client will be able to view this proof version without logging in.'}
                  </p>
                </div>

                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  icon={Link2}
                  disabled={generating || !isConfigured}
                  onClick={() => setIsConfirmingGenerate(true)}
                  id="generate-review-link-btn"
                  className="shrink-0"
                >
                  {generating ? 'Generating...' : 'Generate Review Link'}
                </Button>
              </div>
            </div>
          )}

          {/* Confirmation: Generate / Replace Active Link */}
          {isConfirmingGenerate && (
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border-2 border-indigo-200 space-y-3 animate-in fade-in">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span>
                    {isLinkActive
                      ? 'Confirm Replacing Active Review Link'
                      : 'Confirm Review Link Generation'}
                  </span>
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {isLinkActive
                    ? 'An active review link is currently live. Creating a new link will immediately revoke the existing link and generate a fresh 7-day token. Continue?'
                    : 'A new secure review link will be generated for Version ' +
                      (pendingSubmission?.proof_version_id ? 'selected' : '') +
                      '. The link will expire in 7 days.'}
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-1 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={generating}
                  onClick={() => setIsConfirmingGenerate(false)}
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={generating}
                  onClick={handleGenerateLink}
                  id="confirm-generate-review-link-btn"
                >
                  {generating ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generating Link...</span>
                    </span>
                  ) : (
                    <span>Confirm & Generate</span>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Confirmation: Revoke Link */}
          {isConfirmingRevoke && (
            <div className="p-4 sm:p-5 rounded-2xl bg-rose-50/70 border-2 border-rose-200 space-y-3 animate-in fade-in">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-rose-900 flex items-center gap-2">
                  <Ban className="w-4 h-4 text-rose-600" />
                  <span>Confirm Review Link Revocation</span>
                </h4>
                <p className="text-xs text-rose-800 leading-relaxed">
                  Are you sure you want to revoke this review link? Any customers who attempt to open this link will no longer be able to view the proof.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-1 border-t border-rose-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={revoking}
                  onClick={() => setIsConfirmingRevoke(false)}
                >
                  Cancel
                </Button>

                <button
                  type="button"
                  disabled={revoking}
                  onClick={handleRevokeLink}
                  id="confirm-revoke-review-link-btn"
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  {revoking ? 'Revoking...' : 'Confirm Revocation'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
