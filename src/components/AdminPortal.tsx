/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Shield,
  Briefcase,
  Users,
  Plus,
  BarChart3,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Building,
  Mail,
  UserPlus,
  UserMinus,
  Edit,
  Database,
  Send,
  FileEdit,
  EyeOff,
  Eye,
} from 'lucide-react';
import { DashboardJobStats, Job, JobType, User } from '../types';
import { api } from '../api';
import { SupabaseSyncTab } from './SupabaseSyncTab';

interface AdminPortalProps {
  currentUser: User;
  jobs: Job[];
  recruiters: User[];
  dashboardStats: {
    totalJobs: number;
    totalApplications: number;
    totalOpenings: number;
    totalHired: number;
    jobStats: DashboardJobStats[];
  } | null;
  onRefresh: () => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  jobs,
  recruiters,
  dashboardStats,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'jobs' | 'recruiters' | 'supabase'>('dashboard');

  // Create/Edit Job Modal State
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState('');
  const [jobDepartment, setJobDepartment] = useState('Engineering');
  const [jobLocation, setJobLocation] = useState('Remote');
  const [jobType, setJobType] = useState<JobType>('full-time');
  const [jobDescription, setJobDescription] = useState('');
  const [jobRequirementsStr, setJobRequirementsStr] = useState('');
  const [jobOpenings, setJobOpenings] = useState(1);
  const [jobLastDate, setJobLastDate] = useState('');
  const [jobStatus, setJobStatus] = useState<'Draft' | 'Open'>('Draft');
  const [jobAssignedRecruiterIds, setJobAssignedRecruiterIds] = useState<string[]>([]);
  const [jobFormError, setJobFormError] = useState<string | null>(null);
  const [savingJob, setSavingJob] = useState(false);
  const [actionLoadingJobId, setActionLoadingJobId] = useState<string | null>(null);
  const [toastNotification, setToastNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToastNotification({ type, message });
    setTimeout(() => {
      setToastNotification((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  // Add Recruiter Modal State
  const [isRecruiterModalOpen, setIsRecruiterModalOpen] = useState(false);
  const [recruiterName, setRecruiterName] = useState('');
  const [recruiterEmail, setRecruiterEmail] = useState('');
  const [recruiterError, setRecruiterError] = useState<string | null>(null);
  const [addingRecruiter, setAddingRecruiter] = useState(false);

  const handleOpenCreateJob = () => {
    setEditingJobId(null);
    setJobTitle('');
    setJobDepartment('Engineering');
    setJobLocation('Remote');
    setJobType('full-time');
    setJobDescription('');
    setJobRequirementsStr('');
    setJobOpenings(1);
    const inTwoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
    setJobLastDate(inTwoWeeks);
    // Newly created jobs default to Draft until the admin explicitly posts them!
    setJobStatus('Draft');
    setJobAssignedRecruiterIds(recruiters.length > 0 ? [recruiters[0].id] : []);
    setJobFormError(null);
    setIsJobModalOpen(true);
  };

  const handleOpenEditJob = (job: Job) => {
    setEditingJobId(job.id);
    setJobTitle(job.title);
    setJobDepartment(job.department);
    setJobLocation(job.location);
    setJobType(job.jobType);
    setJobDescription(job.description);
    setJobRequirementsStr(job.requirements.join('\n'));
    setJobOpenings(job.openings);
    setJobLastDate(job.lastDateToApply);
    setJobStatus(job.status === 'Draft' ? 'Draft' : 'Open');
    setJobAssignedRecruiterIds(job.assignedRecruiterIds);
    setJobFormError(null);
    setIsJobModalOpen(true);
  };

  const handleSaveJob = async (e?: React.FormEvent, overrideStatus?: 'Draft' | 'Open') => {
    if (e) e.preventDefault();
    setJobFormError(null);

    const targetStatus = overrideStatus || jobStatus;

    if (jobAssignedRecruiterIds.length === 0) {
      setJobFormError('No dead ends: Every job must have at least one recruiter assigned.');
      return;
    }

    const reqs = jobRequirementsStr
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean);

    if (reqs.length === 0) {
      setJobFormError('Please list at least one requirement.');
      return;
    }

    setSavingJob(true);
    try {
      if (editingJobId) {
        await api.updateJob(editingJobId, {
          title: jobTitle,
          department: jobDepartment,
          location: jobLocation,
          jobType,
          description: jobDescription,
          requirements: reqs,
          openings: Number(jobOpenings),
          lastDateToApply: jobLastDate,
          status: targetStatus,
          assignedRecruiterIds: jobAssignedRecruiterIds,
        });
        showToast(
          targetStatus === 'Open'
            ? `Job "${jobTitle}" updated and posted live!`
            : `Job "${jobTitle}" saved as Draft.`
        );
      } else {
        await api.createJob({
          title: jobTitle,
          department: jobDepartment,
          location: jobLocation,
          jobType,
          description: jobDescription,
          requirements: reqs,
          openings: Number(jobOpenings),
          lastDateToApply: jobLastDate,
          status: targetStatus,
          assignedRecruiterIds: jobAssignedRecruiterIds,
        });
        showToast(
          targetStatus === 'Open'
            ? `Job "${jobTitle}" created and posted live!`
            : `New job "${jobTitle}" created as Draft. It will remain hidden from applicants until posted live.`
        );
      }

      setIsJobModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setJobFormError(err.message || 'Failed to save job.');
    } finally {
      setSavingJob(false);
    }
  };

  const handlePublishJob = async (jobId: string, title?: string) => {
    setActionLoadingJobId(jobId);
    try {
      const res = await api.publishJob(jobId);
      showToast(res.message || `Job "${title || 'Job'}" is now posted live for applicants!`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to post job live.', 'error');
    } finally {
      setActionLoadingJobId(null);
    }
  };

  const handleUnpublishJob = async (jobId: string, title?: string) => {
    setActionLoadingJobId(jobId);
    try {
      const res = await api.unpublishJob(jobId);
      showToast(res.message || `Job "${title || 'Job'}" has been reverted to Draft mode.`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to revert job to draft.', 'error');
    } finally {
      setActionLoadingJobId(null);
    }
  };

  const handleCloseJobEarly = async (jobId: string) => {
    if (
      !confirm(
        'Are you sure you want to close this job early? Candidates will no longer be able to apply, and active applications can only be rejected.'
      )
    ) {
      return;
    }

    try {
      await api.closeJob(jobId);
      showToast('Job has been closed.', 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to close job.', 'error');
    }
  };

  const handleAddRecruiter = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecruiterError(null);
    setAddingRecruiter(true);

    try {
      await api.addRecruiter(recruiterName.trim(), recruiterEmail.trim());
      setIsRecruiterModalOpen(false);
      setRecruiterName('');
      setRecruiterEmail('');
      onRefresh();
    } catch (err: any) {
      setRecruiterError(err.message || 'Failed to add recruiter.');
    } finally {
      setAddingRecruiter(false);
    }
  };

  const handleToggleRecruiterActive = async (recruiterId: string) => {
    try {
      await api.toggleRecruiterActive(recruiterId);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to update recruiter status.');
    }
  };

  const toggleRecruiterAssignment = (recruiterId: string) => {
    if (jobAssignedRecruiterIds.includes(recruiterId)) {
      if (jobAssignedRecruiterIds.length === 1) {
        alert('Every job must have at least one recruiter assigned.');
        return;
      }
      setJobAssignedRecruiterIds(jobAssignedRecruiterIds.filter((id) => id !== recruiterId));
    } else {
      setJobAssignedRecruiterIds([...jobAssignedRecruiterIds, recruiterId]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Admin Banner & Navigation */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 uppercase tracking-wide">
              Admin Dashboard
            </span>
            <span className="text-xs text-slate-400">alishba11@gmail.com</span>
            <span className="text-xs text-slate-500">·</span>
            <span className="text-xs text-slate-400">Total Positions: {jobs.length}</span>
          </div>
          <h1 className="text-2xl font-extrabold mt-1 tracking-tight">
            Admin Management Console
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            View total jobs, openings, applications, hired count, stage distributions, manage job postings, and manage recruiters.
          </p>
        </div>

        {/* Action Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'dashboard'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Overview & Stages
          </button>
          <button
            onClick={() => setActiveTab('jobs')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'jobs'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Manage Jobs ({jobs.length})
          </button>
          <button
            onClick={() => setActiveTab('recruiters')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'recruiters'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            Manage Recruiters ({recruiters.length})
          </button>
          <button
            onClick={() => setActiveTab('supabase')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'supabase'
                ? 'bg-emerald-500 text-white shadow-xs'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Database className="w-4 h-4 text-emerald-300" />
            Supabase Sync
          </button>
        </div>
      </div>

      {/* Toast Notification Banner */}
      {toastNotification && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between border shadow-sm transition-all ${
            toastNotification.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastNotification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{toastNotification.message}</span>
          </div>
          <button
            onClick={() => setToastNotification(null)}
            className="text-xs text-slate-400 hover:text-slate-700 ml-4 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* TAB 1: DASHBOARD STATS */}
      {activeTab === 'dashboard' && dashboardStats && (
        <div className="space-y-6">
          {/* Top 4 Metrics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Total Jobs
              </span>
              <div className="text-3xl font-extrabold text-slate-900 mt-1">
                {dashboardStats.totalJobs}
              </div>
              <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  {jobs.filter((j) => j.status === 'Open').length} live
                </span>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  {jobs.filter((j) => j.status === 'Draft').length} draft
                </span>
                {jobs.filter((j) => j.status === 'Closed').length > 0 && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-500">
                      {jobs.filter((j) => j.status === 'Closed').length} closed
                    </span>
                  </>
                )}
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Total Openings
              </span>
              <div className="text-3xl font-extrabold text-indigo-600 mt-1">
                {dashboardStats.totalOpenings}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {dashboardStats.totalOpenings - dashboardStats.totalHired} unfilled slots
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Total Applications
              </span>
              <div className="text-3xl font-extrabold text-blue-600 mt-1">
                {dashboardStats.totalApplications}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Across all jobs</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Total Hired
              </span>
              <div className="text-3xl font-extrabold text-emerald-600 mt-1">
                {dashboardStats.totalHired}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Successful hires</p>
            </div>
          </div>

          {/* Detailed Job Stage Breakdown Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Applications by Job & Stage
                </h3>
                <p className="text-xs text-slate-500">
                  Live counts for Applied, Shortlisted, Interview, Offer, Hired, and Closed status
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Job Title & Department</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Openings / Hired</th>
                    <th className="py-3 px-3 text-center">Applied</th>
                    <th className="py-3 px-3 text-center">Shortlisted</th>
                    <th className="py-3 px-3 text-center">Interview</th>
                    <th className="py-3 px-3 text-center">Offer</th>
                    <th className="py-3 px-3 text-center">Hired</th>
                    <th className="py-3 px-3 text-center">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {dashboardStats.jobStats.map((stat) => (
                    <tr key={stat.jobId} className="hover:bg-slate-50/50">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{stat.jobTitle}</div>
                        <div className="text-slate-400 text-[11px]">{stat.department}</div>
                      </td>
                      <td className="py-3.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            stat.status === 'Open'
                              ? 'bg-emerald-100 text-emerald-800'
                              : stat.status === 'Draft'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {stat.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 font-medium">
                        {stat.hiredCount} of {stat.openings}
                      </td>
                      <td className="py-3.5 px-3 text-center font-semibold text-slate-800">
                        {stat.byStage?.Applied || 0}
                      </td>
                      <td className="py-3.5 px-3 text-center font-semibold text-amber-700">
                        {stat.byStage?.Shortlisted || 0}
                      </td>
                      <td className="py-3.5 px-3 text-center font-semibold text-blue-700">
                        {stat.byStage?.Interview || 0}
                      </td>
                      <td className="py-3.5 px-3 text-center font-semibold text-purple-700">
                        {stat.byStage?.Offer || 0}
                      </td>
                      <td className="py-3.5 px-3 text-center font-bold text-emerald-700">
                        {stat.byStage?.Hired || 0}
                      </td>
                      <td className="py-3.5 px-3 text-center font-bold text-slate-900">
                        {stat.totalApplications}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MANAGE JOBS */}
      {activeTab === 'jobs' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Job Postings Directory</h2>
              <p className="text-xs text-slate-500">
                Newly created jobs start in <strong>Draft</strong> mode. They remain private and invisible to applicants until you post them live.
              </p>
            </div>
            <button
              onClick={handleOpenCreateJob}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Job</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-200">
            {jobs.map((job) => {
              const assigned = recruiters.filter((r) => job.assignedRecruiterIds.includes(r.id));

              return (
                <div key={job.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1.5 max-w-xl">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {job.department}
                      </span>
                      <h4 className="text-base font-bold text-slate-900">{job.title}</h4>
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded uppercase inline-flex items-center gap-1 ${
                          job.status === 'Open'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : job.status === 'Draft'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-slate-100 text-slate-600 border border-slate-300'
                        }`}
                      >
                        {job.status === 'Draft' && <FileEdit className="w-3 h-3 text-amber-700" />}
                        {job.status === 'Open' && <CheckCircle2 className="w-3 h-3 text-emerald-700" />}
                        {job.status === 'Closed' && <XCircle className="w-3 h-3 text-slate-500" />}
                        {job.status === 'Draft' ? 'Draft (Not Live)' : job.status === 'Open' ? 'Live / Open' : 'Closed'}
                      </span>
                    </div>

                    {job.status === 'Draft' && (
                      <div className="text-[11px] text-amber-800 bg-amber-50/90 border border-amber-200 rounded-md px-2.5 py-1 flex items-center gap-1.5">
                        <EyeOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>This job is currently a <strong>Draft</strong>. Candidates cannot view or apply to it until you click <strong>Post Job Live</strong>.</span>
                      </div>
                    )}

                    <p className="text-xs text-slate-500">
                      Location: {job.location} · {job.jobType} · Openings: {job.openings} (Hired: {job.hiredCount}) · Deadline: {job.lastDateToApply}
                    </p>

                    {/* Assigned Recruiters */}
                    <div className="flex items-center gap-2 pt-1 text-xs">
                      <span className="text-slate-400">Assigned Recruiters:</span>
                      {assigned.length === 0 ? (
                        <span className="text-red-500 font-semibold">None assigned (Requires recruiter!)</span>
                      ) : (
                        assigned.map((r) => (
                          <span
                            key={r.id}
                            className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded text-[11px] font-medium"
                          >
                            {r.name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-start md:self-center flex-wrap">
                    {job.status === 'Draft' && (
                      <button
                        onClick={() => handlePublishJob(job.id, job.title)}
                        disabled={actionLoadingJobId === job.id}
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors"
                        title="Publish this job to make it live for applicants"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{actionLoadingJobId === job.id ? 'Posting...' : 'Post Job Live'}</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleOpenEditJob(job)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-300 rounded-lg flex items-center gap-1"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>

                    {job.status === 'Open' && (
                      <>
                        <button
                          onClick={() => handleUnpublishJob(job.id, job.title)}
                          disabled={actionLoadingJobId === job.id}
                          className="px-2.5 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg flex items-center gap-1"
                          title="Revert job to draft mode to hide it from applicants"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>{actionLoadingJobId === job.id ? 'Updating...' : 'Revert to Draft'}</span>
                        </button>
                        <button
                          onClick={() => handleCloseJobEarly(job.id)}
                          className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg"
                        >
                          Close Job
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: RECRUITERS MANAGEMENT */}
      {activeTab === 'recruiters' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Recruiter Team</h2>
              <p className="text-xs text-slate-500">
                Add recruiters to send automated invitations, monitor assigned jobs, and control team access.
              </p>
            </div>
            <button
              onClick={() => {
                setRecruiterName('');
                setRecruiterEmail('');
                setRecruiterError(null);
                setIsRecruiterModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Recruiter</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-200">
            {recruiters.map((recruiter) => {
              const assignedCount = jobs.filter((j) =>
                j.assignedRecruiterIds.includes(recruiter.id)
              ).length;

              return (
                <div key={recruiter.id} className="p-5 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">{recruiter.name}</h4>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          recruiter.isActive !== false
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {recruiter.isActive !== false ? 'Active' : 'Deactivated'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{recruiter.email}</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Assigned to {assignedCount} job(s)
                    </p>
                  </div>

                  <button
                    onClick={() => handleToggleRecruiterActive(recruiter.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                      recruiter.isActive !== false
                        ? 'text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-200'
                        : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                    }`}
                  >
                    {recruiter.isActive !== false ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: SUPABASE INTEGRATION */}
      {activeTab === 'supabase' && <SupabaseSyncTab />}

      {/* CREATE / EDIT JOB MODAL */}
      {isJobModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-slate-900">
              {editingJobId ? 'Edit Job Posting' : 'Create New Job Posting'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Configure job requirements, openings, deadline, and assigned recruiters.
            </p>

            {jobFormError && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-700 text-xs border border-red-200">
                {jobFormError}
              </div>
            )}

            <form onSubmit={handleSaveJob} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Job Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="e.g. Senior Backend Engineer"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Department *
                  </label>
                  <input
                    type="text"
                    required
                    value={jobDepartment}
                    onChange={(e) => setJobDepartment(e.target.value)}
                    placeholder="e.g. Engineering or Design"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Location *
                  </label>
                  <input
                    type="text"
                    required
                    value={jobLocation}
                    onChange={(e) => setJobLocation(e.target.value)}
                    placeholder="Remote / On-site"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Job Type *
                  </label>
                  <select
                    value={jobType}
                    onChange={(e) => setJobType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-hidden bg-white"
                  >
                    <option value="full-time">Full-Time</option>
                    <option value="part-time">Part-Time</option>
                    <option value="contract">Contract</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Number of Openings *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    required
                    value={jobOpenings}
                    onChange={(e) => setJobOpenings(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Last Date to Apply (Deadline) *
                  </label>
                  <input
                    type="date"
                    required
                    value={jobLastDate}
                    onChange={(e) => setJobLastDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Initial Posting Status *
                  </label>
                  <select
                    value={jobStatus}
                    onChange={(e) => setJobStatus(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-hidden bg-white"
                  >
                    <option value="Draft">Draft (Internal only - hidden until you post it)</option>
                    <option value="Open">Open (Post live immediately for candidates)</option>
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {jobStatus === 'Draft'
                      ? '🔒 Default mode: Job will remain as Draft until you post it live.'
                      : '🌐 Will be published immediately on the public job board for applicants.'}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description *
                </label>
                <textarea
                  rows={3}
                  required
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Describe the role responsibilities..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Requirements * (One per line)
                </label>
                <textarea
                  rows={3}
                  required
                  value={jobRequirementsStr}
                  onChange={(e) => setJobRequirementsStr(e.target.value)}
                  placeholder="3+ years React and TypeScript experience&#10;Experience with REST or GraphQL APIs&#10;Good team communication skills"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-hidden font-mono"
                />
              </div>

              {/* Recruiter Assignment */}
              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assign Recruiters * (No dead ends rule: at least 1 required)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-slate-200 rounded-xl p-3 bg-slate-50">
                  {recruiters.map((r) => {
                    const isChecked = jobAssignedRecruiterIds.includes(r.id);
                    return (
                      <label
                        key={r.id}
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-xs border transition-colors ${
                          isChecked
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleRecruiterAssignment(r.id)}
                          className="rounded text-indigo-600"
                        />
                        <span>{r.name}</span>
                        <span className="text-[10px] text-slate-400">({r.email})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsJobModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={savingJob}
                    onClick={() => handleSaveJob(undefined, 'Draft')}
                    className="px-4 py-2 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg shadow-xs disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                  >
                    <FileEdit className="w-3.5 h-3.5" />
                    <span>{savingJob && jobStatus === 'Draft' ? 'Saving...' : 'Save as Draft'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={savingJob}
                    onClick={() => handleSaveJob(undefined, 'Open')}
                    className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{savingJob && jobStatus === 'Open' ? 'Posting...' : 'Post Job Live'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD RECRUITER MODAL */}
      {isRecruiterModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 p-6">
            <h3 className="text-lg font-bold text-slate-900">Add New Recruiter</h3>
            <p className="text-xs text-slate-500 mt-1">
              They will receive an email invitation to join Nowshera Digital ATS.
            </p>

            {recruiterError && (
              <div className="mt-3 p-3 rounded-lg bg-red-50 text-red-700 text-xs border border-red-200">
                {recruiterError}
              </div>
            )}

            <form onSubmit={handleAddRecruiter} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={recruiterName}
                  onChange={(e) => setRecruiterName(e.target.value)}
                  placeholder="e.g. Rachel Adams"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={recruiterEmail}
                  onChange={(e) => setRecruiterEmail(e.target.value)}
                  placeholder="rachel.recruiter@nowsheradigital.com"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-hidden"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRecruiterModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingRecruiter}
                  className="px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-xs disabled:opacity-50"
                >
                  {addingRecruiter ? 'Sending Invitation...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
