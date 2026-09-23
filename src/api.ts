/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Application,
  ApplicationStage,
  DashboardJobStats,
  EmailLog,
  Job,
  SupabaseAIDecision,
  SupabaseConfigStatus,
  SupabaseSyncLog,
  User,
  UserRole,
} from './types';

const TOKEN_KEY = 'nowshera_ats_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data as T;
}

export const api = {
  // Auth
  async getMe(): Promise<{ user: User }> {
    return request<{ user: User }>('/api/auth/me');
  },

  async login(email: string, pass: string): Promise<{ token: string; user: User }> {
    const res = await request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: pass }),
    });
    setStoredToken(res.token);
    return res;
  },

  async signup(name: string, email: string, pass: string, phone?: string, role?: UserRole): Promise<{ token: string; user: User }> {
    const res = await request<{ token: string; user: User }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, email, password: pass, phone, role }),
    });
    setStoredToken(res.token);
    return res;
  },

  logout(): void {
    setStoredToken(null);
  },

  async updateCandidateProfile(updates: {
    name?: string;
    phone?: string;
    cvFileName?: string;
    cvDataUrl?: string;
  }): Promise<{ user: User }> {
    return request<{ user: User }>('/api/candidate/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  // Jobs
  async getJobs(): Promise<{ jobs: Job[] }> {
    return request<{ jobs: Job[] }>('/api/jobs');
  },

  async getJob(id: string): Promise<{ job: Job }> {
    return request<{ job: Job }>(`/api/jobs/${id}`);
  },

  async createJob(jobData: Partial<Job>): Promise<{ job: Job }> {
    return request<{ job: Job }>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify(jobData),
    });
  },

  async updateJob(id: string, jobData: Partial<Job>): Promise<{ job: Job }> {
    return request<{ job: Job }>(`/api/jobs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(jobData),
    });
  },

  async publishJob(id: string): Promise<{ job: Job; message?: string }> {
    return request<{ job: Job; message?: string }>(`/api/jobs/${id}/publish`, {
      method: 'POST',
    });
  },

  async unpublishJob(id: string): Promise<{ job: Job; message?: string }> {
    return request<{ job: Job; message?: string }>(`/api/jobs/${id}/unpublish`, {
      method: 'POST',
    });
  },

  async closeJob(id: string): Promise<{ job: Job }> {
    return request<{ job: Job }>(`/api/jobs/${id}/close`, {
      method: 'POST',
    });
  },

  // Recruiters
  async getRecruiters(): Promise<{ recruiters: User[] }> {
    return request<{ recruiters: User[] }>('/api/recruiters');
  },

  async addRecruiter(name: string, email: string, password?: string): Promise<{ recruiter: User; tempPassword: string }> {
    return request<{ recruiter: User; tempPassword: string }>('/api/recruiters', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
  },

  async toggleRecruiterActive(id: string): Promise<{ recruiter: User }> {
    return request<{ recruiter: User }>(`/api/recruiters/${id}/deactivate`, {
      method: 'PUT',
    });
  },

  // Applications
  async getApplications(): Promise<{ applications: Application[] }> {
    return request<{ applications: Application[] }>('/api/applications');
  },

  async getApplication(id: string): Promise<{ application: Application }> {
    return request<{ application: Application }>(`/api/applications/${id}`);
  },

  async applyForJob(payload: {
    jobId: string;
    cvFileName: string;
    cvDataUrl: string;
    cvText?: string;
  }): Promise<{ message: string; application: Application }> {
    return request<{ message: string; application: Application }>('/api/applications', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async withdrawApplication(id: string): Promise<{ message: string; application: Application }> {
    return request<{ message: string; application: Application }>(`/api/applications/${id}/withdraw`, {
      method: 'POST',
    });
  },

  async updateStage(id: string, targetStage: string, note?: string): Promise<{ message: string; application: Application; jobClosed?: boolean }> {
    return request<{ message: string; application: Application; jobClosed?: boolean }>(`/api/applications/${id}/stage`, {
      method: 'PUT',
      body: JSON.stringify({ targetStage, note }),
    });
  },

  async scheduleInterview(id: string, payload: {
    date: string;
    time: string;
    locationOrLink: string;
    recruiterId?: string;
  }): Promise<{ message: string; application: Application }> {
    return request<{ message: string; application: Application }>(`/api/applications/${id}/interview`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async cancelInterview(id: string): Promise<{ message: string; application: Application }> {
    return request<{ message: string; application: Application }>(`/api/applications/${id}/cancel-interview`, {
      method: 'POST',
    });
  },

  async checkInterviewClash(payload: {
    recruiterId?: string;
    date: string;
    time: string;
    excludeApplicationId?: string;
  }): Promise<{
    hasClash: boolean;
    conflictingApp?: {
      id: string;
      candidateName: string;
      jobTitle: string;
      interview?: {
        date: string;
        time: string;
        locationOrLink: string;
        scheduledByRecruiterName: string;
      };
    } | null;
  }> {
    return request<{
      hasClash: boolean;
      conflictingApp?: {
        id: string;
        candidateName: string;
        jobTitle: string;
        interview?: {
          date: string;
          time: string;
          locationOrLink: string;
          scheduledByRecruiterName: string;
        };
      } | null;
    }>('/api/interviews/check-clash', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async addNote(id: string, content: string): Promise<{ message: string; application: Application }> {
    return request<{ message: string; application: Application }>(`/api/applications/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  async retryAiSummary(id: string): Promise<{ message: string; aiSummary: any; application: Application }> {
    return request<{ message: string; aiSummary: any; application: Application }>(`/api/applications/${id}/retry-ai`, {
      method: 'POST',
    });
  },

  async generateCandidateAiSummary(id: string): Promise<{ message: string; aiSummary: any; application: Application }> {
    return request<{ message: string; aiSummary: any; application: Application }>(`/api/applications/${id}/generate-ai-summary`, {
      method: 'POST',
    });
  },

  async getCvDownload(id: string): Promise<{ fileName: string; fileSize: number; dataUrl: string }> {
    return request<{ fileName: string; fileSize: number; dataUrl: string }>(`/api/applications/${id}/cv`);
  },

  // Dashboard & Emails
  async getDashboard(): Promise<{
    stats: {
      totalJobs: number;
      totalApplications: number;
      totalOpenings: number;
      totalHired: number;
      jobStats: DashboardJobStats[];
    };
  }> {
    return request<{
      stats: {
        totalJobs: number;
        totalApplications: number;
        totalOpenings: number;
        totalHired: number;
        jobStats: DashboardJobStats[];
      };
    }>('/api/dashboard');
  },

  async getEmails(): Promise<{ emails: EmailLog[] }> {
    return request<{ emails: EmailLog[] }>('/api/emails');
  },

  async resetTestData(): Promise<{ message: string }> {
    return request<{ message: string }>('/api/test/reset', {
      method: 'POST',
    });
  },

  // Supabase Integration
  async getSupabaseStatus(): Promise<{ status: SupabaseConfigStatus }> {
    return request<{ status: SupabaseConfigStatus }>('/api/supabase/status');
  },

  async getSupabaseLogs(): Promise<{ logs: SupabaseSyncLog[] }> {
    return request<{ logs: SupabaseSyncLog[] }>('/api/supabase/logs');
  },

  async getSupabaseSql(): Promise<{ sql: string }> {
    return request<{ sql: string }>('/api/supabase/sql');
  },

  async configureSupabase(supabaseUrl: string, supabaseKey: string): Promise<{ message: string; status: SupabaseConfigStatus }> {
    return request<{ message: string; status: SupabaseConfigStatus }>('/api/supabase/configure', {
      method: 'POST',
      body: JSON.stringify({ supabaseUrl, supabaseKey }),
    });
  },

  async syncAllToSupabase(): Promise<{
    message: string;
    result: { applicationsSynced: number; decisionsSynced: number; errors: string[] };
    status: SupabaseConfigStatus;
  }> {
    return request<{
      message: string;
      result: { applicationsSynced: number; decisionsSynced: number; errors: string[] };
      status: SupabaseConfigStatus;
    }>('/api/supabase/sync-all', {
      method: 'POST',
    });
  },

  // Supabase AI Decision Management
  async getAiDecisions(): Promise<{ decisions: SupabaseAIDecision[]; count: number }> {
    return request<{ decisions: SupabaseAIDecision[]; count: number }>('/api/supabase/ai-decisions');
  },

  async syncAiDecisions(): Promise<{
    message: string;
    newDecisionsCount: number;
    totalDecisions: number;
    decisions: SupabaseAIDecision[];
    errors: string[];
  }> {
    return request<{
      message: string;
      newDecisionsCount: number;
      totalDecisions: number;
      decisions: SupabaseAIDecision[];
      errors: string[];
    }>('/api/supabase/sync-ai-decisions', {
      method: 'POST',
    });
  },

  async applyAiDecision(
    applicationId: string,
    decisionId: string,
    targetStage?: ApplicationStage
  ): Promise<{ message: string; application: Application; decision: SupabaseAIDecision }> {
    return request<{ message: string; application: Application; decision: SupabaseAIDecision }>(
      `/api/applications/${applicationId}/apply-ai-decision`,
      {
        method: 'POST',
        body: JSON.stringify({ decisionId, targetStage }),
      }
    );
  },

  async simulateAiDecision(payload: {
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
  }): Promise<{ message: string; decision: SupabaseAIDecision }> {
    return request<{ message: string; decision: SupabaseAIDecision }>('/api/supabase/simulate-ai-decision', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
