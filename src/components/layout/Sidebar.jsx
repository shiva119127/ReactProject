import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  PlusCircle,
  Layers,
  X,
  Sparkles,
} from 'lucide-react';

const navigationItems = [
  {
    name: 'Dashboard',
    to: '/',
    icon: LayoutDashboard,
    id: 'nav-link-dashboard',
    exact: true,
  },
  {
    name: 'Jobs',
    to: '/jobs',
    icon: Briefcase,
    id: 'nav-link-jobs',
    exact: true,
  },
  {
    name: 'Create Job',
    to: '/jobs/new',
    icon: PlusCircle,
    id: 'nav-link-create-job',
    exact: true,
  },
];

export default function Sidebar({ isOpen, onClose }) {
  const navContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Brand Header */}
      <div className="h-16 px-6 flex items-center justify-between border-b border-slate-100">
        <NavLink
          to="/"
          onClick={onClose}
          className="flex items-center gap-3 group focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg p-1"
          id="sidebar-brand-logo"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20 group-hover:scale-105 transition-transform duration-200">
            <Layers className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold text-slate-900 tracking-tight leading-tight group-hover:text-blue-600 transition-colors">
              ProofLoop
            </span>
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Print Workflow
            </span>
          </div>
        </NavLink>

        {/* Mobile close button */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close sidebar"
            id="sidebar-close-btn"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Main Navigation Links */}
      <div className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          Main Menu
        </div>
        {navigationItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            onClick={onClose}
            id={item.id}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-semibold shadow-xs border border-blue-100/70'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-blue-600' : 'text-slate-400'
                  }`}
                />
                <span className="truncate">{item.name}</span>
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Sidebar Footer Info */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/60 m-3 rounded-xl border">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
          <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
          <span>ProofLoop v1.0</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
          Ready for customer orders, proofs, and approvals.
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:block w-64 shrink-0 sticky top-0 h-screen z-20">
        {navContent}
      </aside>

      {/* Mobile Drawer Backdrop and Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-200"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside className="fixed inset-y-0 left-0 w-72 max-w-[80vw] z-50 shadow-2xl transition-transform duration-200">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
