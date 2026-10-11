import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PlusCircle,
  FolderOpen,
  Search,
  ArrowRight,
  Filter,
  RefreshCw,
  AlertCircle,
  Lock,
} from 'lucide-react';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import StatusBadge from '../components/ui/StatusBadge';
import SupabaseSetupBanner from '../components/ui/SupabaseSetupBanner';
import { useAuth } from '../context/useAuth';
import { getJobs } from '../services/jobs';

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'awaiting_proof', label: 'Awaiting Proof' },
  { value: 'awaiting_customer', label: 'Awaiting Customer' },
  { value: 'changes_requested', label: 'Changes Requested' },
  { value: 'approved', label: 'Approved' },
  { value: 'in_production', label: 'In Production' },
  { value: 'quality_check', label: 'Quality Check' },
  { value: 'ready_for_delivery', label: 'Ready for Delivery' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function Jobs() {
  const { user, isConfigured } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(Boolean(isConfigured && user));
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchJobList = React.useCallback(async () => {
    if (!isConfigured || !user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await getJobs({ search: activeSearch, status: statusFilter });
      setJobs(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch jobs from database.');
    } finally {
      setLoading(false);
    }
  }, [user, isConfigured, activeSearch, statusFilter]);

  useEffect(() => {
    let ignore = false;

    if (!isConfigured || !user) {
      return;
    }

    getJobs({ search: activeSearch, status: statusFilter })
      .then((data) => {
        if (!ignore) {
          setJobs(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message || 'Failed to fetch jobs from database.');
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [user, isConfigured, activeSearch, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setActiveSearch(searchTerm);
  };


  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Jobs
          </h1>
          <p className="mt-1.5 text-sm sm:text-base text-slate-600 max-w-2xl leading-relaxed">
            Track, monitor, and manage print production jobs from initial design
            to final customer approval and delivery.
          </p>
        </div>

        <div className="shrink-0">
          <Button
            to="/jobs/new"
            id="jobs-header-create-job-btn"
            variant="primary"
            icon={PlusCircle}
          >
            Create Job
          </Button>
        </div>
      </div>

      {!isConfigured && <SupabaseSetupBanner />}

      {isConfigured && !user && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800">
              Please sign in to view and manage your print jobs.
            </p>
          </div>
          <Button to="/login" variant="primary" size="sm">
            Sign In
          </Button>
        </div>
      )}

      {/* Search and Filters Bar */}
      {isConfigured && user && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 sm:p-5 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <form
            onSubmit={handleSearchSubmit}
            className="flex-1 relative flex items-center"
          >
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by job #, title, or customer name..."
              className="w-full pl-10 pr-24 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <button
              type="submit"
              className="absolute right-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Search
            </button>
          </form>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent text-slate-800 font-medium focus:outline-none cursor-pointer"
              >
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={fetchJobList}
              title="Refresh jobs list"
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-xs text-red-700 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Database Error</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 bg-white rounded-2xl border border-slate-200/80 animate-pulse"
            />
          ))}
        </div>
      ) : isConfigured && user && jobs.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={activeSearch || statusFilter !== 'all' ? 'No matching jobs' : 'No jobs created yet'}
          description={
            activeSearch || statusFilter !== 'all'
              ? 'No print jobs match your search or filter criteria. Try resetting the filters.'
              : 'Your print production queue is currently empty. Start by logging customer requirements and order specifications.'
          }
          actionText={activeSearch || statusFilter !== 'all' ? undefined : 'Create New Job'}
          actionTo={activeSearch || statusFilter !== 'all' ? undefined : '/jobs/new'}
          actionIcon={activeSearch || statusFilter !== 'all' ? undefined : PlusCircle}
          actionId="jobs-empty-state-create-job-btn"
          className="py-16 sm:py-20"
        />

      ) : isConfigured && user ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th scope="col" className="py-3.5 px-4 sm:px-6">Job #</th>
                  <th scope="col" className="py-3.5 px-4 sm:px-6">Job Title</th>
                  <th scope="col" className="py-3.5 px-4 sm:px-6">Customer</th>
                  <th scope="col" className="py-3.5 px-4 sm:px-6">Quantity</th>
                  <th scope="col" className="py-3.5 px-4 sm:px-6">Due Date</th>
                  <th scope="col" className="py-3.5 px-4 sm:px-6">Status</th>
                  <th scope="col" className="py-3.5 px-4 sm:px-6">Created</th>
                  <th scope="col" className="py-3.5 px-4 sm:px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {jobs.map((job) => {
                  const createdDate = new Date(job.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  });
                  const dueDate = job.due_date
                    ? new Date(job.due_date + 'T00:00:00').toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })
                    : '—';

                  return (
                    <tr
                      key={job.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      <td className="py-4 px-4 sm:px-6 font-mono text-xs font-bold text-blue-600">
                        <Link
                          to={`/jobs/${job.id}`}
                          className="hover:underline flex items-center gap-1.5"
                        >
                          {job.job_number}
                        </Link>
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-slate-900 font-semibold max-w-xs truncate">
                        <Link
                          to={`/jobs/${job.id}`}
                          className="hover:text-blue-600 transition-colors"
                        >
                          {job.job_title}
                        </Link>
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-slate-700">
                        {job.customer_name}
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-slate-700">
                        {Number(job.quantity).toLocaleString()}
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-slate-600">
                        {dueDate}
                      </td>
                      <td className="py-4 px-4 sm:px-6">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-xs text-slate-400">
                        {createdDate}
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-right">
                        <Link
                          to={`/jobs/${job.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                        >
                          <span>View</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
