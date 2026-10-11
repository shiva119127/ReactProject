import React from 'react';
import {
  Briefcase,
  Clock,
  Send,
  CheckCircle2,
  PlusCircle,
  Inbox,
  ArrowRight,
} from 'lucide-react';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';

// Static placeholder metric definitions for layout purposes only.
// In future steps, these values can easily be replaced by real database queries or hooks.
const PLACEHOLDER_STATS = [
  {
    id: 'stat-total-jobs',
    title: 'Total Jobs',
    value: '0',
    badgeText: 'Static',
    badgeVariant: 'neutral',
    description: 'Total print orders recorded in system',
    icon: Briefcase,
  },
  {
    id: 'stat-awaiting-proof',
    title: 'Awaiting Proof',
    value: '0',
    badgeText: 'Placeholder',
    badgeVariant: 'amber',
    description: 'Orders pending initial proof generation',
    icon: Clock,
  },
  {
    id: 'stat-awaiting-approval',
    title: 'Awaiting Approval',
    value: '0',
    badgeText: 'Placeholder',
    badgeVariant: 'blue',
    description: 'Proofs out for client review & feedback',
    icon: Send,
  },
  {
    id: 'stat-approved',
    title: 'Approved',
    value: '0',
    badgeText: 'Placeholder',
    badgeVariant: 'emerald',
    description: 'Proofs approved and cleared for printing',
    icon: CheckCircle2,
  },
];

export default function Dashboard() {
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

      {/* Static Placeholder Statistics Cards Grid */}
      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">
          Job Statistics Overview
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {PLACEHOLDER_STATS.map((stat) => (
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

      {/* Main Empty State Section */}
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
        </div>

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
      </section>
    </div>
  );
}
