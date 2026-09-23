/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Header } from './components/Header';
import { HomeLanding } from './components/HomeLanding';
import { CandidatePortal } from './components/CandidatePortal';
import { RecruiterPortal } from './components/RecruiterPortal';
import { AdminPortal } from './components/AdminPortal';
import { AuthModal } from './components/AuthModal';
import { EmailOutboxModal } from './components/EmailOutboxModal';
import { api, getStoredToken } from './api';
import { Application, DashboardJobStats, EmailLog, Job, User, UserRole } from './types';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeRoleView, setActiveRoleView] = useState<UserRole>('candidate');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [recruiters, setRecruiters] = useState<User[]>([]);
  const [dashboardStats, setDashboardStats] = useState<{
    totalJobs: number;
    totalApplications: number;
    totalOpenings: number;
    totalHired: number;
    jobStats: DashboardJobStats[];
  } | null>(null);
  const [emails, setEmails] = useState<EmailLog[]>([]);

  // Modals state
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');
  const [isEmailsOpen, setIsEmailsOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load user from stored token if already logged in (no automatic demo login)
  const loadUser = useCallback(async () => {
    const token = getStoredToken();
    if (token) {
      try {
        const res = await api.getMe();
        setCurrentUser(res.user);
        setActiveRoleView(res.user.role);
        return res.user;
      } catch (err) {
        api.logout();
        setCurrentUser(null);
        return null;
      }
    }
    setCurrentUser(null);
    return null;
  }, []);

  // Fetch data
  const fetchData = useCallback(async (userOverride?: User | null) => {
    const user = userOverride !== undefined ? userOverride : currentUser;
    try {
      setError(null);
      // Fetch public jobs
      const jobsRes = await api.getJobs();
      setJobs(jobsRes.jobs);

      // Fetch emails if logged in
      if (user) {
        try {
          const emailsRes = await api.getEmails();
          setEmails(emailsRes.emails);
        } catch (_) {
          setEmails([]);
        }

        // Fetch applications accessible by this user role
        try {
          const appsRes = await api.getApplications();
          setApplications(appsRes.applications);
        } catch (_) {
          setApplications([]);
        }

        // Fetch recruiters & dashboard if admin or recruiter
        if (user.role === 'admin' || user.role === 'recruiter') {
          try {
            const recruitersRes = await api.getRecruiters();
            setRecruiters(recruitersRes.recruiters);
          } catch (_) {
            setRecruiters([]);
          }

          try {
            const dashRes = await api.getDashboard();
            setDashboardStats(dashRes.stats);
          } catch (_) {
            setDashboardStats(null);
          }
        }
      } else {
        setApplications([]);
        setEmails([]);
      }
    } catch (err: any) {
      console.error('Data fetch error:', err);
      setError(err.message || 'Failed to load recruitment data.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadUser().then((user) => {
      fetchData(user);
    });
  }, [loadUser, fetchData]);

  const handleOpenSignIn = () => {
    setAuthModalMode('signin');
    setIsAuthOpen(true);
  };

  const handleOpenSignUp = () => {
    setAuthModalMode('signup');
    setIsAuthOpen(true);
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
    setActiveRoleView('candidate');
    setApplications([]);
    setEmails([]);
    fetchData(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Global Navigation Header - Only Sign In and Sign Up keys when logged out */}
      <Header
        currentUser={currentUser}
        activeRoleView={activeRoleView}
        onSelectRoleView={(role) => setActiveRoleView(role as UserRole)}
        onOpenSignIn={handleOpenSignIn}
        onOpenSignUp={handleOpenSignUp}
        onLogout={handleLogout}
        onOpenEmails={currentUser ? () => setIsEmailsOpen(true) : undefined}
        emailCount={
          currentUser?.role === 'candidate'
            ? emails.filter((e) => e.toEmail.toLowerCase() === currentUser.email.toLowerCase()).length
            : emails.length
        }
      />

      {/* Main App Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => fetchData()}
              className="text-xs font-semibold underline hover:text-red-900 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm font-medium text-slate-600">Loading Nowshera Digital ATS...</p>
          </div>
        ) : !currentUser ? (
          // Home Page when logged out: ONLY Sign In & Sign Up keys, no extra keys!
          <HomeLanding
            onOpenSignIn={handleOpenSignIn}
            onOpenSignUp={handleOpenSignUp}
          />
        ) : (
          // Authenticated Dashboard Views
          <>
            {/* Candidate Portal View */}
            {currentUser.role === 'candidate' && (
              <CandidatePortal
                currentUser={currentUser}
                jobs={jobs.filter((j) => j.status === 'Open')}
                applications={applications}
                onRefresh={() => fetchData()}
                onOpenAuth={handleOpenSignIn}
              />
            )}

            {/* Recruiter Portal View */}
            {currentUser.role === 'recruiter' && (
              <RecruiterPortal
                currentUser={currentUser}
                jobs={jobs}
                applications={applications}
                onRefresh={() => fetchData()}
              />
            )}

            {/* Admin Portal View */}
            {currentUser.role === 'admin' && (
              <AdminPortal
                currentUser={currentUser}
                jobs={jobs}
                recruiters={recruiters}
                dashboardStats={dashboardStats}
                onRefresh={() => fetchData()}
              />
            )}
          </>
        )}
      </main>

      {/* Clean Footer with NO extra keys */}
      <footer className="border-t border-slate-200 bg-white py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <span className="font-bold text-slate-800">Nowshera Digital ATS</span>
            <span>·</span>
            <span>Recruitment & Applicant Tracking System</span>
          </div>
          <div className="text-slate-400">
            Candidate, Recruiter & Admin Management Portal
          </div>
        </div>
      </footer>

      {/* Authentication Modal (Sign In / Sign Up) */}
      <AuthModal
        isOpen={isAuthOpen}
        initialMode={authModalMode}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={(user) => {
          setCurrentUser(user);
          setActiveRoleView(user.role);
          fetchData(user);
        }}
      />

      {/* Notification / Emails Modal for logged-in users */}
      {currentUser && (
        <EmailOutboxModal
          isOpen={isEmailsOpen}
          onClose={() => setIsEmailsOpen(false)}
          emails={emails}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}
