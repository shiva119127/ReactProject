import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Hash,
  Mail,
  Phone,
  User,
  Clock,
  AlertCircle,
  ShieldAlert,
  FileText,
  Sparkles,
} from 'lucide-react';
import { getJobById } from '../services/jobs';
import StatusBadge from '../components/ui/StatusBadge';
import Button from '../components/ui/Button';
import DesignProofsSection from '../components/proofs/DesignProofsSection';

export default function JobDetails() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchJob() {
      setLoading(true);
      setError(null);
      try {
        const data = await getJobById(id);
        if (isMounted) {
          setJob(data);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Unable to load job details.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    if (id) {
      fetchJob();
    }

    return () => {
      isMounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 py-6 animate-pulse">
        <div className="h-6 w-32 bg-slate-200 rounded-lg" />
        <div className="h-10 w-3/4 bg-slate-200 rounded-lg" />
        <div className="h-64 bg-slate-100 rounded-2xl border border-slate-200" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto ring-8 ring-amber-50/50">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Job Not Found</h1>
        <p className="text-sm text-slate-500 leading-relaxed">
          {error ||
            'The requested job could not be found or you do not have permission to view it.'}
        </p>
        <div className="pt-2">
          <Button to="/jobs" variant="primary" icon={ArrowLeft}>
            Back to Jobs
          </Button>
        </div>
      </div>
    );
  }

  const formattedCreatedDate = new Date(job.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const formattedDueDate = job.due_date
    ? new Date(job.due_date + 'T00:00:00').toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Top Navigation & Breadcrumbs */}
      <div className="flex flex-col gap-3 pb-4 border-b border-slate-200/80">
        <div className="flex items-center gap-2">
          <Button
            to="/jobs"
            variant="ghost"
            size="sm"
            icon={ArrowLeft}
            id="job-details-back-btn"
            className="px-2 py-1 text-slate-500 hover:text-slate-800"
          >
            Back to Jobs
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md">
                {job.job_number}
              </span>
              <StatusBadge status={job.status} />
            </div>
            <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              {job.job_title}
            </h1>
            <p className="mt-1 text-xs text-slate-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>Created {formattedCreatedDate}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Customer & Production Specs (2 cols) */}
        <div className="md:col-span-2 space-y-6">
          {/* Customer Information Panel */}
          <section
            aria-labelledby="customer-info-heading"
            className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6"
          >
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100 mb-5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <User className="w-5 h-5" />
              </div>
              <h2
                id="customer-info-heading"
                className="text-base font-bold text-slate-900 tracking-tight"
              >
                Customer Details
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">
                  Customer Name
                </span>
                <span className="mt-1 text-slate-900 font-semibold block">
                  {job.customer_name}
                </span>
              </div>

              <div>
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">
                  Phone Number
                </span>
                {job.customer_phone ? (
                  <a
                    href={`tel:${job.customer_phone}`}
                    className="mt-1 text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1.5"
                  >
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{job.customer_phone}</span>
                  </a>
                ) : (
                  <span className="mt-1 text-slate-400 italic">Not provided</span>
                )}
              </div>

              <div className="sm:col-span-2">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">
                  Email Address
                </span>
                {job.customer_email ? (
                  <a
                    href={`mailto:${job.customer_email}`}
                    className="mt-1 text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1.5"
                  >
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>{job.customer_email}</span>
                  </a>
                ) : (
                  <span className="mt-1 text-slate-400 italic">Not provided</span>
                )}
              </div>
            </div>
          </section>

          {/* Customer Requirements Panel */}
          <section
            aria-labelledby="requirements-heading"
            className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6"
          >
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100 mb-5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <h2
                id="requirements-heading"
                className="text-base font-bold text-slate-900 tracking-tight"
              >
                Customer Requirements & Artwork Brief
              </h2>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 text-slate-800 text-sm whitespace-pre-wrap leading-relaxed">
              {job.requirements}
            </div>
          </section>

          {/* Design Proofs Section */}
          <DesignProofsSection jobId={job.id} ownerId={job.owner_id} />

          {/* Internal Notes (Print Shop Only) */}
          {job.internal_notes && (
            <section
              aria-labelledby="internal-notes-heading"
              className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <h2
                    id="internal-notes-heading"
                    className="text-base font-bold text-slate-900 tracking-tight"
                  >
                    Internal Notes
                  </h2>
                </div>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  Shop Only
                </span>
              </div>

              <div className="p-4 rounded-xl bg-amber-50/40 border border-amber-200/60 text-slate-800 text-sm whitespace-pre-wrap leading-relaxed">
                {job.internal_notes}
              </div>
            </section>
          )}
        </div>

        {/* Right Column: Order Metrics & Status Overview */}
        <div className="space-y-6">
          <section
            aria-labelledby="specs-heading"
            className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-5"
          >
            <h2
              id="specs-heading"
              className="text-xs font-bold text-slate-400 uppercase tracking-wider"
            >
              Order Specifications
            </h2>

            <div>
              <span className="text-xs text-slate-500 block">Quantity</span>
              <div className="mt-1 flex items-center gap-2">
                <Hash className="w-4 h-4 text-slate-400" />
                <span className="text-xl font-bold text-slate-900">
                  {Number(job.quantity).toLocaleString()}{' '}
                  <span className="text-xs font-normal text-slate-500">units</span>
                </span>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <span className="text-xs text-slate-500 block">Due Date</span>
              <div className="mt-1 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-800">
                  {formattedDueDate || 'No due date specified'}
                </span>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <span className="text-xs text-slate-500 block">Production Phase</span>
              <div className="mt-2">
                <StatusBadge status={job.status} />
              </div>
            </div>
          </section>

          {/* Next Steps Card */}
          <div className="p-5 rounded-2xl bg-blue-50/60 border border-blue-100 text-blue-900 text-xs space-y-2">
            <div className="flex items-center gap-2 font-semibold text-blue-800">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>Next Production Phase</span>
            </div>
            <p className="leading-relaxed text-blue-700">
              Initial artwork proofing and customer review links will be enabled in upcoming steps.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
