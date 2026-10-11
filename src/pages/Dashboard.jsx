import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  Clock,
  Send,
  CheckCircle2,
  PlusCircle,
  Inbox,
  ArrowRight,
  AlertCircle,
  Lock,
} from 'lucide-react';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import SupabaseSetupBanner from '../components/ui/SupabaseSetupBanner';
import { useAuth } from '../context/useAuth';
import { getDashboardData } from '../services/jobs';

export default function Dashboard() {
  const { user, isConfigured } = useAuth();
  const [stats, setStats] = useState({
    total: 0,
    awaitingProof: 0,
    awaitingCustomer: 0,
    approved: 0,
  });
  const [recentJobs, setRecentJobs] = useState([]);
  const [loading, setLoading] = useState(Boolean(isConfigured && user));
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    if (!isConfigured || !user) {
      return;
    }

    getDashboardData()
      .then(({ stats: fetchedStats, recentJobs: fetchedRecent }) => {
        if (isMounted) {
          setStats(fetchedStats);
          setRecentJobs(fetchedRecent);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Failed to load dashboard metrics from database.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [user, isConfigured]);

  const statCardsData = [
    {
      id: 'stat-total-jobs',
      title: 'Total Jobs',
      value: loading ? '...' : String(stats.total),
      badgeText: isConfigured && user ? 'Database' : 'Setup Req',
      badgeVariant: 'neutral',
      description: 'Total print orders recorded in your shop',
      icon: Briefcase,
    },
    {
      id: 'stat-awaiting-proof',
      title: 'Awaiting Proof',
      value: loading ? '...' : String(stats.awaitingProof),
      badgeText: isConfigured && user ? 'Design Queue' : 'Setup Req',
      badgeVariant: 'amber',
      description: 'Orders pending initial proof generation',
      icon: Clock,
    },
    {
      id: 'stat-awaiting-customer',
      title: 'Awaiting Approval',
      value: loading ? '...' : String(stats.awaitingCustomer),
      badgeText: isConfigured && user ? 'Client Review' : 'Setup Req',
      badgeVariant: 'blue',
      description: 'Proofs out for client review & feedback',
      icon: Send,
    },
    {
      id: 'stat-approved',
      title: 'Approved',
      value: loading ? '...' : String(stats.approved),
      badgeText: isConfigured && user ? 'Print Ready' : 'Setup Req',
      badgeVariant: 'emerald',
      description: 'Proofs approved and cleared for printing',
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Welcome to ProofLoop
          </h1>
          <p className="mt-1.5 text-sm sm:text-base text-slate-600 max-w-2xl leading-relaxed">
            ProofLoop helps your printing business manage customer orders, design
            proofs, approvals, revisions, and production workflows in one unified hub.
          </p>
        </div>

        <div className="shrink-0">
          <Button
            to="/jobs/new"
            id="dashboard-header-create-job-btn"
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
              Sign in to view live statistics and recent production activity for your print shop.
            </p>
          </div>
          <Button to="/login" variant="primary" size="sm">
            Sign In
          </Button>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-xs text-red-700 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Database Connection Notice</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Database-backed Statistics Cards Grid */}
      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">
          Job Statistics Overview
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {statCardsData.map((stat) => (
            <StatCard
              key={stat.id}
              id={stat.id}
              title={stat.title}
              value={stat.value}
              icon={stat.icon}
              badgeText={stat.badgeText}
              badgeVariant={stat.badgeVariant}
              description={stat.description}
            />
          ))}
        </div>
      </section>

      {/* Recent Job Activity Section */}
      <section aria-labelledby="activity-heading" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2
              id="activity-heading"
              className="text-lg font-bold text-slate-900 tracking-tight"
            >
              Recent Job Activity
            </h2>
            <p className="text-xs text-slate-500">
              Overview of active print orders and proof progress
            </p>
          </div>

          {recentJobs.length > 0 && (
            <Link
              to="/jobs"
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <span>View all jobs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>

        {loading ? (
          <div className="h-48 bg-white rounded-2xl border border-slate-200/80 animate-pulse" />
        ) : recentJobs.length > 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="py-3.5 px-4 sm:px-6">Job #</th>
                    <th scope="col" className="py-3.5 px-4 sm:px-6">Job Title</th>
                    <th scope="col" className="py-3.5 px-4 sm:px-6">Customer</th>
                    <th scope="col" className="py-3.5 px-4 sm:px-6">Quantity</th>
                    <th scope="col" className="py-3.5 px-4 sm:px-6">Status</th>
                    <th scope="col" className="py-3.5 px-4 sm:px-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {recentJobs.map((job) => (
                    <tr
                      key={job.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      <td className="py-4 px-4 sm:px-6 font-mono text-xs font-bold text-blue-600">
                        <Link to={`/jobs/${job.id}`} className="hover:underline">
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
                      <td className="py-4 px-4 sm:px-6">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-right">
                        <Link
                          to={`/jobs/${job.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                        >
                          <span>Details</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Inbox}
            title="No jobs in the pipeline yet"
            description="Jobs will appear here once they are created. Once you start logging customer orders, you can track proof uploads, revision requests, and client sign-offs directly from this dashboard."
            actionText="Create Your First Job"
            actionTo="/jobs/new"
            actionIcon={ArrowRight}
            actionId="dashboard-empty-state-create-job-btn"
            className="py-12 sm:py-16"
          />
        )}
      </section>
    </div>
  );
}
