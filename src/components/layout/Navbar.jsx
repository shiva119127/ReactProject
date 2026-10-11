import React from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, ChevronRight } from 'lucide-react';

export default function Navbar({ onToggleMobile }) {
  const location = useLocation();

  const getPageInfo = (path) => {
    switch (path) {
      case '/':
        return {
          title: 'Dashboard',
          category: 'Overview',
        };
      case '/jobs':
        return {
          title: 'Jobs',
          category: 'Production',
        };
      case '/jobs/new':
        return {
          title: 'Create New Job',
          category: 'Jobs',
        };
      default:
        return {
          title: 'Page Not Found',
          category: 'System',
        };
    }
  };

  const pageInfo = getPageInfo(location.pathname);

  return (
    <header className="sticky top-0 z-10 h-16 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
      {/* Left side: Mobile Toggle & Page Title */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={onToggleMobile}
          className="md:hidden p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          aria-label="Open mobile navigation menu"
          id="navbar-mobile-toggle-btn"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Dynamic Page Header & Breadcrumb */}
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <span>ProofLoop</span>
            <ChevronRight className="w-3 h-3 text-slate-300" />
            <span className="text-slate-500">{pageInfo.category}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-none">
              {pageInfo.title}
            </span>
          </div>
        </div>
      </div>

      {/* Right side: Profile / Avatar Placeholder */}
      <div className="flex items-center gap-3">
        <div
          id="navbar-user-profile-badge"
          className="flex items-center gap-3 pl-3 pr-2 py-1.5 rounded-full border border-slate-200/80 bg-slate-50/70 hover:bg-slate-100/70 transition-colors"
        >
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-semibold text-slate-800 leading-tight">
              Print Shop Admin
            </span>
            <span className="text-[10px] font-medium text-slate-400 leading-none">
              shop@proofloop.com
            </span>
          </div>
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-semibold text-xs flex items-center justify-center shadow-xs">
              PA
            </div>
            <span
              className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white"
              title="Online"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
