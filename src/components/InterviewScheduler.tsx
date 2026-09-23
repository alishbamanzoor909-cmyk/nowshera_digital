/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  Clock,
  User,
  Users,
  Briefcase,
  Video,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  X,
  FileText,
  Sparkles,
  HelpCircle,
  CalendarDays,
  ListOrdered,
  Columns,
  RefreshCw,
  RotateCw,
  Trash2,
  MapPin,
  Check,
  ShieldAlert,
} from 'lucide-react';
import { Application, Job, User as UserModel } from '../types';
import { api } from '../api';

interface InterviewSchedulerProps {
  applications: Application[];
  jobs: Job[];
  currentUser: UserModel;
  recruiters: UserModel[];
  onRefresh: () => void;
  onOpenCandidateModal?: (app: Application) => void;
  preSelectedAppId?: string | null;
}

// 1-Hour Time Slots from 08:00 to 19:00 (interviews are strictly 1 hour)
const BUSINESS_HOURS = [
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
];

export const InterviewScheduler: React.FC<InterviewSchedulerProps> = ({
  applications,
  jobs,
  currentUser,
  recruiters,
  onRefresh,
  onOpenCandidateModal,
  preSelectedAppId,
}) => {
  // Navigation & View Mode
  const [viewMode, setViewMode] = useState<'timeline' | 'week' | 'month' | 'agenda'>('timeline');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Filters
  const [filterRecruiterId, setFilterRecruiterId] = useState<string>('all');
  const [filterJobId, setFilterJobId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Toast Notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  // Schedule / Reschedule Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'reschedule'>('create');
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [scheduledRecruiterId, setScheduledRecruiterId] = useState<string>(currentUser.id);
  const [modalDate, setModalDate] = useState<string>('');
  const [modalTime, setModalTime] = useState<string>('10:00');
  const [modalLocation, setModalLocation] = useState<string>(
    'Google Meet: https://meet.google.com/nds-hire-sync'
  );
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Real-time Clash Detection State in Modal
  const [localClash, setLocalClash] = useState<{
    hasClash: boolean;
    conflictingApp?: Application | null;
  }>({ hasClash: false });

  // Candidate Details / AI Summary Drawer State
  const [inspectingApp, setInspectingApp] = useState<Application | null>(null);

  // All applications with a scheduled interview
  const scheduledApplications = useMemo(() => {
    return applications
      .filter((app) => app.interview && app.stage !== 'Withdrawn' && app.stage !== 'Rejected')
      .sort((a, b) => {
        const dateTimeA = `${a.interview!.date}T${a.interview!.time}`;
        const dateTimeB = `${b.interview!.date}T${b.interview!.time}`;
        return dateTimeA.localeCompare(dateTimeB);
      });
  }, [applications]);

  // Candidates available for scheduling (in 'Shortlisted' stage without an interview)
  const shortlistedCandidates = useMemo(() => {
    return applications.filter(
      (app) => app.stage === 'Shortlisted' && !app.interview
    );
  }, [applications]);

  // Filtered applications with scheduled interview according to toolbar filters
  const filteredInterviews = useMemo(() => {
    return scheduledApplications.filter((app) => {
      if (!app.interview) return false;

      // Recruiter filter
      if (
        filterRecruiterId !== 'all' &&
        app.interview.scheduledByRecruiterId !== filterRecruiterId
      ) {
        return false;
      }

      // Job filter
      if (filterJobId !== 'all' && app.jobId !== filterJobId) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesCandidate =
          app.candidateName.toLowerCase().includes(query) ||
          app.candidateEmail.toLowerCase().includes(query);
        const matchesJob = app.jobTitle.toLowerCase().includes(query);
        const matchesRecruiter = app.interview.scheduledByRecruiterName
          .toLowerCase()
          .includes(query);
        if (!matchesCandidate && !matchesJob && !matchesRecruiter) {
          return false;
        }
      }

      return true;
    });
  }, [scheduledApplications, filterRecruiterId, filterJobId, searchQuery]);

  // If a preSelectedAppId was passed in, auto-open the schedule modal
  useEffect(() => {
    if (preSelectedAppId) {
      const target = applications.find((a) => a.id === preSelectedAppId);
      if (target) {
        handleOpenScheduleModal(target);
      }
    }
  }, [preSelectedAppId]);

  // Helper: check clash locally in memory for immediate UI feedback
  const checkClashLocally = (
    recruiterId: string,
    date: string,
    time: string,
    excludeAppId?: string
  ) => {
    if (!date || !time) return { hasClash: false };
    const [newH, newM] = time.split(':').map(Number);
    const newStart = newH * 60 + newM;
    const newEnd = newStart + 60; // 1-hour fixed duration

    for (const app of applications) {
      if (app.id === excludeAppId) continue;
      if (app.stage === 'Withdrawn' || app.stage === 'Rejected') continue;
      if (!app.interview) continue;

      if (
        app.interview.scheduledByRecruiterId === recruiterId &&
        app.interview.date === date
      ) {
        const [existH, existM] = app.interview.time.split(':').map(Number);
        const existStart = existH * 60 + existM;
        const existEnd = existStart + 60;

        if (newStart < existEnd && existStart < newEnd) {
          return { hasClash: true, conflictingApp: app };
        }
      }
    }
    return { hasClash: false };
  };

  // Re-run clash check whenever modal parameters change
  useEffect(() => {
    if (!isModalOpen) return;
    const clash = checkClashLocally(
      scheduledRecruiterId,
      modalDate,
      modalTime,
      modalMode === 'reschedule' ? selectedAppId : undefined
    );
    setLocalClash(clash);
  }, [scheduledRecruiterId, modalDate, modalTime, selectedAppId, modalMode, isModalOpen]);

  // Open modal for new interview or rescheduling
  const handleOpenScheduleModal = (
    app?: Application,
    prefillDate?: string,
    prefillTime?: string
  ) => {
    setModalError(null);
    if (app && app.interview) {
      // Reschedule mode
      setModalMode('reschedule');
      setSelectedAppId(app.id);
      setScheduledRecruiterId(app.interview.scheduledByRecruiterId || currentUser.id);
      setModalDate(prefillDate || app.interview.date);
      setModalTime(prefillTime || app.interview.time);
      setModalLocation(app.interview.locationOrLink);
    } else {
      // Create new interview mode
      setModalMode('create');
      setSelectedAppId(app?.id || (shortlistedCandidates[0]?.id ?? ''));
      setScheduledRecruiterId(currentUser.id);
      // Default to tomorrow or specified prefillDate
      const defaultDate =
        prefillDate ||
        selectedDate ||
        new Date(Date.now() + 86400000).toISOString().split('T')[0];
      setModalDate(defaultDate);
      setModalTime(prefillTime || '10:00');
      setModalLocation('Google Meet: https://meet.google.com/nds-hire-sync');
    }
    setIsModalOpen(true);
  };

  // Suggest the next available clash-free slot for the selected recruiter
  const handleFindNextFreeSlot = () => {
    const today = new Date();
    // Look through the next 7 days
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const checkDay = new Date(today.getTime() + dayOffset * 86400000);
      const dateStr = checkDay.toISOString().split('T')[0];

      for (const timeStr of BUSINESS_HOURS) {
        const candidateDateTime = new Date(`${dateStr}T${timeStr}:00`);
        if (candidateDateTime <= new Date()) continue; // Skip past times

        const clash = checkClashLocally(
          scheduledRecruiterId,
          dateStr,
          timeStr,
          modalMode === 'reschedule' ? selectedAppId : undefined
        );

        if (!clash.hasClash) {
          setModalDate(dateStr);
          setModalTime(timeStr);
          showToast(`Found clash-free slot: ${dateStr} at ${timeStr}`, 'success');
          return;
        }
      }
    }
    showToast('No free business-hour slots found in the next 7 days.', 'error');
  };

  // Handle Form Submission (Schedule or Reschedule)
  const handleSaveInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!selectedAppId) {
      setModalError('Please select a candidate to schedule.');
      return;
    }

    if (!modalDate || !modalTime) {
      setModalError('Please select both date and time.');
      return;
    }

    if (localClash.hasClash) {
      setModalError(
        `Overlapping slot detected! Recruiter already has an interview with ${
          localClash.conflictingApp?.candidateName || 'another candidate'
        } at this time. Please pick another slot.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.scheduleInterview(selectedAppId, {
        date: modalDate,
        time: modalTime,
        locationOrLink: modalLocation.trim(),
        recruiterId: scheduledRecruiterId,
      });

      showToast(
        res.message ||
          (modalMode === 'reschedule'
            ? 'Interview rescheduled successfully!'
            : 'Interview scheduled successfully!'),
        'success'
      );
      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setModalError(err.message || 'Failed to schedule interview.');
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel Interview handler
  const handleCancelInterview = async (app: Application) => {
    if (
      !confirm(
        `Are you sure you want to cancel the interview for ${app.candidateName}? The candidate will be returned to the Shortlisted pool and notified via email.`
      )
    ) {
      return;
    }

    try {
      const res = await api.cancelInterview(app.id);
      showToast(res.message || 'Interview cancelled successfully.', 'success');
      if (inspectingApp?.id === app.id) {
        setInspectingApp(null);
      }
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to cancel interview.', 'error');
    }
  };

  // Quick Date Navigation
  const handlePrevDay = () => {
    const cur = new Date(selectedDate);
    cur.setDate(cur.getDate() - 1);
    setSelectedDate(cur.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const cur = new Date(selectedDate);
    cur.setDate(cur.getDate() + 1);
    setSelectedDate(cur.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  // Compute 7 days for the Week view
  const weekDays = useMemo(() => {
    const base = new Date(selectedDate);
    const dayOfWeek = base.getDay(); // 0 is Sunday, 1 is Monday...
    // Adjust to Monday as start
    const diff = base.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(base.setDate(diff));

    const days: { dateStr: string; dayName: string; dayNum: number; isToday: boolean }[] = [];
    const todayStr = new Date().toISOString().split('T')[0];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      days.push({
        dateStr,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: d.getDate(),
        isToday: dateStr === todayStr,
      });
    }
    return days;
  }, [selectedDate]);

  // Month days generation for Month View
  const monthMatrix = useMemo(() => {
    const base = new Date(selectedDate);
    const year = base.getFullYear();
    const month = base.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Day of week of the 1st (0 is Sun, 1 is Mon)
    let startDayOfWeek = firstDayOfMonth.getDay();
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1; // Mon = 0

    const totalDays = lastDayOfMonth.getDate();
    const todayStr = new Date().toISOString().split('T')[0];

    const weeks: Array<Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      interviews: Application[];
    }>> = [];

    let currentWeek: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      interviews: Application[];
    }> = [];

    // Prepend previous month days
    const prevMonthLastDate = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDate - i;
      const d = new Date(year, month - 1, dayNum);
      const dateStr = d.toISOString().split('T')[0];
      const items = filteredInterviews.filter((a) => a.interview?.date === dateStr);
      currentWeek.push({
        dateStr,
        dayNum,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        interviews: items,
      });
    }

    // Days of current month
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, month, day);
      const dateStr = d.toISOString().split('T')[0];
      const items = filteredInterviews.filter((a) => a.interview?.date === dateStr);
      currentWeek.push({
        dateStr,
        dayNum: day,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        interviews: items,
      });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    // Append next month days
    if (currentWeek.length > 0) {
      let nextMonthDay = 1;
      while (currentWeek.length < 7) {
        const d = new Date(year, month + 1, nextMonthDay);
        const dateStr = d.toISOString().split('T')[0];
        const items = filteredInterviews.filter((a) => a.interview?.date === dateStr);
        currentWeek.push({
          dateStr,
          dayNum: nextMonthDay,
          isCurrentMonth: false,
          isToday: dateStr === todayStr,
          interviews: items,
        });
        nextMonthDay++;
      }
      weeks.push(currentWeek);
    }

    return weeks;
  }, [selectedDate, filteredInterviews]);

  // Formatted date label
  const formattedSelectedDate = useMemo(() => {
    try {
      const parts = selectedDate.split('-');
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // Selected candidate object inside the modal
  const modalTargetApp = useMemo(() => {
    return applications.find((a) => a.id === selectedAppId);
  }, [applications, selectedAppId]);

  return (
    <div className="space-y-5">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between border shadow-sm transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-slate-700 ml-3 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Scheduler Top Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wide">
              Interview Command Center
            </span>
            <span className="text-xs text-slate-500 font-medium">
              1-Hour Fixed Duration · Zero Overlaps Guaranteed
            </span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 mt-1 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <span>Interview Scheduler & Visual Timeline</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Visualize assigned candidate interview slots, manage clash-free schedules, and conduct structured interviews.
          </p>
        </div>

        {/* Action Controls & Primary Book Button */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle Buttons */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                viewMode === 'timeline'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Daily Visual Timeline"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Day Timeline</span>
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                viewMode === 'week'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="7-Day Weekly Grid"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Week View</span>
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                viewMode === 'month'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Monthly Calendar"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Month</span>
            </button>
            <button
              onClick={() => setViewMode('agenda')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                viewMode === 'agenda'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Chronological Agenda List"
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>Agenda ({scheduledApplications.length})</span>
            </button>
          </div>

          {/* Schedule Interview Button */}
          <button
            onClick={() => handleOpenScheduleModal()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule Interview</span>
          </button>
        </div>
      </div>

      {/* Scheduler Metrics & Quick Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">
            Total Scheduled
          </span>
          <div className="text-2xl font-extrabold text-slate-900 mt-0.5">
            {scheduledApplications.length}
          </div>
          <p className="text-[11px] text-slate-400">Interviews on calendar</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">
            Selected Day Slots
          </span>
          <div className="text-2xl font-extrabold text-indigo-600 mt-0.5">
            {
              scheduledApplications.filter((a) => a.interview?.date === selectedDate).length
            }
          </div>
          <p className="text-[11px] text-slate-400">On {selectedDate}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">
            Ready to Schedule
          </span>
          <div className="text-2xl font-extrabold text-amber-600 mt-0.5">
            {shortlistedCandidates.length}
          </div>
          <p className="text-[11px] text-slate-400">Shortlisted candidates</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">
            Overlap Protection
          </span>
          <div className="text-2xl font-extrabold text-emerald-600 mt-0.5 flex items-center gap-1">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>Active</span>
          </div>
          <p className="text-[11px] text-slate-400">Strict 1-hour enforcement</p>
        </div>
      </div>

      {/* Date Navigation & Filter Controls Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Date Navigator */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevDay}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700"
            title="Previous Day"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleToday}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-700"
          >
            Today
          </button>
          <button
            onClick={handleNextDay}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700"
            title="Next Day"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg text-slate-800 bg-white"
          />

          <span className="text-xs font-bold text-slate-800 hidden sm:inline ml-2">
            {formattedSelectedDate}
          </span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Recruiter Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium">Recruiter:</span>
            <select
              value={filterRecruiterId}
              onChange={(e) => setFilterRecruiterId(e.target.value)}
              className="text-xs font-medium px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-hidden"
            >
              <option value="all">All Recruiters</option>
              {recruiters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.id === currentUser.id ? '(You)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Job Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium">Job:</span>
            <select
              value={filterJobId}
              onChange={(e) => setFilterJobId(e.target.value)}
              className="text-xs font-medium px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-hidden max-w-[160px] truncate"
            >
              <option value="all">All Assigned Jobs</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search candidate, job..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-hidden w-44"
            />
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* VIEW 1: DAILY VISUAL TIMELINE (NO OVERLAP VISUALIZER) */}
      {/* ======================================================== */}
      {viewMode === 'timeline' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Timeline Header */}
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Timeline for {formattedSelectedDate}
              </h3>
              <span className="text-xs text-slate-500">
                ({filteredInterviews.filter((a) => a.interview?.date === selectedDate).length} slots booked)
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />
                Booked 1-Hr Slot
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full border border-dashed border-emerald-500 inline-block bg-emerald-50" />
                Available Free Slot
              </span>
            </div>
          </div>

          {/* Hourly Slots Table */}
          <div className="divide-y divide-slate-100">
            {BUSINESS_HOURS.map((hour) => {
              // Find interview booked at this hour on selectedDate
              const bookedApp = filteredInterviews.find((app) => {
                if (!app.interview) return false;
                if (app.interview.date !== selectedDate) return false;
                // Match exact hour
                const appHour = app.interview.time.split(':')[0];
                const slotHour = hour.split(':')[0];
                return appHour === slotHour;
              });

              const [h] = hour.split(':').map(Number);
              const nextHourStr = `${String(h + 1).padStart(2, '0')}:00`;

              return (
                <div
                  key={hour}
                  className="flex flex-col sm:flex-row sm:items-center py-3.5 px-5 hover:bg-slate-50/70 transition-colors gap-3"
                >
                  {/* Time Column */}
                  <div className="w-28 shrink-0 flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                      {hour}
                    </span>
                    <span className="text-[11px] text-slate-400">1 hr</span>
                  </div>

                  {/* Slot Content */}
                  <div className="flex-1">
                    {bookedApp && bookedApp.interview ? (
                      <div className="bg-indigo-50/90 border border-indigo-200 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-extrabold text-indigo-950">
                              {bookedApp.candidateName}
                            </span>
                            <span className="text-xs text-indigo-700 font-medium">
                              · {bookedApp.jobTitle}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Clash-Free Locked Slot
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                            <span className="flex items-center gap-1 text-slate-500">
                              <User className="w-3.5 h-3.5 text-slate-400" />
                              Recruiter: <strong>{bookedApp.interview.scheduledByRecruiterName}</strong>
                            </span>
                            <span className="flex items-center gap-1 text-slate-500">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              {bookedApp.interview.time} – {nextHourStr} (1 Hour)
                            </span>
                            <span className="flex items-center gap-1 text-slate-500 truncate max-w-xs">
                              <Video className="w-3.5 h-3.5 text-indigo-500" />
                              {bookedApp.interview.locationOrLink}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 self-start md:self-center shrink-0">
                          {bookedApp.interview.locationOrLink.startsWith('http') && (
                            <a
                              href={bookedApp.interview.locationOrLink}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-white hover:bg-indigo-100 border border-indigo-300 rounded-lg flex items-center gap-1 shadow-2xs"
                              title="Join interview video call"
                            >
                              <Video className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Join Meet</span>
                            </a>
                          )}

                          <button
                            onClick={() => setInspectingApp(bookedApp)}
                            className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg flex items-center gap-1"
                            title="Inspect AI interview questions and candidate details"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                            <span>AI Questions</span>
                          </button>

                          <button
                            onClick={() => handleOpenScheduleModal(bookedApp)}
                            className="px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200 rounded-lg flex items-center gap-1"
                            title="Reschedule to another clash-free slot"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            <span>Reschedule</span>
                          </button>

                          <button
                            onClick={() => handleCancelInterview(bookedApp)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 border border-transparent hover:border-rose-200"
                            title="Cancel interview and return candidate to Shortlisted pool"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Free Slot Indicator with 1-click booking */
                      <button
                        onClick={() => handleOpenScheduleModal(undefined, selectedDate, hour)}
                        className="w-full text-left p-3 rounded-xl border border-dashed border-slate-200 hover:border-emerald-400 bg-white hover:bg-emerald-50/50 transition-all flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          <span className="text-xs font-medium text-slate-500 group-hover:text-emerald-800">
                            Available 1-Hour Slot ({hour} – {nextHourStr})
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold text-emerald-700 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          <Plus className="w-3.5 h-3.5" />
                          Book Candidate Here
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW 2: 7-DAY WEEKLY GRID */}
      {/* ======================================================== */}
      {viewMode === 'week' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-x-auto">
          <div className="min-w-[760px]">
            {/* Week Header Columns */}
            <div className="grid grid-cols-8 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
              <div className="p-3 text-center border-r border-slate-200 text-slate-400">
                Time
              </div>
              {weekDays.map((d) => (
                <div
                  key={d.dateStr}
                  className={`p-3 text-center border-r border-slate-200 last:border-r-0 ${
                    d.isToday ? 'bg-indigo-50/80 font-bold text-indigo-900' : ''
                  }`}
                >
                  <div>{d.dayName}</div>
                  <div
                    className={`text-sm ${
                      d.isToday ? 'text-indigo-600 font-extrabold' : 'text-slate-900'
                    }`}
                  >
                    {d.dayNum}
                  </div>
                  {d.isToday && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-200 text-indigo-800 mt-0.5 inline-block">
                      Today
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Week Rows */}
            <div className="divide-y divide-slate-100">
              {BUSINESS_HOURS.map((hour) => (
                <div key={hour} className="grid grid-cols-8 min-h-[64px]">
                  {/* Time label */}
                  <div className="p-2 border-r border-slate-200 text-center text-xs font-mono text-slate-500 bg-slate-50/40 flex items-center justify-center">
                    {hour}
                  </div>

                  {/* 7 Days Columns */}
                  {weekDays.map((d) => {
                    const booked = filteredInterviews.find((app) => {
                      if (!app.interview) return false;
                      if (app.interview.date !== d.dateStr) return false;
                      return app.interview.time.split(':')[0] === hour.split(':')[0];
                    });

                    return (
                      <div
                        key={d.dateStr}
                        className={`p-1 border-r border-slate-200 last:border-r-0 relative group transition-colors ${
                          d.isToday ? 'bg-indigo-50/20' : 'bg-white'
                        }`}
                      >
                        {booked && booked.interview ? (
                          <div
                            onClick={() => setInspectingApp(booked)}
                            className="h-full bg-indigo-100/90 hover:bg-indigo-200/90 border border-indigo-300 rounded-lg p-1.5 cursor-pointer flex flex-col justify-between transition-colors shadow-2xs"
                            title={`Interview: ${booked.candidateName} (${booked.jobTitle})`}
                          >
                            <div>
                              <div className="text-[11px] font-bold text-indigo-950 truncate">
                                {booked.candidateName}
                              </div>
                              <div className="text-[10px] text-indigo-700 truncate">
                                {booked.jobTitle}
                              </div>
                            </div>
                            <div className="text-[9px] text-indigo-800 font-medium truncate flex items-center justify-between">
                              <span>{booked.interview.time}</span>
                              <span className="text-[8px] bg-indigo-200 px-1 rounded">1h</span>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleOpenScheduleModal(undefined, d.dateStr, hour)}
                            className="w-full h-full opacity-0 group-hover:opacity-100 rounded border border-dashed border-emerald-300 bg-emerald-50 text-[10px] font-semibold text-emerald-700 flex items-center justify-center transition-opacity"
                          >
                            + Book
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW 3: FULL MONTH VIEW */}
      {/* ======================================================== */}
      {viewMode === 'month' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Days of Week header */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 text-center py-2.5">
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
            <div>Sun</div>
          </div>

          {/* Month Matrix */}
          <div className="divide-y divide-slate-200">
            {monthMatrix.map((week, wIdx) => (
              <div key={wIdx} className="grid grid-cols-7 divide-x divide-slate-200 min-h-[96px]">
                {week.map((cell) => (
                  <div
                    key={cell.dateStr}
                    onClick={() => {
                      setSelectedDate(cell.dateStr);
                      setViewMode('timeline');
                    }}
                    className={`p-2 cursor-pointer transition-colors hover:bg-slate-50 flex flex-col justify-between ${
                      !cell.isCurrentMonth
                        ? 'bg-slate-50/50 text-slate-400'
                        : cell.isToday
                        ? 'bg-indigo-50/40'
                        : 'bg-white text-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-semibold ${
                          cell.isToday
                            ? 'w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center'
                            : ''
                        }`}
                      >
                        {cell.dayNum}
                      </span>
                      {cell.interviews.length > 0 && (
                        <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-800">
                          {cell.interviews.length}
                        </span>
                      )}
                    </div>

                    {/* Interview items preview */}
                    <div className="space-y-1 mt-1">
                      {cell.interviews.slice(0, 2).map((app) => (
                        <div
                          key={app.id}
                          className="text-[10px] truncate bg-indigo-100/90 text-indigo-900 border border-indigo-200 px-1 py-0.5 rounded font-medium"
                        >
                          {app.interview?.time} {app.candidateName}
                        </div>
                      ))}
                      {cell.interviews.length > 2 && (
                        <div className="text-[9px] text-slate-400 font-semibold">
                          +{cell.interviews.length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW 4: CHRONOLOGICAL AGENDA / LIST VIEW */}
      {/* ======================================================== */}
      {viewMode === 'agenda' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-200">
          <div className="p-4 bg-slate-50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              Scheduled Interview Agenda ({filteredInterviews.length})
            </h3>
            <span className="text-xs text-slate-500">
              Sorted by date and time
            </span>
          </div>

          {filteredInterviews.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No interviews scheduled matching current filters.
            </div>
          ) : (
            filteredInterviews.map((app) => {
              if (!app.interview) return null;
              const isToday = app.interview.date === new Date().toISOString().split('T')[0];

              return (
                <div
                  key={app.id}
                  className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors ${
                    isToday ? 'bg-indigo-50/30' : ''
                  }`}
                >
                  <div className="space-y-1 max-w-xl">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900">
                        {app.candidateName}
                      </span>
                      <span className="text-xs text-slate-500">· {app.jobTitle}</span>
                      {isToday && (
                        <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                          Happening Today
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1 font-medium text-slate-700">
                        <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                        {app.interview.date} at {app.interview.time} (1 Hour)
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        Recruiter: {app.interview.scheduledByRecruiterName}
                      </span>
                      <span className="flex items-center gap-1 truncate max-w-xs">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {app.interview.locationOrLink}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 self-start md:self-center shrink-0">
                    {app.interview.locationOrLink.startsWith('http') && (
                      <a
                        href={app.interview.locationOrLink}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg flex items-center gap-1"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Join</span>
                      </a>
                    )}

                    <button
                      onClick={() => setInspectingApp(app)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-300 rounded-lg flex items-center gap-1"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      <span>Details & Questions</span>
                    </button>

                    <button
                      onClick={() => handleOpenScheduleModal(app)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-300 rounded-lg"
                    >
                      Reschedule
                    </button>

                    <button
                      onClick={() => handleCancelInterview(app)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                      title="Cancel interview"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: SCHEDULE / RESCHEDULE INTERVIEW WITH CLASH DETECTOR */}
      {/* ======================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-100 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-indigo-600" />
                  <span>
                    {modalMode === 'reschedule' ? 'Reschedule Interview Slot' : 'Schedule 1-Hour Candidate Interview'}
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Strictly 1 hour per session. Clash-free scheduling is validated in real time.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveInterview} className="space-y-4">
              {/* Candidate Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Candidate *
                </label>
                {modalMode === 'reschedule' ? (
                  <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800">
                    {modalTargetApp?.candidateName} ({modalTargetApp?.jobTitle})
                  </div>
                ) : (
                  <select
                    value={selectedAppId}
                    onChange={(e) => setSelectedAppId(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-hidden bg-white"
                  >
                    <option value="">-- Select Shortlisted Candidate --</option>
                    {shortlistedCandidates.map((cand) => (
                      <option key={cand.id} value={cand.id}>
                        {cand.candidateName} — {cand.jobTitle} ({cand.candidateEmail})
                      </option>
                    ))}
                  </select>
                )}
                {modalMode === 'create' && shortlistedCandidates.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    No shortlisted candidates waiting for an interview. Shortlist an applicant first.
                  </p>
                )}
              </div>

              {/* Recruiter Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Interviewer / Recruiter *
                </label>
                <select
                  value={scheduledRecruiterId}
                  onChange={(e) => setScheduledRecruiterId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-hidden bg-white"
                >
                  {recruiters.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.email}) {r.id === currentUser.id ? '— You' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date & Time Picker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Interview Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={modalDate}
                    onChange={(e) => setModalDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Time (1 Hour Duration) *
                  </label>
                  <select
                    value={modalTime}
                    onChange={(e) => setModalTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-hidden bg-white font-mono"
                  >
                    {BUSINESS_HOURS.map((t) => (
                      <option key={t} value={t}>
                        {t} (ends at {String(Number(t.split(':')[0]) + 1).padStart(2, '0')}:00)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Real-time Overlap / Clash Feedback Banner */}
              {localClash.hasClash ? (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs space-y-2">
                  <div className="flex items-center gap-2 text-rose-800 font-bold">
                    <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>⚠️ Interview Schedule Clash Detected!</span>
                  </div>
                  <p className="text-rose-700 text-[11px]">
                    Recruiter already has an interview booked with{' '}
                    <strong>{localClash.conflictingApp?.candidateName}</strong> on{' '}
                    <strong>{localClash.conflictingApp?.interview?.date}</strong> at{' '}
                    <strong>{localClash.conflictingApp?.interview?.time}</strong> (1-hour slot).
                    Interviews cannot overlap.
                  </p>
                  <button
                    type="button"
                    onClick={handleFindNextFreeSlot}
                    className="px-3 py-1.5 bg-rose-700 text-white rounded-lg text-xs font-semibold hover:bg-rose-800 shadow-2xs flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Find Next Available Free Slot</span>
                  </button>
                </div>
              ) : (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>✓ Slot is clash-free & available for 1 hour.</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleFindNextFreeSlot}
                    className="text-[11px] text-emerald-700 hover:text-emerald-900 underline font-semibold"
                  >
                    Suggest Alternative
                  </button>
                </div>
              )}

              {/* Meeting Location / Video Link */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Location or Meeting Link *
                </label>
                <input
                  type="text"
                  required
                  value={modalLocation}
                  onChange={(e) => setModalLocation(e.target.value)}
                  placeholder="https://meet.google.com/..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-hidden font-mono"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || localClash.hasClash || !selectedAppId}
                  className="px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-xs disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  {submitting
                    ? 'Saving Slot...'
                    : modalMode === 'reschedule'
                    ? 'Confirm Reschedule'
                    : 'Confirm & Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* DRAWER / MODAL: CANDIDATE PROFILE & AI INTERVIEW QUESTIONS */}
      {/* ======================================================== */}
      {inspectingApp && inspectingApp.interview && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Interview Details
                  </span>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs text-slate-500 font-mono">
                    {inspectingApp.interview.date} at {inspectingApp.interview.time}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  {inspectingApp.candidateName}
                </h3>
                <p className="text-xs text-slate-500">
                  Applied for <strong>{inspectingApp.jobTitle}</strong> ({inspectingApp.jobDepartment})
                </p>
              </div>
              <button
                onClick={() => setInspectingApp(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Session Details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Interviewer</span>
                <span className="font-bold text-slate-800">
                  {inspectingApp.interview.scheduledByRecruiterName}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Slot Duration</span>
                <span className="font-bold text-slate-800">1 Hour Fixed</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Contact Email</span>
                <span className="font-bold text-slate-800 truncate block">
                  {inspectingApp.candidateEmail}
                </span>
              </div>
            </div>

            {/* Meeting Link */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-indigo-200 bg-indigo-50/70">
              <div className="flex items-center gap-2 truncate">
                <Video className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-xs font-mono text-indigo-900 truncate">
                  {inspectingApp.interview.locationOrLink}
                </span>
              </div>
              {inspectingApp.interview.locationOrLink.startsWith('http') && (
                <a
                  href={inspectingApp.interview.locationOrLink}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 shrink-0 flex items-center gap-1 shadow-2xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Launch Meeting</span>
                </a>
              )}
            </div>

            {/* AI Generated Interview Questions Section */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span>AI-Generated Tailored Interview Questions</span>
              </h4>

              {inspectingApp.aiSummary?.interviewQuestions &&
              inspectingApp.aiSummary.interviewQuestions.length > 0 ? (
                <div className="space-y-2 bg-purple-50/50 border border-purple-200 rounded-xl p-3.5">
                  {inspectingApp.aiSummary.interviewQuestions.map((q, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-800">
                      <span className="font-bold text-purple-700 shrink-0">{idx + 1}.</span>
                      <p className="leading-relaxed">{q}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
                  AI questions will be automatically generated upon CV ingestion.
                </div>
              )}
            </div>

            {/* Matched vs Missing Requirements */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-1.5">
                <span className="text-xs font-bold text-emerald-900 block flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Matched Qualifications
                </span>
                <ul className="text-xs text-emerald-800 space-y-1">
                  {inspectingApp.aiSummary?.matchedRequirements &&
                  inspectingApp.aiSummary.matchedRequirements.length > 0 ? (
                    inspectingApp.aiSummary.matchedRequirements.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-emerald-500">•</span>
                        <span>{r}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-slate-400">None specified</li>
                  )}
                </ul>
              </div>

              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl space-y-1.5">
                <span className="text-xs font-bold text-amber-900 block flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  Missing / Needs Verification
                </span>
                <ul className="text-xs text-amber-800 space-y-1">
                  {inspectingApp.aiSummary?.missingRequirements &&
                  inspectingApp.aiSummary.missingRequirements.length > 0 ? (
                    inspectingApp.aiSummary.missingRequirements.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-amber-500">•</span>
                        <span>{r}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-slate-400">No missing qualifications noted</li>
                  )}
                </ul>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setInspectingApp(null);
                  handleCancelInterview(inspectingApp);
                }}
                className="px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Cancel Interview</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const app = inspectingApp;
                    setInspectingApp(null);
                    handleOpenScheduleModal(app);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg flex items-center gap-1"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Reschedule Slot</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectingApp(null)}
                  className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white rounded-lg shadow-xs"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
