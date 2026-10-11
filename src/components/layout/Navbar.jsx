import React from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { Menu, ChevronRight, LogOut, LogIn } from 'lucide-react';
import { useAuth } from '../../context/useAuth';

export default function Navbar({ onToggleMobile }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();


  const getPageInfo = (path) => {
    if (path === '/') {
      return { title: 'Dashboard', category: 'Overview' };
    }
    if (path === '/jobs') {
      return { title: 'Jobs', category: 'Production' };
    }
    if (path === '/jobs/new') {
      return { title: 'Create New Job', category: 'Jobs' };
    }
    if (path.startsWith('/jobs/')) {
      return { title: 'Job Details', category: 'Jobs' };
    }
    if (path === '/login') {
      return { title: 'Authentication', category: 'Account' };
    }
    return { title: 'Page Not Found', category: 'System' };
  };

  const pageInfo = getPageInfo(location.pathname);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch {
      // Ignored
    }
  };

  const getUserInitials = () => {
    if (!user?.email) return 'PS';
    return user.email.slice(0, 2).toUpperCase();
  };

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

      {/* Right side: Profile / Auth Controls */}
      <div className="flex items-center gap-3">
        {user ? (
          <div className="flex items-center gap-3">
            <div
              id="navbar-user-profile-badge"
              className="flex items-center gap-3 pl-3 pr-2 py-1.5 rounded-full border border-slate-200/80 bg-slate-50/70"
            >
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-semibold text-slate-800 leading-tight">
                  Shop Owner
                </span>
                <span className="text-[10px] font-medium text-slate-400 leading-none truncate max-w-[140px]">
                  {user.email}
                </span>
              </div>
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-semibold text-xs flex items-center justify-center shadow-xs">
                  {getUserInitials()}
                </div>
                <span
                  className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white"
                  title="Authenticated"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              title="Sign Out"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              id="navbar-sign-out-btn"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            id="navbar-sign-in-btn"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-xs"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </Link>
        )}
      </div>
    </header>
  );
}
