import React from 'react';
import { Database, AlertTriangle, Key, Terminal } from 'lucide-react';

export default function SupabaseSetupBanner({ compact = false }) {
  if (compact) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3 text-xs text-amber-800">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        <div>
          <span className="font-semibold">Supabase Configuration Required:</span>{' '}
          Please configure <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono">VITE_SUPABASE_URL</code> and{' '}
          <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono">VITE_SUPABASE_ANON_KEY</code> in your <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono">.env</code> file.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden mb-8">
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 text-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-xl">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base">Supabase Setup Required</h3>
            <p className="text-xs text-amber-100">
              Database connection credentials are not configured in your environment.
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4 text-sm text-slate-700">
        <p>
          To enable persistent job creation, authenticated owners, and real-time dashboard data, provide your Supabase project keys in a <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 font-semibold">.env</code> file:
        </p>

        <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-xs overflow-x-auto space-y-1">
          <div className="text-slate-400"># In /Users/shivamsingh/Desktop/loop/.env</div>
          <div><span className="text-emerald-400">VITE_SUPABASE_URL</span>=https://your-project-id.supabase.co</div>
          <div><span className="text-emerald-400">VITE_SUPABASE_ANON_KEY</span>=your-anon-key-here</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-2.5">
            <Key className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-900 block">1. Obtain Credentials</span>
              <span>Find URL & Anon Key under Project Settings &rarr; API in your Supabase Dashboard.</span>
            </div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-2.5">
            <Terminal className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-900 block">2. Run SQL Migration</span>
              <span>Run the SQL migration in <code className="font-mono">supabase/migrations/</code> in Supabase SQL Editor.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
