/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Database,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Code,
  Copy,
  Check,
  Send,
  Sliders,
  ShieldCheck,
  FileText,
  UserCheck,
  Calendar,
  Layers,
} from 'lucide-react';
import { api } from '../api';
import { SupabaseConfigStatus, SupabaseSyncLog } from '../types';

export const SupabaseSyncTab: React.FC = () => {
  const [status, setStatus] = useState<SupabaseConfigStatus | null>(null);
  const [logs, setLogs] = useState<SupabaseSyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [sqlSchema, setSqlSchema] = useState<string>('');
  const [copiedSql, setCopiedSql] = useState(false);
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [selectedLog, setSelectedLog] = useState<SupabaseSyncLog | null>(null);

  // Form state
  const [formUrl, setFormUrl] = useState('');
  const [formKey, setFormKey] = useState('');
  const [formSaving, setFormSaving] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statusRes, logsRes, sqlRes] = await Promise.all([
        api.getSupabaseStatus(),
        api.getSupabaseLogs(),
        api.getSupabaseSql(),
      ]);
      setStatus(statusRes.status);
      setLogs(logsRes.logs);
      setSqlSchema(sqlRes.sql);
    } catch (err: any) {
      console.error('Failed to load Supabase status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSyncAll = async () => {
    try {
      setSyncingAll(true);
      setSyncMessage(null);
      const res = await api.syncAllToSupabase();
      setStatus(res.status);
      setSyncMessage(res.message);
      await fetchData();
    } catch (err: any) {
      setSyncMessage(`Sync failed: ${err.message || err}`);
    } finally {
      setSyncingAll(false);
    }
  };

  const handleCopySql = () => {
    if (!sqlSchema) return;
    navigator.clipboard.writeText(sqlSchema);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUrl || !formKey) {
      setFormFeedback({ type: 'error', text: 'Both Supabase URL and Key are required.' });
      return;
    }

    try {
      setFormSaving(true);
      setFormFeedback(null);
      const res = await api.configureSupabase(formUrl, formKey);
      setStatus(res.status);
      setFormFeedback({ type: 'success', text: res.message });
      await fetchData();
      setTimeout(() => setShowConfigForm(false), 1800);
    } catch (err: any) {
      setFormFeedback({ type: 'error', text: err.message || 'Failed to save configuration.' });
    } finally {
      setFormSaving(false);
    }
  };

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'CANDIDATE_APPLIED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Candidate Applied</span>;
      case 'STAGE_CHANGE':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">Stage Decision</span>;
      case 'INTERVIEW_SCHEDULED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">Interview Scheduled</span>;
      case 'RECRUITER_NOTE':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Recruiter Note</span>;
      case 'HIRED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300">Hired Decision</span>;
      case 'REJECTION':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">Rejection Decision</span>;
      case 'STAGE_TABLE_SYNCED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">Stage Table Dispatched</span>;
      case 'AI_DECISION_RECEIVED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">AI Decision Ingested</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">{type}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0">
              <Database className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                  Supabase Backend Integration
                </h2>
                {status?.isConfigured ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Live Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    Sync Queue Active (Pending Credentials)
                  </span>
                )}
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                Automated pipeline syncing candidate job applications to <code className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded text-xs font-mono text-emerald-600 dark:text-emerald-400">candidate_applications</code>, recruiter decisions to <code className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded text-xs font-mono text-blue-600 dark:text-blue-400">recruiter_decisions</code>, stage transitions into individual stage tables (<code className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded text-xs font-mono text-indigo-600 dark:text-indigo-400">stage_applied</code>, <code className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded text-xs font-mono text-indigo-600 dark:text-indigo-400">stage_shortlisted</code>, <code className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded text-xs font-mono text-indigo-600 dark:text-indigo-400">stage_interview</code>, <code className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded text-xs font-mono text-indigo-600 dark:text-indigo-400">stage_offer</code>, <code className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded text-xs font-mono text-indigo-600 dark:text-indigo-400">stage_hired</code>, <code className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded text-xs font-mono text-indigo-600 dark:text-indigo-400">stage_rejected</code>), and real-time ingestion from <code className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded text-xs font-mono text-purple-600 dark:text-purple-400">ai_decision</code>.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowConfigForm(!showConfigForm)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5" />
              Configure Credentials
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleSyncAll}
              disabled={syncingAll}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-xs disabled:opacity-50"
            >
              <Send className={`w-3.5 h-3.5 ${syncingAll ? 'animate-bounce' : ''}`} />
              {syncingAll ? 'Syncing to Supabase...' : 'Sync All Historical Data'}
            </button>
          </div>
        </div>

        {syncMessage && (
          <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
            <span>{syncMessage}</span>
            <button onClick={() => setSyncMessage(null)} className="text-emerald-600 hover:underline">Dismiss</button>
          </div>
        )}

        {/* Configuration drawer */}
        {showConfigForm && (
          <form onSubmit={handleSaveConfig} className="mt-5 p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-900/50 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-emerald-600" />
                Supabase Credentials Settings
              </h4>
              <span className="text-xs text-neutral-500">
                You can also configure via <code className="font-mono">.env</code> (SUPABASE_URL and SUPABASE_KEY)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Supabase Project URL
                </label>
                <input
                  type="url"
                  placeholder="https://your-project.supabase.co"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Supabase Anon or Service Role Key
                </label>
                <input
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI..."
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                />
              </div>
            </div>

            {formFeedback && (
              <div
                className={`p-2.5 rounded text-xs ${
                  formFeedback.type === 'success'
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                }`}
              >
                {formFeedback.text}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowConfigForm(false)}
                className="px-3 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={formSaving}
                className="px-3 py-1 text-xs font-medium rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
              >
                {formSaving ? 'Connecting...' : 'Connect to Supabase'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4">
          <div className="flex items-center justify-between text-neutral-500 text-xs">
            <span>Total Sync Records</span>
            <Database className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {logs.length}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-neutral-500 mt-1">
            <span>Tracked in real-time</span>
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4">
          <div className="flex items-center justify-between text-neutral-500 text-xs">
            <span>Stage-Specific Tables (Sent)</span>
            <Layers className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {logs.filter((l) => l.eventType === 'STAGE_TABLE_SYNCED' || l.targetTable?.includes('stage_')).length}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-neutral-500 mt-1">
            <span>6 distinct stage tables</span>
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4">
          <div className="flex items-center justify-between text-neutral-500 text-xs">
            <span>Decisions Table (Sent)</span>
            <UserCheck className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {logs.filter((l) => l.targetTable?.includes('recruiter_decisions')).length}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-neutral-500 mt-1">
            <span>Destination: recruiter_decisions</span>
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4">
          <div className="flex items-center justify-between text-neutral-500 text-xs">
            <span>Supabase Sync State</span>
            <ShieldCheck className="w-4 h-4 text-teal-500" />
          </div>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {status?.isConfigured ? '100%' : 'Queued'}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-neutral-500 mt-1">
            <span>{status?.isConfigured ? 'Direct cloud sync' : 'Stored safely in local cache'}</span>
          </div>
        </div>
      </div>

      {/* Stage Tables Mapping Badge Banner */}
      <div className="bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4">
        <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2 flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-500" />
          Individual Stage Table Architecture in Supabase:
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
          <div className="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
            <div className="text-[11px] text-neutral-500 font-medium">Stage 1</div>
            <div className="font-semibold text-neutral-900 dark:text-neutral-100">Applied</div>
            <code className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono block mt-1">stage_applied</code>
          </div>
          <div className="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
            <div className="text-[11px] text-neutral-500 font-medium">Stage 2</div>
            <div className="font-semibold text-neutral-900 dark:text-neutral-100">Shortlisted</div>
            <code className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono block mt-1">stage_shortlisted</code>
          </div>
          <div className="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
            <div className="text-[11px] text-neutral-500 font-medium">Stage 3</div>
            <div className="font-semibold text-neutral-900 dark:text-neutral-100">Interview</div>
            <code className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono block mt-1">stage_interview</code>
          </div>
          <div className="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
            <div className="text-[11px] text-neutral-500 font-medium">Stage 4</div>
            <div className="font-semibold text-neutral-900 dark:text-neutral-100">Offer</div>
            <code className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono block mt-1">stage_offer</code>
          </div>
          <div className="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
            <div className="text-[11px] text-neutral-500 font-medium">Stage 5</div>
            <div className="font-semibold text-neutral-900 dark:text-neutral-100">Hired</div>
            <code className="text-[10px] text-teal-600 dark:text-teal-400 font-mono block mt-1">stage_hired</code>
          </div>
          <div className="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
            <div className="text-[11px] text-neutral-500 font-medium">Stage 6</div>
            <div className="font-semibold text-neutral-900 dark:text-neutral-100">Rejected</div>
            <code className="text-[10px] text-rose-600 dark:text-rose-400 font-mono block mt-1">stage_rejected</code>
          </div>
        </div>
      </div>

      {/* SQL Setup Helper Card */}
      <div className="bg-neutral-900 text-neutral-100 rounded-xl p-5 border border-neutral-800 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <Code className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-semibold text-white">
                Supabase SQL Table Definitions (PostgreSQL)
              </h3>
              <p className="text-xs text-neutral-400">
                Run this SQL script in your Supabase project's SQL editor to initialize tables with performance indexes and RLS.
              </p>
            </div>
          </div>
          <button
            onClick={handleCopySql}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors shrink-0"
          >
            {copiedSql ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedSql ? 'Copied to Clipboard!' : 'Copy SQL Schema'}
          </button>
        </div>
        <div className="max-h-48 overflow-y-auto bg-black/60 p-3 rounded-lg font-mono text-xs text-neutral-300 border border-neutral-800 scrollbar-thin">
          <pre>{sqlSchema || '-- Loading SQL schema...'}</pre>
        </div>
      </div>

      {/* Activity Log Table */}
      <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-neutral-500" />
              Live Supabase Transmission Audit Stream
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Every candidate job application and recruiter decision dispatched to Supabase with full payload telemetry.
            </p>
          </div>
          <span className="text-xs text-neutral-500 font-mono">
            {logs.length} events logged
          </span>
        </div>

        {logs.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 text-xs">
            No events have been dispatched yet. When a candidate applies or a recruiter takes an action, it will appear here instantly.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 dark:bg-neutral-900/60 text-neutral-500 uppercase tracking-wider font-semibold border-b border-neutral-200 dark:border-neutral-700">
                <tr>
                  <th className="py-2.5 px-4">Event Type</th>
                  <th className="py-2.5 px-4">Candidate</th>
                  <th className="py-2.5 px-4">Target Job</th>
                  <th className="py-2.5 px-4">Supabase Table</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-750 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      {getEventBadge(log.eventType)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-medium text-neutral-900 dark:text-neutral-100">
                      <div>{log.candidateName}</div>
                      <div className="text-[11px] text-neutral-500 font-normal">{log.candidateEmail}</div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-neutral-700 dark:text-neutral-300">
                      {log.jobTitle}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                      {log.targetTable}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {log.status === 'synced' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Synced
                        </span>
                      ) : log.status === 'failed' ? (
                        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
                          <AlertCircle className="w-3.5 h-3.5" /> Failed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Queued (Ready)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-neutral-500">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="px-2 py-1 text-neutral-600 dark:text-neutral-300 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium text-xs rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                      >
                        Inspect Payload
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payload Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-neutral-800 rounded-xl max-w-xl w-full border border-neutral-200 dark:border-neutral-700 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                  Supabase Payload: {selectedLog.id}
                </h4>
                <p className="text-xs text-neutral-500">Target Table: {selectedLog.targetTable}</p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-lg leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <div className="text-xs font-medium text-neutral-500 mb-1">Details</div>
                <div className="text-xs text-neutral-800 dark:text-neutral-200 bg-neutral-50 dark:bg-neutral-900 p-2 rounded border border-neutral-200 dark:border-neutral-700">
                  {selectedLog.details}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-neutral-500 mb-1">JSON Payload sent to Supabase API</div>
                <pre className="p-3 bg-neutral-950 text-emerald-400 rounded font-mono text-xs overflow-x-auto max-h-60 border border-neutral-800">
                  {JSON.stringify(selectedLog.payload, null, 2)}
                </pre>
              </div>
            </div>
            <div className="p-3 bg-neutral-50 dark:bg-neutral-900/60 border-t border-neutral-200 dark:border-neutral-700 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-800 dark:text-neutral-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
