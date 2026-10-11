import React from 'react';

/**
 * Reusable StatCard component for displaying key business metrics.
 * Designed with clean typography, subtle borders, and placeholder styling
 * ready to receive database counts in future steps.
 */
export default function StatCard({
  title,
  value,
  icon: Icon,
  badgeText,
  badgeVariant = 'neutral',
  description,
  id,
}) {
  const badgeVariants = {
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  };

  const iconBgVariants = {
    neutral: 'bg-slate-100 text-slate-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  };

  return (
    <div
      id={id}
      className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs hover:shadow-sm transition-all duration-200"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            {title}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-slate-900">
              {value}
            </span>
            {badgeText && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${badgeVariants[badgeVariant] || badgeVariants.neutral}`}
              >
                {badgeText}
              </span>
            )}
          </div>
        </div>
        {Icon && (
          <div
            className={`p-2.5 rounded-lg shrink-0 ${iconBgVariants[badgeVariant] || iconBgVariants.neutral}`}
          >
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      {description && (
        <p className="mt-3 text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
          {description}
        </p>
      )}
    </div>
  );
}
