import React from 'react';
import { PlusCircle, FolderOpen, ArrowRight } from 'lucide-react';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';

export default function Jobs() {
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

      {/* Designed Empty State */}
      <section aria-labelledby="jobs-list-heading">
        <h2 id="jobs-list-heading" className="sr-only">
          Job Records
        </h2>
        <EmptyState
          icon={FolderOpen}
          title="No jobs created yet"
          description="Your print production queue is currently empty. Start by logging customer requirements, order specifications, and job details."
          actionText="Create New Job"
          actionTo="/jobs/new"
          actionIcon={ArrowRight}
          actionId="jobs-empty-state-create-job-btn"
          className="py-16 sm:py-20"
        />
      </section>
    </div>
  );
}
