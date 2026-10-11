import React from 'react';
import Button from './Button';

/**
 * Reusable EmptyState component for presenting empty list or overview states.
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionText,
  actionTo,
  actionIcon,
  actionId,
  className = '',
}) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-slate-300 bg-white p-8 sm:p-12 text-center shadow-xs ${className}`}
    >
      <div className="mx-auto max-w-md flex flex-col items-center">
        {Icon && (
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5 ring-8 ring-blue-50/50">
            <Icon className="w-7 h-7" />
          </div>
        )}
        <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
          {title}
        </h3>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed text-center">
          {description}
        </p>

        {actionText && actionTo && (
          <div className="mt-6">
            <Button
              to={actionTo}
              id={actionId}
              variant="primary"
              icon={actionIcon}
            >
              {actionText}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
