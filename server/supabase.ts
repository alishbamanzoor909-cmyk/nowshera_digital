/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AISummary,
  Application,
  SupabaseAIDecision,
  SupabaseConfigStatus,
  SupabaseEventType,
  SupabaseSyncLog,
} from '../src/types.js';
import { db } from './db.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const SYNC_LOGS_FILE = path.join(DATA_DIR, 'supabase_sync_logs.json');

/**
 * Returns the dedicated table name in Supabase for each application stage:
 * - Applied -> stage_applied
 * - Shortlisted -> stage_shortlisted
 * - Interview -> stage_interview
 * - Offer -> stage_offer
 * - Hired -> stage_hired
 * - Rejected -> stage_rejected
 */
export function getStageTableName(stage: string): string {
  const norm = (stage || '').toLowerCase().trim();
  switch (norm) {
    case 'applied':
      return 'stage_applied';
    case 'shortlisted':
      return 'stage_shortlisted';
    case 'interview':
      return 'stage_interview';
    case 'offer':
      return 'stage_offer';
    case 'hired':
      return 'stage_hired';
    case 'rejected':
      return 'stage_rejected';
    default:
      return `stage_${norm.replace(/[^a-z0-9_]/g, '_')}`;
  }
}

class SupabaseService {
  private client: SupabaseClient | null = null;
  private url: string = '';
  private key: string = '';
  private logs: SupabaseSyncLog[] = [];
  private realtimeChannel: any = null;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.loadLogs();
    this.initClient();
  }

  private loadLogs() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(SYNC_LOGS_FILE)) {
        const content = fs.readFileSync(SYNC_LOGS_FILE, 'utf-8');
        this.logs = JSON.parse(content);
      }
    } catch (e) {
      console.warn('Error loading Supabase sync logs:', e);
      this.logs = [];
    }
  }

  private saveLogs() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(SYNC_LOGS_FILE, JSON.stringify(this.logs.slice(-500), null, 2));
    } catch (e) {
      console.warn('Error saving Supabase sync logs:', e);
    }
  }

  public initClient(customUrl?: string, customKey?: string) {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.realtimeChannel && this.client) {
      try {
        this.client.removeChannel(this.realtimeChannel);
      } catch {
        // ignore cleanup error
      }
      this.realtimeChannel = null;
    }

    this.url = (customUrl || process.env.SUPABASE_URL || '').trim();
    this.key = (
      customKey ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_KEY ||
      ''
    ).trim();

    if (this.url && this.key) {
      try {
        this.client = createClient(this.url, this.key, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        });
        console.log(`[Supabase] Client initialized for target URL: ${this.url}`);

        // Set up Realtime listener for incoming rows in ai_decision
        this.setupRealtimeListener();

        // Run initial poll and schedule background poll every 10 seconds
        this.fetchAiDecisions().catch(() => {});
        this.pollInterval = setInterval(() => {
          this.fetchAiDecisions().catch(() => {});
        }, 10000);
      } catch (err) {
        console.warn('[Supabase] Failed to initialize client:', err);
        this.client = null;
      }
    } else {
      this.client = null;
    }
  }

  /**
   * Sets up Realtime subscription on the ai_decision table
   */
  private setupRealtimeListener() {
    if (!this.client) return;

    try {
      // Cleanly remove any previous channel instance before creating a new one
      if (this.realtimeChannel) {
        try {
          this.client.removeChannel(this.realtimeChannel);
        } catch {
          // ignore cleanup notice
        }
        this.realtimeChannel = null;
      }

      const channelName = `ai_decision_channel_${Date.now()}`;
      this.realtimeChannel = this.client
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'ai_decision' },
          (payload: any) => {
            console.log('[Supabase Realtime] New row detected in ai_decision:', payload.new);
            this.handleIncomingAiDecision(payload.new);
          }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'ai_decisions' },
          (payload: any) => {
            console.log('[Supabase Realtime] New row detected in ai_decisions:', payload.new);
            this.handleIncomingAiDecision(payload.new);
          }
        )
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            console.log('[Supabase Realtime] Realtime stream active and subscribed for ai_decision table updates.');
          } else if (status === 'CHANNEL_ERROR') {
            // Clean up the channel to prevent unhandled websocket error loops
            if (this.realtimeChannel && this.client) {
              try {
                this.client.removeChannel(this.realtimeChannel);
              } catch {
                // ignore
              }
              this.realtimeChannel = null;
            }
            console.log('[Supabase Realtime] Channel standby. Continuous REST polling fallback is actively synchronizing ai_decision rows.');
            // Attempt to re-subscribe after 30 seconds
            setTimeout(() => {
              if (!this.realtimeChannel && this.client) {
                this.setupRealtimeListener();
              }
            }, 30000);
          } else if (status === 'TIMED_OUT') {
            console.log('[Supabase Realtime] Connection timed out; falling back to periodic REST polling.');
          }
        });
    } catch (err) {
      console.warn('[Supabase Realtime] Subscription setup notice:', err);
    }
  }

  /**
   * Process a row added to ai_decision and store it directly in the ATS database & Recruiter Dashboard
   */
  public handleIncomingAiDecision(row: any): SupabaseAIDecision {
    const timestamp = row.created_at || row.timestamp || new Date().toISOString();
    const id = String(row.id || `ai-dec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`);

    // Parse score flexibly
    let confidenceScore: number | undefined;
    if (typeof row.confidence_score === 'number') {
      confidenceScore = row.confidence_score;
    } else if (typeof row.confidence === 'number') {
      confidenceScore = row.confidence;
    } else if (typeof row.score === 'number') {
      confidenceScore = row.score;
    } else if (row.confidence_score && !isNaN(Number(row.confidence_score))) {
      confidenceScore = Number(row.confidence_score);
    }

    const decisionRecord: SupabaseAIDecision = {
      id,
      applicationId: row.application_id || row.applicationId || row.app_id || undefined,
      candidateName: row.candidate_name || row.candidateName || row.name || undefined,
      candidateEmail: row.candidate_email || row.candidateEmail || row.email || undefined,
      jobId: row.job_id || row.jobId || undefined,
      jobTitle: row.job_title || row.jobTitle || undefined,
      decision: String(row.decision || row.stage || row.status || row.recommendation || row.ai_decision || 'Recommended'),
      confidenceScore,
      reason: row.reason || row.reasoning || row.explanation || row.rationale || row.notes || row.summary || undefined,
      suggestedAction: row.suggested_action || row.action || row.suggested_stage || undefined,
      notes: row.notes || row.comment || undefined,
      createdAt: timestamp,
      rawPayload: row,
    };

    const { decision, matchedApplication } = db.addAiDecision(decisionRecord);

    const logEntry: SupabaseSyncLog = {
      id: `syn-recv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      eventType: 'AI_DECISION_RECEIVED',
      entityId: decision.applicationId || id,
      candidateEmail: decision.candidateEmail || (matchedApplication?.candidateEmail ?? 'Unknown'),
      candidateName: decision.candidateName || (matchedApplication?.candidateName ?? 'Candidate'),
      jobTitle: decision.jobTitle || (matchedApplication?.jobTitle ?? 'Job Position'),
      details: `Supabase ai_decision row #${id} received: ${decision.decision}${
        matchedApplication ? ` -> Matched to candidate ${matchedApplication.candidateName}` : ' (Unlinked applicant)'
      }`,
      status: 'synced',
      targetTable: 'ai_decision',
      payload: row,
      timestamp: new Date().toISOString(),
    };

    this.logs.push(logEntry);
    this.saveLogs();

    console.log(
      `[Supabase] Ingested ai_decision #${id} into Recruiter Dashboard: ${decision.decision} for ${decision.candidateName || decision.applicationId}`
    );

    return decision;
  }

  /**
   * Periodically queries the Supabase ai_decision table to pull newly inserted rows
   */
  public async fetchAiDecisions(): Promise<{ newDecisionsCount: number; errors: string[] }> {
    if (!this.client) {
      return { newDecisionsCount: 0, errors: ['Supabase client not configured'] };
    }

    const errors: string[] = [];
    let newDecisionsCount = 0;
    const existingDecisionIds = new Set(db.getAiDecisions().map((d) => d.id));

    // Try primary table `ai_decision`
    let rows: any[] | null = null;
    let queryError: any = null;

    try {
      const { data, error } = await this.client
        .from('ai_decision')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        queryError = error;
      } else {
        rows = data;
      }
    } catch (e: any) {
      queryError = e;
    }

    // Fallback: try `ai_decisions` plural if singular gave error
    if (queryError && (!rows || rows.length === 0)) {
      try {
        const { data, error } = await this.client
          .from('ai_decisions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (!error && data) {
          rows = data;
          queryError = null;
        }
      } catch {
        // ignore
      }
    }

    if (queryError) {
      // Table might not exist yet if user hasn't run the SQL schema
      errors.push(`Could not query ai_decision table: ${queryError.message || queryError}`);
      return { newDecisionsCount: 0, errors };
    }

    if (rows && rows.length > 0) {
      for (const row of rows) {
        const rowId = String(row.id || '');
        if (rowId && !existingDecisionIds.has(rowId)) {
          this.handleIncomingAiDecision(row);
          existingDecisionIds.add(rowId);
          newDecisionsCount++;
        }
      }
    }

    return { newDecisionsCount, errors };
  }

  /**
   * Helper to manually insert an AI decision into Supabase ai_decision table,
   * triggering realtime and automatic recruiter dashboard ingestion.
   */
  public async insertAiDecision(params: {
    applicationId?: string;
    candidateName?: string;
    candidateEmail?: string;
    jobId?: string;
    jobTitle?: string;
    decision: string;
    confidenceScore?: number;
    reason?: string;
    suggestedAction?: string;
    notes?: string;
  }): Promise<SupabaseAIDecision> {
    const id = `ai-dec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const timestamp = new Date().toISOString();

    const row = {
      id,
      application_id: params.applicationId || null,
      candidate_name: params.candidateName || null,
      candidate_email: params.candidateEmail || null,
      job_id: params.jobId || null,
      job_title: params.jobTitle || null,
      decision: params.decision,
      confidence_score: params.confidenceScore ?? 90,
      reason: params.reason || null,
      suggested_action: params.suggestedAction || null,
      notes: params.notes || null,
      created_at: timestamp,
    };

    if (this.client) {
      try {
        const { error } = await this.client.from('ai_decision').insert(row);
        if (error) {
          console.warn('[Supabase] Warning inserting into ai_decision cloud table:', error.message);
        }
      } catch (err: any) {
        console.warn('[Supabase] Error executing insert to ai_decision:', err.message || err);
      }
    }

    // Process locally to ensure immediate recruiter dashboard availability
    return this.handleIncomingAiDecision(row);
  }

  public getStatus(): SupabaseConfigStatus {
    const isConfigured = Boolean(this.client && this.url && this.key);
    const totalSynced = this.logs.filter((l) => l.status === 'synced').length;
    const totalPending = this.logs.filter((l) => l.status === 'pending_credentials').length;
    const totalFailed = this.logs.filter((l) => l.status === 'failed').length;
    const lastLog = this.logs[this.logs.length - 1];

    return {
      isConfigured,
      supabaseUrl: this.url ? this.url.replace(/(https?:\/\/)(.*)/, '$1***') : undefined,
      hasKey: Boolean(this.key),
      totalSynced,
      totalPending,
      totalFailed,
      lastSyncAttempt: lastLog ? lastLog.timestamp : undefined,
      recentLogs: this.logs.slice(-50).reverse(),
    };
  }

  public getLogs(): SupabaseSyncLog[] {
    return this.logs.slice(-100).reverse();
  }

  /**
   * Sends candidate job application data to Supabase table: candidate_applications
   * and dispatches record to the stage_applied table.
   */
  public async sendCandidateApplication(application: Application): Promise<SupabaseSyncLog> {
    const timestamp = new Date().toISOString();
    const logId = `syn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // Prepare Supabase record payload
    const payload = {
      id: application.id,
      job_id: application.jobId,
      job_title: application.jobTitle,
      job_department: application.jobDepartment,
      candidate_id: application.candidateId,
      candidate_name: application.candidateName,
      candidate_email: application.candidateEmail,
      candidate_phone: application.candidatePhone || null,
      stage: application.stage,
      applied_at: application.appliedAt,
      cv_file_name: application.cvFileName,
      ai_summary: application.aiSummary?.profileBullets?.join('\n') || null,
      updated_at: timestamp,
    };

    const logEntry: SupabaseSyncLog = {
      id: logId,
      eventType: 'CANDIDATE_APPLIED',
      entityId: application.id,
      candidateEmail: application.candidateEmail,
      candidateName: application.candidateName,
      jobTitle: application.jobTitle,
      details: `New application submitted for ${application.jobTitle}`,
      status: this.client ? 'synced' : 'pending_credentials',
      targetTable: 'candidate_applications',
      payload,
      timestamp,
    };

    // Also dispatch to dedicated stage table: stage_applied
    this.sendStageRecord({
      applicationId: application.id,
      candidateName: application.candidateName,
      candidateEmail: application.candidateEmail,
      candidatePhone: application.candidatePhone,
      candidateId: application.candidateId,
      jobId: application.jobId,
      jobTitle: application.jobTitle,
      jobDepartment: application.jobDepartment,
      stage: 'Applied',
      previousStage: null,
      note: 'Application submitted by candidate',
      aiSummary: application.aiSummary?.profileBullets?.join('\n'),
      cvFileName: application.cvFileName,
    }).catch((err) => {
      console.warn('[Supabase] Note on dispatching to stage_applied:', err?.message || err);
    });

    if (!this.client) {
      logEntry.errorMessage = 'Supabase credentials not yet configured in environment (SUPABASE_URL and SUPABASE_KEY). Payload queued in sync history.';
      this.logs.push(logEntry);
      this.saveLogs();
      return logEntry;
    }

    try {
      const { error } = await this.client
        .from('candidate_applications')
        .upsert(payload, { onConflict: 'id' });

      if (error) {
        throw new Error(error.message);
      }

      logEntry.status = 'synced';
      console.log(`[Supabase] Application ${application.id} synced successfully.`);
    } catch (err: any) {
      logEntry.status = 'failed';
      logEntry.errorMessage = err.message || 'Supabase upsert failed';
      console.warn(`[Supabase] Note on syncing application ${application.id}:`, err?.message || err);
    }

    this.logs.push(logEntry);
    this.saveLogs();
    return logEntry;
  }

  /**
   * Sends candidate data directly to a dedicated stage-specific table in Supabase:
   * - Applied -> stage_applied
   * - Shortlisted -> stage_shortlisted
   * - Interview -> stage_interview
   * - Offer -> stage_offer
   * - Hired -> stage_hired
   * - Rejected -> stage_rejected
   */
  public async sendStageRecord(params: {
    applicationId: string;
    candidateName: string;
    candidateEmail: string;
    candidatePhone?: string | null;
    candidateId?: string | null;
    jobId: string;
    jobTitle: string;
    jobDepartment?: string | null;
    stage: string;
    previousStage?: string | null;
    recruiterId?: string | null;
    recruiterName?: string | null;
    note?: string | null;
    interviewDate?: string | null;
    interviewTime?: string | null;
    interviewLocation?: string | null;
    aiSummary?: string | null;
    aiDecision?: string | null;
    cvFileName?: string | null;
  }): Promise<SupabaseSyncLog> {
    const timestamp = new Date().toISOString();
    const targetTable = getStageTableName(params.stage);
    const logId = `syn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const recordId = `${params.applicationId}_${params.stage.toLowerCase()}`;

    const payload: any = {
      id: recordId,
      application_id: params.applicationId,
      candidate_id: params.candidateId || null,
      candidate_name: params.candidateName,
      candidate_email: params.candidateEmail,
      candidate_phone: params.candidatePhone || null,
      job_id: params.jobId,
      job_title: params.jobTitle,
      created_at: timestamp,
      updated_at: timestamp,
    };

    if (params.stage.toLowerCase() === 'interview') {
      payload.interview_date = params.interviewDate || null;
      payload.interview_time = params.interviewTime || null;
      payload.interview_location = params.interviewLocation || null;
    }

    const logEntry: SupabaseSyncLog = {
      id: logId,
      eventType: 'STAGE_TABLE_SYNCED',
      entityId: params.applicationId,
      candidateEmail: params.candidateEmail,
      candidateName: params.candidateName,
      jobTitle: params.jobTitle,
      details: `Candidate stage '${params.stage}' dispatched to dedicated Supabase table '${targetTable}'`,
      status: this.client ? 'synced' : 'pending_credentials',
      targetTable,
      payload,
      timestamp,
    };

    if (!this.client) {
      logEntry.errorMessage = `Supabase credentials not configured in environment. Stage record for '${targetTable}' queued in sync logs.`;
      this.logs.push(logEntry);
      this.saveLogs();
      return logEntry;
    }

    try {
      const { error } = await this.client
        .from(targetTable)
        .upsert(payload, { onConflict: 'id' });

      if (error) {
        if (error.message.includes('relation') || error.message.includes('schema cache')) {
          logEntry.status = 'failed';
          logEntry.errorMessage = `Table '${targetTable}' not found in Supabase. Run the SQL schema script in Supabase SQL Editor to create it.`;
          console.warn(`[Supabase] Note: Table '${targetTable}' not found in Supabase. Run SQL schema in Supabase SQL Editor.`);
        } else {
          throw error;
        }
      } else {
        logEntry.status = 'synced';
        console.log(`[Supabase] Stage record successfully dispatched to '${targetTable}' for ${params.candidateName}.`);
      }
    } catch (err: any) {
      logEntry.status = 'failed';
      logEntry.errorMessage = err.message || `Supabase upsert to ${targetTable} failed`;
      console.warn(`[Supabase] Error syncing to stage table ${targetTable}:`, err?.message || err);
    }

    this.logs.push(logEntry);
    this.saveLogs();
    return logEntry;
  }

  /**
   * Sends AI summary of candidate to Supabase:
   * 1. Updates candidate_applications table column `ai_summary`
   * 2. Upserts structured summary record into `ai_summaries` table
   */
  public async sendAiSummary(application: Application, summary: AISummary): Promise<SupabaseSyncLog> {
    const timestamp = new Date().toISOString();
    const logId = `syn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const summaryText = summary.profileBullets ? summary.profileBullets.join('\n') : '';

    const payload = {
      id: `sum-${application.id}`,
      application_id: application.id,
      candidate_id: application.candidateId,
      candidate_name: application.candidateName,
      candidate_email: application.candidateEmail,
      job_id: application.jobId,
      job_title: application.jobTitle,
      profile_bullets: summary.profileBullets || [],
      matched_requirements: summary.matchedRequirements || [],
      missing_requirements: summary.missingRequirements || [],
      interview_questions: summary.interviewQuestions || [],
      summary_text: summaryText,
      created_at: summary.generatedAt || timestamp,
    };

    const logEntry: SupabaseSyncLog = {
      id: logId,
      eventType: 'AI_SUMMARY_SYNCED',
      entityId: application.id,
      candidateEmail: application.candidateEmail,
      candidateName: application.candidateName,
      jobTitle: application.jobTitle,
      details: `AI Candidate Summary generated (${summary.profileBullets?.length || 0} bullets, ${summary.matchedRequirements?.length || 0} matched requirements) and synced to Supabase`,
      status: this.client ? 'synced' : 'pending_credentials',
      targetTable: 'candidate_applications & ai_summaries',
      payload,
      timestamp,
    };

    if (!this.client) {
      logEntry.errorMessage = 'Supabase credentials not configured in environment. Summary queued in sync logs.';
      this.logs.push(logEntry);
      this.saveLogs();
      return logEntry;
    }

    try {
      // 1. Update candidate_applications table with the AI summary
      const { error: appUpdateError } = await this.client
        .from('candidate_applications')
        .update({
          ai_summary: summaryText,
          updated_at: timestamp,
        })
        .eq('id', application.id);

      if (appUpdateError) {
        console.warn('[Supabase] Warning updating candidate_applications.ai_summary:', appUpdateError.message);
      }

      // 2. Upsert into ai_summaries table
      const { error: summaryInsertError } = await this.client
        .from('ai_summaries')
        .upsert(payload, { onConflict: 'id' });

      if (summaryInsertError) {
        console.warn('[Supabase] Note on ai_summaries table insert:', summaryInsertError.message);
      }

      logEntry.status = 'synced';
      console.log(`[Supabase] AI summary for candidate ${application.candidateName} synced to Supabase successfully.`);
    } catch (err: any) {
      logEntry.status = 'failed';
      logEntry.errorMessage = err.message || 'Supabase AI summary sync failed';
      console.warn(`[Supabase] Error syncing AI summary for ${application.id}:`, err?.message || err);
    }

    this.logs.push(logEntry);
    this.saveLogs();
    return logEntry;
  }

  /**
   * Sends recruiter decision data to Supabase table: recruiter_decisions,
   * updates candidate_applications table with new stage,
   * AND dispatches the candidate to the dedicated stage table (e.g. stage_shortlisted, stage_interview, stage_offer, stage_hired, stage_rejected).
   */
  public async sendRecruiterDecision(decision: {
    applicationId: string;
    candidateName: string;
    candidateEmail: string;
    candidatePhone?: string | null;
    candidateId?: string | null;
    jobId: string;
    jobTitle: string;
    jobDepartment?: string | null;
    recruiterId: string;
    recruiterName: string;
    decisionType: SupabaseEventType;
    stageFrom?: string;
    stageTo?: string;
    note?: string;
    interviewDetails?: {
      date: string;
      time: string;
      locationOrLink: string;
    };
    aiSummary?: string | null;
    aiDecision?: string | null;
    cvFileName?: string | null;
  }): Promise<SupabaseSyncLog> {
    const timestamp = new Date().toISOString();
    const logId = `syn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const decisionId = `dec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const payload = {
      id: decisionId,
      application_id: decision.applicationId,
      candidate_name: decision.candidateName,
      candidate_email: decision.candidateEmail,
      job_id: decision.jobId,
      job_title: decision.jobTitle,
      recruiter_id: decision.recruiterId,
      recruiter_name: decision.recruiterName,
      decision_type: decision.decisionType,
      stage_from: decision.stageFrom || null,
      stage_to: decision.stageTo || null,
      note: decision.note || null,
      interview_date: decision.interviewDetails?.date || null,
      interview_time: decision.interviewDetails?.time || null,
      interview_location: decision.interviewDetails?.locationOrLink || null,
    };

    let details = `${decision.recruiterName} made decision: ${decision.decisionType}`;
    if (decision.stageTo) {
      details = `Stage updated to ${decision.stageTo} by ${decision.recruiterName}`;
    }
    if (decision.decisionType === 'INTERVIEW_SCHEDULED' && decision.interviewDetails) {
      details = `Interview scheduled for ${decision.interviewDetails.date} at ${decision.interviewDetails.time}`;
    }

    const logEntry: SupabaseSyncLog = {
      id: logId,
      eventType: decision.decisionType,
      entityId: decision.applicationId,
      candidateEmail: decision.candidateEmail,
      candidateName: decision.candidateName,
      jobTitle: decision.jobTitle,
      details,
      status: this.client ? 'synced' : 'pending_credentials',
      targetTable: decision.stageTo ? `recruiter_decisions & ${getStageTableName(decision.stageTo)}` : 'recruiter_decisions',
      payload,
      timestamp,
    };

    // If a stage is added / updated, dispatch to that stage's dedicated table
    if (decision.stageTo) {
      this.sendStageRecord({
        applicationId: decision.applicationId,
        candidateName: decision.candidateName,
        candidateEmail: decision.candidateEmail,
        candidatePhone: decision.candidatePhone,
        candidateId: decision.candidateId,
        jobId: decision.jobId,
        jobTitle: decision.jobTitle,
        jobDepartment: decision.jobDepartment,
        stage: decision.stageTo,
        previousStage: decision.stageFrom || null,
        recruiterId: decision.recruiterId,
        recruiterName: decision.recruiterName,
        note: decision.note,
        interviewDate: decision.interviewDetails?.date,
        interviewTime: decision.interviewDetails?.time,
        interviewLocation: decision.interviewDetails?.locationOrLink,
        aiSummary: decision.aiSummary,
        aiDecision: decision.aiDecision,
        cvFileName: decision.cvFileName,
      }).catch((err) => {
        console.warn(`[Supabase] Note on stage dispatch to ${getStageTableName(decision.stageTo!)}:`, err?.message || err);
      });
    }

    if (!this.client) {
      logEntry.errorMessage = 'Supabase credentials not yet configured in environment. Decision recorded in sync queue.';
      this.logs.push(logEntry);
      this.saveLogs();
      return logEntry;
    }

    try {
      // 1. Insert into recruiter_decisions table
      const { error: decisionError } = await this.client
        .from('recruiter_decisions')
        .insert(payload);

      if (decisionError) {
        throw new Error(`Failed to insert into recruiter_decisions: ${decisionError.message}`);
      }

      // 2. Also update candidate_applications stage and updated_at if stage changed
      if (decision.stageTo) {
        await this.client
          .from('candidate_applications')
          .update({
            stage: decision.stageTo,
            updated_at: timestamp,
          })
          .eq('id', decision.applicationId);
      }

      logEntry.status = 'synced';
      console.log(`[Supabase] Recruiter decision for ${decision.applicationId} synced successfully.`);
    } catch (err: any) {
      logEntry.status = 'failed';
      logEntry.errorMessage = err.message || 'Supabase insert failed';
      console.warn(`[Supabase] Note on syncing recruiter decision:`, err?.message || err);
    }

    this.logs.push(logEntry);
    this.saveLogs();
    return logEntry;
  }

  /**
   * Backfill / Sync all existing applications, stage tables, and decisions to Supabase
   */
  public async syncAll(applications: Application[]): Promise<{
    applicationsSynced: number;
    decisionsSynced: number;
    stageRecordsSynced: number;
    errors: string[];
  }> {
    let applicationsSynced = 0;
    let decisionsSynced = 0;
    let stageRecordsSynced = 0;
    const errors: string[] = [];

    for (const app of applications) {
      const appRes = await this.sendCandidateApplication(app);
      if (appRes.status === 'synced') {
        applicationsSynced++;
      } else if (appRes.errorMessage) {
        errors.push(`App ${app.id}: ${appRes.errorMessage}`);
      }

      // Sync into dedicated stage table
      const stageRes = await this.sendStageRecord({
        applicationId: app.id,
        candidateName: app.candidateName,
        candidateEmail: app.candidateEmail,
        candidatePhone: app.candidatePhone,
        candidateId: app.candidateId,
        jobId: app.jobId,
        jobTitle: app.jobTitle,
        jobDepartment: app.jobDepartment,
        stage: app.stage,
        previousStage: app.stageHistory?.[app.stageHistory.length - 2]?.stage || null,
        recruiterId: 'rec-system',
        recruiterName: app.stageHistory?.[app.stageHistory.length - 1]?.changedBy || 'Recruitment Team',
        note: app.stageHistory?.[app.stageHistory.length - 1]?.note,
        aiSummary: app.aiSummary?.profileBullets?.join('\n'),
        aiDecision: app.latestAiDecision?.decision,
        cvFileName: app.cvFileName,
      });
      if (stageRes.status === 'synced') {
        stageRecordsSynced++;
      }

      // Sync stage history as decisions
      for (const history of app.stageHistory) {
        if (history.stage !== 'Applied') {
          const decRes = await this.sendRecruiterDecision({
            applicationId: app.id,
            candidateName: app.candidateName,
            candidateEmail: app.candidateEmail,
            candidatePhone: app.candidatePhone,
            candidateId: app.candidateId,
            jobId: app.jobId,
            jobTitle: app.jobTitle,
            jobDepartment: app.jobDepartment,
            recruiterId: 'rec-system',
            recruiterName: history.changedBy || 'Recruitment Team',
            decisionType: history.stage === 'Interview'
              ? 'INTERVIEW_SCHEDULED'
              : history.stage === 'Hired'
              ? 'HIRED'
              : history.stage === 'Rejected'
              ? 'REJECTION'
              : 'STAGE_CHANGE',
            stageTo: history.stage,
            note: history.note,
            aiSummary: app.aiSummary?.profileBullets?.join('\n'),
            aiDecision: app.latestAiDecision?.decision,
            cvFileName: app.cvFileName,
          });

          if (decRes.status === 'synced') {
            decisionsSynced++;
          }
        }
      }
    }

    return { applicationsSynced, decisionsSynced, stageRecordsSynced, errors };
  }

  /**
   * Generates the SQL script to run in Supabase SQL editor
   */
  public getSqlSchema(): string {
    return `-- ============================================================================
-- FULL NOWSHERA DIGITAL ATS & SUPABASE SCHEMA SETUP
-- ============================================================================

-- 1. Drop existing tables if you want a clean reset (optional, ensures no old schema conflicts)
DROP TABLE IF EXISTS public.ai_decision CASCADE;
DROP TABLE IF EXISTS public.ai_summaries CASCADE;
DROP TABLE IF EXISTS public.recruiter_decisions CASCADE;
DROP TABLE IF EXISTS public.stage_rejected CASCADE;
DROP TABLE IF EXISTS public.stage_hired CASCADE;
DROP TABLE IF EXISTS public.stage_offer CASCADE;
DROP TABLE IF EXISTS public.stage_interview CASCADE;
DROP TABLE IF EXISTS public.stage_shortlisted CASCADE;
DROP TABLE IF EXISTS public.stage_applied CASCADE;
DROP TABLE IF EXISTS public.candidate_applications CASCADE;

-- 2. Create candidate_applications table
CREATE TABLE public.candidate_applications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  job_title TEXT NOT NULL,
  job_department TEXT,
  candidate_id TEXT NOT NULL,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  candidate_phone TEXT,
  stage TEXT NOT NULL DEFAULT 'Applied',
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  cv_file_name TEXT,
  cv_file_size INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cand_apps_stage ON public.candidate_applications(stage);
CREATE INDEX IF NOT EXISTS idx_cand_apps_job ON public.candidate_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_cand_apps_email ON public.candidate_applications(candidate_email);

ALTER TABLE public.candidate_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow ATS backend read candidate_applications" ON public.candidate_applications FOR SELECT USING (true);
CREATE POLICY "Allow ATS backend insert candidate_applications" ON public.candidate_applications FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow ATS backend update candidate_applications" ON public.candidate_applications FOR UPDATE USING (true);


-- 3. Create recruiter_decisions table
CREATE TABLE public.recruiter_decisions (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  job_id TEXT NOT NULL,
  job_title TEXT NOT NULL,
  recruiter_id TEXT NOT NULL,
  recruiter_name TEXT NOT NULL,
  decision_type TEXT NOT NULL, -- e.g., 'INTERVIEW_SCHEDULED', 'OFFER_EXTENDED', 'REJECTED'
  stage_from TEXT,
  stage_to TEXT,
  note TEXT,
  interview_date TEXT,
  interview_time TEXT,
  interview_location TEXT,
  ai_summary TEXT,
  ai_decision TEXT,
  cv_file_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_dec_app ON public.recruiter_decisions(application_id);
CREATE INDEX IF NOT EXISTS idx_rec_dec_recruiter ON public.recruiter_decisions(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_rec_dec_email ON public.recruiter_decisions(candidate_email);

ALTER TABLE public.recruiter_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow ATS backend read recruiter_decisions" ON public.recruiter_decisions FOR SELECT USING (true);
CREATE POLICY "Allow ATS backend insert recruiter_decisions" ON public.recruiter_decisions FOR INSERT WITH CHECK (true);


-- 4. Create stage tracking tables
CREATE TABLE public.stage_applied (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  application_id TEXT NOT NULL,
  candidate_id TEXT,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  candidate_phone TEXT,
  job_id TEXT NOT NULL,
  job_title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stage_applied_email ON public.stage_applied(candidate_email);
ALTER TABLE public.stage_applied ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow ATS backend read stage_applied" ON public.stage_applied FOR SELECT USING (true);
CREATE POLICY "Allow ATS backend insert stage_applied" ON public.stage_applied FOR INSERT WITH CHECK (true);

CREATE TABLE public.stage_shortlisted (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  application_id TEXT NOT NULL,
  candidate_id TEXT,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  candidate_phone TEXT,
  job_id TEXT NOT NULL,
  job_title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stage_shortlisted_email ON public.stage_shortlisted(candidate_email);
ALTER TABLE public.stage_shortlisted ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow ATS backend read stage_shortlisted" ON public.stage_shortlisted FOR SELECT USING (true);
CREATE POLICY "Allow ATS backend insert stage_shortlisted" ON public.stage_shortlisted FOR INSERT WITH CHECK (true);

CREATE TABLE public.stage_interview (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  application_id TEXT NOT NULL,
  candidate_id TEXT,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  candidate_phone TEXT,
  job_id TEXT NOT NULL,
  job_title TEXT NOT NULL,
  interview_date TEXT,
  interview_time TEXT,
  interview_location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stage_interview_email ON public.stage_interview(candidate_email);
ALTER TABLE public.stage_interview ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow ATS backend read stage_interview" ON public.stage_interview FOR SELECT USING (true);
CREATE POLICY "Allow ATS backend insert stage_interview" ON public.stage_interview FOR INSERT WITH CHECK (true);

CREATE TABLE public.stage_offer (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  application_id TEXT NOT NULL,
  candidate_id TEXT,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  candidate_phone TEXT,
  job_id TEXT NOT NULL,
  job_title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stage_offer_email ON public.stage_offer(candidate_email);
ALTER TABLE public.stage_offer ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow ATS backend read stage_offer" ON public.stage_offer FOR SELECT USING (true);
CREATE POLICY "Allow ATS backend insert stage_offer" ON public.stage_offer FOR INSERT WITH CHECK (true);

CREATE TABLE public.stage_hired (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  application_id TEXT NOT NULL,
  candidate_id TEXT,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  candidate_phone TEXT,
  job_id TEXT NOT NULL,
  job_title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stage_hired_email ON public.stage_hired(candidate_email);
ALTER TABLE public.stage_hired ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow ATS backend read stage_hired" ON public.stage_hired FOR SELECT USING (true);
CREATE POLICY "Allow ATS backend insert stage_hired" ON public.stage_hired FOR INSERT WITH CHECK (true);

CREATE TABLE public.stage_rejected (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  application_id TEXT NOT NULL,
  candidate_id TEXT,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  candidate_phone TEXT,
  job_id TEXT NOT NULL,
  job_title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stage_rejected_email ON public.stage_rejected(candidate_email);
ALTER TABLE public.stage_rejected ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow ATS backend read stage_rejected" ON public.stage_rejected FOR SELECT USING (true);
CREATE POLICY "Allow ATS backend insert stage_rejected" ON public.stage_rejected FOR INSERT WITH CHECK (true);


-- 5. Create ai_decision & ai_summaries tables
CREATE TABLE public.ai_decision (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  application_id TEXT,
  candidate_name TEXT,
  candidate_email TEXT,
  job_id TEXT,
  job_title TEXT,
  decision TEXT NOT NULL,
  reason TEXT,
  confidence NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.ai_summaries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  application_id TEXT NOT NULL,
  candidate_id TEXT,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  job_id TEXT,
  job_title TEXT,
  profile_bullets JSONB,
  matched_requirements JSONB,
  missing_requirements JSONB,
  interview_questions JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_summaries_app ON public.ai_summaries(application_id);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_email ON public.ai_summaries(candidate_email);

ALTER TABLE public.ai_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow ATS backend read ai_summaries" ON public.ai_summaries FOR SELECT USING (true);
CREATE POLICY "Allow ATS backend insert ai_summaries" ON public.ai_summaries FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow ATS backend update ai_summaries" ON public.ai_summaries FOR UPDATE USING (true);

CREATE INDEX IF NOT EXISTS idx_ai_decision_app ON public.ai_decision(application_id);
CREATE INDEX IF NOT EXISTS idx_ai_decision_email ON public.ai_decision(candidate_email);
CREATE INDEX IF NOT EXISTS idx_ai_decision_created ON public.ai_decision(created_at DESC);

ALTER TABLE public.ai_decision ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow ATS backend read ai_decision" ON public.ai_decision FOR SELECT USING (true);
CREATE POLICY "Allow ATS backend insert ai_decision" ON public.ai_decision FOR INSERT WITH CHECK (true);`;
  }
}

export const supabaseService = new SupabaseService();
