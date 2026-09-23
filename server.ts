/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db.js';
import { generateCvSummary } from './server/gemini.js';
import { supabaseService } from './server/supabase.js';
import { Application, ApplicationStage, Job, User, UserRole } from './src/types.js';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// ----------------------------------------------------
// Authentication Middleware
// ----------------------------------------------------
interface AuthenticatedRequest extends Request {
  user?: User;
}

function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next();
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return next();
  }

  const user = db.getUserById(token);
  if (user && user.isActive) {
    req.user = user;
  }
  next();
}

app.use(authMiddleware);

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }
  next();
}

function requireRole(roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access denied. Requires role: ${roles.join(' or ')}.` });
    }
    next();
  };
}

// ----------------------------------------------------
// Health check
// ----------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ----------------------------------------------------
// Auth Routes
// ----------------------------------------------------
app.get('/api/auth/me', (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ user: req.user });
});

const handleSignup = (req: express.Request, res: express.Response) => {
  const { name, email, phone, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  const existing = db.getUserByEmail(email);
  if (existing) {
    return res.status(400).json({ error: 'An account with this email already exists.' });
  }

  const userRole: UserRole = role === 'admin' ? 'admin' : role === 'recruiter' ? 'recruiter' : 'candidate';
  const prefix = userRole === 'admin' ? 'usr-admin' : userRole === 'recruiter' ? 'usr-rec' : 'usr-cand';

  const newUser: User = {
    id: `${prefix}-${Date.now()}`,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role: userRole,
    phone: phone ? phone.trim() : undefined,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  db.createUser(newUser, password);
  res.json({ token: newUser.id, user: newUser });
};

app.post('/api/auth/signup', handleSignup);
app.post('/api/auth/register', handleSignup);

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.getUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (!user.isActive) {
    return res.status(403).json({ error: 'Your account has been deactivated. Please contact the administrator.' });
  }

  if (!db.verifyPassword(user.id, password)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  res.json({ token: user.id, user });
});

// Update candidate profile (e.g. upload new CV)
app.put('/api/candidate/profile', requireRole(['candidate']), (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const { name, phone, cvFileName, cvDataUrl } = req.body;

  const updates: Partial<User> = {};
  if (name) updates.name = name.trim();
  if (phone !== undefined) updates.phone = phone.trim();

  if (cvDataUrl) {
    // Validate PDF
    if (!cvDataUrl.startsWith('data:application/pdf')) {
      return res.status(400).json({ error: 'File must be a PDF document.' });
    }
    // Check size limit: base64 overhead is ~4/3, 2MB is 2,097,152 bytes
    const approximateBytes = Math.round((cvDataUrl.length * 3) / 4);
    if (approximateBytes > 2 * 1024 * 1024) {
      return res.status(400).json({ error: 'PDF file size must not exceed 2 MB.' });
    }
    updates.cvDataUrl = cvDataUrl;
    updates.cvFileName = cvFileName || 'Resume.pdf';
    updates.cvUploadedAt = new Date().toISOString();
  }

  const updated = db.updateUser(user.id, updates);
  res.json({ user: updated });
});

// ----------------------------------------------------
// Jobs Routes
// ----------------------------------------------------
app.get('/api/jobs', (req: AuthenticatedRequest, res) => {
  const allJobs = db.getJobs();
  const user = req.user;

  if (!user || user.role === 'candidate') {
    // Candidates only see Open jobs whose deadline hasn't passed and openings > 0
    const today = new Date().toISOString().split('T')[0];
    const candidateJobs = allJobs.filter(
      (j) => j.status === 'Open' && j.lastDateToApply >= today && j.hiredCount < j.openings
    );
    return res.json({ jobs: candidateJobs });
  }

  if (user.role === 'recruiter') {
    // Recruiters only see jobs assigned to them
    const recruiterJobs = allJobs.filter((j) => j.assignedRecruiterIds.includes(user.id));
    return res.json({ jobs: recruiterJobs });
  }

  // Admin sees all jobs
  res.json({ jobs: allJobs });
});

app.get('/api/jobs/:id', (req: AuthenticatedRequest, res) => {
  const job = db.getJobById(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  const user = req.user;
  const today = new Date().toISOString().split('T')[0];

  if (!user || user.role === 'candidate') {
    if (job.status !== 'Open' || job.lastDateToApply < today) {
      return res.status(403).json({ error: 'This job is not currently open for applications.' });
    }
  } else if (user.role === 'recruiter') {
    if (!job.assignedRecruiterIds.includes(user.id)) {
      return res.status(403).json({ error: 'You are not assigned to this job.' });
    }
  }

  res.json({ job });
});

app.post('/api/jobs', requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  const {
    title,
    department,
    location,
    jobType,
    description,
    requirements,
    openings,
    lastDateToApply,
    status,
    assignedRecruiterIds,
  } = req.body;

  if (!title || !department || !location || !jobType || !description || !lastDateToApply) {
    return res.status(400).json({ error: 'All primary job details are required.' });
  }

  const numOpenings = Number(openings) || 1;
  if (numOpenings < 1) {
    return res.status(400).json({ error: 'Openings must be at least 1.' });
  }

  const newJob: Job = {
    id: `job-${Date.now()}`,
    title: title.trim(),
    department: department.trim(),
    location: location.trim(),
    jobType: jobType || 'full-time',
    description: description.trim(),
    requirements: Array.isArray(requirements)
      ? requirements.map((r: string) => r.trim()).filter(Boolean)
      : requirements ? [requirements.trim()] : [],
    openings: numOpenings,
    hiredCount: 0,
    lastDateToApply,
    status: status === 'Open' ? 'Open' : 'Draft',
    assignedRecruiterIds: Array.isArray(assignedRecruiterIds) ? assignedRecruiterIds : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.createJob(newJob);
  res.status(201).json({ job: newJob });
});

app.put('/api/jobs/:id', requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  const job = db.getJobById(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  const {
    title,
    department,
    location,
    jobType,
    description,
    requirements,
    openings,
    lastDateToApply,
    status,
    assignedRecruiterIds,
  } = req.body;

  const updates: Partial<Job> = {};
  if (title) updates.title = title.trim();
  if (department) updates.department = department.trim();
  if (location) updates.location = location.trim();
  if (jobType) updates.jobType = jobType;
  if (description) updates.description = description.trim();
  if (requirements) {
    updates.requirements = Array.isArray(requirements)
      ? requirements.map((r: string) => r.trim()).filter(Boolean)
      : [requirements.trim()];
  }
  if (openings !== undefined) updates.openings = Number(openings);
  if (lastDateToApply) updates.lastDateToApply = lastDateToApply;
  if (status) updates.status = status;
  if (assignedRecruiterIds) updates.assignedRecruiterIds = assignedRecruiterIds;

  const updated = db.updateJob(job.id, updates);
  res.json({ job: updated });
});

app.post('/api/jobs/:id/publish', requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  const job = db.getJobById(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  const today = new Date().toISOString().split('T')[0];
  if (job.lastDateToApply < today) {
    return res.status(400).json({
      error: 'Cannot post job: the application deadline has already passed. Please update the deadline date first.',
    });
  }

  if (job.assignedRecruiterIds.length === 0) {
    return res.status(400).json({
      error: 'Cannot post job: at least one recruiter must be assigned before publishing live.',
    });
  }

  const updated = db.updateJob(job.id, { status: 'Open' });
  res.json({ job: updated, message: `Job "${job.title}" has been successfully posted live!` });
});

app.post('/api/jobs/:id/unpublish', requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  const job = db.getJobById(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  const updated = db.updateJob(job.id, { status: 'Draft' });
  res.json({ job: updated, message: `Job "${job.title}" has been moved to Draft mode.` });
});

app.post('/api/jobs/:id/close', requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  const job = db.getJobById(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  const updated = db.updateJob(job.id, { status: 'Closed' });
  res.json({ job: updated });
});

// ----------------------------------------------------
// Recruiter Management (Admin)
// ----------------------------------------------------
app.get('/api/recruiters', requireRole(['admin']), (req, res) => {
  const recruiters = db.getUsers().filter((u) => u.role === 'recruiter');
  res.json({ recruiters });
});

app.post('/api/recruiters', requireRole(['admin']), (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }

  const existing = db.getUserByEmail(email);
  if (existing) {
    return res.status(400).json({ error: 'A user with this email already exists.' });
  }

  const tempPassword = password || 'recruiter123';
  const newRecruiter: User = {
    id: `usr-rec-${Date.now()}`,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role: 'recruiter',
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  db.createUser(newRecruiter, tempPassword);

  // Send set-password / welcome email
  db.sendEmail({
    toEmail: newRecruiter.email,
    toName: newRecruiter.name,
    subject: 'Welcome to Nowshera Digital Hiring Team - Set Your Password',
    body: `Hello ${newRecruiter.name},\n\nYou have been added as a Recruiter at Nowshera Digital.\n\nYour account is active. Use your temporary password: "${tempPassword}" or sign in to configure your assigned job pipelines.\n\nBest regards,\nNowshera Digital HR Administration`,
    category: 'recruiter_invite',
  });

  res.status(201).json({ recruiter: newRecruiter, tempPassword });
});

app.put('/api/recruiters/:id/deactivate', requireRole(['admin']), (req, res) => {
  const recruiter = db.getUserById(req.params.id);
  if (!recruiter || recruiter.role !== 'recruiter') {
    return res.status(404).json({ error: 'Recruiter not found.' });
  }

  const updated = db.updateUser(recruiter.id, { isActive: !recruiter.isActive });
  res.json({ recruiter: updated });
});

// ----------------------------------------------------
// Applications Routes
// ----------------------------------------------------

// Filter applications depending on role
app.get('/api/applications', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const allApps = db.getApplications();

  if (user.role === 'candidate') {
    // Candidate ONLY sees their own applications
    const candidateApps = allApps
      .filter((a) => a.candidateId === user.id)
      .map((a) => {
        // Strip recruiter notes and AI summary and AI decisions from candidate view
        const { recruiterNotes, aiSummary, aiDecisions, latestAiDecision, ...safeApp } = a;
        return safeApp;
      });
    return res.json({ applications: candidateApps });
  }

  if (user.role === 'recruiter') {
    // Recruiter ONLY sees applications for jobs assigned to them
    const assignedJobs = db.getJobs().filter((j) => j.assignedRecruiterIds.includes(user.id));
    const assignedJobIds = new Set(assignedJobs.map((j) => j.id));

    const recruiterApps = allApps.filter((a) => assignedJobIds.has(a.jobId));
    return res.json({ applications: recruiterApps });
  }

  // Admin sees all applications
  res.json({ applications: allApps });
});

app.get('/api/applications/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const appItem = db.getApplicationById(req.params.id);

  if (!appItem) {
    return res.status(404).json({ error: 'Application not found.' });
  }

  // Candidate privacy check
  if (user.role === 'candidate') {
    if (appItem.candidateId !== user.id) {
      return res.status(403).json({ error: 'You do not have permission to view this application.' });
    }
    // Strip recruiterNotes, aiSummary, and aiDecisions
    const { recruiterNotes, aiSummary, aiDecisions, latestAiDecision, ...safeApp } = appItem;
    return res.json({ application: safeApp });
  }

  // Recruiter privacy check
  if (user.role === 'recruiter') {
    const job = db.getJobById(appItem.jobId);
    if (!job || !job.assignedRecruiterIds.includes(user.id)) {
      return res.status(403).json({ error: 'You are not assigned to the job for this application.' });
    }
  }

  res.json({ application: appItem });
});

// Download / View snapshot CV
app.get('/api/applications/:id/cv', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const appItem = db.getApplicationById(req.params.id);

  if (!appItem) {
    return res.status(404).json({ error: 'Application not found.' });
  }

  // Candidate can only view their own CV
  if (user.role === 'candidate' && appItem.candidateId !== user.id) {
    return res.status(403).json({ error: 'You cannot access another candidate’s CV.' });
  }

  // Recruiter can only view if assigned
  if (user.role === 'recruiter') {
    const job = db.getJobById(appItem.jobId);
    if (!job || !job.assignedRecruiterIds.includes(user.id)) {
      return res.status(403).json({ error: 'You are not assigned to this job.' });
    }
  }

  res.json({
    fileName: appItem.cvFileName,
    fileSize: appItem.cvFileSize,
    dataUrl: appItem.cvDataUrl,
  });
});

// Candidate applies for a job
app.post('/api/applications', requireRole(['candidate']), async (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const { jobId, cvFileName, cvDataUrl, cvText } = req.body;

  if (!jobId) {
    return res.status(400).json({ error: 'Job ID is required.' });
  }

  const job = db.getJobById(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  // Rule: Candidate cannot apply to Closed or Draft jobs
  if (job.status !== 'Open') {
    return res.status(400).json({ error: `Cannot apply. This job is currently ${job.status.toLowerCase()}.` });
  }

  // Rule: Cannot apply after last date
  const today = new Date().toISOString().split('T')[0];
  if (job.lastDateToApply < today) {
    return res.status(400).json({ error: 'The application deadline for this job has passed.' });
  }

  // Rule: Cannot apply if openings are already filled
  if (job.hiredCount >= job.openings) {
    return res.status(400).json({ error: 'All openings for this job have already been filled.' });
  }

  // Rule: Candidates can submit a new application with a new CV for the same job anytime.
  // We allow multiple applications per candidate per job so they can update their CV/application.

  // CV validation
  const effectiveCvDataUrl = cvDataUrl || user.cvDataUrl;
  const effectiveCvFileName = cvFileName || user.cvFileName || `${user.name.replace(/\s+/g, '_')}_CV.pdf`;

  if (!effectiveCvDataUrl) {
    return res.status(400).json({ error: 'Please upload a PDF CV to apply.' });
  }

  if (!effectiveCvDataUrl.startsWith('data:application/pdf')) {
    return res.status(400).json({ error: 'File must be a PDF document (Word and other formats are not accepted).' });
  }

  const approxBytes = Math.round((effectiveCvDataUrl.length * 3) / 4);
  if (approxBytes > 2 * 1024 * 1024) {
    return res.status(400).json({ error: 'PDF file size must not exceed 2 MB.' });
  }

  const now = new Date().toISOString();
  const applicationId = `app-${Date.now()}`;

  const newApp: Application = {
    id: applicationId,
    jobId: job.id,
    jobTitle: job.title,
    jobDepartment: job.department,
    candidateId: user.id,
    candidateName: user.name,
    candidateEmail: user.email,
    candidatePhone: user.phone,
    stage: 'Applied',
    cvFileName: effectiveCvFileName,
    cvDataUrl: effectiveCvDataUrl, // Immutable snapshot for this application!
    cvFileSize: approxBytes,
    aiSummary: {
      status: 'pending',
    },
    recruiterNotes: [],
    stageHistory: [
      {
        stage: 'Applied',
        changedAt: now,
        changedBy: user.name,
        note: 'Application submitted by candidate.',
      },
    ],
    appliedAt: now,
    updatedAt: now,
  };

  // 1. Save application
  db.createApplication(newApp);

  // Send candidate application data to Supabase candidate_applications table
  supabaseService.sendCandidateApplication(newApp).catch((err) => {
    console.error('Failed to dispatch candidate application to Supabase:', err);
  });

  // 2. Send "application received" email immediately
  db.sendEmail({
    toEmail: user.email,
    toName: user.name,
    subject: `Application Received: ${job.title} at Nowshera Digital`,
    body: `Dear ${user.name},\n\nThank you for applying for the position of ${job.title} at Nowshera Digital.\n\nWe have safely received your application and PDF CV (${effectiveCvFileName}). Our recruitment team will review your application.\n\nYou can track the status of your application at any time in the "My Applications" portal.\n\nBest regards,\nNowshera Digital Recruitment Team`,
    category: 'application_received',
    applicationId: newApp.id,
  });

  // 3. Generate AI summary of the candidate and send data to Supabase
  generateCvSummary({
    candidateName: user.name,
    cvContent: cvText || `Candidate CV for ${user.name}. Experienced in professional software engineering and project delivery for ${job.title}.`,
    pdfBase64: effectiveCvDataUrl,
    jobTitle: job.title,
    jobRequirements: job.requirements,
  })
    .then(async (summary) => {
      db.updateApplication(newApp.id, { aiSummary: summary });
      const updatedWithAi = db.getApplicationById(newApp.id);
      if (updatedWithAi) {
        // Dispatch structured AI summary to Supabase (candidate_applications & ai_summaries)
        await supabaseService.sendAiSummary(updatedWithAi, summary).catch((err) => {
          console.warn('[Supabase] Warning syncing AI summary to Supabase:', err?.message || err);
        });
      }
    })
    .catch((err) => {
      console.warn('[AI Service] Notice on generating AI summary:', err?.message || err);
      db.updateApplication(newApp.id, {
        aiSummary: {
          status: 'failed',
          errorMessage: 'Summary not available.',
        },
      });
    });

  // Return to candidate (without sensitive fields)
  const { recruiterNotes, aiSummary, ...safeCreated } = newApp;
  res.status(201).json({
    message: 'Application submitted successfully.',
    application: safeCreated,
  });
});

// Candidate withdraws application
app.post('/api/applications/:id/withdraw', requireRole(['candidate']), (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const appItem = db.getApplicationById(req.params.id);

  if (!appItem) {
    return res.status(404).json({ error: 'Application not found.' });
  }

  if (appItem.candidateId !== user.id) {
    return res.status(403).json({ error: 'You cannot withdraw another candidate’s application.' });
  }

  if (appItem.stage === 'Hired' || appItem.stage === 'Rejected') {
    return res.status(400).json({
      error: `Cannot withdraw an application that has already been ${appItem.stage.toLowerCase()}.`,
    });
  }

  const now = new Date().toISOString();
  const updated = db.updateApplication(appItem.id, {
    stage: 'Withdrawn',
    stageHistory: [
      ...appItem.stageHistory,
      {
        stage: 'Withdrawn',
        changedAt: now,
        changedBy: user.name,
        note: 'Candidate withdrew application.',
      },
    ],
  });

  res.json({ message: 'Application withdrawn successfully.', application: updated });
});

// Recruiter or Admin moves stage
const STAGE_ORDER: ApplicationStage[] = ['Applied', 'Shortlisted', 'Interview', 'Offer', 'Hired'];

app.put('/api/applications/:id/stage', requireRole(['recruiter', 'admin']), (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const appItem = db.getApplicationById(req.params.id);

  if (!appItem) {
    return res.status(404).json({ error: 'Application not found.' });
  }

  const job = db.getJobById(appItem.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Associated job not found.' });
  }

  // Recruiter authorization check
  if (user.role === 'recruiter' && !job.assignedRecruiterIds.includes(user.id)) {
    return res.status(403).json({ error: 'You are not assigned to this job.' });
  }

  const { targetStage, note } = req.body as { targetStage: ApplicationStage; note?: string };
  const currentStage = appItem.stage;

  // Rule: Hired and Rejected are final
  if (currentStage === 'Hired' || currentStage === 'Rejected') {
    return res.status(400).json({ error: `Cannot change stage. ${currentStage} is final.` });
  }

  // Rule: Withdrawn cannot be moved
  if (currentStage === 'Withdrawn') {
    return res.status(400).json({ error: 'Cannot move application. Candidate has withdrawn this application.' });
  }

  // Rule: An application can be Rejected at any stage before Hired
  if (targetStage === 'Rejected') {
    const now = new Date().toISOString();
    const updated = db.updateApplication(appItem.id, {
      stage: 'Rejected',
      stageHistory: [
        ...appItem.stageHistory,
        {
          stage: 'Rejected',
          changedAt: now,
          changedBy: user.name,
          note: note || 'Application rejected by recruitment team.',
        },
      ],
    });

    // Send recruiter decision to Supabase (recruiter_decisions AND stage_rejected)
    supabaseService.sendRecruiterDecision({
      applicationId: appItem.id,
      candidateName: appItem.candidateName,
      candidateEmail: appItem.candidateEmail,
      candidatePhone: appItem.candidatePhone,
      candidateId: appItem.candidateId,
      jobId: job.id,
      jobTitle: job.title,
      jobDepartment: job.department,
      recruiterId: user.id,
      recruiterName: user.name,
      decisionType: 'REJECTION',
      stageFrom: currentStage,
      stageTo: 'Rejected',
      note: note || 'Application rejected by recruitment team.',
      aiSummary: appItem.aiSummary?.profileBullets?.join('\n'),
      aiDecision: appItem.latestAiDecision?.decision,
      cvFileName: appItem.cvFileName,
    }).catch((err) => {
      console.error('Failed to dispatch rejection decision to Supabase:', err);
    });

    // Send rejection email
    db.sendEmail({
      toEmail: appItem.candidateEmail,
      toName: appItem.candidateName,
      subject: `Update on your application for ${job.title} at Nowshera Digital`,
      body: `Dear ${appItem.candidateName},\n\nThank you for taking the time to apply for the ${job.title} role at Nowshera Digital.\n\nAfter careful consideration, we regret to inform you that we will not be moving forward with your application for this position. We appreciate your interest in Nowshera Digital and wish you success in your job search.\n\nBest regards,\nThe Nowshera Digital Hiring Team`,
      category: 'rejected',
      applicationId: appItem.id,
    });

    return res.json({ message: 'Application rejected.', application: updated });
  }

  // If job is closed, other active applications can ONLY be rejected
  if (job.status === 'Closed') {
    return res.status(400).json({
      error: 'This job is closed. Active applications for a closed job can only be rejected.',
    });
  }

  // Rule: Pipeline progression order: Applied -> Shortlisted -> Interview -> Offer -> Hired
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  const targetIndex = STAGE_ORDER.indexOf(targetStage);

  if (targetIndex === -1) {
    return res.status(400).json({ error: `Invalid target stage: ${targetStage}` });
  }

  if (targetIndex < currentIndex) {
    return res.status(400).json({ error: 'Cannot move application backwards.' });
  }

  if (targetIndex > currentIndex + 1) {
    const expectedNext = STAGE_ORDER[currentIndex + 1];
    return res.status(400).json({
      error: `Cannot skip stages. Next stage must be ${expectedNext}.`,
    });
  }

  // Moving to Interview requires scheduling endpoint or schedule details
  if (targetStage === 'Interview' && !appItem.interview) {
    return res.status(400).json({
      error: 'Cannot move to Interview without scheduling an interview. Please provide interview date, time, and location.',
    });
  }

  // Moving to Hired
  if (targetStage === 'Hired') {
    // Check if openings are already filled
    if (job.hiredCount >= job.openings) {
      return res.status(400).json({
        error: `All ${job.openings} opening(s) have already been filled for this job. Additional hires are blocked.`,
      });
    }

    const now = new Date().toISOString();
    const updated = db.updateApplication(appItem.id, {
      stage: 'Hired',
      stageHistory: [
        ...appItem.stageHistory,
        {
          stage: 'Hired',
          changedAt: now,
          changedBy: user.name,
          note: note || 'Candidate hired.',
        },
      ],
    });

    // Increment hired count on job
    const newHiredCount = job.hiredCount + 1;
    const isNowClosed = newHiredCount >= job.openings;

    db.updateJob(job.id, {
      hiredCount: newHiredCount,
      ...(isNowClosed ? { status: 'Closed' } : {}),
    });

    // Send Hired decision to Supabase (recruiter_decisions AND stage_hired)
    supabaseService.sendRecruiterDecision({
      applicationId: appItem.id,
      candidateName: appItem.candidateName,
      candidateEmail: appItem.candidateEmail,
      candidatePhone: appItem.candidatePhone,
      candidateId: appItem.candidateId,
      jobId: job.id,
      jobTitle: job.title,
      jobDepartment: job.department,
      recruiterId: user.id,
      recruiterName: user.name,
      decisionType: 'HIRED',
      stageFrom: currentStage,
      stageTo: 'Hired',
      note: note || 'Candidate hired.',
      aiSummary: appItem.aiSummary?.profileBullets?.join('\n'),
      aiDecision: appItem.latestAiDecision?.decision,
      cvFileName: appItem.cvFileName,
    }).catch((err) => {
      console.error('Failed to dispatch hired decision to Supabase:', err);
    });

    // Send Hired email
    db.sendEmail({
      toEmail: appItem.candidateEmail,
      toName: appItem.candidateName,
      subject: `Congratulations! You have been Hired for ${job.title} at Nowshera Digital`,
      body: `Dear ${appItem.candidateName},\n\nWe are delighted to confirm that you have been formally hired as a ${job.title} at Nowshera Digital!\n\nOur human resources team will follow up shortly with onboarding documentation, start dates, and orientation logistics. Welcome to the team!\n\nWarm regards,\nNowshera Digital Leadership Team`,
      category: 'hired',
      applicationId: appItem.id,
    });

    return res.json({
      message: `Candidate hired.${isNowClosed ? ' Job openings filled; job has automatically closed.' : ''}`,
      application: updated,
      jobClosed: isNowClosed,
    });
  }

  // For other stages (Shortlisted, Offer)
  const now = new Date().toISOString();
  const updated = db.updateApplication(appItem.id, {
    stage: targetStage,
    stageHistory: [
      ...appItem.stageHistory,
      {
        stage: targetStage,
        changedAt: now,
        changedBy: user.name,
        note: note || `Application moved to ${targetStage}.`,
      },
    ],
  });

  // Send stage transition decision to Supabase (recruiter_decisions AND stage_<targetStage>)
  supabaseService.sendRecruiterDecision({
    applicationId: appItem.id,
    candidateName: appItem.candidateName,
    candidateEmail: appItem.candidateEmail,
    candidatePhone: appItem.candidatePhone,
    candidateId: appItem.candidateId,
    jobId: job.id,
    jobTitle: job.title,
    jobDepartment: job.department,
    recruiterId: user.id,
    recruiterName: user.name,
    decisionType: 'STAGE_CHANGE',
    stageFrom: currentStage,
    stageTo: targetStage,
    note: note || `Application moved to ${targetStage}.`,
    aiSummary: appItem.aiSummary?.profileBullets?.join('\n'),
    aiDecision: appItem.latestAiDecision?.decision,
    cvFileName: appItem.cvFileName,
  }).catch((err) => {
    console.error('Failed to dispatch stage change decision to Supabase:', err);
  });

  if (targetStage === 'Offer') {
    db.sendEmail({
      toEmail: appItem.candidateEmail,
      toName: appItem.candidateName,
      subject: `Formal Job Offer: ${job.title} at Nowshera Digital`,
      body: `Dear ${appItem.candidateName},\n\nWe are thrilled to extend an offer for the position of ${job.title} at Nowshera Digital!\n\nOur recruiting team has approved this offer based on your interview performance and CV qualifications. Your offer package details will follow.\n\nBest regards,\nNowshera Digital Hiring Team`,
      category: 'offer',
      applicationId: appItem.id,
    });
  }

  res.json({ message: `Stage updated to ${targetStage}.`, application: updated });
});

// Schedule 1-hour Interview (moves application from Shortlisted to Interview)
app.post('/api/applications/:id/interview', requireRole(['recruiter', 'admin']), (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const appItem = db.getApplicationById(req.params.id);

  if (!appItem) {
    return res.status(404).json({ error: 'Application not found.' });
  }

  const job = db.getJobById(appItem.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  if (user.role === 'recruiter' && !job.assignedRecruiterIds.includes(user.id)) {
    return res.status(403).json({ error: 'You are not assigned to this job.' });
  }

  const isReschedule = appItem.stage === 'Interview';
  if (appItem.stage !== 'Shortlisted' && !isReschedule) {
    return res.status(400).json({
      error: `Interviews can only be scheduled for applicants in the "Shortlisted" or "Interview" stage (current stage: ${appItem.stage}).`,
    });
  }

  const { date, time, locationOrLink, recruiterId: customRecruiterId } = req.body;
  if (!date || !time || !locationOrLink) {
    return res.status(400).json({ error: 'Interview date, time, and location or meeting link are required.' });
  }

  // Determine recruiter assignment
  let assignedRecruiter = user;
  if (customRecruiterId && customRecruiterId !== user.id) {
    const specifiedRecruiter = db.getUserById(customRecruiterId);
    if (specifiedRecruiter && specifiedRecruiter.role === 'recruiter') {
      assignedRecruiter = specifiedRecruiter;
    }
  }

  // Validate date format YYYY-MM-DD and time HH:mm
  const interviewDateTimeStr = `${date}T${time}:00`;
  const interviewDateTime = new Date(interviewDateTimeStr);

  if (isNaN(interviewDateTime.getTime())) {
    return res.status(400).json({ error: 'Invalid interview date or time format.' });
  }

  // Rule: An interview can't be in the past
  const now = new Date();
  if (interviewDateTime < now) {
    return res.status(400).json({ error: 'Interview date and time cannot be in the past.' });
  }

  // Rule: A recruiter's interviews can't overlap (1-hour duration)
  const clashCheck = db.checkInterviewClash(assignedRecruiter.id, date, time, appItem.id);
  if (clashCheck.hasClash) {
    const conflict = clashCheck.conflictingApp?.interview;
    return res.status(400).json({
      error: `Interview schedule clash! Recruiter ${assignedRecruiter.name} already has an interview scheduled on ${date} at ${conflict?.time} (1-hour slot with ${clashCheck.conflictingApp?.candidateName}). Interviews cannot overlap.`,
    });
  }

  const nowIso = new Date().toISOString();
  const interviewSchedule = {
    date,
    time,
    durationHours: 1,
    locationOrLink: locationOrLink.trim(),
    scheduledByRecruiterId: assignedRecruiter.id,
    scheduledByRecruiterName: assignedRecruiter.name,
    createdAt: nowIso,
  };

  const actionVerb = isReschedule ? 'rescheduled' : 'scheduled';
  const updated = db.updateApplication(appItem.id, {
    stage: 'Interview',
    interview: interviewSchedule,
    stageHistory: [
      ...appItem.stageHistory,
      {
        stage: 'Interview',
        changedAt: nowIso,
        changedBy: user.name,
        note: `Interview ${actionVerb} for ${date} at ${time} (1 hour) at ${locationOrLink} with ${assignedRecruiter.name}.`,
      },
    ],
  });

  // Send interview decision to Supabase (recruiter_decisions AND stage_interview)
  supabaseService.sendRecruiterDecision({
    applicationId: appItem.id,
    candidateName: appItem.candidateName,
    candidateEmail: appItem.candidateEmail,
    candidatePhone: appItem.candidatePhone,
    candidateId: appItem.candidateId,
    jobId: job.id,
    jobTitle: job.title,
    jobDepartment: job.department,
    recruiterId: assignedRecruiter.id,
    recruiterName: assignedRecruiter.name,
    decisionType: 'INTERVIEW_SCHEDULED',
    stageFrom: appItem.stage,
    stageTo: 'Interview',
    note: `Interview ${actionVerb} for ${date} at ${time} at ${locationOrLink}.`,
    interviewDetails: {
      date,
      time,
      locationOrLink,
    },
    aiSummary: appItem.aiSummary?.profileBullets?.join('\n'),
    aiDecision: appItem.latestAiDecision?.decision,
    cvFileName: appItem.cvFileName,
  }).catch((err) => {
    console.error('Failed to dispatch interview decision to Supabase:', err);
  });

  // Send interview invitation/reschedule email to candidate
  db.sendEmail({
    toEmail: appItem.candidateEmail,
    toName: appItem.candidateName,
    subject: isReschedule
      ? `Interview Rescheduled: ${job.title} at Nowshera Digital`
      : `Interview Invitation: ${job.title} at Nowshera Digital`,
    body: isReschedule
      ? `Dear ${appItem.candidateName},\n\nYour 1-hour interview for the ${job.title} position at Nowshera Digital has been rescheduled.\n\nNew Schedule Details:\n• Date: ${date}\n• Time: ${time} (1 hour)\n• Location / Link: ${locationOrLink}\n• Recruiter: ${assignedRecruiter.name}\n\nIf you have any questions, please let us know.\n\nBest regards,\nNowshera Digital Hiring Team`
      : `Dear ${appItem.candidateName},\n\nYou have been invited to a 1-hour interview for the ${job.title} position at Nowshera Digital.\n\nDetails:\n• Date: ${date}\n• Time: ${time} (1 hour)\n• Location / Link: ${locationOrLink}\n• Recruiter: ${assignedRecruiter.name}\n\nPlease be prepared to discuss your background and technical experience. If you need to reschedule, please notify us in advance.\n\nBest regards,\nNowshera Digital Hiring Team`,
    category: 'interview_scheduled',
    applicationId: appItem.id,
  });

  res.json({
    message: isReschedule
      ? `Interview successfully rescheduled for ${date} at ${time}.`
      : 'Interview scheduled successfully and invitation email sent.',
    application: updated,
  });
});

// Cancel/Postpone Interview (moves application back to Shortlisted)
app.post('/api/applications/:id/cancel-interview', requireRole(['recruiter', 'admin']), (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const appItem = db.getApplicationById(req.params.id);

  if (!appItem) {
    return res.status(404).json({ error: 'Application not found.' });
  }

  const job = db.getJobById(appItem.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  if (user.role === 'recruiter' && !job.assignedRecruiterIds.includes(user.id)) {
    return res.status(403).json({ error: 'You are not assigned to this job.' });
  }

  if (appItem.stage !== 'Interview' && !appItem.interview) {
    return res.status(400).json({ error: 'This candidate does not have a scheduled interview.' });
  }

  const previousDate = appItem.interview?.date;
  const previousTime = appItem.interview?.time;
  const nowIso = new Date().toISOString();

  const updated = db.updateApplication(appItem.id, {
    stage: 'Shortlisted',
    interview: undefined,
    stageHistory: [
      ...appItem.stageHistory,
      {
        stage: 'Shortlisted',
        changedAt: nowIso,
        changedBy: user.name,
        note: `Interview on ${previousDate} at ${previousTime} was cancelled. Application returned to Shortlisted pool.`,
      },
    ],
  });

  db.sendEmail({
    toEmail: appItem.candidateEmail,
    toName: appItem.candidateName,
    subject: `Interview Update: ${job.title} at Nowshera Digital`,
    body: `Dear ${appItem.candidateName},\n\nYour interview previously scheduled for ${previousDate} at ${previousTime} for the ${job.title} position has been cancelled or postponed.\n\nOur recruiting team will reach out with next steps or updated availability.\n\nBest regards,\nNowshera Digital Hiring Team`,
    category: 'interview_scheduled',
    applicationId: appItem.id,
  });

  res.json({
    message: 'Interview cancelled and candidate returned to Shortlisted status.',
    application: updated,
  });
});

// Real-time Clash Check endpoint
app.post('/api/interviews/check-clash', requireRole(['recruiter', 'admin']), (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const { recruiterId, date, time, excludeApplicationId } = req.body;
  const targetRecruiterId = recruiterId || user.id;

  if (!date || !time) {
    return res.status(400).json({ error: 'Date and time are required.' });
  }

  const clashCheck = db.checkInterviewClash(targetRecruiterId, date, time, excludeApplicationId);
  res.json({
    hasClash: clashCheck.hasClash,
    conflictingApp: clashCheck.conflictingApp ? {
      id: clashCheck.conflictingApp.id,
      candidateName: clashCheck.conflictingApp.candidateName,
      jobTitle: clashCheck.conflictingApp.jobTitle,
      interview: clashCheck.conflictingApp.interview,
    } : null,
  });
});

// Add Recruiter Note
app.post('/api/applications/:id/notes', requireRole(['recruiter', 'admin']), (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const appItem = db.getApplicationById(req.params.id);

  if (!appItem) {
    return res.status(404).json({ error: 'Application not found.' });
  }

  const job = db.getJobById(appItem.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  if (user.role === 'recruiter' && !job.assignedRecruiterIds.includes(user.id)) {
    return res.status(403).json({ error: 'You are not assigned to this job.' });
  }

  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Note content cannot be empty.' });
  }

  const newNote = {
    id: `note-${Date.now()}`,
    recruiterId: user.id,
    recruiterName: user.name,
    content: content.trim(),
    createdAt: new Date().toISOString(),
  };

  const updated = db.updateApplication(appItem.id, {
    recruiterNotes: [...appItem.recruiterNotes, newNote],
  });

  // Send recruiter note to Supabase
  supabaseService.sendRecruiterDecision({
    applicationId: appItem.id,
    candidateName: appItem.candidateName,
    candidateEmail: appItem.candidateEmail,
    jobId: job.id,
    jobTitle: job.title,
    recruiterId: user.id,
    recruiterName: user.name,
    decisionType: 'RECRUITER_NOTE',
    note: content.trim(),
  }).catch((err) => {
    console.error('Failed to dispatch recruiter note to Supabase:', err);
  });

  res.json({ message: 'Note added successfully.', application: updated });
});

// Generate / Regenerate AI summary of candidate and send data to Supabase
app.post('/api/applications/:id/generate-ai-summary', requireRole(['recruiter', 'admin']), async (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const appItem = db.getApplicationById(req.params.id);

  if (!appItem) {
    return res.status(404).json({ error: 'Application not found.' });
  }

  const job = db.getJobById(appItem.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  if (user.role === 'recruiter' && !job.assignedRecruiterIds.includes(user.id)) {
    return res.status(403).json({ error: 'You are not assigned to this job.' });
  }

  try {
    const summary = await generateCvSummary({
      candidateName: appItem.candidateName,
      cvContent: `Candidate CV for ${appItem.candidateName}. Professional background and domain experience for ${job.title}.`,
      pdfBase64: appItem.cvDataUrl,
      jobTitle: job.title,
      jobRequirements: job.requirements,
    });

    const updated = db.updateApplication(appItem.id, { aiSummary: summary });
    if (updated) {
      await supabaseService.sendAiSummary(updated, summary);
    }

    res.json({
      message: 'AI summary generated and synced to Supabase.',
      aiSummary: summary,
      application: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate AI summary: ' + (err?.message || err) });
  }
});

// Sync / Refresh AI Decision from Supabase ai_decision table and re-sync AI summary
app.post('/api/applications/:id/retry-ai', requireRole(['recruiter', 'admin']), async (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const appItem = db.getApplicationById(req.params.id);

  if (!appItem) {
    return res.status(404).json({ error: 'Application not found.' });
  }

  const job = db.getJobById(appItem.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  if (user.role === 'recruiter' && !job.assignedRecruiterIds.includes(user.id)) {
    return res.status(403).json({ error: 'You are not assigned to this job.' });
  }

  try {
    // Generate fresh summary if missing or requested
    let summary = appItem.aiSummary;
    if (!summary || summary.status !== 'completed') {
      summary = await generateCvSummary({
        candidateName: appItem.candidateName,
        cvContent: `Candidate CV for ${appItem.candidateName}. Professional experience for ${job.title}.`,
        pdfBase64: appItem.cvDataUrl,
        jobTitle: job.title,
        jobRequirements: job.requirements,
      });
      db.updateApplication(appItem.id, { aiSummary: summary });
    }

    // Sync to Supabase
    const updated = db.getApplicationById(appItem.id);
    if (updated && summary) {
      await supabaseService.sendAiSummary(updated, summary);
    }
    const syncRes = await supabaseService.fetchAiDecisions();

    res.json({
      message: `AI summary synced to Supabase. Checked ai_decision table (${syncRes.newDecisionsCount} new decision(s)).`,
      aiSummary: summary,
      application: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to sync AI data: ' + (err?.message || err) });
  }
});

// ----------------------------------------------------
// Dashboard & Emails
// ----------------------------------------------------
app.get('/api/dashboard', requireRole(['admin']), (req, res) => {
  const stats = db.getDashboardStats();
  res.json({ stats });
});

app.get('/api/emails', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const allEmails = db.getEmails();

  if (user.role === 'candidate') {
    // Candidate only sees emails addressed to them
    const candidateEmails = allEmails.filter(
      (e) => e.toEmail.toLowerCase() === user.email.toLowerCase()
    );
    return res.json({ emails: candidateEmails });
  }

  // Recruiter and Admin can see all email delivery logs
  res.json({ emails: allEmails });
});

// ----------------------------------------------------
// Supabase Integration & Synchronization Routes
// ----------------------------------------------------
app.get('/api/supabase/status', requireRole(['admin', 'recruiter']), (req, res) => {
  const status = supabaseService.getStatus();
  res.json({ status });
});

app.get('/api/supabase/logs', requireRole(['admin', 'recruiter']), (req, res) => {
  const logs = supabaseService.getLogs();
  res.json({ logs });
});

app.get('/api/supabase/sql', requireRole(['admin', 'recruiter']), (req, res) => {
  const sql = supabaseService.getSqlSchema();
  res.json({ sql });
});

// Configure or test Supabase connection
app.post('/api/supabase/configure', requireRole(['admin']), (req, res) => {
  const { supabaseUrl, supabaseKey } = req.body;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(400).json({ error: 'Supabase URL and Key are required.' });
  }

  process.env.SUPABASE_URL = supabaseUrl.trim();
  process.env.SUPABASE_KEY = supabaseKey.trim();
  supabaseService.initClient(supabaseUrl.trim(), supabaseKey.trim());

  const status = supabaseService.getStatus();
  res.json({
    message: status.isConfigured
      ? 'Supabase client configured successfully.'
      : 'Configuration failed. Please verify URL and key.',
    status,
  });
});

// Sync all historical applications and decisions to Supabase
app.post('/api/supabase/sync-all', requireRole(['admin']), async (req, res) => {
  const allApplications = db.getApplications();
  try {
    const result = await supabaseService.syncAll(allApplications);
    const status = supabaseService.getStatus();
    res.json({
      message: `Sync complete: ${result.applicationsSynced} application(s) and ${result.decisionsSynced} decision(s) processed.`,
      result,
      status,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to sync with Supabase: ' + (err?.message || err) });
  }
});

// ----------------------------------------------------
// Supabase ai_decision Table Sync & Ingestion Routes
// ----------------------------------------------------

// 1. Get all ingested AI decisions from Supabase
app.get('/api/supabase/ai-decisions', requireRole(['admin', 'recruiter']), (req, res) => {
  const decisions = db.getAiDecisions();
  res.json({ decisions, count: decisions.length });
});

// 2. Poll & sync incoming rows from Supabase ai_decision table right now
app.post('/api/supabase/sync-ai-decisions', requireRole(['admin', 'recruiter']), async (req, res) => {
  try {
    const result = await supabaseService.fetchAiDecisions();
    const allDecisions = db.getAiDecisions();
    res.json({
      message: result.newDecisionsCount > 0
        ? `Successfully pulled ${result.newDecisionsCount} new AI decision(s) from Supabase ai_decision table into recruiter dashboard.`
        : 'Checked Supabase ai_decision table: Recruiter dashboard is completely up to date.',
      newDecisionsCount: result.newDecisionsCount,
      totalDecisions: allDecisions.length,
      decisions: allDecisions,
      errors: result.errors,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch ai_decision rows from Supabase: ' + (err?.message || err) });
  }
});

// 3. Webhook endpoint for Supabase Database Webhooks on table public.ai_decision
app.post('/api/supabase/ai-decision-webhook', (req, res) => {
  try {
    const row = req.body.record || req.body.new || req.body;
    if (!row || typeof row !== 'object') {
      return res.status(400).json({ error: 'Invalid payload: row object expected.' });
    }
    const decision = supabaseService.handleIncomingAiDecision(row);
    res.json({
      success: true,
      message: 'Row added from Supabase ai_decision into Recruiter Dashboard.',
      decision,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to ingest webhook row: ' + (err?.message || err) });
  }
});

// 4. Endpoint to insert an AI decision into Supabase and add to Recruiter Dashboard
app.post('/api/supabase/simulate-ai-decision', requireRole(['admin', 'recruiter']), async (req, res) => {
  try {
    const { applicationId, candidateName, candidateEmail, jobId, jobTitle, decision, confidenceScore, reason, suggestedAction, notes } = req.body;

    if (!decision) {
      return res.status(400).json({ error: 'Decision is required (e.g. Shortlist, Interview, Offer, Reject).' });
    }

    const created = await supabaseService.insertAiDecision({
      applicationId,
      candidateName,
      candidateEmail,
      jobId,
      jobTitle,
      decision,
      confidenceScore: typeof confidenceScore === 'number' ? confidenceScore : 90,
      reason,
      suggestedAction,
      notes,
    });

    res.json({
      message: `AI Decision [${created.decision}] successfully added to Supabase ai_decision and visible in Recruiter Dashboard.`,
      decision: created,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to add AI decision: ' + (err?.message || err) });
  }
});

// 5. Recruiter applies the AI decision (moves candidate stage / creates audit trail)
app.post('/api/applications/:id/apply-ai-decision', requireRole(['recruiter', 'admin']), (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const { decisionId, targetStage } = req.body;

  if (!decisionId) {
    return res.status(400).json({ error: 'decisionId is required.' });
  }

  try {
    const result = db.applyAiDecision(decisionId, user, targetStage);

    const job = db.getJobById(result.application.jobId);
    // Also dispatch decision sync to Supabase (recruiter_decisions AND stage_<stage> table)
    supabaseService.sendRecruiterDecision({
      applicationId: result.application.id,
      candidateName: result.application.candidateName,
      candidateEmail: result.application.candidateEmail,
      candidatePhone: result.application.candidatePhone,
      candidateId: result.application.candidateId,
      jobId: result.application.jobId,
      jobTitle: result.application.jobTitle,
      jobDepartment: job?.department,
      recruiterId: user.id,
      recruiterName: user.name,
      decisionType: 'STAGE_CHANGE',
      stageFrom: result.application.stageHistory[result.application.stageHistory.length - 2]?.stage,
      stageTo: result.application.stage,
      note: `Applied Supabase AI Decision [${result.decision.decision}]: ${result.decision.reason || ''}`,
      aiSummary: result.application.aiSummary?.profileBullets?.join('\n'),
      aiDecision: result.decision.decision,
      cvFileName: result.application.cvFileName,
    }).catch(() => {});

    res.json({
      message: `AI Decision applied: ${result.application.candidateName} moved to stage '${result.application.stage}'.`,
      application: result.application,
      decision: result.decision,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to apply AI decision.' });
  }
});

// Helper route to reset test data if requested
app.post('/api/test/reset', requireRole(['admin']), (req, res) => {
  db['seedInitialData']();
  db.save();
  res.json({ message: 'Database reset to initial sample state.' });
});

// ----------------------------------------------------
// Production Static & Vite Development Middleware
// ----------------------------------------------------
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nowshera Digital ATS Server running on http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
});
