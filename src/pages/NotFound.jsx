import React from 'react';
import { Home, HelpCircle } from 'lucide-react';
import Button from '../components/ui/Button';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200/90 p-8 sm:p-10 shadow-xs text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center ring-8 ring-slate-50">
          <HelpCircle className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-bold text-blue-600 uppercase tracking-widest">
            404 Error
          </p>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Page Not Found
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            The page you are looking for doesn't exist or has been moved within ProofLoop.
          </p>
        </div>

        <div className="pt-2 flex justify-center">
          <Button
            to="/"
            variant="primary"
            icon={Home}
            id="not-found-return-home-btn"
          >
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
