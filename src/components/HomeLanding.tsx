/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { LogIn, UserPlus, Briefcase, Users, Shield, ArrowRight, CheckCircle2, Sparkles, Clock, FileCheck } from 'lucide-react';

interface HomeLandingProps {
  onOpenSignIn: () => void;
  onOpenSignUp: () => void;
}

export const HomeLanding: React.FC<HomeLandingProps> = ({ onOpenSignIn, onOpenSignUp }) => {
  return (
    <div className="max-w-6xl mx-auto py-8 sm:py-12 px-4 sm:px-6 space-y-16">
      {/* Hero Section */}
      <div className="text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold mb-6 shadow-xs">
          <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
          <span>Nowshera Digital ATS · Modern Hiring & Talent Platform</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.15]">
          Smart, structured recruitment for high-growth tech teams.
        </h1>

        <p className="mt-5 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Streamline your entire talent lifecycle. From PDF CV ingestion and AI summarization to clash-free interview scheduling and executive oversight.
        </p>

        {/* Primary Action Keys: Only Sign In and Sign Up */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            id="home-btn-signin"
            onClick={onOpenSignIn}
            className="w-full sm:w-auto px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-base shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2.5 cursor-pointer"
          >
            <LogIn className="w-5 h-5" />
            Sign In
          </button>

          <button
            id="home-btn-signup"
            onClick={onOpenSignUp}
            className="w-full sm:w-auto px-8 py-3.5 bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 hover:border-slate-400 font-bold rounded-xl text-base shadow-xs transition-all flex items-center justify-center gap-2.5 cursor-pointer"
          >
            <UserPlus className="w-5 h-5 text-indigo-600" />
            Sign Up
          </button>
        </div>
      </div>

      {/* Hero Showcase Picture */}
      <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-slate-200/80 bg-slate-900 group">
        <img
          src="/src/assets/images/recruitment_hero_1790140805725.jpg"
          alt="Modern recruitment and engineering team collaborating in an open workspace"
          className="w-full h-72 sm:h-96 lg:h-[460px] object-cover object-center group-hover:scale-102 transition-transform duration-700"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent flex flex-col justify-end p-6 sm:p-10">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              Next-Gen Recruitment Workflow
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              Connect candidates, recruiters & leaders seamlessly
            </h2>
            <p className="text-xs sm:text-sm text-slate-200 mt-1">
              Experience transparent stage transitions, conflict-free scheduling, and verified applicant CV tracking.
            </p>
          </div>
        </div>
      </div>

      {/* Role Dashboards with Dedicated Pictures */}
      <div>
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
            Tailored Experiences for Every Role
          </h2>
          <p className="text-slate-500 text-sm mt-1 max-w-lg mx-auto">
            Choose your portal by signing in or signing up with your account credentials.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Candidate Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
            <div className="relative h-48 overflow-hidden bg-slate-100">
              <img
                src="/src/assets/images/candidate_workspace_1790140818478.jpg"
                alt="Candidate preparing job application and portfolio"
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                referrerPolicy="no-referrer"
              />
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-emerald-600 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                <Briefcase className="w-3.5 h-3.5" />
                Candidate
              </div>
            </div>

            <div className="p-6 flex-1 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Candidate Dashboard</h3>
                <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
                  Browse open positions, upload your PDF resume, and track application stages in real-time.
                </p>
                <ul className="space-y-2.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Explore active company job listings</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Real-time stage tracking (Applied to Hired)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Inspect uploaded CV snapshots & details</span>
                  </li>
                </ul>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={onOpenSignUp}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                >
                  Create Account <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onOpenSignIn}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Sign In
                </button>
              </div>
            </div>
          </div>

          {/* Recruiter Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
            <div className="relative h-48 overflow-hidden bg-slate-100">
              <img
                src="/src/assets/images/recruiter_meeting_1790140830996.jpg"
                alt="Recruiter conducting an interview meeting"
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                referrerPolicy="no-referrer"
              />
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-blue-600 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                <Users className="w-3.5 h-3.5" />
                Recruiter
              </div>
            </div>

            <div className="p-6 flex-1 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Recruiter Dashboard</h3>
                <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
                  Review applicant pipelines, inspect AI CV summaries, and schedule clash-free interviews.
                </p>
                <ul className="space-y-2.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                    <span>Candidate pipelines for assigned jobs</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                    <span>AI CV summaries & interview questions</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                    <span>Conflict-free 1-hour interview scheduling</span>
                  </li>
                </ul>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={onOpenSignIn}
                  className="text-xs font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                >
                  Recruiter Sign In <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Admin Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
            <div className="relative h-48 overflow-hidden bg-slate-100">
              <img
                src="/src/assets/images/admin_analytics_1790140842820.jpg"
                alt="Executive reviewing hiring analytics and corporate metrics"
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                referrerPolicy="no-referrer"
              />
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                <Shield className="w-3.5 h-3.5" />
                Administrator
              </div>
            </div>

            <div className="p-6 flex-1 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Admin Dashboard</h3>
                <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
                  Total positions, openings, applications, hiring stage metrics, and recruiter team governance.
                </p>
                <ul className="space-y-2.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>Total jobs, openings, applications & hires</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>Stage-by-stage distribution analytics</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>Manage job requisitions & assign recruiters</span>
                  </li>
                </ul>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={onOpenSignIn}
                  className="text-xs font-bold text-indigo-700 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                >
                  Admin Sign In <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Highlights Grid */}
      <div className="bg-slate-900 text-white rounded-3xl p-8 sm:p-12 shadow-md">
        <div className="max-w-2xl mb-8">
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">Built for Precision</span>
          <h2 className="text-2xl sm:text-3xl font-extrabold mt-1">Enterprise Hiring Infrastructure</h2>
          <p className="text-slate-300 text-xs sm:text-sm mt-2 leading-relaxed">
            Every step in the recruitment cycle is guarded by strict role-based access control, clash validation, and instant email dispatching.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-slate-800/70 border border-slate-700/60 p-5 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mb-3">
              <FileCheck className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-sm text-white">AI CV Summarization</h4>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Automated extraction of skills, experience highlights, and contextual interview questions directly from candidate CVs.
            </p>
          </div>

          <div className="bg-slate-800/70 border border-slate-700/60 p-5 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center mb-3">
              <Clock className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-sm text-white">Clash-Free Interviews</h4>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Intelligent 1-hour slot scheduler guarantees recruiters and candidates never suffer double bookings or scheduling conflicts.
            </p>
          </div>

          <div className="bg-slate-800/70 border border-slate-700/60 p-5 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3">
              <Shield className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-sm text-white">Strict Stage Gates</h4>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Enforced hiring progression through Applied, Shortlisted, Interview, Offer, and Hired stages with full audit visibility.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
