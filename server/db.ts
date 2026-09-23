/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import {
  User,
  Job,
  Application,
  EmailLog,
  ApplicationStage,
  DashboardJobStats,
  SupabaseAIDecision,
} from '../src/types.js';
import { createSamplePdfBase64 } from './samplePdf.js';

interface DatabaseSchema {
  users: User[];
  jobs: Job[];
  applications: Application[];
  emails: EmailLog[];
  aiDecisions: SupabaseAIDecision[];
  passwords: Record<string, string>; // userId -> password
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'ats_database.json');

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = {
      users: [],
      jobs: [],
      applications: [],
      emails: [],
      aiDecisions: [],
      passwords: {},
    };
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(fileContent);
        this.data.aiDecisions = this.data.aiDecisions || [];
      } else {
        this.seedInitialData();
      }
      this.ensureStandardAccounts();
      this.save();
    } catch (e) {
      console.error('Error loading DB, seeding fresh database:', e);
      this.seedInitialData();
      this.ensureStandardAccounts();
      this.save();
    }
  }

  private ensureStandardAccounts() {
    // 1. Admin: alishba11@gmail.com
    let admin = this.data.users.find((u) => u.email.toLowerCase() === 'alishba11@gmail.com' || u.id === 'usr-admin-1');
    if (!admin) {
      admin = {
        id: 'usr-admin-1',
        name: 'Alishba (Admin)',
        email: 'alishba11@gmail.com',
        role: 'admin',
        phone: '+1 (555) 010-0001',
        isActive: true,
        createdAt: '2026-09-21T10:00:00Z',
      };
      this.data.users.unshift(admin);
    } else {
      admin.name = 'Alishba (Admin)';
      admin.email = 'alishba11@gmail.com';
      admin.role = 'admin';
      admin.isActive = true;
    }
    this.data.passwords['usr-admin-1'] = '123456789';

    // 2. Recruiter Sarah: sarah@gmail.com
    let rec1 = this.data.users.find((u) => u.email.toLowerCase() === 'sarah@gmail.com' || u.id === 'usr-rec-1');
    if (!rec1) {
      rec1 = {
        id: 'usr-rec-1',
        name: 'Sarah Jenkins',
        email: 'sarah@gmail.com',
        role: 'recruiter',
        phone: '+1 (555) 010-0002',
        isActive: true,
        createdAt: '2026-09-21T10:00:00Z',
      };
      this.data.users.push(rec1);
    } else {
      rec1.name = 'Sarah Jenkins';
      rec1.email = 'sarah@gmail.com';
      rec1.role = 'recruiter';
      rec1.isActive = true;
    }
    this.data.passwords['usr-rec-1'] = '123456789';

    // 3. Recruiter David: david@gmail.com
    let rec2 = this.data.users.find((u) => u.email.toLowerCase() === 'david@gmail.com' || u.id === 'usr-rec-2');
    if (!rec2) {
      rec2 = {
        id: 'usr-rec-2',
        name: 'David Vance',
        email: 'david@gmail.com',
        role: 'recruiter',
        phone: '+1 (555) 010-0003',
        isActive: true,
        createdAt: '2026-09-21T10:00:00Z',
      };
      this.data.users.push(rec2);
    } else {
      rec2.name = 'David Vance';
      rec2.email = 'david@gmail.com';
      rec2.role = 'recruiter';
      rec2.isActive = true;
    }
    this.data.passwords['usr-rec-2'] = '123456789';

    // Ensure Sarah is assigned to job-1 and job-2, David to job-3 and job-4
    for (const job of this.data.jobs) {
      if ((job.id === 'job-1' || job.id === 'job-2') && !job.assignedRecruiterIds.includes('usr-rec-1')) {
        job.assignedRecruiterIds.push('usr-rec-1');
      }
      if ((job.id === 'job-3' || job.id === 'job-4') && !job.assignedRecruiterIds.includes('usr-rec-2')) {
        job.assignedRecruiterIds.push('usr-rec-2');
      }
    }
  }

  public save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save DB file:', e);
    }
  }

  private seedInitialData() {
    const now = '2026-09-21T10:00:00Z';
    const samplePdfData = createSamplePdfBase64(
      'John Candidate',
      'Senior Full Stack Engineer',
      ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Docker', 'System Design']
    );

    const adminUser: User = {
      id: 'usr-admin-1',
      name: 'Admin Manager',
      email: 'admin@nowsheradigital.com',
      role: 'admin',
      phone: '+1 (555) 010-0001',
      isActive: true,
      createdAt: now,
    };

    const recruiter1: User = {
      id: 'usr-rec-1',
      name: 'Sarah Jenkins',
      email: 'sarah.recruiter@nowsheradigital.com',
      role: 'recruiter',
      phone: '+1 (555) 010-0002',
      isActive: true,
      createdAt: now,
    };

    const recruiter2: User = {
      id: 'usr-rec-2',
      name: 'David Vance',
      email: 'david.recruiter@nowsheradigital.com',
      role: 'recruiter',
      phone: '+1 (555) 010-0003',
      isActive: true,
      createdAt: now,
    };

    const candidate1: User = {
      id: 'usr-cand-1',
      name: 'John Candidate',
      email: 'john.candidate@example.com',
      role: 'candidate',
      phone: '+1 (555) 010-0004',
      cvFileName: 'John_Candidate_CV.pdf',
      cvDataUrl: samplePdfData,
      cvUploadedAt: now,
      isActive: true,
      createdAt: now,
    };

    this.data.users = [adminUser, recruiter1, recruiter2, candidate1];
    this.data.passwords = {
      'usr-admin-1': 'admin123',
      'usr-rec-1': 'recruiter123',
      'usr-rec-2': 'recruiter123',
      'usr-cand-1': 'candidate123',
    };

    const job1: Job = {
      id: 'job-1',
      title: 'Senior Full Stack Engineer',
      department: 'Engineering',
      location: 'San Francisco, CA / Remote',
      jobType: 'full-time',
      description:
        'Nowshera Digital is seeking an accomplished Senior Full Stack Engineer to lead architecture across our client platforms, modern web APIs, and responsive applications.',
      requirements: [
        '5+ years building production web applications in TypeScript / Node.js',
        'Strong expertise in modern React and state management architecture',
        'Demonstrated experience with relational and document databases',
        'Solid background in API design, automated testing, and CI/CD pipelines',
      ],
      openings: 2,
      hiredCount: 0,
      lastDateToApply: '2026-10-31',
      status: 'Open',
      assignedRecruiterIds: ['usr-rec-1'],
      createdAt: now,
      updatedAt: now,
    };

    const job2: Job = {
      id: 'job-2',
      title: 'UI/UX Product Designer',
      department: 'Design',
      location: 'Remote',
      jobType: 'full-time',
      description:
        'Craft intuitive user interfaces, design systems, and delightful workflows for high-growth enterprise web applications.',
      requirements: [
        '3+ years experience designing web and mobile user experiences in Figma',
        'Deep understanding of typography, accessibility standards (WCAG), and responsive layouts',
        'Portfolio demonstrating user journeys, design tokens, and rapid prototyping',
      ],
      openings: 1,
      hiredCount: 0,
      lastDateToApply: '2026-10-15',
      status: 'Open',
      assignedRecruiterIds: ['usr-rec-1'],
      createdAt: now,
      updatedAt: now,
    };

    const job3: Job = {
      id: 'job-3',
      title: 'Backend Systems Engineer',
      department: 'Infrastructure',
      location: 'New York, NY / Hybrid',
      jobType: 'full-time',
      description:
        'Build scalable distributed backend services, caching layers, and high-performance APIs.',
      requirements: [
        '3+ years backend development experience with Node.js / Go / Python',
        'Experience building robust microservices and event-driven architectures',
        'Hands-on expertise with cloud deployment, Docker, and caching strategies',
      ],
      openings: 1,
      hiredCount: 0,
      lastDateToApply: '2026-10-20',
      status: 'Open',
      assignedRecruiterIds: ['usr-rec-2'],
      createdAt: now,
      updatedAt: now,
    };

    const job4: Job = {
      id: 'job-4',
      title: 'QA Automation Lead',
      department: 'Quality Assurance',
      location: 'Remote',
      jobType: 'full-time',
      description: 'Lead automated regression testing and quality frameworks.',
      requirements: ['4+ years in Cypress or Playwright test suites'],
      openings: 1,
      hiredCount: 1,
      lastDateToApply: '2026-08-01', // Date passed
      status: 'Closed',
      assignedRecruiterIds: ['usr-rec-2'],
      createdAt: '2026-07-01T09:00:00Z',
      updatedAt: '2026-08-02T10:00:00Z',
    };

    this.data.jobs = [job1, job2, job3, job4];

    // Seed one sample application
    const app1: Application = {
      id: 'app-seed-1',
      jobId: 'job-1',
      jobTitle: job1.title,
      jobDepartment: job1.department,
      candidateId: 'usr-cand-1',
      candidateName: candidate1.name,
      candidateEmail: candidate1.email,
      candidatePhone: candidate1.phone,
      stage: 'Applied',
      cvFileName: 'John_Candidate_CV.pdf',
      cvDataUrl: samplePdfData,
      cvFileSize: 124500,
      aiSummary: {
        status: 'completed',
        generatedAt: now,
        profileBullets: [
          'Over 6 years of full-stack engineering experience specializing in TypeScript and React ecosystems.',
          'Proven record in designing scalable RESTful APIs, microservices, and database schemas.',
          'Strong command of automated testing, containerized deployments, and agile project delivery.',
        ],
        matchedRequirements: [
          '5+ years building production web applications in TypeScript / Node.js',
          'Strong expertise in modern React and state management architecture',
          'Demonstrated experience with relational and document databases',
        ],
        missingRequirements: [
          'Specific CI/CD pipeline automation setup not explicitly detailed in CV text',
        ],
        interviewQuestions: [
          'How have you architected state management and performance optimizations in large React applications?',
          'Can you describe your strategy for database indexing and schema migrations in production?',
          'What automated testing strategies do you employ to guarantee zero-downtime releases?',
        ],
      },
      recruiterNotes: [
        {
          id: 'note-1',
          recruiterId: 'usr-rec-1',
          recruiterName: 'Sarah Jenkins',
          content: 'Strong background in modern TypeScript and React. Looks like a solid fit for the Senior Full Stack role.',
          createdAt: now,
        },
      ],
      stageHistory: [
        {
          stage: 'Applied',
          changedAt: now,
          changedBy: 'John Candidate',
          note: 'Application submitted through career portal.',
        },
      ],
      appliedAt: now,
      updatedAt: now,
    };

    const seedAiDecision: SupabaseAIDecision = {
      id: 'dec-supabase-seed-1',
      applicationId: app1.id,
      candidateName: candidate1.name,
      candidateEmail: candidate1.email,
      jobId: job1.id,
      jobTitle: job1.title,
      decision: 'Shortlisted',
      confidenceScore: 94,
      reason: 'Candidate profile demonstrates 6+ years React & TypeScript development, directly satisfying senior full stack requirements. Suggests progression to Technical Interview.',
      suggestedAction: 'Advance candidate to Technical Interview',
      rawPayload: {
        source: 'supabase.public.ai_decision',
        evaluation: 'Qualified for interview progression',
      },
      appliedToDashboard: false,
      createdAt: now,
    };

    app1.aiDecisions = [seedAiDecision];
    app1.latestAiDecision = seedAiDecision;

    this.data.applications = [app1];
    this.data.aiDecisions = [seedAiDecision];

    this.data.emails = [
      {
        id: 'email-seed-1',
        toEmail: candidate1.email,
        toName: candidate1.name,
        subject: `Application Received: ${job1.title} at Nowshera Digital`,
        body: `Dear ${candidate1.name},\n\nThank you for applying for the ${job1.title} position at Nowshera Digital. We have received your application and PDF CV.\n\nOur hiring team will review your application carefully. You will be notified via email of any updates regarding your status.\n\nBest regards,\nThe Nowshera Digital Hiring Team`,
        category: 'application_received',
        applicationId: app1.id,
        sentAt: now,
      },
    ];
  }

  // Users
  public getUsers(): User[] {
    return this.data.users;
  }

  public getUserById(id: string): User | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  public getUserByEmail(email: string): User | undefined {
    const norm = email.toLowerCase().trim();
    if (norm === 'alishba11@gmail.com' || norm === 'admin@nowsheradigital.com') {
      return this.data.users.find((u) => u.role === 'admin') || this.data.users.find((u) => u.id === 'usr-admin-1');
    }
    if (norm === 'sarah@gmail.com' || norm === 'sarah.recruiter@nowsheradigital.com') {
      return this.data.users.find((u) => u.id === 'usr-rec-1' || u.email.toLowerCase() === 'sarah@gmail.com');
    }
    if (norm === 'david@gmail.com' || norm === 'david.recruiter@nowsheradigital.com') {
      return this.data.users.find((u) => u.id === 'usr-rec-2' || u.email.toLowerCase() === 'david@gmail.com');
    }
    return this.data.users.find((u) => u.email.toLowerCase() === norm);
  }

  public createUser(user: User, password?: string): User {
    this.data.users.push(user);
    if (password) {
      this.data.passwords[user.id] = password;
    }
    this.save();
    return user;
  }

  public updateUser(id: string, updates: Partial<User>): User | undefined {
    const idx = this.data.users.findIndex((u) => u.id === id);
    if (idx === -1) return undefined;
    this.data.users[idx] = { ...this.data.users[idx], ...updates };
    this.save();
    return this.data.users[idx];
  }

  public verifyPassword(userId: string, pass: string): boolean {
    if (userId === 'usr-admin-1') {
      return pass === '123456789' || pass === 'admin123' || this.data.passwords[userId] === pass;
    }
    if (userId === 'usr-rec-1' || userId === 'usr-rec-2') {
      return pass === '123456789' || pass === 'recruiter123' || this.data.passwords[userId] === pass;
    }
    return this.data.passwords[userId] === pass;
  }

  public setPassword(userId: string, pass: string): void {
    this.data.passwords[userId] = pass;
    this.save();
  }

  // Jobs
  public getJobs(): Job[] {
    // Automatically close any open jobs whose deadline has passed
    const today = new Date().toISOString().split('T')[0];
    let changed = false;
    for (const job of this.data.jobs) {
      if (job.status === 'Open' && job.lastDateToApply < today) {
        job.status = 'Closed';
        job.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) this.save();
    return this.data.jobs;
  }

  public getJobById(id: string): Job | undefined {
    const jobs = this.getJobs();
    return jobs.find((j) => j.id === id);
  }

  public createJob(job: Job): Job {
    this.data.jobs.push(job);
    this.save();
    return job;
  }

  public updateJob(id: string, updates: Partial<Job>): Job | undefined {
    const idx = this.data.jobs.findIndex((j) => j.id === id);
    if (idx === -1) return undefined;
    this.data.jobs[idx] = {
      ...this.data.jobs[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return this.data.jobs[idx];
  }

  // Applications
  public getApplications(): Application[] {
    return this.data.applications;
  }

  public getApplicationById(id: string): Application | undefined {
    return this.data.applications.find((a) => a.id === id);
  }

  public getActiveApplicationForCandidateAndJob(
    candidateId: string,
    jobId: string
  ): Application | undefined {
    const activeStages: ApplicationStage[] = ['Applied', 'Shortlisted', 'Interview', 'Offer'];
    return this.data.applications.find(
      (a) => a.candidateId === candidateId && a.jobId === jobId && activeStages.includes(a.stage)
    );
  }

  public createApplication(app: Application): Application {
    this.data.applications.push(app);
    this.save();
    return app;
  }

  public updateApplication(id: string, updates: Partial<Application>): Application | undefined {
    const idx = this.data.applications.findIndex((a) => a.id === id);
    if (idx === -1) return undefined;
    this.data.applications[idx] = {
      ...this.data.applications[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return this.data.applications[idx];
  }

  // Recruiter Interview Clash Verification
  // An interview is 1 hour. Cannot clash with any existing interview for the same recruiter on the same date.
  public checkInterviewClash(
    recruiterId: string,
    date: string, // YYYY-MM-DD
    time: string, // HH:mm
    excludeApplicationId?: string
  ): { hasClash: boolean; conflictingApp?: Application } {
    const [newHours, newMinutes] = time.split(':').map(Number);
    const newStart = newHours * 60 + newMinutes;
    const newEnd = newStart + 60; // 1-hour duration

    for (const app of this.data.applications) {
      if (app.id === excludeApplicationId) continue;
      if (app.stage === 'Withdrawn' || app.stage === 'Rejected') continue;
      if (!app.interview) continue;

      if (
        app.interview.scheduledByRecruiterId === recruiterId &&
        app.interview.date === date
      ) {
        const [existHours, existMinutes] = app.interview.time.split(':').map(Number);
        const existStart = existHours * 60 + existMinutes;
        const existEnd = existStart + 60;

        // Check time interval overlap
        if (newStart < existEnd && existStart < newEnd) {
          return { hasClash: true, conflictingApp: app };
        }
      }
    }

    return { hasClash: false };
  }

  // Emails
  public getEmails(): EmailLog[] {
    return this.data.emails;
  }

  public sendEmail(log: Omit<EmailLog, 'id' | 'sentAt'>): EmailLog {
    // Guard against sending the exact same category email twice for the same application
    if (log.applicationId) {
      const existing = this.data.emails.find(
        (e) => e.applicationId === log.applicationId && e.category === log.category
      );
      if (existing) {
        console.log(`Email category ${log.category} already delivered for app ${log.applicationId}`);
        return existing;
      }
    }

    const email: EmailLog = {
      ...log,
      id: `email-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sentAt: new Date().toISOString(),
    };
    this.data.emails.unshift(email);
    this.save();
    return email;
  }

  // Dashboard Stats
  public getDashboardStats(): {
    totalJobs: number;
    totalApplications: number;
    totalOpenings: number;
    totalHired: number;
    jobStats: DashboardJobStats[];
  } {
    const jobs = this.getJobs();
    const apps = this.getApplications();

    let totalOpenings = 0;
    let totalHired = 0;

    const jobStats: DashboardJobStats[] = jobs.map((job) => {
      totalOpenings += job.openings;
      totalHired += job.hiredCount;

      const jobApps = apps.filter((a) => a.jobId === job.id);
      const byStage: Record<ApplicationStage, number> = {
        Applied: 0,
        Shortlisted: 0,
        Interview: 0,
        Offer: 0,
        Hired: 0,
        Rejected: 0,
        Withdrawn: 0,
      };

      for (const a of jobApps) {
        if (byStage[a.stage] !== undefined) {
          byStage[a.stage]++;
        }
      }

      return {
        jobId: job.id,
        jobTitle: job.title,
        department: job.department,
        status: job.status,
        openings: job.openings,
        hiredCount: job.hiredCount,
        lastDateToApply: job.lastDateToApply,
        totalApplications: jobApps.length,
        byStage,
      };
    });

    return {
      totalJobs: jobs.length,
      totalApplications: apps.length,
      totalOpenings,
      totalHired,
      jobStats,
    };
  }

  // ----------------------------------------------------
  // Supabase AI Decision Management
  // ----------------------------------------------------
  public getAiDecisions(): SupabaseAIDecision[] {
    return this.data.aiDecisions || [];
  }

  public addAiDecision(decision: SupabaseAIDecision): {
    decision: SupabaseAIDecision;
    matchedApplication?: Application;
  } {
    this.data.aiDecisions = this.data.aiDecisions || [];

    // Deduplicate by ID if already ingested
    const existingIndex = this.data.aiDecisions.findIndex((d) => d.id === decision.id);
    if (existingIndex >= 0) {
      this.data.aiDecisions[existingIndex] = {
        ...this.data.aiDecisions[existingIndex],
        ...decision,
      };
    } else {
      this.data.aiDecisions.unshift(decision);
    }

    // Attempt to match with an existing application
    let matchedApp: Application | undefined;

    if (decision.applicationId) {
      matchedApp = this.data.applications.find((a) => a.id === decision.applicationId);
    }

    if (!matchedApp && decision.candidateEmail) {
      const emailLower = decision.candidateEmail.toLowerCase().trim();
      matchedApp = this.data.applications.find(
        (a) => a.candidateEmail.toLowerCase().trim() === emailLower
      );
    }

    if (!matchedApp && decision.candidateName) {
      const nameLower = decision.candidateName.toLowerCase().trim();
      matchedApp = this.data.applications.find(
        (a) => a.candidateName.toLowerCase().trim() === nameLower
      );
    }

    if (matchedApp) {
      decision.applicationId = matchedApp.id;
      decision.candidateName = decision.candidateName || matchedApp.candidateName;
      decision.candidateEmail = decision.candidateEmail || matchedApp.candidateEmail;
      decision.jobId = decision.jobId || matchedApp.jobId;
      decision.jobTitle = decision.jobTitle || matchedApp.jobTitle;

      matchedApp.aiDecisions = matchedApp.aiDecisions || [];
      const appDecIndex = matchedApp.aiDecisions.findIndex((d) => d.id === decision.id);
      if (appDecIndex >= 0) {
        matchedApp.aiDecisions[appDecIndex] = decision;
      } else {
        matchedApp.aiDecisions.unshift(decision);
      }
      matchedApp.latestAiDecision = decision;

      // Log confidential recruiter note for audit trail
      const noteExists = matchedApp.recruiterNotes.some(
        (n) => n.content.includes(`[Supabase ai_decision #${decision.id}]`)
      );
      if (!noteExists) {
        const scoreStr = decision.confidenceScore ? ` (Confidence: ${decision.confidenceScore}%)` : '';
        const reasonStr = decision.reason ? ` - ${decision.reason}` : '';
        const actionStr = decision.suggestedAction ? ` [Suggested: ${decision.suggestedAction}]` : '';

        matchedApp.recruiterNotes.push({
          id: `note-ai-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          recruiterId: 'supabase-ai',
          recruiterName: 'Supabase AI System',
          content: `[Supabase ai_decision #${decision.id}]: Decision: ${decision.decision}${scoreStr}${actionStr}${reasonStr}`,
          createdAt: decision.createdAt || new Date().toISOString(),
        });
      }
    }

    this.save();
    return { decision, matchedApplication: matchedApp };
  }

  public applyAiDecision(
    decisionId: string,
    recruiterUser: User,
    targetStageOverride?: ApplicationStage
  ): { application: Application; decision: SupabaseAIDecision } {
    const decision = (this.data.aiDecisions || []).find((d) => d.id === decisionId);
    if (!decision) {
      throw new Error(`AI decision ${decisionId} not found.`);
    }

    const application = this.data.applications.find((a) => a.id === decision.applicationId);
    if (!application) {
      throw new Error(`No application linked to AI decision ${decisionId}.`);
    }

    // Determine target stage
    let targetStage: ApplicationStage = targetStageOverride || 'Shortlisted';
    if (!targetStageOverride) {
      const decText = (decision.decision + ' ' + (decision.suggestedAction || '')).toLowerCase();
      if (decText.includes('interview')) {
        targetStage = 'Interview';
      } else if (decText.includes('offer')) {
        targetStage = 'Offer';
      } else if (decText.includes('hire')) {
        targetStage = 'Hired';
      } else if (decText.includes('reject')) {
        targetStage = 'Rejected';
      } else {
        targetStage = 'Shortlisted';
      }
    }

    // Update application stage
    application.stage = targetStage;
    application.stageHistory.push({
      stage: targetStage,
      changedAt: new Date().toISOString(),
      changedBy: `${recruiterUser.name} (Applied Supabase AI Decision: ${decision.decision})`,
      note: decision.reason || decision.notes || `Adopted AI recommendation from Supabase`,
    });
    application.updatedAt = new Date().toISOString();

    // Mark decision as applied
    decision.appliedToDashboard = true;
    decision.appliedAt = new Date().toISOString();
    decision.appliedStage = targetStage;

    this.save();
    return { application, decision };
  }
}

export const db = new Database();
