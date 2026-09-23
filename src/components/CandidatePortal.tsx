/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Briefcase,
  FileText,
  Upload,
  Calendar,
  MapPin,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Sparkles,
  Search,
  Building,
  UserCheck,
} from 'lucide-react';
import { Application, Job, User } from '../types';
import { api } from '../api';

interface CandidatePortalProps {
  currentUser: User | null;
  jobs: Job[];
  applications: Application[];
  onRefresh: () => void;
  onOpenAuth: () => void;
}

export const CandidatePortal: React.FC<CandidatePortalProps> = ({
  currentUser,
  jobs,
  applications,
  onRefresh,
  onOpenAuth,
}) => {
  const [activeTab, setActiveTab] = useState<'jobs' | 'applications' | 'cv'>('jobs');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('all');

  // Application submission state
  const [applyCvFileName, setApplyCvFileName] = useState<string>('');
  const [applyCvDataUrl, setApplyCvDataUrl] = useState<string>('');
  const [applyCvSize, setApplyCvSize] = useState<number>(0);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Profile CV upload state
  const [profileCvError, setProfileCvError] = useState<string | null>(null);
  const [profileCvSuccess, setProfileCvSuccess] = useState<string | null>(null);
  const [uploadingProfileCv, setUploadingProfileCv] = useState(false);

  // Candidates see Open and Closed jobs (Closed jobs cannot be applied to)
  const visibleJobs = jobs.filter((j) => j.status === 'Open' || j.status === 'Closed');
  const departments = ['all', ...Array.from(new Set(visibleJobs.map((j) => j.department)))];

  const filteredJobs = visibleJobs.filter((job) => {
    const matchesSearch =
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.requirements.some((r) => r.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesDept = selectedDept === 'all' || job.department === selectedDept;
    return matchesSearch && matchesDept;
  });

  const handlePdfUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    onSetFile: (name: string, dataUrl: string, size: number) => void,
    onError: (err: string | null) => void
  ) => {
    onError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Strict validation: must be PDF
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      onError('File must be a PDF document. Word, image, or text files are not accepted.');
      return;
    }

    // Strict size validation: <= 2 MB
    if (file.size > 2 * 1024 * 1024) {
      onError(`File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 2 MB limit.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      onSetFile(file.name, dataUrl, file.size);
    };
    reader.onerror = () => {
      onError('Failed to read PDF file. Please try again.');
    };
    reader.readAsDataURL(file);
  };

  const handleOpenApply = (job: Job) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    setSelectedJob(job);
    setApplyError(null);
    setApplySuccess(null);
    // Pre-populate with candidate's saved CV if available
    if (currentUser.cvDataUrl) {
      setApplyCvFileName(currentUser.cvFileName || 'My_Profile_CV.pdf');
      setApplyCvDataUrl(currentUser.cvDataUrl);
      setApplyCvSize(100000);
    } else {
      setApplyCvFileName('');
      setApplyCvDataUrl('');
      setApplyCvSize(0);
    }
    setIsApplyModalOpen(true);
  };

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) return;

    if (!applyCvDataUrl) {
      setApplyError('Please upload a PDF CV (up to 2 MB) to proceed.');
      return;
    }

    setSubmitting(true);
    setApplyError(null);

    try {
      await api.applyForJob({
        jobId: selectedJob.id,
        cvFileName: applyCvFileName,
        cvDataUrl: applyCvDataUrl,
      });

      setApplySuccess(
        `Application submitted successfully! Your application data has been sent to Supabase and confirmation email sent to ${currentUser?.email}.`
      );
      onRefresh();
      setTimeout(() => {
        setIsApplyModalOpen(false);
        setActiveTab('applications');
      }, 1500);
    } catch (err: any) {
      setApplyError(err.message || 'Failed to submit application.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (applicationId: string) => {
    if (!confirm('Are you sure you want to withdraw this application? This action cannot be undone.')) {
      return;
    }
    try {
      await api.withdrawApplication(applicationId);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to withdraw application.');
    }
  };

  const handleUpdateProfileCv = async (name: string, dataUrl: string) => {
    setUploadingProfileCv(true);
    setProfileCvError(null);
    setProfileCvSuccess(null);
    try {
      await api.updateCandidateProfile({
        cvFileName: name,
        cvDataUrl: dataUrl,
      });
      setProfileCvSuccess('CV updated successfully! Note: existing submitted applications keep the CV you used when applying.');
      onRefresh();
    } catch (err: any) {
      setProfileCvError(err.message || 'Failed to update CV.');
    } finally {
      setUploadingProfileCv(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Sub-Navigation */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                Candidate Dashboard
              </span>
              {currentUser && (
                <span className="text-xs text-slate-300 font-medium">
                  {currentUser.name} {currentUser.phone ? `· ${currentUser.phone}` : ''}
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold mt-3 tracking-tight">
              Careers at Nowshera Digital
            </h1>
            <p className="text-slate-300 text-sm sm:text-base mt-2 leading-relaxed">
              Browse open positions, submit your PDF CV with instant AI summaries, track your applications in real-time, and manage your candidate profile.
            </p>
          </div>

          <div className="hidden lg:block w-48 h-32 shrink-0 rounded-xl overflow-hidden border border-white/20 shadow-md">
            <img
              src="/src/assets/images/candidate_workspace_1790140818478.jpg"
              alt="Candidate workspace"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-slate-800">
          <button
            id="tab-candidate-jobs"
            onClick={() => setActiveTab('jobs')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'jobs'
                ? 'bg-white text-slate-900 shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Jobs ({visibleJobs.length})
          </button>
          <button
            id="tab-candidate-applications"
            onClick={() => setActiveTab('applications')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'applications'
                ? 'bg-white text-slate-900 shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            My Applications ({applications.length})
          </button>
          <button
            id="tab-candidate-cv"
            onClick={() => setActiveTab('cv')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'cv'
                ? 'bg-white text-slate-900 shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-4 h-4" />
            My CV & Profile
          </button>
        </div>
      </div>

      {/* TAB 1: BROWSE JOBS */}
      {activeTab === 'jobs' && (
        <div className="space-y-6">
          {/* Search & Department Filters */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search job title, skills, description..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
              <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Department:</span>
              {departments.map((dept) => (
                <button
                  key={dept}
                  onClick={() => setSelectedDept(dept)}
                  className={`text-xs px-3 py-1.5 rounded-lg capitalize whitespace-nowrap transition-colors font-medium ${
                    selectedDept === dept
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {dept}
                </button>
              ))}
            </div>
          </div>

          {/* Job Listings Grid */}
          {filteredJobs.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-8">
              <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-800">No open positions found</h3>
              <p className="text-sm text-slate-500 mt-1">Try adjusting your search query or department filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredJobs.map((job) => {
                const activeApp = applications.find(
                  (a) =>
                    a.jobId === job.id &&
                    ['Applied', 'Shortlisted', 'Interview', 'Offer'].includes(a.stage)
                );

                return (
                  <div
                    key={job.id}
                    className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase tracking-wide">
                            {job.department}
                          </span>
                          <h3 className="text-lg font-bold text-slate-900 mt-2 hover:text-indigo-600 transition-colors">
                            {job.title}
                          </h3>
                        </div>
                        <span className="text-xs font-medium px-2 py-1 rounded bg-slate-100 text-slate-700 capitalize whitespace-nowrap">
                          {job.jobType.replace('-', ' ')}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-3">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>{job.location}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>Apply by: {job.lastDateToApply}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Building className="w-3.5 h-3.5 text-slate-400" />
                          <span>{job.openings - job.hiredCount} open slot(s)</span>
                        </div>
                      </div>

                      <p className="text-sm text-slate-600 mt-3.5 line-clamp-3 leading-relaxed">
                        {job.description}
                      </p>

                      {/* Requirements Tags */}
                      <div className="mt-4 pt-3 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-700 mb-1.5">Key Requirements:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {job.requirements.slice(0, 3).map((req, i) => (
                            <span
                              key={i}
                              className="text-xs px-2 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200"
                            >
                              {req}
                            </span>
                          ))}
                          {job.requirements.length > 3 && (
                            <span className="text-xs text-slate-400 self-center">
                              +{job.requirements.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                      {job.status === 'Closed' ? (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
                          <XCircle className="w-4 h-4 text-amber-600" />
                          <span>Position Closed (No longer accepting applications)</span>
                        </div>
                      ) : activeApp ? (
                        <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200">
                          <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                          <span>Applied · Stage: {activeApp.stage}</span>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">
                          AI summary assists recruiters · Humans decide
                        </div>
                      )}

                      {job.status !== 'Closed' && (
                        <button
                          onClick={() => handleOpenApply(job)}
                          className={`text-sm font-semibold px-4 py-2 rounded-xl transition-all shadow-xs ${
                            activeApp
                              ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                          }`}
                        >
                          {activeApp ? 'View Status' : 'Apply Now'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MY APPLICATIONS */}
      {activeTab === 'applications' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">My Application Tracking</h2>
            <span className="text-xs text-slate-500">
              Stages: Applied → Shortlisted → Interview → Offer → Hired
            </span>
          </div>

          {applications.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-8">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-800">No applications submitted yet</h3>
              <p className="text-sm text-slate-500 mt-1 mb-4">
                Explore our open jobs and submit your PDF CV to get started.
              </p>
              <button
                onClick={() => setActiveTab('jobs')}
                className="px-4 py-2 bg-indigo-600 text-white font-semibold text-sm rounded-lg hover:bg-indigo-700"
              >
                Browse Open Jobs
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {applications.map((app) => {
                const isFinal = app.stage === 'Hired' || app.stage === 'Rejected' || app.stage === 'Withdrawn';

                return (
                  <div
                    key={app.id}
                    className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:border-slate-300 transition-all"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                            {app.jobDepartment}
                          </span>
                          <h3 className="text-lg font-bold text-slate-900">{app.jobTitle}</h3>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Applied on {new Date(app.appliedAt).toLocaleDateString()} with CV: {app.cvFileName}
                        </p>
                      </div>

                      {/* Current Stage Badge */}
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wide flex items-center gap-1.5 ${
                            app.stage === 'Hired'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : app.stage === 'Offer'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : app.stage === 'Interview'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : app.stage === 'Shortlisted'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : app.stage === 'Rejected'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : app.stage === 'Withdrawn'
                              ? 'bg-slate-100 text-slate-600 border border-slate-300'
                              : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full bg-current"></span>
                          {app.stage}
                        </span>

                        {!isFinal && (
                          <button
                            onClick={() => handleWithdraw(app.id)}
                            className="text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-200 transition-colors"
                          >
                            Withdraw
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Stage Pipeline Visualization */}
                    <div className="mt-4 pt-2">
                      <div className="grid grid-cols-5 gap-2 text-center text-xs font-semibold">
                        {['Applied', 'Shortlisted', 'Interview', 'Offer', 'Hired'].map((stageName, idx) => {
                          const stages = ['Applied', 'Shortlisted', 'Interview', 'Offer', 'Hired'];
                          const currentIdx = stages.indexOf(app.stage);
                          const isPassed = currentIdx >= idx && app.stage !== 'Rejected' && app.stage !== 'Withdrawn';
                          const isCurrent = app.stage === stageName;

                          return (
                            <div key={stageName} className="flex flex-col items-center">
                              <div
                                className={`w-full h-2 rounded-full mb-1.5 transition-colors ${
                                  isCurrent
                                    ? 'bg-indigo-600'
                                    : isPassed
                                    ? 'bg-indigo-300'
                                    : app.stage === 'Rejected' && idx === 0
                                    ? 'bg-rose-300'
                                    : 'bg-slate-200'
                                }`}
                              />
                              <span
                                className={`${
                                  isCurrent
                                    ? 'text-indigo-700 font-bold'
                                    : isPassed
                                    ? 'text-slate-700'
                                    : 'text-slate-400'
                                }`}
                              >
                                {stageName}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Interview Notification Banner if stage is Interview */}
                    {app.interview && (
                      <div className="mt-4 p-4 rounded-xl bg-blue-50/80 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-blue-600 text-white mt-0.5">
                            <Clock className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                              Interview Scheduled (1 Hour)
                            </div>
                            <div className="text-sm font-bold text-slate-900 mt-0.5">
                              {app.interview.date} at {app.interview.time}
                            </div>
                            <div className="text-xs text-blue-800 mt-1 flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5" />
                              <span>{app.interview.locationOrLink}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              With Recruiter: {app.interview.scheduledByRecruiterName}
                            </p>
                          </div>
                        </div>

                        {app.interview.locationOrLink.startsWith('http') && (
                          <a
                            href={app.interview.locationOrLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors self-start sm:self-center"
                          >
                            Join Video Link
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    )}

                    {/* Rejection notice */}
                    {app.stage === 'Rejected' && (
                      <div className="mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>This application has been closed. We appreciate your time and interest in Nowshera Digital.</span>
                      </div>
                    )}

                    {/* Withdrawn notice */}
                    {app.stage === 'Withdrawn' && (
                      <div className="mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-slate-500 shrink-0" />
                        <span>You withdrew this application. You can re-apply for this job anytime while it remains open.</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CANDIDATE CV PROFILE */}
      {activeTab === 'cv' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 max-w-2xl shadow-xs">
          <h2 className="text-lg font-bold text-slate-900 mb-1">My CV & Candidate Profile</h2>
          <p className="text-xs text-slate-500 mb-6">
            Keep your default CV up to date. When you submit an application, a snapshot of your CV is securely preserved for that specific application.
          </p>

          {profileCvError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-xs border border-red-200">
              {profileCvError}
            </div>
          )}

          {profileCvSuccess && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-50 text-emerald-800 text-xs border border-emerald-200">
              {profileCvSuccess}
            </div>
          )}

          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-indigo-600" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {currentUser?.cvFileName || 'No CV uploaded yet'}
                  </div>
                  <div className="text-xs text-slate-500">
                    {currentUser?.cvUploadedAt
                      ? `Last updated: ${new Date(currentUser.cvUploadedAt).toLocaleDateString()}`
                      : 'Upload a PDF file (maximum 2 MB)'}
                  </div>
                </div>
              </div>

              {currentUser?.cvDataUrl && (
                <a
                  href={currentUser.cvDataUrl}
                  download={currentUser.cvFileName || 'My_CV.pdf'}
                  className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg hover:bg-slate-100 text-slate-700 shadow-2xs"
                >
                  Download PDF
                </a>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Upload / Replace Default CV (PDF only, ≤ 2 MB)
              </label>
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-indigo-500 hover:bg-indigo-50/20 transition-all cursor-pointer relative">
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) =>
                    handlePdfUpload(
                      e,
                      (name, dataUrl) => handleUpdateProfileCv(name, dataUrl),
                      setProfileCvError
                    )
                  }
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  disabled={uploadingProfileCv}
                />
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">
                  {uploadingProfileCv ? 'Uploading...' : 'Click or drag & drop to upload a new PDF'}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">Strictly PDF format, maximum 2 MB</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* APPLY MODAL */}
      {isApplyModalOpen && selectedJob && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-100 p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-slate-900">
              Apply for {selectedJob.title}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {selectedJob.department} · {selectedJob.location} · Deadline: {selectedJob.lastDateToApply}
            </p>

            {/* MANDATORY AI TRANSPARENCY NOTICE */}
            <div className="mt-4 p-3.5 rounded-xl bg-indigo-50/80 border border-indigo-100 flex items-start gap-2.5 text-xs text-indigo-950">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-bold">AI Assistance Notice:</span> An AI tool objectively summarizes your CV against job requirements for our recruiting team. People make every shortlisting, interview, and hiring decision.
              </div>
            </div>

            {applyError && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-700 text-xs border border-red-200">
                {applyError}
              </div>
            )}

            {applySuccess && (
              <div className="mt-4 p-3 rounded-lg bg-emerald-50 text-emerald-800 text-xs border border-emerald-200">
                {applySuccess}
              </div>
            )}

            <form onSubmit={handleSubmitApplication} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Applicant Name & Email
                </label>
                <input
                  type="text"
                  disabled
                  value={`${currentUser?.name} (${currentUser?.email})`}
                  className="w-full px-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded-lg text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Upload PDF CV for this Application * (max 2 MB)
                </label>

                {applyCvDataUrl ? (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-indigo-600" />
                      <div>
                        <div className="text-xs font-bold text-slate-800">{applyCvFileName}</div>
                        <div className="text-[11px] text-slate-500">
                          {applyCvSize > 0 ? `${(applyCvSize / 1024).toFixed(1)} KB` : 'Ready'}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setApplyCvDataUrl('');
                        setApplyCvFileName('');
                      }}
                      className="text-xs text-red-600 hover:text-red-800 font-medium"
                    >
                      Change File
                    </button>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center hover:border-indigo-500 hover:bg-indigo-50/20 transition-all cursor-pointer relative">
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(e) =>
                        handlePdfUpload(
                          e,
                          (name, dataUrl, size) => {
                            setApplyCvFileName(name);
                            setApplyCvDataUrl(dataUrl);
                            setApplyCvSize(size);
                          },
                          setApplyError
                        )
                      }
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
                    <p className="text-xs font-semibold text-slate-700">
                      Upload your PDF CV
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Strictly PDF format, maximum 2 MB</p>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsApplyModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !applyCvDataUrl}
                  className="px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-xs transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Submitting Application...' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
