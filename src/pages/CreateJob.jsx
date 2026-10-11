import React from 'react';
import { ArrowLeft, Clock, FileEdit, CheckCircle2 } from 'lucide-react';
import Button from '../components/ui/Button';

export default function CreateJob() {
  return (
    <div className="space-y-8">
      {/* Header with Back Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button
              to="/jobs"
              variant="ghost"
              size="sm"
              icon={ArrowLeft}
              id="create-job-back-btn"
              className="px-2 py-1 text-slate-500 hover:text-slate-800"
            >
              Back to Jobs
            </Button>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Create New Job
          </h1>
          <p className="mt-1.5 text-sm sm:text-base text-slate-600 max-w-2xl leading-relaxed">
            Record customer requirements, artwork specifications, and order
            details for printing production.
          </p>
        </div>
      </div>

      {/* Simple Placeholder Panel */}
      <div
        id="create-job-placeholder-panel"
        className="bg-white rounded-2xl border border-slate-200/90 p-8 sm:p-12 shadow-xs"
      >
        <div className="max-w-xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 ring-8 ring-blue-50/50">
            <FileEdit className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              <Clock className="w-3.5 h-3.5" />
              <span>Coming in Step 2</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Job Creation Form Placeholder
            </h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              The full job creation workflow—including customer details, job
              specifications, target delivery dates, and artwork upload
              guidelines—will be implemented in the next step.
            </p>
          </div>

          <div className="bg-slate-50 rounded-xl p-5 border border-slate-200/70 text-left space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Planned Form Features:
            </p>
            <ul className="text-xs text-slate-600 space-y-2">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Customer contact information and company name</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Print job specifications (quantities, paper stock, sizing)</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Initial artwork notes and file attachment placeholders</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Production deadline & priority assignment</span>
              </li>
            </ul>
          </div>

          <div className="pt-2">
            <Button
              to="/jobs"
              variant="outline"
              id="placeholder-back-to-jobs-btn"
            >
              Return to Jobs
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
