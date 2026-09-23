/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Briefcase,
  UserCheck,
  Shield,
  Mail,
  LogOut,
  LogIn,
  UserPlus,
  Menu,
  X,
} from 'lucide-react';
import { User, UserRole } from '../types';

interface HeaderProps {
  currentUser: User | null;
  activeRoleView: UserRole | 'test_runner';
  onSelectRoleView: (role: UserRole | 'test_runner') => void;
  onOpenSignIn: () => void;
  onOpenSignUp: () => void;
  onLogout: () => void;
  onOpenEmails?: () => void;
  emailCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  activeRoleView,
  onSelectRoleView,
  onOpenSignIn,
  onOpenSignUp,
  onLogout,
  onOpenEmails,
  emailCount = 0,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-700 flex items-center justify-center text-white shadow-sm font-bold text-lg">
              ND
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-lg tracking-tight">
                  Nowshera Digital
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase tracking-wide">
                  ATS
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Recruitment & Applicant Tracking System
              </p>
            </div>
          </div>

          {/* Center: When logged in, show active role status indicator */}
          {currentUser && (
            <div className="hidden md:flex items-center gap-2">
              {currentUser.role === 'candidate' && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-200">
                  <Briefcase className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Candidate Dashboard</span>
                </div>
              )}
              {currentUser.role === 'recruiter' && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-800 text-xs font-semibold border border-blue-200">
                  <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                  <span>Recruiter Dashboard</span>
                </div>
              )}
              {currentUser.role === 'admin' && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-800 text-xs font-semibold border border-indigo-200">
                  <Shield className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Admin Management Console</span>
                </div>
              )}
            </div>
          )}

          {/* Right Action Keys */}
          <div className="flex items-center gap-3">
            {currentUser ? (
              // Logged In view: User details + Sign Out key (and optional notification badge)
              <div className="flex items-center gap-3">
                {onOpenEmails && (
                  <button
                    onClick={onOpenEmails}
                    className="relative p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                    title="View System Notifications & Emails"
                  >
                    <Mail className="w-5 h-5" />
                    {emailCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center shadow-xs">
                        {emailCount}
                      </span>
                    )}
                  </button>
                )}

                <div className="hidden sm:block text-right pl-2 border-l border-slate-200">
                  <div className="text-sm font-semibold text-slate-900 leading-tight">
                    {currentUser.name}
                  </div>
                  <div className="text-xs text-slate-500 capitalize">
                    {currentUser.role}
                  </div>
                </div>

                <button
                  id="btn-sign-out"
                  onClick={onLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50 border border-slate-200 transition-colors cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              // Logged Out / Home Page view: ONLY Sign In and Sign Up keys!
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  id="header-btn-signin"
                  onClick={onOpenSignIn}
                  className="px-4 py-2 text-sm font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <LogIn className="w-4 h-4 text-slate-500" />
                  <span>Sign In</span>
                </button>

                <button
                  id="header-btn-signup"
                  onClick={onOpenSignUp}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Sign Up</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
