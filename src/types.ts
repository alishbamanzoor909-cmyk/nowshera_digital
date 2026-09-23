/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'candidate' | 'recruiter' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  cvFileName?: string;
  cvDataUrl?: string; // base64 or storage url
  cvUploadedAt?: string;
  isActive: boolean; // For recruiters
  createdAt: string;
}

export type JobType = 'full-time' | 'part-time' | 'contract' | 'internship';
export type JobStatus = 'Draft' | 'Open' | 'Closed';

export interface Job {
  id: string;
  title: string;
  department: string;
  location: string;
  jobType: JobType;
  description: string;
  requirements: string[]; // List of required skills/qualifications
  openings: number;
  hiredCount: number;
  lastDateToApply: string; // YYYY-MM-DD
  status: JobStatus;
  assignedRecruiterIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type ApplicationStage =
  | 'Applied'
  | 'Shortlisted'
  | 'Interview'
  | 'Offer'
  | 'Hired'
  | 'Rejected'
  | 'Withdrawn';

export interface InterviewSchedule {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  durationHours: number; // strictly 1 hour
  locationOrLink: string;
  scheduledByRecruiterId: string;
  scheduledByRecruiterName: string;
  createdAt: string;
}

export interface AISummary {
  status: 'pending' | 'completed' | 'failed';
  generatedAt?: string;
  profileBullets?: string[];
  matchedRequirements?: string[];
  missingRequirements?: string[];
  interviewQuestions?: string[];
  errorMessage?: string;
}

export interface RecruiterNote {
  id: string;
  recruiterId: string;
  recruiterName: string;
  content: string;
  createdAt: string;
}

export interface Application {
  id: string;
  jobId: string;
  jobTitle: string;
  jobDepartment: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string;
  stage: ApplicationStage;
  cvFileName: string;
  cvDataUrl: string; // The snapshot of the CV used when applied
  cvFileSize: number; // bytes
  aiSummary?: AISummary;
  recruiterNotes: RecruiterNote[];
  interview?: InterviewSchedule;
  aiDecisions?: SupabaseAIDecision[];
  latestAiDecision?: SupabaseAIDecision;
  stageHistory: {
    stage: ApplicationStage;
    changedAt: string;
    changedBy: string;
    note?: string;
  }[];
  appliedAt: string;
  updatedAt: string;
}

export interface SupabaseAIDecision {
  id: string;
  applicationId?: string;
  candidateName?: string;
  candidateEmail?: string;
  jobId?: string;
  jobTitle?: string;
  decision: string; // e.g. "Shortlist", "Interview", "Offer", "Reject", "Advance"
  confidenceScore?: number; // 0 - 100
  reason?: string;
  suggestedAction?: string;
  notes?: string;
  createdAt: string;
  appliedToDashboard?: boolean;
  appliedAt?: string;
  appliedStage?: ApplicationStage;
  rawPayload?: Record<string, any>;
}

export interface EmailLog {
  id: string;
  toEmail: string;
  toName: string;
  subject: string;
  body: string;
  category: 'application_received' | 'interview_scheduled' | 'offer' | 'hired' | 'rejected' | 'recruiter_invite';
  applicationId?: string;
  sentAt: string;
}

export interface DashboardJobStats {
  jobId: string;
  jobTitle: string;
  department: string;
  status: JobStatus;
  openings: number;
  hiredCount: number;
  lastDateToApply: string;
  totalApplications: number;
  byStage: Record<ApplicationStage, number>;
}

export type SupabaseEventType =
  | 'CANDIDATE_APPLIED'
  | 'STAGE_CHANGE'
  | 'STAGE_TABLE_SYNCED'
  | 'INTERVIEW_SCHEDULED'
  | 'RECRUITER_NOTE'
  | 'REJECTION'
  | 'HIRED'
  | 'AI_DECISION_RECEIVED'
  | 'AI_SUMMARY_SYNCED';

export interface SupabaseSyncLog {
  id: string;
  eventType: SupabaseEventType;
  entityId: string; // application id
  candidateEmail: string;
  candidateName: string;
  jobTitle: string;
  details: string;
  status: 'synced' | 'pending_credentials' | 'failed';
  errorMessage?: string;
  targetTable: string;
  payload: Record<string, any>;
  timestamp: string;
}

export interface SupabaseConfigStatus {
  isConfigured: boolean;
  supabaseUrl?: string;
  hasKey: boolean;
  totalSynced: number;
  totalPending: number;
  totalFailed: number;
  lastSyncAttempt?: string;
  recentLogs: SupabaseSyncLog[];
}

