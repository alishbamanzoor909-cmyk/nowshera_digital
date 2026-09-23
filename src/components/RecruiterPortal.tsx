/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  FileText,
  Clock,
  Sparkles,
  CheckCircle2,
  XCircle,
  Calendar,
  AlertTriangle,
  RotateCw,
  Send,
  Lock,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  MapPin,
  ExternalLink,
  Database,
  Bot,
  RefreshCw,
  Zap,
  PlusCircle,
  ArrowRight,
  Filter,
  Check,
} from 'lucide-react';
import { Application, ApplicationStage, Job, SupabaseAIDecision, User } from '../types';
import { api } from '../api';
import { InterviewScheduler } from './InterviewScheduler';

interface RecruiterPortalProps {
  currentUser: User;
  jobs: Job[];
  applications: Application[];
  onRefresh: () => void;
}

export const RecruiterPortal: React.FC<RecruiterPortalProps> = ({
  currentUser,
  jobs,
  applications,
  onRefresh,
}) => {
  const [selectedJobId, setSelectedJobId] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [recruiters, setRecruiters] = useState<User[]>([]);
  const [activeMainTab, setActiveMainTab] = useState<'pipeline' | 'scheduler'>('pipeline');
  const [schedulerTargetAppId, setSchedulerTargetAppId] = useState<string | null>(null);

  useEffect(() => {
    api.getRecruiters().then((res) => {
      setRecruiters(res.recruiters || []);
    }).catch(() => {
      setRecruiters([currentUser]);
    });
  }, [currentUser]);

  // Supabase ai_decision ingestion state
  const [supabaseAiDecisions, setSupabaseAiDecisions] = useState<SupabaseAIDecision[]>([]);
  const [isSyncingDecisions, setIsSyncingDecisions] = useState(false);
  const [lastDecisionsSyncTime, setLastDecisionsSyncTime] = useState<string>('');
  const [showDecisionsFeed, setShowDecisionsFeed] = useState(false);

  // Modal to simulate / insert an ai_decision row in Supabase
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);
  const [simulatedCandidateAppId, setSimulatedCandidateAppId] = useState<string>('');
  const [simulatedDecision, setSimulatedDecision] = useState<string>('Shortlisted');
  const [simulatedScore, setSimulatedScore] = useState<number>(92);
  const [simulatedReason, setSimulatedReason] = useState<string>('');
  const [simulatedAction, setSimulatedAction] = useState<string>('Schedule Technical Screening');
  const [isSubmittingSimulated, setIsSubmittingSimulated] = useState<boolean>(false);

  // Interview scheduling modal state
  const [isInterviewModalOpen, setIsInterviewModalOpen] = useState(false);
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewTime, setInterviewTime] = useState('10:00');
  const [interviewLocation, setInterviewLocation] = useState('Google Meet: https://meet.google.com/nds-hire-sync');
  const [interviewError, setInterviewError] = useState<string | null>(null);
  const [schedulingInterview, setSchedulingInterview] = useState(false);

  // Note addition state
  const [newNoteContent, setNewNoteContent] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Stage transition & AI state
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isSyncingCandidate, setIsSyncingCandidate] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  // Keep selected application up to date when applications update
  useEffect(() => {
    if (selectedApp) {
      const fresh = applications.find((a) => a.id === selectedApp.id);
      if (fresh) setSelectedApp(fresh);
    }
  }, [applications]);

  // Fetch AI Decisions from Supabase & poll every 8 seconds
  const fetchDecisions = async (isManual = false) => {
    if (isManual) setIsSyncingDecisions(true);
    try {
      if (isManual) {
        const syncRes = await api.syncAiDecisions();
        setSupabaseAiDecisions(syncRes.decisions);
        setLastDecisionsSyncTime(new Date().toLocaleTimeString());
        if (syncRes.newDecisionsCount > 0) {
          setActionSuccess(
            `Ingested ${syncRes.newDecisionsCount} new decision(s) from Supabase ai_decision table into recruiter dashboard!`
          );
          onRefresh();
        } else {
          setActionSuccess(`Checked Supabase ai_decision table: Dashboard is completely up to date.`);
        }
      } else {
        const res = await api.getAiDecisions();
        setSupabaseAiDecisions(res.decisions);
        setLastDecisionsSyncTime(new Date().toLocaleTimeString());
      }
    } catch (err: any) {
      if (isManual) {
        setActionError(err.message || 'Failed to sync with Supabase ai_decision table.');
      }
    } finally {
      if (isManual) setIsSyncingDecisions(false);
    }
  };

  useEffect(() => {
    fetchDecisions(false);
    const interval = setInterval(() => {
      fetchDecisions(false);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Recruiter applies the AI decision
  const handleApplyAiDecision = async (appId: string, decisionId: string, targetStage?: ApplicationStage) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await api.applyAiDecision(appId, decisionId, targetStage);
      setActionSuccess(res.message);
      setSelectedApp(res.application);
      onRefresh();
      fetchDecisions(false);
    } catch (err: any) {
      setActionError(err.message || 'Failed to apply AI decision.');
    }
  };

  // Test insert into ai_decision table
  const handleInsertTestAiDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingSimulated(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const targetApp = applications.find((a) => a.id === simulatedCandidateAppId);
      const res = await api.simulateAiDecision({
        applicationId: targetApp?.id,
        candidateName: targetApp?.candidateName || 'Candidate',
        candidateEmail: targetApp?.candidateEmail || 'candidate@example.com',
        jobId: targetApp?.jobId,
        jobTitle: targetApp?.jobTitle,
        decision: simulatedDecision,
        confidenceScore: Number(simulatedScore),
        reason:
          simulatedReason ||
          `Assessment profile shows strong competence. AI recommendation suggests progressing to ${simulatedDecision}.`,
        suggestedAction: simulatedAction || `Advance to ${simulatedDecision}`,
      });

      setActionSuccess(
        `Row added to Supabase 'ai_decision' table (ID: ${res.decision.id}) and ingested into recruiter dashboard!`
      );
      setIsSimulateModalOpen(false);
      onRefresh();
      fetchDecisions(false);
      if (targetApp) {
        setSelectedApp(targetApp);
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to insert row into ai_decision');
    } finally {
      setIsSubmittingSimulated(false);
    }
  };

  // Filter applications for jobs assigned to this recruiter
  const assignedJobIds = new Set(jobs.map((j) => j.id));
  const myApplications = applications.filter((a) => assignedJobIds.has(a.jobId));

  const filteredApps = myApplications.filter((app) => {
    const matchesJob = selectedJobId === 'all' || app.jobId === selectedJobId;
    const matchesStage = stageFilter === 'all' || app.stage === stageFilter;
    return matchesJob && matchesStage;
  });

  const handleOpenAppDetail = (app: Application) => {
    setSelectedApp(app);
    setActionError(null);
    setActionSuccess(null);
  };

  const handleStageChange = async (targetStage: ApplicationStage) => {
    if (!selectedApp) return;
    setActionError(null);
    setActionSuccess(null);

    // If moving to Interview, prompt the interview scheduling modal
    if (targetStage === 'Interview') {
      setIsInterviewModalOpen(true);
      return;
    }

    try {
      const res = await api.updateStage(selectedApp.id, targetStage);
      setActionSuccess(`${res.message} (Decision dispatched to Supabase)`);
      setSelectedApp(res.application);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || `Failed to move stage to ${targetStage}.`);
    }
  };

  const handleScheduleInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;

    setInterviewError(null);
    setSchedulingInterview(true);

    try {
      const res = await api.scheduleInterview(selectedApp.id, {
        date: interviewDate,
        time: interviewTime,
        locationOrLink: interviewLocation,
      });

      setIsInterviewModalOpen(false);
      setSelectedApp(res.application);
      setActionSuccess('Interview scheduled successfully! Invitation email delivered and decision sent to Supabase.');
      onRefresh();
    } catch (err: any) {
      setInterviewError(err.message || 'Failed to schedule interview.');
    } finally {
      setSchedulingInterview(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp || !newNoteContent.trim()) return;

    setAddingNote(true);
    try {
      const res = await api.addNote(selectedApp.id, newNoteContent.trim());
      setSelectedApp(res.application);
      setNewNoteContent('');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to add note.');
    } finally {
      setAddingNote(false);
    }
  };

  const handleSyncCandidateAiDecision = async () => {
    if (!selectedApp) return;
    setIsSyncingCandidate(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await api.retryAiSummary(selectedApp.id);
      setSelectedApp(res.application);
      setActionSuccess(res.message);
      onRefresh();
      await fetchDecisions(false);
    } catch (err: any) {
      setActionError(err.message || 'Failed to sync with Supabase ai_decision.');
    } finally {
      setIsSyncingCandidate(false);
    }
  };

  const handleGenerateAiSummary = async () => {
    if (!selectedApp) return;
    setIsGeneratingSummary(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await api.generateCandidateAiSummary(selectedApp.id);
      setSelectedApp(res.application);
      setActionSuccess('AI summary generated and synced to Supabase successfully.');
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to generate AI summary.');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  // Next stage in pipeline
  const getNextStage = (current: ApplicationStage): ApplicationStage | null => {
    switch (current) {
      case 'Applied':
        return 'Shortlisted';
      case 'Shortlisted':
        return 'Interview';
      case 'Interview':
        return 'Offer';
      case 'Offer':
        return 'Hired';
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Recruiter Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-100 uppercase tracking-wide">
              Recruiter Dashboard
            </span>
            <span className="text-xs text-slate-500">{currentUser.email}</span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500 font-medium">Assigned Jobs: {jobs.length}</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Database className="w-3 h-3 text-emerald-600" />
              Supabase Connected
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 mt-1">
            {currentUser.name}&apos;s Hiring Pipeline
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Review AI summaries, inspect original CV snapshots, schedule clash-free interviews, and manage stage progression for assigned roles.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Job Filter */}
          <select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="text-xs font-medium px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-hidden"
          >
            <option value="all">All Assigned Jobs ({jobs.length})</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} {j.status === 'Draft' ? '— [Draft - Not Live]' : `(${j.openings - j.hiredCount} open)`}
              </option>
            ))}
          </select>

          {/* Stage Filter */}
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="text-xs font-medium px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-hidden"
          >
            <option value="all">All Stages</option>
            <option value="Applied">Applied</option>
            <option value="Shortlisted">Shortlisted</option>
            <option value="Interview">Interview</option>
            <option value="Offer">Offer</option>
            <option value="Hired">Hired</option>
            <option value="Rejected">Rejected</option>
            <option value="Withdrawn">Withdrawn</option>
          </select>
        </div>
      </div>

      {/* Primary Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveMainTab('pipeline')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeMainTab === 'pipeline'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Candidate Pipeline ({filteredApps.length})</span>
        </button>

        <button
          onClick={() => setActiveMainTab('scheduler')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeMainTab === 'scheduler'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>
            Interview Scheduler & Timeline (
            {applications.filter((a) => a.interview && a.stage !== 'Withdrawn' && a.stage !== 'Rejected').length})
          </span>
        </button>
      </div>

      {activeMainTab === 'scheduler' ? (
        <InterviewScheduler
          applications={applications}
          jobs={jobs}
          currentUser={currentUser}
          recruiters={recruiters}
          onRefresh={onRefresh}
          preSelectedAppId={schedulerTargetAppId}
        />
      ) : (
        <div className="space-y-6">
          {/* Supabase ai_decision Integration Control & Feed Banner */}
      <div className="bg-linear-to-r from-purple-900 via-indigo-900 to-slate-900 rounded-2xl p-5 text-white shadow-md border border-purple-800/40 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/30 text-purple-200 border border-purple-400/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Supabase Live Ingestion Active
              </span>
              <span className="text-xs font-mono text-purple-200 bg-purple-950/70 px-2 py-0.5 rounded border border-purple-700/50">
                table: public.ai_decision
              </span>
            </div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-400" />
              <span>Supabase AI Decisions Feed</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-700 text-purple-100">
                {supabaseAiDecisions.length} ingested
              </span>
            </h2>
            <p className="text-xs text-purple-200/80">
              When a row is added into <code className="text-purple-300 font-mono">ai_decision</code> in Supabase, the data is automatically ingested and linked to candidate profiles on this dashboard.
              {lastDecisionsSyncTime && ` (Last checked: ${lastDecisionsSyncTime})`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Sync Now Button */}
            <button
              onClick={() => fetchDecisions(true)}
              disabled={isSyncingDecisions}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-purple-700/80 hover:bg-purple-600 text-white border border-purple-500/40 shadow-xs transition-all disabled:opacity-50"
              title="Poll latest rows from Supabase ai_decision table"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDecisions ? 'animate-spin' : ''}`} />
              <span>{isSyncingDecisions ? 'Syncing...' : 'Sync Supabase ai_decision'}</span>
            </button>

            {/* Test Row Simulation Button */}
            <button
              onClick={() => {
                if (filteredApps.length > 0) {
                  setSimulatedCandidateAppId(selectedApp ? selectedApp.id : filteredApps[0].id);
                }
                setIsSimulateModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-all"
              title="Insert a test row into ai_decision"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>+ Add Row to ai_decision</span>
            </button>

            {/* Toggle Table Stream */}
            <button
              onClick={() => setShowDecisionsFeed(!showDecisionsFeed)}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-colors"
            >
              <span>{showDecisionsFeed ? 'Hide Stream' : 'View Stream'}</span>
              {showDecisionsFeed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Expandable Feed Table */}
        {showDecisionsFeed && (
          <div className="pt-3 border-t border-purple-800/60">
            {supabaseAiDecisions.length === 0 ? (
              <div className="text-center py-6 bg-purple-950/40 rounded-xl border border-purple-800/40 text-xs text-purple-300">
                <Bot className="w-6 h-6 text-purple-400 mx-auto mb-1.5 opacity-60" />
                <p className="font-semibold">No rows in Supabase ai_decision yet</p>
                <p className="text-[11px] text-purple-400/80 mt-0.5">
                  Click &apos;+ Add Row to ai_decision&apos; above or insert rows directly into your Supabase database table.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-purple-800/50 bg-purple-950/60 max-h-72">
                <table className="w-full text-left text-xs text-purple-100">
                  <thead className="bg-purple-900/80 text-[11px] uppercase tracking-wider text-purple-300 border-b border-purple-800/60 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Row ID</th>
                      <th className="py-2.5 px-3">Candidate / Job</th>
                      <th className="py-2.5 px-3">AI Decision</th>
                      <th className="py-2.5 px-3">Score</th>
                      <th className="py-2.5 px-3">Reason / Rationale</th>
                      <th className="py-2.5 px-3 text-right">Dashboard Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-800/40 text-[11px]">
                    {supabaseAiDecisions.map((dec) => {
                      const matchedApp = applications.find(
                        (a) =>
                          a.id === dec.applicationId ||
                          (dec.candidateEmail && a.candidateEmail.toLowerCase() === dec.candidateEmail.toLowerCase())
                      );

                      return (
                        <tr key={dec.id} className="hover:bg-purple-900/40 transition-colors">
                          <td className="py-2.5 px-3 font-mono text-purple-300">
                            {dec.id.slice(0, 12)}...
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-white">
                              {dec.candidateName || matchedApp?.candidateName || 'Unlinked'}
                            </div>
                            <div className="text-[10px] text-purple-300">
                              {dec.jobTitle || matchedApp?.jobTitle || dec.candidateEmail}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-extrabold px-2 py-0.5 rounded bg-purple-700/80 text-purple-100 border border-purple-500/40">
                              {dec.decision}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            {dec.confidenceScore !== undefined ? (
                              <span className="font-bold text-emerald-300">
                                {dec.confidenceScore}%
                              </span>
                            ) : (
                              <span className="text-purple-400">N/A</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 max-w-xs truncate text-purple-200/90" title={dec.reason}>
                            {dec.reason || dec.notes || dec.suggestedAction || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right space-x-1.5 whitespace-nowrap">
                            {matchedApp ? (
                              <>
                                <button
                                  onClick={() => handleOpenAppDetail(matchedApp)}
                                  className="px-2 py-1 bg-purple-700/80 hover:bg-purple-600 text-white rounded text-[10px] font-semibold transition-colors"
                                >
                                  View Candidate
                                </button>
                                {dec.appliedToDashboard ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 px-2 py-1">
                                    <Check className="w-3 h-3" /> Applied
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleApplyAiDecision(matchedApp.id, dec.id)}
                                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-semibold transition-colors"
                                  >
                                    Apply
                                  </button>
                                )}
                              </>
                            ) : (
                              <span className="text-[10px] text-purple-400 italic">Unmatched email</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Grid: Applications List on Left, Selected Detail on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Applications List (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase px-1">
            <span>Applicants ({filteredApps.length})</span>
            <span>Stage</span>
          </div>

          {filteredApps.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <UserCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No applicants found</p>
              <p className="text-xs text-slate-400 mt-1">
                {jobs.length === 0
                  ? 'You are not currently assigned to any jobs.'
                  : 'No applications match the selected filter.'}
              </p>
            </div>
          ) : (
            filteredApps.map((app) => {
              const isSelected = selectedApp?.id === app.id;
              return (
                <div
                  key={app.id}
                  onClick={() => handleOpenAppDetail(app)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-indigo-50/70 border-indigo-500 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{app.candidateName}</h4>
                      <p className="text-xs font-medium text-slate-600 mt-0.5">{app.jobTitle}</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Applied {new Date(app.appliedAt).toLocaleDateString()}
                      </p>
                    </div>

                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                        app.stage === 'Hired'
                          ? 'bg-emerald-100 text-emerald-800'
                          : app.stage === 'Offer'
                          ? 'bg-purple-100 text-purple-800'
                          : app.stage === 'Interview'
                          ? 'bg-blue-100 text-blue-800'
                          : app.stage === 'Shortlisted'
                          ? 'bg-amber-100 text-amber-800'
                          : app.stage === 'Rejected'
                          ? 'bg-rose-100 text-rose-800'
                          : app.stage === 'Withdrawn'
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}
                    >
                      {app.stage}
                    </span>
                  </div>

                  {/* Supabase AI Decision Tag on Applicant Card */}
                  {app.latestAiDecision && (
                    <div className="mt-2.5 pt-2 border-t border-purple-100 flex items-center justify-between text-[11px] bg-purple-50/70 -mx-4 -mb-4 px-4 py-2 rounded-b-xl">
                      <div className="flex items-center gap-1.5 font-bold text-purple-900">
                        <Bot className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                        <span>Supabase AI: {app.latestAiDecision.decision}</span>
                      </div>
                      {app.latestAiDecision.confidenceScore !== undefined && (
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-purple-200 text-purple-900">
                          {app.latestAiDecision.confidenceScore}% score
                        </span>
                      )}
                    </div>
                  )}

                  {app.interview && !app.latestAiDecision && (
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-blue-700 font-medium">
                      <Clock className="w-3.5 h-3.5 text-blue-500" />
                      <span>
                        Interview: {app.interview.date} at {app.interview.time} (1 hr)
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Selected Application Detail (7 cols) */}
        <div className="lg:col-span-7">
          {selectedApp ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-6">
              {/* Header & Candidate Info */}
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {selectedApp.jobDepartment}
                    </span>
                    <h2 className="text-xl font-bold text-slate-900 mt-1">
                      {selectedApp.candidateName}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Position: <span className="font-semibold text-slate-800">{selectedApp.jobTitle}</span> · Email: {selectedApp.candidateEmail}
                    </p>
                  </div>

                  {/* CV Download / View Snapshot */}
                  <a
                    href={selectedApp.cvDataUrl}
                    download={selectedApp.cvFileName}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors border border-slate-200"
                  >
                    <FileText className="w-4 h-4 text-indigo-600" />
                    <span>Open CV Snapshot ({selectedApp.cvFileName})</span>
                  </a>
                </div>

                {actionError && (
                  <div className="mt-3 p-3 rounded-lg bg-red-50 text-red-700 text-xs border border-red-200 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <span>{actionError}</span>
                  </div>
                )}

                {actionSuccess && (
                  <div className="mt-3 p-3 rounded-lg bg-emerald-50 text-emerald-800 text-xs border border-emerald-200 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{actionSuccess}</span>
                  </div>
                )}
              </div>

              {/* Stage Progress & Action Bar */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-700">
                    Current Stage: <span className="text-indigo-700 font-bold uppercase">{selectedApp.stage}</span>
                  </div>

                  {/* Progression Actions */}
                  {selectedApp.stage !== 'Hired' &&
                    selectedApp.stage !== 'Rejected' &&
                    selectedApp.stage !== 'Withdrawn' && (
                      <div className="flex items-center gap-2">
                        {/* Reject Button */}
                        <button
                          onClick={() => handleStageChange('Rejected')}
                          className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
                        >
                          Reject
                        </button>

                        {/* Move to Next Stage */}
                        {getNextStage(selectedApp.stage) && (
                          <button
                            onClick={() => handleStageChange(getNextStage(selectedApp.stage)!)}
                            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors"
                          >
                            <span>Move to {getNextStage(selectedApp.stage)}</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                </div>

                {/* Scheduled Interview Details */}
                {selectedApp.interview && (
                  <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-blue-900 gap-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600" />
                      <span>
                        Interview: <strong>{selectedApp.interview.date}</strong> at <strong>{selectedApp.interview.time}</strong> (1 Hour Slot)
                      </span>
                    </div>
                    <div className="text-slate-500 text-[11px] truncate max-w-xs">
                      Location / Link: {selectedApp.interview.locationOrLink}
                    </div>
                  </div>
                )}
              </div>

              {/* SUPABASE AI_DECISION RECORD & ASSESSMENT CARD */}
              {selectedApp.latestAiDecision ? (
                <div className="border border-purple-200 bg-linear-to-br from-purple-50/80 via-indigo-50/40 to-white rounded-xl p-5 shadow-2xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-purple-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900">
                            Supabase AI Decision Ingested
                          </h3>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                            <Database className="w-2.5 h-2.5" />
                            Table: ai_decision
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Row ID: <code className="font-mono text-slate-700 bg-slate-100 px-1 rounded">{selectedApp.latestAiDecision.id}</code> · Received {new Date(selectedApp.latestAiDecision.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSyncCandidateAiDecision}
                        disabled={isSyncingCandidate}
                        title="Re-fetch from Supabase ai_decision"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 hover:text-purple-900 bg-white hover:bg-purple-50 px-2.5 py-1.5 rounded-lg border border-purple-200 shadow-2xs transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCandidate ? 'animate-spin' : ''}`} />
                        <span>{isSyncingCandidate ? 'Syncing...' : 'Sync'}</span>
                      </button>

                      {selectedApp.latestAiDecision.appliedToDashboard ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Applied to {selectedApp.latestAiDecision.appliedStage || selectedApp.stage}</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleApplyAiDecision(selectedApp.id, selectedApp.latestAiDecision!.id)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 px-3.5 py-1.5 rounded-lg shadow-xs transition-colors shrink-0"
                        >
                          <Zap className="w-3.5 h-3.5 text-amber-300" />
                          <span>Apply AI Recommendation</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Decision & Score Highlights */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 bg-white rounded-lg border border-purple-100 shadow-2xs">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                        AI Recommended Decision
                      </span>
                      <span className="text-base font-extrabold text-purple-950 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-purple-600" />
                        {selectedApp.latestAiDecision.decision}
                      </span>
                    </div>

                    <div className="p-3.5 bg-white rounded-lg border border-purple-100 shadow-2xs">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                        Assessment Confidence
                      </span>
                      <div className="flex items-center gap-2.5">
                        <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className="bg-purple-600 h-2.5 rounded-full transition-all duration-500"
                            style={{ width: `${selectedApp.latestAiDecision.confidenceScore || 85}%` }}
                          />
                        </div>
                        <span className="text-xs font-extrabold text-purple-900">
                          {selectedApp.latestAiDecision.confidenceScore || 85}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Rationale & Notes */}
                  {selectedApp.latestAiDecision.reason && (
                    <div className="p-3.5 bg-white rounded-lg border border-purple-100 text-xs space-y-1 shadow-2xs">
                      <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wider">
                        Supabase Rationale & Assessment Notes:
                      </span>
                      <p className="text-slate-700 leading-relaxed">
                        {selectedApp.latestAiDecision.reason}
                      </p>
                    </div>
                  )}

                  {/* Suggested Next Action */}
                  {selectedApp.latestAiDecision.suggestedAction && (
                    <div className="flex items-center gap-2 text-xs font-medium text-purple-900 bg-purple-100/60 p-2.5 rounded-lg border border-purple-200">
                      <ArrowRight className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                      <span><strong>Suggested Next Step:</strong> {selectedApp.latestAiDecision.suggestedAction}</span>
                    </div>
                  )}

                  {/* History if multiple decisions received from Supabase */}
                  {selectedApp.aiDecisions && selectedApp.aiDecisions.length > 1 && (
                    <div className="pt-2 border-t border-purple-100 text-xs text-slate-500">
                      <span className="font-semibold text-slate-700 block mb-1.5">
                        Historical AI Decisions ({selectedApp.aiDecisions.length}):
                      </span>
                      <div className="space-y-1.5">
                        {selectedApp.aiDecisions.slice(1).map((hist) => (
                          <div
                            key={hist.id}
                            className="flex items-center justify-between p-2 bg-white rounded border border-purple-100 text-[11px]"
                          >
                            <span>
                              <strong>{hist.decision}</strong> ({hist.confidenceScore || 85}%) - {hist.reason || 'Decision logged'}
                            </span>
                            <span className="text-slate-400">
                              {new Date(hist.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="border border-dashed border-purple-300 rounded-xl p-5 bg-purple-50/40 text-xs text-slate-600 space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">
                          Awaiting AI Decision from Supabase <code className="font-mono text-purple-700">ai_decision</code> table
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Candidate assessments are ingested directly from Supabase when a row is added to the table.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSyncCandidateAiDecision}
                        disabled={isSyncingCandidate}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg font-semibold text-[11px] shadow-2xs shrink-0 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCandidate ? 'animate-spin' : ''}`} />
                        <span>{isSyncingCandidate ? 'Checking Supabase...' : 'Check Supabase'}</span>
                      </button>
                      <button
                        onClick={() => {
                          setSimulatedCandidateAppId(selectedApp.id);
                          setIsSimulateModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold text-[11px] shadow-2xs shrink-0 transition-colors"
                      >
                        <PlusCircle className="w-3.5 h-3.5 text-white" />
                        <span>+ Add ai_decision Row</span>
                      </button>
                    </div>
                  </div>
                  <div className="p-3 bg-white/80 rounded-lg border border-purple-100 text-[11px] text-slate-600 flex items-center gap-2">
                    <Database className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span>
                      Target candidate: <strong>{selectedApp.candidateName}</strong> ({selectedApp.candidateEmail}). When any external AI scoring model inserts a row into Supabase <code className="font-mono text-purple-700 font-bold">ai_decision</code>, the recommendation, confidence score, rationale, and suggested action will automatically appear here.
                    </span>
                  </div>
                </div>
              )}

              {/* AI CANDIDATE SUMMARY (SYNCED TO SUPABASE) */}
              <div className="border border-indigo-100 bg-indigo-50/30 rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-indigo-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900">
                          AI Candidate Summary
                        </h3>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                          Synced to Supabase
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Objective CV evaluation · Synced to Supabase tables <code className="font-mono text-indigo-700 bg-indigo-50 px-1 rounded">candidate_applications.ai_summary</code> &amp; <code className="font-mono text-indigo-700 bg-indigo-50 px-1 rounded">ai_summaries</code>
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleGenerateAiSummary}
                    disabled={isGeneratingSummary}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-white hover:bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200 shadow-2xs transition-colors disabled:opacity-50 shrink-0"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${isGeneratingSummary ? 'animate-spin' : ''}`} />
                    <span>{isGeneratingSummary ? 'Generating & Syncing...' : selectedApp.aiSummary?.status === 'completed' ? 'Regenerate & Sync' : 'Generate & Send to Supabase'}</span>
                  </button>
                </div>

                {selectedApp.aiSummary?.status === 'completed' ? (
                  <div className="space-y-4 text-xs">
                    {/* PART 1: SHORT PROFILE (3 to 5 bullets) */}
                    <div>
                      <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-indigo-600" />
                        1. Candidate Profile:
                      </h4>
                      <ul className="space-y-1.5 list-disc list-inside text-slate-700 pl-1 leading-relaxed">
                        {selectedApp.aiSummary.profileBullets?.map((bullet, i) => (
                          <li key={i}>{bullet}</li>
                        ))}
                      </ul>
                    </div>

                    {/* PART 2: REQUIREMENTS ANALYSIS (Matched vs Missing) */}
                    <div className="pt-3 border-t border-indigo-100">
                      <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-2">
                        2. Requirements Alignment:
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-3 bg-emerald-50/60 rounded-lg border border-emerald-200">
                          <span className="font-bold text-emerald-800 flex items-center gap-1.5 mb-1.5 text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Mentioned in CV:
                          </span>
                          <ul className="space-y-1 text-[11px] text-emerald-950">
                            {selectedApp.aiSummary.matchedRequirements?.map((r, i) => (
                              <li key={i}>• {r}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-200">
                          <span className="font-bold text-amber-800 flex items-center gap-1.5 mb-1.5 text-[11px]">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            Not Evidenced in CV:
                          </span>
                          <ul className="space-y-1 text-[11px] text-amber-950">
                            {selectedApp.aiSummary.missingRequirements?.map((r, i) => (
                              <li key={i}>• {r}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* PART 3: 3 INTERVIEW QUESTIONS */}
                    <div className="pt-3 border-t border-indigo-100">
                      <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-2">
                        3. Suggested Interview Questions (3 Questions):
                      </h4>
                      <ol className="space-y-1.5 list-decimal list-inside text-slate-700 pl-1 leading-relaxed">
                        {selectedApp.aiSummary.interviewQuestions?.map((q, i) => (
                          <li key={i} className="font-medium text-slate-800">
                            {q}
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div className="pt-2 border-t border-indigo-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[10px] text-slate-500">
                      <span>* Objective summary generated without age, gender, religion, or marital bias.</span>
                      <span className="font-mono text-indigo-700">Dispatched to Supabase: {selectedApp.aiSummary.generatedAt ? new Date(selectedApp.aiSummary.generatedAt).toLocaleTimeString() : 'Live'}</span>
                    </div>
                  </div>
                ) : selectedApp.aiSummary?.status === 'pending' || isGeneratingSummary ? (
                  <div className="py-6 text-center text-slate-500">
                    <Sparkles className="w-6 h-6 text-indigo-500 animate-pulse mx-auto mb-2" />
                    <p className="font-semibold text-xs text-slate-700">Generating AI Summary &amp; Sending to Supabase...</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Evaluating CV against job requirements and syncing to Supabase tables.</p>
                  </div>
                ) : (
                  <div className="py-4 text-center text-slate-600">
                    <p className="font-semibold text-xs text-slate-800">No AI Summary on record yet</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 mb-3">
                      Generate an objective 3-part AI summary for {selectedApp.candidateName} and send the data directly to Supabase.
                    </p>
                    <button
                      onClick={handleGenerateAiSummary}
                      disabled={isGeneratingSummary}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
                    >
                      Generate AI Summary &amp; Send to Supabase
                    </button>
                  </div>
                )}
              </div>

              {/* PRIVATE RECRUITER NOTES SECTION */}
              <div className="border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-slate-500" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Private Recruiter Notes (Confidential)
                  </h3>
                </div>
                <p className="text-[11px] text-slate-400">
                  Visible only to assigned recruiters and admins. Never visible to candidates.
                </p>

                {/* Notes List */}
                <div className="space-y-2.5 max-h-48 overflow-y-auto">
                  {selectedApp.recruiterNotes.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No notes recorded yet.</p>
                  ) : (
                    selectedApp.recruiterNotes.map((note) => (
                      <div key={note.id} className="p-3 bg-slate-50 rounded-lg text-xs space-y-1">
                        <div className="flex items-center justify-between text-slate-500 text-[11px]">
                          <span className="font-semibold text-slate-700">{note.recruiterName}</span>
                          <span>{new Date(note.createdAt).toLocaleDateString()}</span>
                        </div>
                        <p className="text-slate-800">{note.content}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Note Form */}
                <form onSubmit={handleAddNote} className="flex gap-2 pt-2 border-t border-slate-100">
                  <input
                    type="text"
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    placeholder="Add private feedback, screening remarks..."
                    className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-hidden"
                  />
                  <button
                    type="submit"
                    disabled={addingNote || !newNoteContent.trim()}
                    className="px-3 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-900 disabled:opacity-50 flex items-center gap-1"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
              <UserCheck className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              <h3 className="text-base font-semibold text-slate-700">Select an applicant to review</h3>
              <p className="text-xs text-slate-400 mt-1">
                Click any applicant on the left to inspect their CV snapshot, AI summary, and manage stage decisions.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* SCHEDULE INTERVIEW MODAL */}
      {isInterviewModalOpen && selectedApp && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 p-6">
            <h3 className="text-lg font-bold text-slate-900">
              Schedule 1-Hour Interview
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Candidate: <strong>{selectedApp.candidateName}</strong> for <strong>{selectedApp.jobTitle}</strong>
            </p>

            <div className="mt-3 p-2.5 rounded-lg bg-blue-50 text-blue-800 text-xs border border-blue-100 flex items-start gap-2">
              <Clock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                Interviews are strictly 1 hour. Clashing interviews for the same recruiter are automatically blocked.
              </span>
            </div>

            {interviewError && (
              <div className="mt-3 p-3 rounded-lg bg-red-50 text-red-700 text-xs border border-red-200">
                {interviewError}
              </div>
            )}

            <form onSubmit={handleScheduleInterview} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Interview Date *
                </label>
                <input
                  type="date"
                  required
                  min={new Date().toISOString().split('T')[0]}
                  value={interviewDate}
                  onChange={(e) => setInterviewDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Start Time * (Duration: 1 Hour)
                </label>
                <input
                  type="time"
                  required
                  value={interviewTime}
                  onChange={(e) => setInterviewTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Meeting Link or Physical Location *
                </label>
                <input
                  type="text"
                  required
                  value={interviewLocation}
                  onChange={(e) => setInterviewLocation(e.target.value)}
                  placeholder="e.g. Google Meet URL or Room 402"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-hidden"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsInterviewModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={schedulingInterview}
                  className="px-5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs disabled:opacity-50"
                >
                  {schedulingInterview ? 'Validating Slot...' : 'Confirm & Move to Interview'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SIMULATE / INSERT ROW INTO SUPABASE ai_decision MODAL */}
      {isSimulateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Insert Row into Supabase <code className="font-mono text-purple-700">ai_decision</code>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Simulates external AI scoring row inserted into cloud Supabase table
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSimulateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleInsertTestAiDecision} className="mt-4 space-y-4">
              {/* Target Candidate Application */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Candidate Application *
                </label>
                <select
                  value={simulatedCandidateAppId}
                  onChange={(e) => setSimulatedCandidateAppId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-hidden bg-white"
                  required
                >
                  {applications.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.candidateName} — {a.jobTitle} (Current: {a.stage})
                    </option>
                  ))}
                </select>
              </div>

              {/* AI Decision Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    AI Decision *
                  </label>
                  <select
                    value={simulatedDecision}
                    onChange={(e) => setSimulatedDecision(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-hidden bg-white"
                  >
                    <option value="Shortlisted">Shortlisted</option>
                    <option value="Interview">Interview</option>
                    <option value="Offer">Offer</option>
                    <option value="Rejected">Rejected</option>
                    <option value="Review">Requires Recruiter Review</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Confidence Score (%) (0 - 100)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={simulatedScore}
                    onChange={(e) => setSimulatedScore(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-hidden"
                  />
                </div>
              </div>

              {/* AI Assessment Reason */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  AI Evaluation Rationale / Notes (reason)
                </label>
                <textarea
                  rows={2}
                  value={simulatedReason}
                  onChange={(e) => setSimulatedReason(e.target.value)}
                  placeholder="e.g. Profile shows 5+ years React & TypeScript, exceeding requirements. Technical assessment benchmark passed."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-hidden"
                />
              </div>

              {/* Suggested Action */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Suggested Action (suggested_action)
                </label>
                <input
                  type="text"
                  value={simulatedAction}
                  onChange={(e) => setSimulatedAction(e.target.value)}
                  placeholder="e.g. Schedule 1-Hour Technical Screening with Engineering Lead"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-hidden"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  Inserts into Supabase table &apos;ai_decision&apos;
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSimulateModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingSimulated}
                    className="px-5 py-2 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span>{isSubmittingSimulated ? 'Inserting...' : 'Insert & Sync into Dashboard'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
};
