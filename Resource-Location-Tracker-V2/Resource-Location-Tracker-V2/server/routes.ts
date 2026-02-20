import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { parseKMZFile, convertToResources } from "./services/kmzParser";
import { parseCSVFile, parseExcelFile, convertCSVToResources, exportToExcel, exportToExcelWithBirdRepSheets, exportToCSVWithBirdRepFiles } from "./services/csvParser";
import { routingService } from "./services/routingService";
import { fetchSPCOutlook, fetchElectricUtilities, calculateAffectedUtilities } from "./services/weatherService";
import { insertResourceSchema, insertAnalysisPointSchema, insertContractorSchema, insertContractorReviewSchema, insertUserSchema, insertUserCompanyAccessSchema, insertCompanySchema, insertStormSessionSchema, insertRosterSchema, insertCrewSchema, insertRosterPersonnelSchema, insertRosterEquipmentSchema, insertTimesheetSchema, insertTimesheetLineSchema, insertExpenseSchema, insertExpenseFileSchema, insertInvoiceSchema, insertInvoiceLineSchema, insertIssueTypeSchema, insertTicketSchema, insertTicketAssignmentSchema, ticketAssignments, distanceCalculations, analysisPoints, contractors, contractorFiles, users, rosterPersonnel, rosterEquipment, timesheetLines, expenseFiles, invoiceLines, resources, contractorReviews, analysisJobs, crewAvailability, equipmentAvailability, availabilitySubmissions, availabilitySessions, incidents, incidentAssignments, crewRosters, appConfig, companies, userCompanyAccess, stormSessions, sessionContractors, sessionContractorMembers, userSessions, rosters, crews, timesheets, timesheetPersonnel, timesheetEquipment, expenses, fteReports, companyLocations, rateTables, invoices, auditLogs, issueTypes, tickets, ticketStatusEvents, ticketWorkSegments, notifications } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import archiver from 'archiver';
import OpenAI from "openai";
import { requireAuth, requireUtility, requireManager, requireManagerOrUtility, requireAdminRole, requireAdminOrManager, requireCompanyAccess } from "./middleware/rbac";
import { createAuditLog, getAuditContext } from "./services/auditLog";
import { objectStorageClient, ObjectStorageService, parseObjectPath } from "./objectStorage";

// Session utility functions
function getSessionId(req: any): string {
  const sessionId = req.headers['x-session-id'] || req.query.sessionId;
  return sessionId || 'global-session';
}

async function getEffectiveSessionId(req: any, pointId?: number): Promise<string> {
  const requestedSessionId = getSessionId(req);

  // If it's the auto-detect session, try to find the actual session ID from existing data
  if (requestedSessionId === 'auto-detect-session' && pointId) {
    const analysisPoints = await storage.getAllAnalysisPoints();
    const existingPoint = analysisPoints.find(p => p.id === pointId);
    if (existingPoint && existingPoint.sessionId) {
      return existingPoint.sessionId;
    }
  }

  return requestedSessionId;
}

const upload = multer({
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    // Allow common document and data types for contractor files
    const allowedTypes = ['.kmz', '.kml', '.csv', '.xlsx', '.xls', '.pdf', '.doc', '.docx', '.txt', '.jpg', '.jpeg', '.png', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowedTypes.includes(ext));
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Configure multer for in-memory storage (for Object Storage uploads)
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    // Allow common image and document types for receipts
    const allowedTypes = ['.jpg', '.jpeg', '.png', '.pdf', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowedTypes.includes(ext));
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Initialize OpenAI client - the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// AI-powered contractor matching function
async function findBestContractorMatch(submissionCompanyName: string, allContractors: any[]): Promise<{contractor: any | null, confidence: number, reasoning: string}> {
  try {
    if (!submissionCompanyName || submissionCompanyName.trim() === '') {
      return { contractor: null, confidence: 0, reasoning: 'No company name provided' };
    }

    // If OpenAI is not available, skip to fallback
    if (!openai) {
      throw new Error('OpenAI not configured');
    }

    // Create a list of contractor names for comparison
    const contractorList = allContractors.map(c => ({
      id: c.id,
      company: c.company,
      name: c.name
    }));

    const prompt = `I need to match a company name from a form submission to contractors in my database. The submission might have typos, abbreviations, or slight variations.

Submission company name: "${submissionCompanyName}"

Database contractors:
${contractorList.map(c => `ID: ${c.id}, Company: "${c.company}", Contact: "${c.name}"`).join('\n')}

Please find the best match and respond with JSON in this exact format:
{
  "matched_contractor_id": number_or_null,
  "confidence": number_between_0_and_1,
  "reasoning": "explanation of the match or why no match was found"
}

Consider variations like:
- Abbreviations (e.g., "Inc" vs "Incorporated", "LLC" vs "Limited")
- Typos and misspellings
- Word order differences
- Missing or extra words
- Different punctuation

If confidence is below 0.7, return null for matched_contractor_id.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an expert at matching company names despite variations, typos, and abbreviations. Return only valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    const matchedContractor = result.matched_contractor_id 
      ? allContractors.find(c => c.id === result.matched_contractor_id)
      : null;

    return {
      contractor: matchedContractor,
      confidence: Math.max(0, Math.min(1, result.confidence || 0)),
      reasoning: result.reasoning || 'No reasoning provided'
    };

  } catch (error) {
    console.error('AI contractor matching error:', error);
    // Fallback to exact string matching
    const exactMatch = allContractors.find(c => 
      c.company.toLowerCase().trim() === submissionCompanyName.toLowerCase().trim()
    );
    
    if (exactMatch) {
      return {
        contractor: exactMatch,
        confidence: 1.0,
        reasoning: 'Exact match found (AI fallback)'
      };
    }

    return {
      contractor: null,
      confidence: 0,
      reasoning: `AI matching failed: ${error.message}. No exact match found.`
    };
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Current user endpoint (Replit Auth)
  app.get("/api/user", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    const userClaims = (req.user as any)?.claims;
    if (!userClaims?.sub) {
      return res.status(401).json({ message: "No user session" });
    }
    
    // Get user from database
    const user = await storage.getUser(userClaims.sub);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Return user without sensitive data
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      role: user.role,
      companyId: user.companyId,
    });
  });

  // ============================================================================
  // USER MANAGEMENT API (ADMIN only)
  // ============================================================================

  // List all users (ADMIN only)
  app.get("/api/users", requireAuth, async (req, res) => {
    try {
      // Allow ADMIN and MANAGER to list users
      if (req.authenticatedUser?.role !== 'ADMIN' && req.authenticatedUser?.role !== 'MANAGER') {
        return res.status(403).json({ message: "Access denied. This endpoint is for ADMIN and MANAGER users only." });
      }
      
      const users = await storage.getAllUsers();
      
      // Return users without sensitive data
      const sanitizedUsers = users.map(user => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        role: user.role,
        companyId: user.companyId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }));
      
      res.json(sanitizedUsers);
    } catch (error) {
      console.error('List users error:', error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Create new user (ADMIN only)
  app.post("/api/users", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      
      // Business rule validation: CONTRACTOR must have companyId
      if (userData.role === 'CONTRACTOR' && !userData.companyId) {
        return res.status(400).json({ 
          message: "CONTRACTOR users must be assigned to a company" 
        });
      }
      
      // Business rule validation: ADMIN and UTILITY should not have companyId
      if ((userData.role === 'ADMIN' || userData.role === 'UTILITY') && userData.companyId) {
        return res.status(400).json({ 
          message: `${userData.role} users cannot be assigned to a company` 
        });
      }
      
      const user = await storage.createUser(userData);
      
      // Audit log
      await createAuditLog({
        action: 'user.create',
        entityType: 'user',
        entityId: user.id,
        details: { email: user.email, role: user.role, companyId: user.companyId },
        context: getAuditContext(req),
      });
      
      // Return user without sensitive data
      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        role: user.role,
        companyId: user.companyId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    } catch (error) {
      console.error('Create user error:', error);
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(400).json({ message: "Invalid user data" });
      }
    }
  });

  // Update user (ADMIN only)
  app.patch("/api/users/:id", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const updates = insertUserSchema.partial().parse(req.body);
      
      // Get current user to check role changes
      const currentUser = await storage.getUser(req.params.id);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Determine final role after update
      const finalRole = updates.role || currentUser.role;
      const finalCompanyId = updates.companyId !== undefined ? updates.companyId : currentUser.companyId;
      
      // Business rule validation: CONTRACTOR must have companyId
      if (finalRole === 'CONTRACTOR' && !finalCompanyId) {
        return res.status(400).json({ 
          message: "CONTRACTOR users must be assigned to a company" 
        });
      }
      
      // Business rule validation: ADMIN and UTILITY should not have companyId
      if ((finalRole === 'ADMIN' || finalRole === 'UTILITY') && finalCompanyId) {
        return res.status(400).json({ 
          message: `${finalRole} users cannot be assigned to a company` 
        });
      }
      
      const user = await storage.updateUser(req.params.id, updates);
      
      if (!user) {
        return res.status(404).json({ message: "User not found or deleted" });
      }
      
      // Audit log
      await createAuditLog({
        action: 'user.update',
        entityType: 'user',
        entityId: user.id,
        details: updates,
        context: getAuditContext(req),
      });
      
      // Return user without sensitive data
      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        role: user.role,
        companyId: user.companyId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    } catch (error) {
      console.error('Update user error:', error);
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(400).json({ message: "Invalid user data" });
      }
    }
  });

  // Delete user (soft delete, ADMIN only)
  app.delete("/api/users/:id", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const user = await storage.deleteUser(req.params.id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Audit log
      await createAuditLog({
        action: 'user.delete',
        entityType: 'user',
        entityId: req.params.id,
        context: getAuditContext(req),
      });
      
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // ============================================================================
  // USER COMPANY ACCESS API (MANAGER only)
  // ============================================================================

  // Grant UTILITY user access to a company (MANAGER only)
  app.post("/api/user-company-access", requireAuth, requireManager, async (req, res) => {
    try {
      // Client sends only userId and companyId, server adds grantedBy
      const grantAccessSchema = insertUserCompanyAccessSchema.omit({ grantedBy: true });
      const { userId, companyId } = grantAccessSchema.parse(req.body);
      
      // Verify the user exists and is UTILITY role
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (user.role !== 'UTILITY') {
        return res.status(400).json({ 
          message: "Company access can only be granted to UTILITY users" 
        });
      }
      
      // Verify the company exists
      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }
      
      // Grant access with grantedBy set to current manager
      const access = await storage.grantUserCompanyAccess({
        userId,
        companyId,
        grantedBy: req.authenticatedUser!.id,
      });
      
      // Audit log
      await createAuditLog({
        action: 'user_company_access.grant',
        entityType: 'user_company_access',
        entityId: access.id,
        details: { userId, companyId, grantedBy: req.authenticatedUser!.id },
        context: getAuditContext(req),
      });
      
      res.json(access);
    } catch (error) {
      console.error('Grant access error:', error);
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(400).json({ message: "Failed to grant access" });
      }
    }
  });

  // Revoke UTILITY user access to a company (MANAGER only)
  app.delete("/api/user-company-access", requireAuth, requireManager, async (req, res) => {
    try {
      // Validate request body (userId and companyId required)
      const revokeAccessSchema = z.object({
        userId: z.string(),
        companyId: z.string(),
      });
      const { userId, companyId } = revokeAccessSchema.parse(req.body);
      
      // Find the access grant by userId and companyId
      const accesses = await storage.getUserCompanyAccesses(userId);
      const access = accesses.find(a => a.companyId === companyId);
      
      if (!access) {
        return res.status(404).json({ 
          message: "Access grant not found" 
        });
      }
      
      // Revoke access by ID
      await storage.revokeUserCompanyAccess(access.id);
      
      // Audit log
      await createAuditLog({
        action: 'user_company_access.revoke',
        entityType: 'user_company_access',
        entityId: access.id,
        details: { userId, companyId, revokedBy: req.authenticatedUser!.id },
        context: getAuditContext(req),
      });
      
      res.json({ message: "Access revoked successfully" });
    } catch (error) {
      console.error('Revoke access error:', error);
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to revoke access" });
      }
    }
  });

  // List company access grants for a user (MANAGER only)
  app.get("/api/user-company-access/:userId", requireAuth, requireManager, async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Get user to verify they exist
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Get all companies the user has access to (efficient method)
      const companies = await storage.getUserAccessibleCompanies(userId);
      
      res.json(companies);
    } catch (error) {
      console.error('List user access error:', error);
      res.status(500).json({ message: "Failed to fetch user access" });
    }
  });

  // ============================================================================
  // COMPANIES API (Storm Response Management)
  // ============================================================================

  // Create company (ADMIN, MANAGER, or UTILITY role)
  app.post("/api/companies", requireAuth, async (req, res) => {
    try {
      const userRole = req.authenticatedUser?.role;
      if (userRole !== 'ADMIN' && userRole !== 'MANAGER' && userRole !== 'UTILITY') {
        return res.status(403).json({ message: "Access denied" });
      }
      const companyData = insertCompanySchema.parse(req.body);
      const company = await storage.createCompany(companyData);
      
      // Audit log
      await createAuditLog({
        action: 'company.create',
        entityType: 'company',
        entityId: company.id,
        details: { name: company.name },
        context: getAuditContext(req),
      });
      
      res.json(company);
    } catch (error) {
      console.error('Create company error:', error);
      res.status(400).json({ message: "Invalid company data" });
    }
  });

  // List companies (ADMIN and MANAGER see all, CONTRACTOR sees own, UTILITY sees granted)
  app.get("/api/companies", requireAuth, async (req, res) => {
    try {
      const user = req.authenticatedUser!;
      
      // ADMIN and MANAGER see all companies
      if (user.role === 'ADMIN' || user.role === 'MANAGER') {
        const companies = await storage.getAllCompanies();
        return res.json(companies);
      }
      
      // CONTRACTOR sees only their own company
      if (user.role === 'CONTRACTOR') {
        if (!user.companyId) {
          return res.status(403).json({ 
            message: "Company assignment required. Contact your administrator." 
          });
        }
        const companies = await storage.getAllCompanies();
        const filtered = companies.filter(c => c.id === user.companyId);
        return res.json(filtered);
      }
      
      // UTILITY sees only companies they've been granted access to
      if (user.role === 'UTILITY') {
        const companies = await storage.getUserAccessibleCompanies(user.id);
        return res.json(companies);
      }
      
      return res.status(403).json({ message: "Access denied" });
    } catch (error) {
      console.error('List companies error:', error);
      res.status(500).json({ message: "Failed to fetch companies" });
    }
  });

  // Get single company
  app.get("/api/companies/:id", requireAuth, requireCompanyAccess((req) => req.params.id), async (req, res) => {
    try {
      const company = await storage.getCompany(req.params.id);
      
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }
      
      res.json(company);
    } catch (error) {
      console.error('Get company error:', error);
      res.status(500).json({ message: "Failed to fetch company" });
    }
  });

  // Update company (MANAGER role only)
  app.patch("/api/companies/:id", requireAuth, requireManager, async (req, res) => {
    try {
      const updates = insertCompanySchema.partial().parse(req.body);
      const company = await storage.updateCompany(req.params.id, updates);
      
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }
      
      // Audit log
      await createAuditLog({
        action: 'company.update',
        entityType: 'company',
        entityId: company.id,
        details: updates,
        context: getAuditContext(req),
      });
      
      res.json(company);
    } catch (error) {
      console.error('Update company error:', error);
      res.status(400).json({ message: "Invalid company data" });
    }
  });

  // Delete company (MANAGER role only)
  app.delete("/api/companies/:id", requireAuth, requireManager, async (req, res) => {
    try {
      await storage.deleteCompany(req.params.id);
      
      // Audit log
      await createAuditLog({
        action: 'company.delete',
        entityType: 'company',
        entityId: req.params.id,
        context: getAuditContext(req),
      });
      
      res.json({ message: "Company deleted successfully" });
    } catch (error) {
      console.error('Delete company error:', error);
      res.status(500).json({ message: "Failed to delete company" });
    }
  });

  // Sync companies from contractors database
  app.post("/api/companies/sync-from-contractors", requireAuth, async (req, res) => {
    try {
      // Get all contractors with unique company names
      const allContractors = await storage.getAllContractors();
      const uniqueCompanyNames = [...new Set(allContractors.map(c => c.company).filter(Boolean))];
      
      // Get existing companies
      const existingCompanies = await storage.getAllCompanies();
      const existingCompanyNames = new Set(existingCompanies.map(c => c.name));
      
      // Create companies for new contractor companies
      let createdCount = 0;
      for (const companyName of uniqueCompanyNames) {
        if (!existingCompanyNames.has(companyName)) {
          await storage.createCompany({
            name: companyName,
            contactName: null,
            contactEmail: null,
            contactPhone: null,
            billingAddress: null,
            notes: 'Auto-synced from contractors database',
          });
          createdCount++;
        }
      }
      
      // Return updated list of companies
      const companies = await storage.getAllCompanies();
      
      // Audit log
      await createAuditLog({
        action: 'company.sync',
        entityType: 'company',
        details: { 
          uniqueContractorCompanies: uniqueCompanyNames.length,
          createdCount,
          totalCompanies: companies.length 
        },
        context: getAuditContext(req),
      });
      
      res.json({ 
        message: `Synced ${createdCount} new companies from contractors database`,
        createdCount,
        totalCompanies: companies.length,
        companies 
      });
    } catch (error) {
      console.error('Sync companies error:', error);
      res.status(500).json({ message: "Failed to sync companies" });
    }
  });

  // ============================================================================
  // CONTRACTOR PROFILE API
  // ============================================================================

  // Get contractor profile (CONTRACTOR only)
  app.get("/api/profile", requireAuth, async (req, res) => {
    try {
      const user = req.authenticatedUser!;
      
      if (user.role !== 'CONTRACTOR') {
        return res.status(403).json({ message: "This endpoint is only available for CONTRACTOR users" });
      }
      
      if (!user.companyId) {
        return res.status(404).json({ message: "No company assigned to this contractor" });
      }
      
      const company = await storage.getCompany(user.companyId);
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }
      
      res.json(company);
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  // Update contractor profile (CONTRACTOR only)
  app.patch("/api/profile", requireAuth, async (req, res) => {
    try {
      const user = req.authenticatedUser!;
      
      if (user.role !== 'CONTRACTOR') {
        return res.status(403).json({ message: "This endpoint is only available for CONTRACTOR users" });
      }
      
      if (!user.companyId) {
        return res.status(404).json({ message: "No company assigned to this contractor" });
      }
      
      const updates = insertCompanySchema.partial().parse(req.body);
      const updated = await storage.updateCompany(user.companyId, updates);
      
      if (!updated) {
        return res.status(404).json({ message: "Company not found" });
      }
      
      // Audit log
      await createAuditLog({
        action: 'company.update_profile',
        entityType: 'company',
        entityId: user.companyId,
        details: updates,
        context: getAuditContext(req),
      });
      
      res.json(updated);
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // ============================================================================
  // STORM SESSIONS API
  // ============================================================================

  // Create storm session (ADMIN or MANAGER only)
  app.post("/api/storm-sessions", requireAuth, requireAdminOrManager, async (req, res) => {
    try {
      const sessionData = insertStormSessionSchema.parse(req.body);
      
      // If setting this session as active, first deactivate all other sessions
      if (sessionData.isActive) {
        await storage.deactivateAllSessions();
      }
      
      const session = await storage.createStormSession(sessionData);
      
      // Audit log
      await createAuditLog({
        action: 'session.create',
        entityType: 'session',
        entityId: session.id,
        details: { name: session.name, status: session.status, isActive: session.isActive },
        context: getAuditContext(req),
      });
      
      res.json(session);
    } catch (error) {
      console.error('Create storm session error:', error);
      res.status(400).json({ message: "Invalid session data" });
    }
  });

  // List storm sessions
  app.get("/api/storm-sessions", requireAuth, async (req, res) => {
    try {
      const sessions = await storage.getAllStormSessions();
      res.json(sessions);
    } catch (error) {
      console.error('List storm sessions error:', error);
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  // Get single storm session
  app.get("/api/storm-sessions/:id", requireAuth, async (req, res) => {
    try {
      const session = await storage.getStormSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      res.json(session);
    } catch (error) {
      console.error('Get storm session error:', error);
      res.status(500).json({ message: "Failed to fetch session" });
    }
  });

  // Update storm session (ADMIN or MANAGER only)
  app.patch("/api/storm-sessions/:id", requireAuth, requireAdminOrManager, async (req, res) => {
    try {
      const updates = insertStormSessionSchema.partial().parse(req.body);
      const session = await storage.updateStormSession(req.params.id, updates);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      // Audit log
      await createAuditLog({
        action: 'session.update',
        entityType: 'session',
        entityId: session.id,
        details: updates,
        context: getAuditContext(req),
      });
      
      res.json(session);
    } catch (error) {
      console.error('Update storm session error:', error);
      res.status(400).json({ message: "Invalid session data" });
    }
  });

  // Close storm session (ADMIN or MANAGER only)
  app.post("/api/storm-sessions/:id/close", requireAuth, requireAdminOrManager, async (req, res) => {
    try {
      const session = await storage.closeStormSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      // Audit log
      await createAuditLog({
        action: 'session.close',
        entityType: 'session',
        entityId: session.id,
        context: getAuditContext(req),
      });
      
      res.json(session);
    } catch (error) {
      console.error('Close storm session error:', error);
      res.status(500).json({ message: "Failed to close session" });
    }
  });

  // Reopen storm session (ADMIN or MANAGER only)
  app.post("/api/storm-sessions/:id/reopen", requireAuth, requireAdminOrManager, async (req, res) => {
    try {
      const session = await storage.reopenStormSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      // Audit log
      await createAuditLog({
        action: 'session.reopen',
        entityType: 'session',
        entityId: session.id,
        context: getAuditContext(req),
      });
      
      res.json(session);
    } catch (error) {
      console.error('Reopen storm session error:', error);
      res.status(500).json({ message: "Failed to reopen session" });
    }
  });

  // Activate storm session (ADMIN or MANAGER only)
  app.post("/api/storm-sessions/:id/activate", requireAuth, requireAdminOrManager, async (req, res) => {
    try {
      const session = await storage.activateStormSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      // Audit log
      await createAuditLog({
        action: 'session.activate',
        entityType: 'session',
        entityId: session.id,
        context: getAuditContext(req),
      });
      
      res.json(session);
    } catch (error) {
      console.error('Activate storm session error:', error);
      res.status(500).json({ message: "Failed to activate session" });
    }
  });

  // Deactivate storm session (ADMIN or MANAGER only)
  app.post("/api/storm-sessions/:id/deactivate", requireAuth, requireAdminOrManager, async (req, res) => {
    try {
      const session = await storage.deactivateStormSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      // Audit log
      await createAuditLog({
        action: 'session.deactivate',
        entityType: 'session',
        entityId: session.id,
        context: getAuditContext(req),
      });
      
      res.json(session);
    } catch (error) {
      console.error('Deactivate storm session error:', error);
      res.status(500).json({ message: "Failed to deactivate session" });
    }
  });

  // Get active storm session
  app.get("/api/storm-sessions/active", requireAuth, async (req, res) => {
    try {
      const activeSession = await storage.getActiveStormSession();
      
      // Return null when no session is active (200 status, not 404)
      res.json({ activeSession: activeSession || null });
    } catch (error) {
      console.error('Get active storm session error:', error);
      res.status(500).json({ message: "Failed to fetch active session" });
    }
  });

  // Add contractor to session (ADMIN or MANAGER only)
  app.post("/api/storm-sessions/:id/contractors", requireAuth, requireAdminOrManager, async (req, res) => {
    try {
      const { contractorCompanyId } = req.body;
      
      if (!contractorCompanyId) {
        return res.status(400).json({ message: "contractorCompanyId is required" });
      }
      
      await storage.addContractorToSession(req.params.id, contractorCompanyId);
      
      // Audit log
      await createAuditLog({
        action: 'session.add_contractor',
        entityType: 'session',
        entityId: req.params.id,
        details: { contractorCompanyId },
        context: getAuditContext(req),
      });
      
      res.json({ message: "Contractor added to session successfully" });
    } catch (error) {
      console.error('Add contractor to session error:', error);
      res.status(500).json({ message: "Failed to add contractor to session" });
    }
  });

  // Remove contractor from session (ADMIN or MANAGER only)
  app.delete("/api/storm-sessions/:id/contractors/:contractorId", requireAuth, requireAdminOrManager, async (req, res) => {
    try {
      await storage.removeContractorFromSession(req.params.id, req.params.contractorId);
      
      // Audit log
      await createAuditLog({
        action: 'session.remove_contractor',
        entityType: 'session',
        entityId: req.params.id,
        details: { contractorCompanyId: req.params.contractorId },
        context: getAuditContext(req),
      });
      
      res.json({ message: "Contractor removed from session successfully" });
    } catch (error) {
      console.error('Remove contractor from session error:', error);
      res.status(500).json({ message: "Failed to remove contractor from session" });
    }
  });

  // ============================================================================
  // ROSTERS API
  // ============================================================================

  // Helper function to check roster company access based on RBAC rules
  async function ensureRosterCompanyAccess(
    user: { id: string; role: string; companyId: string | null },
    companyId: string
  ): Promise<{ allowed: boolean; message?: string }> {
    // ADMIN and MANAGER have full access
    if (user.role === 'ADMIN' || user.role === 'MANAGER') {
      return { allowed: true };
    }
    
    // CONTRACTOR can only access their own company
    if (user.role === 'CONTRACTOR') {
      if (!user.companyId) {
        return { allowed: false, message: "Company assignment required" };
      }
      if (user.companyId !== companyId) {
        return { allowed: false, message: "Cannot access roster for another company" };
      }
      return { allowed: true };
    }
    
    // UTILITY can only access companies they've been granted access to
    if (user.role === 'UTILITY') {
      const hasAccess = await storage.hasUtilityCompanyAccess(user.id, companyId);
      if (!hasAccess) {
        return { allowed: false, message: "Cannot access roster for this company" };
      }
      return { allowed: true };
    }
    
    return { allowed: false, message: "Access denied" };
  }

  // Create roster
  app.post("/api/rosters", requireAuth, async (req, res) => {
    try {
      const rosterData = insertRosterSchema.parse(req.body);
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureRosterCompanyAccess(req.authenticatedUser!, rosterData.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const roster = await storage.createRoster(rosterData);
      
      // Audit log
      await createAuditLog({
        action: 'roster.create',
        entityType: 'roster',
        entityId: roster.id,
        details: { sessionId: roster.sessionId, companyId: roster.companyId },
        context: getAuditContext(req),
      });
      
      res.json(roster);
    } catch (error) {
      console.error('Create roster error:', error);
      res.status(400).json({ message: "Invalid roster data" });
    }
  });

  // List rosters (filtered by session or company)
  app.get("/api/rosters", requireAuth, async (req, res) => {
    try {
      const { sessionId, companyId } = req.query;
      const user = req.authenticatedUser!;
      
      // For UTILITY users, fetch accessible companies once (performance optimization)
      let accessibleCompanyIds: Set<string> | null = null;
      if (user.role === 'UTILITY') {
        const companies = await storage.getUserAccessibleCompanies(user.id);
        accessibleCompanyIds = new Set(companies.map(c => c.id));
      }
      
      let rosters;
      if (sessionId) {
        // Fetch all rosters for the session
        const allRosters = await storage.getRostersBySession(sessionId as string);
        
        // ADMIN and MANAGER see all rosters
        if (user.role === 'ADMIN' || user.role === 'MANAGER') {
          rosters = allRosters;
        }
        // CONTRACTOR sees only their company's rosters
        else if (user.role === 'CONTRACTOR') {
          if (!user.companyId) {
            return res.status(403).json({ message: "Company assignment required" });
          }
          rosters = allRosters.filter(r => r.companyId === user.companyId);
        }
        // UTILITY sees only rosters for companies they have access to
        else if (user.role === 'UTILITY') {
          rosters = allRosters.filter(r => accessibleCompanyIds!.has(r.companyId));
        } else {
          return res.status(403).json({ message: "Access denied" });
        }
      } else if (companyId) {
        // Verify company access
        if (user.role === 'ADMIN' || user.role === 'MANAGER') {
          rosters = await storage.getRostersByCompany(companyId as string);
        } else if (user.role === 'CONTRACTOR') {
          if (user.companyId !== companyId) {
            return res.status(403).json({ message: "Cannot access rosters for another company" });
          }
          rosters = await storage.getRostersByCompany(companyId as string);
        } else if (user.role === 'UTILITY') {
          if (!accessibleCompanyIds!.has(companyId as string)) {
            return res.status(403).json({ message: "Cannot access rosters for this company" });
          }
          rosters = await storage.getRostersByCompany(companyId as string);
        } else {
          return res.status(403).json({ message: "Access denied" });
        }
      } else {
        return res.status(400).json({ message: "sessionId or companyId query parameter required" });
      }
      
      res.json(rosters);
    } catch (error) {
      console.error('List rosters error:', error);
      res.status(500).json({ message: "Failed to fetch rosters" });
    }
  });

  // Download roster import template
  app.get("/api/rosters/template", requireAuth, async (req, res) => {
    try {
      const xlsxModule = await import('xlsx');
      const XLSX = xlsxModule.default || xlsxModule;
      
      // Create workbook with two sheets: CREW and EQUIPMENTS
      const workbook = XLSX.utils.book_new();
      
      // CREW sheet headers matching the import parser's expected format
      const crewHeaders = [
        'CREW ID',
        'PERSONNEL ID',
        'FIRST NAME',
        'LAST NAME',
        'EMAIL',
        'CELL PHONE',
        'GENDER',
        'TEAM LEAD / GENERAL FOREMAN (Y/N)',
        'CREW LEAD / FOREMAN(Y/N)',
        'TEAM TYPE',
        'RESOURCE TYPE',
        'DEPARTURE CITY',
        'DEPARTURE STATE'
      ];
      
      // Sample data row for CREW
      const crewSampleData = [
        '001',
        'EMP-001',
        'John',
        'Smith',
        'john.smith@example.com',
        '555-123-4567',
        'M',
        'No',
        'Yes',
        'Line',
        'Lineman',
        'Atlanta',
        'GA'
      ];
      
      const crewData = [crewHeaders, crewSampleData];
      const crewSheet = XLSX.utils.aoa_to_sheet(crewData);
      
      // Set column widths for CREW sheet
      crewSheet['!cols'] = [
        { wch: 10 }, // CREW ID
        { wch: 12 }, // PERSONNEL ID
        { wch: 15 }, // FIRST NAME
        { wch: 15 }, // LAST NAME
        { wch: 25 }, // EMAIL
        { wch: 15 }, // CELL PHONE
        { wch: 8 },  // GENDER
        { wch: 35 }, // TEAM LEAD / GENERAL FOREMAN (Y/N)
        { wch: 25 }, // CREW LEAD / FOREMAN(Y/N)
        { wch: 12 }, // TEAM TYPE
        { wch: 15 }, // RESOURCE TYPE
        { wch: 15 }, // DEPARTURE CITY
        { wch: 15 }, // DEPARTURE STATE
      ];
      
      XLSX.utils.book_append_sheet(workbook, crewSheet, 'CREW');
      
      // EQUIPMENTS sheet headers matching the import parser's expected format
      const equipmentHeaders = [
        'EQUIPMENT ID',
        'EQUIPMENT TYPE',
        'EQUIPMENT DESCRIPTION',
        'EQUIPMENT FUEL TYPE',
        'ASSIGNED EQUIPMENT CREW ID'
      ];
      
      // Sample data row for EQUIPMENTS
      const equipmentSampleData = [
        'EQ-001',
        'Bucket Truck',
        'Ford F-550 Bucket Truck',
        'Diesel',
        '001'
      ];
      
      const equipmentData = [equipmentHeaders, equipmentSampleData];
      const equipmentSheet = XLSX.utils.aoa_to_sheet(equipmentData);
      
      // Set column widths for EQUIPMENTS sheet
      equipmentSheet['!cols'] = [
        { wch: 15 }, // EQUIPMENT ID
        { wch: 15 }, // EQUIPMENT TYPE
        { wch: 30 }, // EQUIPMENT DESCRIPTION
        { wch: 20 }, // EQUIPMENT FUEL TYPE
        { wch: 25 }, // ASSIGNED EQUIPMENT CREW ID
      ];
      
      XLSX.utils.book_append_sheet(workbook, equipmentSheet, 'EQUIPMENTS');
      
      // Generate buffer
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="roster-import-template.xlsx"');
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error('Generate template error:', error);
      res.status(500).json({ message: "Failed to generate template" });
    }
  });

  // Export all rosters for a session (combined into one Excel file)
  app.get("/api/rosters/export-all", requireAuth, async (req, res) => {
    try {
      const { sessionId } = req.query;
      if (!sessionId) {
        return res.status(400).json({ message: "sessionId query parameter required" });
      }

      const user = req.authenticatedUser!;
      
      // Get all rosters for the session
      const allRosters = await storage.getRostersBySession(sessionId as string);
      
      // Filter based on user role and company access
      let rosters;
      if (user.role === 'ADMIN' || user.role === 'MANAGER') {
        rosters = allRosters;
      } else if (user.role === 'CONTRACTOR') {
        if (!user.companyId) {
          return res.status(403).json({ message: "Company assignment required" });
        }
        rosters = allRosters.filter(r => r.companyId === user.companyId);
      } else if (user.role === 'UTILITY') {
        const companies = await storage.getUserAccessibleCompanies(user.id);
        const accessibleCompanyIds = new Set(companies.map(c => c.id));
        rosters = allRosters.filter(r => accessibleCompanyIds.has(r.companyId));
      } else {
        return res.status(403).json({ message: "Access denied" });
      }

      if (rosters.length === 0) {
        return res.status(404).json({ message: "No rosters found" });
      }

      const allData: any[] = [];
      
      for (const roster of rosters) {
        const company = await storage.getCompany(roster.companyId);
        const crews = await storage.getCrewsByRoster(roster.id);
        const personnel = await storage.getRosterPersonnel(roster.id);
        const equipment = await storage.getRosterEquipment(roster.id);

        const companyName = company?.name || '';

        for (const crew of crews) {
          const crewPersonnel = personnel.filter(p => p.crewId === crew.id).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          const crewEquipment = equipment.filter(e => e.crewId === crew.id).sort((a, b) => (a.equipmentId || '').localeCompare(b.equipmentId || ''));
          const maxLen = Math.max(crewPersonnel.length, crewEquipment.length);

          for (let i = 0; i < maxLen; i++) {
            const person = crewPersonnel[i];
            const equip = crewEquipment[i];
            allData.push({
              'COMPANY NAME': companyName,
              'CREW NUMBER': crew.crewName,
              'PERSONNEL ID': person?.personnelId || '',
              'FIRST NAME': person?.firstName || '',
              'LAST NAME': person?.lastName || '',
              'EMAIL': person?.email || '',
              'CELL PHONE': person?.phone || '',
              'GENDER': person?.gender || '',
              'TEAM LEAD / GENERAL FOREMAN (Y/N)': person?.teamLead || '',
              'CREW LEAD / FOREMAN(Y/N)': person?.crewLeadFlag || '',
              'TEAM TYPE': person?.role || '',
              'RESOURCE TYPE': person?.classification || '',
              'DEPARTURE CITY': person?.departureCity || '',
              'DEPARTURE STATE': person?.departureState || '',
              'EQUIPMENT ID': equip?.equipmentId || '',
              'EQUIPMENT TYPE': equip?.equipmentType || '',
              'EQUIPMENT DESCRIPTION': equip?.equipmentDescription || '',
              'EQUIPMENT FUEL TYPE': equip?.fuel || '',
              'ASSIGNED EQUIPMENT CREW ID': equip?.assignedCrewId || '',
            });
          }
        }

        const unassignedPersonnel = personnel.filter(p => !p.crewId || !crews.some(c => c.id === p.crewId));
        const unassignedEquipment = equipment.filter(e => !e.crewId || !crews.some(c => c.id === e.crewId));
        const unassignedMax = Math.max(unassignedPersonnel.length, unassignedEquipment.length);
        for (let i = 0; i < unassignedMax; i++) {
          const person = unassignedPersonnel[i];
          const equip = unassignedEquipment[i];
          allData.push({
            'COMPANY NAME': companyName,
            'CREW NUMBER': '',
            'PERSONNEL ID': person?.personnelId || '',
            'FIRST NAME': person?.firstName || '',
            'LAST NAME': person?.lastName || '',
            'EMAIL': person?.email || '',
            'CELL PHONE': person?.phone || '',
            'GENDER': person?.gender || '',
            'TEAM LEAD / GENERAL FOREMAN (Y/N)': person?.teamLead || '',
            'CREW LEAD / FOREMAN(Y/N)': person?.crewLeadFlag || '',
            'TEAM TYPE': person?.role || '',
            'RESOURCE TYPE': person?.classification || '',
            'DEPARTURE CITY': person?.departureCity || '',
            'DEPARTURE STATE': person?.departureState || '',
            'EQUIPMENT ID': equip?.equipmentId || '',
            'EQUIPMENT TYPE': equip?.equipmentType || '',
            'EQUIPMENT DESCRIPTION': equip?.equipmentDescription || '',
            'EQUIPMENT FUEL TYPE': equip?.fuel || '',
            'ASSIGNED EQUIPMENT CREW ID': equip?.assignedCrewId || '',
          });
        }
      }

      // Use XLSX to create workbook
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(allData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Rosters');
      
      // Write to buffer
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="all-rosters.xlsx"`);
      res.send(buffer);
    } catch (error) {
      console.error('Export all rosters error:', error);
      res.status(500).json({ message: "Failed to export rosters" });
    }
  });

  // Full session export - roster data with timesheet hours and ticket assignments
  app.get("/api/reports/:sessionId/full-export", requireAuth, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const user = req.authenticatedUser!;

      const allRosters = await storage.getRostersBySession(sessionId);
      let filteredRosters;
      if (user.role === 'ADMIN' || user.role === 'MANAGER') {
        filteredRosters = allRosters;
      } else if (user.role === 'CONTRACTOR') {
        if (!user.companyId) return res.status(403).json({ message: "Company assignment required" });
        filteredRosters = allRosters.filter(r => r.companyId === user.companyId);
      } else if (user.role === 'UTILITY') {
        const accessibleCompanies = await storage.getUserAccessibleCompanies(user.id);
        const ids = new Set(accessibleCompanies.map(c => c.id));
        filteredRosters = allRosters.filter(r => ids.has(r.companyId));
      } else {
        return res.status(403).json({ message: "Access denied" });
      }

      if (filteredRosters.length === 0) {
        return res.status(404).json({ message: "No rosters found for this session" });
      }

      const allSessionTimesheets = await storage.getTimesheetsBySession(sessionId);
      const sessionTimesheets = allSessionTimesheets;
      const approvedTimesheets = allSessionTimesheets.filter(t => t.status === 'APPROVED');

      const personnelHoursByRosterId = new Map<string, number>();
      const personnelHoursByCrewName = new Map<string, number>();
      const personnelHoursByCompanyName = new Map<string, number>();

      const equipmentHoursByRosterId = new Map<string, number>();
      const equipmentHoursByCrewNum = new Map<string, number>();
      const equipmentHoursByCompanyNum = new Map<string, number>();
      const equipmentHoursByCrewDescNum = new Map<string, number>();

      const normalizeName = (name: string) => name.replace(/\s+/g, ' ').trim().toLowerCase();

      for (const ts of approvedTimesheets) {
        const personnel = await storage.getTimesheetPersonnel(ts.id);
        for (const p of personnel) {
          const hours = p.totalHours || 0;
          if (p.rosterPersonnelId) {
            personnelHoursByRosterId.set(p.rosterPersonnelId, (personnelHoursByRosterId.get(p.rosterPersonnelId) || 0) + hours);
          }
          const name = normalizeName(p.employeeName || '');
          if (ts.crewId && name) {
            const crewKey = `${ts.crewId}::${name}`;
            personnelHoursByCrewName.set(crewKey, (personnelHoursByCrewName.get(crewKey) || 0) + hours);
          }
          if (name) {
            const compKey = `${ts.companyId}::${name}`;
            personnelHoursByCompanyName.set(compKey, (personnelHoursByCompanyName.get(compKey) || 0) + hours);
          }
        }
        const equipment = await storage.getTimesheetEquipment(ts.id);
        for (const e of equipment) {
          const hours = e.totalHours || 0;
          if (e.rosterEquipmentId) {
            equipmentHoursByRosterId.set(e.rosterEquipmentId, (equipmentHoursByRosterId.get(e.rosterEquipmentId) || 0) + hours);
          }
          const num = normalizeName(e.equipmentNumber || '');
          const desc = normalizeName(e.equipmentDescription || '');
          if (num) {
            if (ts.crewId) {
              const crewKey = `${ts.crewId}::${num}`;
              equipmentHoursByCrewNum.set(crewKey, (equipmentHoursByCrewNum.get(crewKey) || 0) + hours);
            }
            const compKey = `${ts.companyId}::${num}`;
            equipmentHoursByCompanyNum.set(compKey, (equipmentHoursByCompanyNum.get(compKey) || 0) + hours);
          }
          if (ts.crewId && desc && num) {
            const crewDescKey = `${ts.crewId}::${desc}::${num}`;
            equipmentHoursByCrewDescNum.set(crewDescKey, (equipmentHoursByCrewDescNum.get(crewDescKey) || 0) + hours);
          }
        }
      }

      const sessionTickets = await storage.getTicketsBySession(sessionId);
      const crewTicketMap = new Map<string, { count: number; refs: string[]; statuses: string[] }>();
      for (const ticket of sessionTickets) {
        const assignments = await storage.getTicketAssignments(ticket.id);
        for (const assignment of assignments) {
          if (!crewTicketMap.has(assignment.crewId)) {
            crewTicketMap.set(assignment.crewId, { count: 0, refs: [], statuses: [] });
          }
          const entry = crewTicketMap.get(assignment.crewId)!;
          entry.count++;
          entry.refs.push(ticket.externalRef || ticket.title || ticket.id.slice(0, 8));
          if (!entry.statuses.includes(ticket.status)) entry.statuses.push(ticket.status);
        }
      }

      const rows: any[] = [];

      for (const roster of filteredRosters) {
        const company = await storage.getCompany(roster.companyId);
        const crews = await storage.getCrewsByRoster(roster.id);
        const allPersonnel = await storage.getRosterPersonnel(roster.id);
        const allEquipment = await storage.getRosterEquipment(roster.id);
        const companyName = company?.name || '';

        const processCrewData = (crewId: string | null, crewName: string) => {
          const crewPersonnel = allPersonnel.filter(p => crewId ? p.crewId === crewId : (!p.crewId || !crews.some(c => c.id === p.crewId)));
          const crewEquipment = allEquipment.filter(e => crewId ? e.crewId === crewId : (!e.crewId || !crews.some(c => c.id === e.crewId)));
          const ticketInfo = crewId ? crewTicketMap.get(crewId) : null;
          const maxLen = Math.max(crewPersonnel.length, crewEquipment.length, 1);

          for (let i = 0; i < maxLen; i++) {
            const person = crewPersonnel[i];
            const equip = crewEquipment[i];

            rows.push({
              'Crew ID': crewName,
              'Personnel ID': person?.personnelId || '',
              'Last Name': person?.lastName || '',
              'First Name': person?.firstName || '',
              'Email': person?.email || '',
              'Cell Phone': person?.phone || '',
              'Gender': person?.gender || '',
              'Team Lead / General Foreman (Y/N)': person?.teamLead || '',
              'Crew Lead / Foreman(Y/N)': person?.crewLeadFlag || '',
              'Team Type': person?.role || '',
              'Resource Type': person?.classification || '',
              'Departure City': person?.departureCity || '',
              'Departure State': person?.departureState || '',
              'Equipment ID': equip?.equipmentId || '',
              'Equipment Type': equip?.equipmentType || '',
              'Equipment Description': equip?.equipmentDescription || '',
              'Equipment Fuel Type': equip?.fuel || '',
              'Assigned Equipment Crew ID': equip?.assignedCrewId || '',
              'Company (Required)': companyName,
              'Personnel_Classification (Required)': person?.classification || '',
              'Equipment (Required)': equip?.type || equip?.equipmentDescription || '',
              'Personnel Total Hours': (() => {
                if (!person) return '';
                if (person.id && personnelHoursByRosterId.has(person.id)) {
                  return personnelHoursByRosterId.get(person.id)!.toFixed(2);
                }
                const name = normalizeName(person.name || `${person.firstName || ''} ${person.lastName || ''}`.trim());
                if (crewId && name && personnelHoursByCrewName.has(`${crewId}::${name}`)) {
                  return personnelHoursByCrewName.get(`${crewId}::${name}`)!.toFixed(2);
                }
                if (name && personnelHoursByCompanyName.has(`${roster.companyId}::${name}`)) {
                  return personnelHoursByCompanyName.get(`${roster.companyId}::${name}`)!.toFixed(2);
                }
                return '0.00';
              })(),
              'Equipment Total Hours': (() => {
                if (!equip) return '';
                if (equip.id && equipmentHoursByRosterId.has(equip.id)) {
                  return equipmentHoursByRosterId.get(equip.id)!.toFixed(2);
                }
                const equipNum = normalizeName(equip.equipmentId || '');
                const equipDesc = normalizeName(equip.equipmentDescription || equip.type || '');
                if (equipNum) {
                  if (crewId && equipmentHoursByCrewNum.has(`${crewId}::${equipNum}`)) {
                    return equipmentHoursByCrewNum.get(`${crewId}::${equipNum}`)!.toFixed(2);
                  }
                  if (equipmentHoursByCompanyNum.has(`${roster.companyId}::${equipNum}`)) {
                    return equipmentHoursByCompanyNum.get(`${roster.companyId}::${equipNum}`)!.toFixed(2);
                  }
                }
                if (crewId && equipDesc && equipNum) {
                  const crewDescKey = `${crewId}::${equipDesc}::${equipNum}`;
                  if (equipmentHoursByCrewDescNum.has(crewDescKey)) {
                    return equipmentHoursByCrewDescNum.get(crewDescKey)!.toFixed(2);
                  }
                }
                return '0.00';
              })(),
              'Timesheet Status': i === 0 ? (() => {
                const crewTimesheets = sessionTimesheets.filter(t => t.companyId === roster.companyId && t.crewId === crewId);
                if (crewTimesheets.length === 0) return 'No Timesheets';
                const statuses = [...new Set(crewTimesheets.map(t => t.status))];
                const statusLabels: Record<string, string> = { DRAFT: 'Draft', SUBMITTED: 'Waiting Approval', APPROVED: 'Approved', REJECTED: 'Rejected', SIGNED: 'Signed' };
                return statuses.map(s => statusLabels[s] || s).join(', ');
              })() : '',
              'Tickets Assigned': i === 0 ? (ticketInfo?.count || 0) : '',
              'Ticket References': i === 0 ? (ticketInfo?.refs?.join('; ') || '') : '',
              'Ticket Statuses': i === 0 ? (ticketInfo?.statuses?.join('; ') || '') : '',
            });
          }
        };

        for (const crew of crews) {
          processCrewData(crew.id, crew.crewName);
        }

        const hasUnassigned = allPersonnel.some(p => !p.crewId || !crews.some(c => c.id === p.crewId)) ||
                             allEquipment.some(e => !e.crewId || !crews.some(c => c.id === e.crewId));
        if (hasUnassigned) {
          processCrewData(null, 'UNASSIGNED');
        }
      }

      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Full Export');

      const session = await storage.getStormSession(sessionId);
      const sessionName = session?.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Session';
      const buffer = XLSX.write(workbook, { bookType: 'csv', type: 'buffer' });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${sessionName}_Full_Export.csv"`);
      res.send(buffer);
    } catch (error) {
      console.error('Full export error:', error);
      res.status(500).json({ message: "Failed to generate full export" });
    }
  });

  // Export single roster
  app.get("/api/rosters/:id/export", requireAuth, async (req, res) => {
    try {
      const roster = await storage.getRoster(req.params.id);
      
      if (!roster) {
        return res.status(404).json({ message: "Roster not found" });
      }

      // Verify company access
      const accessCheck = await ensureRosterCompanyAccess(req.authenticatedUser!, roster.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }

      // Fetch roster data
      const crews = await storage.getCrewsByRoster(roster.id);
      const personnel = await storage.getRosterPersonnel(roster.id);
      const equipment = await storage.getRosterEquipment(roster.id);
      const company = await storage.getCompany(roster.companyId);

      const exportData: any[] = [];
      const companyName = company?.name || '';

      for (const crew of crews) {
        const crewPersonnel = personnel.filter(p => p.crewId === crew.id).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        const crewEquipment = equipment.filter(e => e.crewId === crew.id).sort((a, b) => (a.equipmentId || '').localeCompare(b.equipmentId || ''));
        const maxLen = Math.max(crewPersonnel.length, crewEquipment.length);

        for (let i = 0; i < maxLen; i++) {
          const person = crewPersonnel[i];
          const equip = crewEquipment[i];
          exportData.push({
            'COMPANY NAME': companyName,
            'CREW NUMBER': crew.crewName,
            'PERSONNEL ID': person?.personnelId || '',
            'FIRST NAME': person?.firstName || '',
            'LAST NAME': person?.lastName || '',
            'EMAIL': person?.email || '',
            'CELL PHONE': person?.phone || '',
            'GENDER': person?.gender || '',
            'TEAM LEAD / GENERAL FOREMAN (Y/N)': person?.teamLead || '',
            'CREW LEAD / FOREMAN(Y/N)': person?.crewLeadFlag || '',
            'TEAM TYPE': person?.role || '',
            'RESOURCE TYPE': person?.classification || '',
            'DEPARTURE CITY': person?.departureCity || '',
            'DEPARTURE STATE': person?.departureState || '',
            'EQUIPMENT ID': equip?.equipmentId || '',
            'EQUIPMENT TYPE': equip?.equipmentType || '',
            'EQUIPMENT DESCRIPTION': equip?.equipmentDescription || '',
            'EQUIPMENT FUEL TYPE': equip?.fuel || '',
            'ASSIGNED EQUIPMENT CREW ID': equip?.assignedCrewId || '',
          });
        }
      }

      const unassignedPersonnel = personnel.filter(p => !p.crewId || !crews.some(c => c.id === p.crewId));
      const unassignedEquipment = equipment.filter(e => !e.crewId || !crews.some(c => c.id === e.crewId));
      const unassignedMax = Math.max(unassignedPersonnel.length, unassignedEquipment.length);
      for (let i = 0; i < unassignedMax; i++) {
        const person = unassignedPersonnel[i];
        const equip = unassignedEquipment[i];
        exportData.push({
          'COMPANY NAME': companyName,
          'CREW NUMBER': '',
          'PERSONNEL ID': person?.personnelId || '',
          'FIRST NAME': person?.firstName || '',
          'LAST NAME': person?.lastName || '',
          'EMAIL': person?.email || '',
          'CELL PHONE': person?.phone || '',
          'GENDER': person?.gender || '',
          'TEAM LEAD / GENERAL FOREMAN (Y/N)': person?.teamLead || '',
          'CREW LEAD / FOREMAN(Y/N)': person?.crewLeadFlag || '',
          'TEAM TYPE': person?.role || '',
          'RESOURCE TYPE': person?.classification || '',
          'DEPARTURE CITY': person?.departureCity || '',
          'DEPARTURE STATE': person?.departureState || '',
          'EQUIPMENT ID': equip?.equipmentId || '',
          'EQUIPMENT TYPE': equip?.equipmentType || '',
          'EQUIPMENT DESCRIPTION': equip?.equipmentDescription || '',
          'EQUIPMENT FUEL TYPE': equip?.fuel || '',
          'ASSIGNED EQUIPMENT CREW ID': equip?.assignedCrewId || '',
        });
      }

      // Use XLSX to create workbook
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Roster');
      
      // Write to buffer
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="roster-${roster.id}.xlsx"`);
      res.send(buffer);
    } catch (error) {
      console.error('Export roster error:', error);
      res.status(500).json({ message: "Failed to export roster" });
    }
  });

  // Get single roster
  app.get("/api/rosters/:id", requireAuth, async (req, res) => {
    try {
      const roster = await storage.getRoster(req.params.id);
      
      if (!roster) {
        return res.status(404).json({ message: "Roster not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureRosterCompanyAccess(req.authenticatedUser!, roster.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      res.json(roster);
    } catch (error) {
      console.error('Get roster error:', error);
      res.status(500).json({ message: "Failed to fetch roster" });
    }
  });

  // Update roster
  app.patch("/api/rosters/:id", requireAuth, async (req, res) => {
    try {
      const roster = await storage.getRoster(req.params.id);
      
      if (!roster) {
        return res.status(404).json({ message: "Roster not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureRosterCompanyAccess(req.authenticatedUser!, roster.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const updates = insertRosterSchema.partial().parse(req.body);
      const updated = await storage.updateRoster(req.params.id, updates);
      
      // Audit log
      await createAuditLog({
        action: 'roster.update',
        entityType: 'roster',
        entityId: req.params.id,
        details: updates,
        context: getAuditContext(req),
      });
      
      res.json(updated);
    } catch (error) {
      console.error('Update roster error:', error);
      res.status(400).json({ message: "Invalid roster data" });
    }
  });

  // Delete roster
  app.delete("/api/rosters/:id", requireAuth, async (req, res) => {
    try {
      const roster = await storage.getRoster(req.params.id);
      
      if (!roster) {
        return res.status(404).json({ message: "Roster not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureRosterCompanyAccess(req.authenticatedUser!, roster.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      await storage.deleteRoster(req.params.id);
      
      // Audit log
      await createAuditLog({
        action: 'roster.delete',
        entityType: 'roster',
        entityId: req.params.id,
        context: getAuditContext(req),
      });
      
      res.json({ message: "Roster deleted successfully" });
    } catch (error) {
      console.error('Delete roster error:', error);
      res.status(500).json({ message: "Failed to delete roster" });
    }
  });

  // Create crew
  app.post("/api/rosters/:rosterId/crews", requireAuth, async (req, res) => {
    try {
      const roster = await storage.getRoster(req.params.rosterId);
      
      if (!roster) {
        return res.status(404).json({ message: "Roster not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureRosterCompanyAccess(req.authenticatedUser!, roster.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const crewData = insertCrewSchema.parse({ ...req.body, rosterId: req.params.rosterId });
      const crew = await storage.createCrew(crewData);
      
      // Audit log
      await createAuditLog({
        action: 'crew.create',
        entityType: 'crew',
        entityId: crew.id,
        details: { rosterId: roster.id, crewName: crew.crewName },
        context: getAuditContext(req),
      });
      
      res.json(crew);
    } catch (error) {
      console.error('Create crew error:', error);
      res.status(400).json({ message: "Invalid crew data" });
    }
  });

  // List crews for a roster
  app.get("/api/rosters/:rosterId/crews", requireAuth, async (req, res) => {
    try {
      const roster = await storage.getRoster(req.params.rosterId);
      
      if (!roster) {
        return res.status(404).json({ message: "Roster not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureRosterCompanyAccess(req.authenticatedUser!, roster.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const crews = await storage.getCrewsByRoster(req.params.rosterId);
      res.json(crews);
    } catch (error) {
      console.error('List crews error:', error);
      res.status(500).json({ message: "Failed to fetch crews" });
    }
  });

  // Add personnel to roster
  app.post("/api/rosters/:rosterId/personnel", requireAuth, async (req, res) => {
    try {
      const roster = await storage.getRoster(req.params.rosterId);
      
      if (!roster) {
        return res.status(404).json({ message: "Roster not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureRosterCompanyAccess(req.authenticatedUser!, roster.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const personnelData = insertRosterPersonnelSchema.parse({ ...req.body, rosterId: req.params.rosterId });
      const personnel = await storage.addRosterPersonnel(personnelData);
      
      // Audit log
      await createAuditLog({
        action: 'roster_personnel.create',
        entityType: 'roster_personnel',
        entityId: personnel.id,
        details: { rosterId: roster.id, name: personnel.name, role: personnel.role },
        context: getAuditContext(req),
      });
      
      res.json(personnel);
    } catch (error) {
      console.error('Add personnel error:', error);
      res.status(400).json({ message: "Invalid personnel data" });
    }
  });

  // List personnel for a roster
  app.get("/api/rosters/:rosterId/personnel", requireAuth, async (req, res) => {
    try {
      const roster = await storage.getRoster(req.params.rosterId);
      
      if (!roster) {
        return res.status(404).json({ message: "Roster not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureRosterCompanyAccess(req.authenticatedUser!, roster.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const personnel = await storage.getRosterPersonnel(req.params.rosterId);
      res.json(personnel);
    } catch (error) {
      console.error('List personnel error:', error);
      res.status(500).json({ message: "Failed to fetch personnel" });
    }
  });

  // Add equipment to roster
  app.post("/api/rosters/:rosterId/equipment", requireAuth, async (req, res) => {
    try {
      const roster = await storage.getRoster(req.params.rosterId);
      
      if (!roster) {
        return res.status(404).json({ message: "Roster not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureRosterCompanyAccess(req.authenticatedUser!, roster.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const equipmentData = insertRosterEquipmentSchema.parse({ ...req.body, rosterId: req.params.rosterId });
      const equipment = await storage.addRosterEquipment(equipmentData);
      
      // Audit log
      await createAuditLog({
        action: 'roster_equipment.create',
        entityType: 'roster_equipment',
        entityId: equipment.id,
        details: { rosterId: roster.id, type: equipment.type },
        context: getAuditContext(req),
      });
      
      res.json(equipment);
    } catch (error) {
      console.error('Add equipment error:', error);
      res.status(400).json({ message: "Invalid equipment data" });
    }
  });

  // List equipment for a roster
  app.get("/api/rosters/:rosterId/equipment", requireAuth, async (req, res) => {
    try {
      const roster = await storage.getRoster(req.params.rosterId);
      
      if (!roster) {
        return res.status(404).json({ message: "Roster not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureRosterCompanyAccess(req.authenticatedUser!, roster.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const equipment = await storage.getRosterEquipment(req.params.rosterId);
      res.json(equipment);
    } catch (error) {
      console.error('List equipment error:', error);
      res.status(500).json({ message: "Failed to fetch equipment" });
    }
  });

  // Update crew
  app.patch("/api/crews/:id", requireAuth, async (req, res) => {
    try {
      const crew = await storage.getCrew(req.params.id);
      
      if (!crew) {
        return res.status(404).json({ message: "Crew not found" });
      }
      
      // Fetch roster to verify company access
      const roster = await storage.getRoster(crew.rosterId);
      if (!roster) {
        return res.status(404).json({ message: "Roster not found" });
      }
      
      // Verify company access
      if (req.authenticatedUser?.role !== 'UTILITY' && req.authenticatedUser?.companyId !== roster.companyId) {
        return res.status(403).json({ message: "Cannot update crew for another company's roster" });
      }
      
      const updates = insertCrewSchema.partial().parse(req.body);
      const updated = await storage.updateCrew(req.params.id, updates);
      
      // Audit log
      await createAuditLog({
        action: 'crew.update',
        entityType: 'crew',
        entityId: req.params.id,
        details: updates,
        context: getAuditContext(req),
      });
      
      res.json(updated);
    } catch (error) {
      console.error('Update crew error:', error);
      res.status(400).json({ message: "Invalid crew data" });
    }
  });

  // Delete crew
  app.delete("/api/crews/:id", requireAuth, async (req, res) => {
    try {
      const crew = await storage.getCrew(req.params.id);
      
      if (!crew) {
        return res.status(404).json({ message: "Crew not found" });
      }
      
      // Fetch roster to verify company access
      const roster = await storage.getRoster(crew.rosterId);
      if (!roster) {
        return res.status(404).json({ message: "Roster not found" });
      }
      
      // Verify company access
      if (req.authenticatedUser?.role !== 'UTILITY' && req.authenticatedUser?.companyId !== roster.companyId) {
        return res.status(403).json({ message: "Cannot delete crew for another company's roster" });
      }
      
      await storage.deleteCrew(req.params.id);
      
      // Audit log
      await createAuditLog({
        action: 'crew.delete',
        entityType: 'crew',
        entityId: req.params.id,
        context: getAuditContext(req),
      });
      
      res.json({ message: "Crew deleted successfully" });
    } catch (error) {
      console.error('Delete crew error:', error);
      res.status(500).json({ message: "Failed to delete crew" });
    }
  });

  // Import roster from Excel file
  app.post("/api/rosters/import-excel", requireAuth, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { sessionId, companyId } = req.body;
      if (!sessionId || !companyId) {
        return res.status(400).json({ message: "sessionId and companyId are required" });
      }

      // Verify company access (ADMIN, MANAGER, and UTILITY can import for any company)
      if (req.authenticatedUser?.role !== 'ADMIN' && req.authenticatedUser?.role !== 'MANAGER' && req.authenticatedUser?.role !== 'UTILITY' && req.authenticatedUser?.companyId !== companyId) {
        return res.status(403).json({ message: "Cannot import roster for another company" });
      }

      // Parse Excel file
      const xlsxModule = await import('xlsx');
      const XLSX = xlsxModule.default || xlsxModule;
      const workbook = XLSX.readFile(req.file.path);
      
      // Parse CREW sheet
      const crewSheet = workbook.Sheets['CREW'];
      if (!crewSheet) {
        return res.status(400).json({ message: "CREW sheet not found in Excel file" });
      }
      const crewData = XLSX.utils.sheet_to_json(crewSheet, { header: 1 }) as any[][];
      
      // Parse EQUIPMENTS sheet
      const equipSheet = workbook.Sheets['EQUIPMENTS'];
      const equipData = equipSheet ? XLSX.utils.sheet_to_json(equipSheet, { header: 1 }) as any[][] : [];

      // Create roster
      const roster = await storage.createRoster({
        sessionId,
        companyId,
        status: 'DRAFT',
      });

      // Process crew data - use header row to find columns dynamically
      const crewHeaders = crewData[0] || [];
      const crewMap = new Map(); // Map crew ID to crew record
      
      // Create a map of header names to column indices
      const headerMap: Record<string, number> = {};
      crewHeaders.forEach((header, index) => {
        const normalizedHeader = (header || '').toString().trim().toUpperCase();
        headerMap[normalizedHeader] = index;
      });
      
      // Log headers for debugging
      console.log('CREW sheet headers:', crewHeaders);
      console.log('Header map:', headerMap);
      
      for (let i = 1; i < crewData.length; i++) {
        const row = crewData[i];
        if (!row) continue; // Skip empty rows

        // Extract data using exact header names from template
        const crewId = (row[headerMap['CREW ID']] || '').toString().trim();
        if (!crewId) continue; // Skip if no crew ID

        const personnelId = (row[headerMap['PERSONNEL ID']] || '').toString().trim();
        const lastName = (row[headerMap['LAST NAME']] || '').toString().trim();
        const firstName = (row[headerMap['FIRST NAME']] || '').toString().trim();
        const name = `${firstName} ${lastName}`.trim() || personnelId || crewId;
        const email = (row[headerMap['EMAIL']] || '').toString().trim();
        const phone = (row[headerMap['CELL PHONE']] || '').toString().trim();
        const gender = (row[headerMap['GENDER']] || '').toString().trim();
        const teamLead = (row[headerMap['TEAM LEAD / GENERAL FOREMAN (Y/N)']] || 'No').toString().trim();
        const crewLead = (row[headerMap['CREW LEAD / FOREMAN(Y/N)']] || 'No').toString().trim();
        const role = (row[headerMap['TEAM TYPE']] || '').toString().trim();
        const classification = (row[headerMap['RESOURCE TYPE']] || '').toString().trim();
        const departureCity = (row[headerMap['DEPARTURE CITY']] || '').toString().trim();
        const departureState = (row[headerMap['DEPARTURE STATE']] || '').toString().trim();
        const workArea = `${departureCity}, ${departureState}`.trim().replace(/^,\s*|,\s*$/g, '');

        // Create or get crew
        if (!crewMap.has(crewId)) {
          const crew = await storage.createCrew({
            rosterId: roster.id,
            crewName: crewId,
            crewLead: crewLead === 'Yes' || crewLead === 'YES' ? name : undefined,
            workArea: workArea,
          });
          crewMap.set(crewId, crew);
        }

        const crew = crewMap.get(crewId);

        // Create personnel with all captured data
        await storage.addRosterPersonnel({
          rosterId: roster.id,
          crewId: crew.id,
          personnelId: personnelId,
          firstName: firstName,
          lastName: lastName,
          name: name,
          role: role,
          classification: classification,
          rateCode: '', // Not in template
          gender: gender,
          stOtPtEligibility: '', // Not in template
          email: email,
          phone: phone,
          teamLead: teamLead,
          crewLeadFlag: crewLead,
          departureCity: departureCity,
          departureState: departureState,
          notes: '',
        });
      }

      // Process equipment data - use header row to find columns dynamically
      if (equipData.length > 1) {
        const equipHeaders = equipData[0] || [];
        
        // Create a map of header names to column indices
        const equipHeaderMap: Record<string, number> = {};
        equipHeaders.forEach((header, index) => {
          const normalizedHeader = (header || '').toString().trim().toUpperCase();
          equipHeaderMap[normalizedHeader] = index;
        });
        
        // Log headers for debugging
        console.log('EQUIPMENTS sheet headers:', equipHeaders);
        console.log('Equipment header map:', equipHeaderMap);
        
        for (let i = 1; i < equipData.length; i++) {
          const row = equipData[i];
          if (!row) continue; // Skip empty rows

          // Extract data using exact header names from template
          const equipmentId = (row[equipHeaderMap['EQUIPMENT ID']] || '').toString().trim();
          if (!equipmentId) continue; // Skip if no equipment ID

          const equipmentType = (row[equipHeaderMap['EQUIPMENT TYPE']] || '').toString().trim();
          const equipmentDescription = (row[equipHeaderMap['EQUIPMENT DESCRIPTION']] || '').toString().trim();
          const fuelType = (row[equipHeaderMap['EQUIPMENT FUEL TYPE']] || '').toString().trim();
          const assignedCrewId = (row[equipHeaderMap['ASSIGNED EQUIPMENT CREW ID']] || '').toString().trim();

          const crew = crewMap.get(assignedCrewId);
          
          await storage.addRosterEquipment({
            rosterId: roster.id,
            crewId: crew?.id,
            equipmentId: equipmentId,
            equipmentType: equipmentType,
            equipmentDescription: equipmentDescription,
            type: equipmentDescription || equipmentType, // For backward compatibility
            classification: equipmentType, // For backward compatibility
            rateCode: '', // Not in template
            ownership: '', // Not in template
            fuel: fuelType,
            assignedCrewId: assignedCrewId,
            notes: '',
          });
        }
      }

      // Clean up uploaded file
      await fs.unlink(req.file.path).catch(() => {});

      // Audit log
      await createAuditLog({
        action: 'roster.import',
        entityType: 'roster',
        entityId: roster.id,
        details: { 
          sessionId, 
          companyId, 
          crewCount: crewMap.size,
          fileName: req.file.originalname 
        },
        context: getAuditContext(req),
      });

      res.json({ 
        message: "Roster imported successfully",
        roster,
        crewCount: crewMap.size 
      });
    } catch (error) {
      console.error('Import roster error:', error);
      res.status(500).json({ message: "Failed to import roster", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Update personnel
  app.patch("/api/personnel/:id", requireAuth, async (req, res) => {
    try {
      // Get the personnel to find the rosterId
      const personnelList = await db.select().from(rosterPersonnel).where(eq(rosterPersonnel.id, req.params.id));
      const personnel = personnelList[0];
      
      if (!personnel) {
        return res.status(404).json({ message: "Personnel not found" });
      }
      
      // Fetch roster to verify company access
      const roster = await storage.getRoster(personnel.rosterId);
      if (!roster) {
        return res.status(404).json({ message: "Roster not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureRosterCompanyAccess(req.authenticatedUser!, roster.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const updates = insertRosterPersonnelSchema.partial().parse(req.body);
      const updated = await storage.updateRosterPersonnel(req.params.id, updates);
      
      // Audit log
      await createAuditLog({
        action: 'roster_personnel.update',
        entityType: 'roster_personnel',
        entityId: req.params.id,
        details: updates,
        context: getAuditContext(req),
      });
      
      res.json(updated);
    } catch (error) {
      console.error('Update personnel error:', error);
      res.status(400).json({ message: "Invalid personnel data" });
    }
  });

  // Delete personnel
  app.delete("/api/personnel/:id", requireAuth, async (req, res) => {
    try {
      // Get the personnel to find the rosterId
      const personnelList = await db.select().from(rosterPersonnel).where(eq(rosterPersonnel.id, req.params.id));
      const personnel = personnelList[0];
      
      if (!personnel) {
        return res.status(404).json({ message: "Personnel not found" });
      }
      
      // Fetch roster to verify company access
      const roster = await storage.getRoster(personnel.rosterId);
      if (!roster) {
        return res.status(404).json({ message: "Roster not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureRosterCompanyAccess(req.authenticatedUser!, roster.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      await storage.removeRosterPersonnel(req.params.id);
      
      // Audit log
      await createAuditLog({
        action: 'roster_personnel.delete',
        entityType: 'roster_personnel',
        entityId: req.params.id,
        context: getAuditContext(req),
      });
      
      res.json({ message: "Personnel deleted successfully" });
    } catch (error) {
      console.error('Delete personnel error:', error);
      res.status(500).json({ message: "Failed to delete personnel" });
    }
  });

  // Update equipment
  app.patch("/api/equipment/:id", requireAuth, async (req, res) => {
    try {
      // Get the equipment to find the rosterId
      const equipmentList = await db.select().from(rosterEquipment).where(eq(rosterEquipment.id, req.params.id));
      const equipment = equipmentList[0];
      
      if (!equipment) {
        return res.status(404).json({ message: "Equipment not found" });
      }
      
      // Fetch roster to verify company access
      const roster = await storage.getRoster(equipment.rosterId);
      if (!roster) {
        return res.status(404).json({ message: "Roster not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureRosterCompanyAccess(req.authenticatedUser!, roster.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const updates = insertRosterEquipmentSchema.partial().parse(req.body);
      const updated = await storage.updateRosterEquipment(req.params.id, updates);
      
      // Audit log
      await createAuditLog({
        action: 'roster_equipment.update',
        entityType: 'roster_equipment',
        entityId: req.params.id,
        details: updates,
        context: getAuditContext(req),
      });
      
      res.json(updated);
    } catch (error) {
      console.error('Update equipment error:', error);
      res.status(400).json({ message: "Invalid equipment data" });
    }
  });

  // Delete equipment
  app.delete("/api/equipment/:id", requireAuth, async (req, res) => {
    try {
      // Get the equipment to find the rosterId
      const equipmentList = await db.select().from(rosterEquipment).where(eq(rosterEquipment.id, req.params.id));
      const equipment = equipmentList[0];
      
      if (!equipment) {
        return res.status(404).json({ message: "Equipment not found" });
      }
      
      // Fetch roster to verify company access
      const roster = await storage.getRoster(equipment.rosterId);
      if (!roster) {
        return res.status(404).json({ message: "Roster not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureRosterCompanyAccess(req.authenticatedUser!, roster.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      await storage.removeRosterEquipment(req.params.id);
      
      // Audit log
      await createAuditLog({
        action: 'roster_equipment.delete',
        entityType: 'roster_equipment',
        entityId: req.params.id,
        context: getAuditContext(req),
      });
      
      res.json({ message: "Equipment deleted successfully" });
    } catch (error) {
      console.error('Delete equipment error:', error);
      res.status(500).json({ message: "Failed to delete equipment" });
    }
  });

  // ============================================================================
  // TIMESHEETS API
  // ============================================================================

  // Helper function to check timesheet company access based on RBAC rules
  async function ensureTimesheetCompanyAccess(
    user: { id: string; role: string; companyId: string | null },
    companyId: string
  ): Promise<{ allowed: boolean; message?: string }> {
    if (user.role === 'ADMIN' || user.role === 'MANAGER') {
      return { allowed: true };
    }
    if (user.role === 'CONTRACTOR') {
      if (!user.companyId) {
        return { allowed: false, message: "Company assignment required" };
      }
      if (user.companyId !== companyId) {
        return { allowed: false, message: "Cannot access timesheet for another company" };
      }
      return { allowed: true };
    }
    if (user.role === 'UTILITY') {
      const hasAccess = await storage.hasUtilityCompanyAccess(user.id, companyId);
      if (!hasAccess) {
        return { allowed: false, message: "Cannot access timesheet for this company" };
      }
      return { allowed: true };
    }
    return { allowed: false, message: "Access denied" };
  }

  // Create timesheet from roster (auto-populate personnel and equipment)
  app.post("/api/timesheets/from-roster", requireAuth, async (req, res) => {
    try {
      const { rosterId, crewId, date, startTime, stopTime, ...additionalData } = req.body;
      
      if (!rosterId || !crewId || !date) {
        return res.status(400).json({ message: "rosterId, crewId, and date are required" });
      }

      // Calculate total hours from start/stop time
      let totalHours = 0;
      let workSegment = null;
      if (startTime && stopTime) {
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [stopHour, stopMin] = stopTime.split(':').map(Number);
        const startMinutes = startHour * 60 + startMin;
        let stopMinutes = stopHour * 60 + stopMin;
        
        // Handle overnight shifts (if stop < start, add 24 hours)
        if (stopMinutes < startMinutes) {
          stopMinutes += 24 * 60;
        }
        
        totalHours = (stopMinutes - startMinutes) / 60;
        
        // Create work segment for personnel  
        workSegment = {
          activityType: 'S', // Standby - general work hours without specific ticket
          startTime,
          endTime: stopTime,
        };
      }

      // Fetch the roster to get session and company info
      const roster = await storage.getRoster(rosterId);
      if (!roster) {
        return res.status(404).json({ message: "Roster not found" });
      }

      // Verify company access
      const accessCheck = await ensureTimesheetCompanyAccess(req.authenticatedUser!, roster.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }

      // Fetch crew info
      const crew = await storage.getCrew(crewId);
      if (!crew) {
        return res.status(404).json({ message: "Crew not found" });
      }

      // Fetch session info for auto-populate
      const session = await storage.getStormSession(roster.sessionId);

      // Get roster personnel to find the foreman
      const rosterPersonnelList = await storage.getRosterPersonnel(rosterId);
      const crewPersonnel = rosterPersonnelList.filter(p => p.crewId === crewId);
      
      // Find the foreman from roster personnel (look for "foreman" in role or classification)
      const foremanPerson = crewPersonnel.find(p => {
        const descriptor = `${p.role ?? ''} ${p.classification ?? ''}`.toLowerCase();
        return descriptor.includes('foreman');
      });
      
      // Set crew foreman name (person's name, not crew name)
      const crewForemanName = foremanPerson?.name ?? '';
      
      // Set crew ID number (crew name like "Crew-003", not the UUID)
      const crewIdNumber = crew.crewName || '';

      // Create the timesheet header with auto-populated fields
      const timesheet = await storage.createTimesheet({
        sessionId: roster.sessionId,
        companyId: roster.companyId,
        crewId: crewId,
        date: new Date(date),
        crewForeman: crewForemanName,
        crewIdNumber: crewIdNumber,
        projectName: session?.name || '',
        utilityName: session?.client || '',
        jobLocations: session?.location || '',
        locationAreaAssigned: '', // Don't auto-fill unless explicitly in session data
        status: 'DRAFT',
        ...additionalData,
      });
      for (const person of crewPersonnel) {
        await storage.addTimesheetPersonnel({
          timesheetId: timesheet.id,
          employeeName: person.name,
          classification: person.classification || person.role || 'Worker',
          segments: workSegment ? [workSegment] : [],
          startTime: startTime || null,
          endTime: stopTime || null,
          totalHours: totalHours,
          mealsProvidedByUtility: 0,
          perDiemMeals: 0,
        });
      }

      // Auto-populate equipment from roster
      const rosterEquipment = await storage.getRosterEquipment(rosterId);
      const crewEquipment = rosterEquipment.filter(e => e.crewId === crewId);
      for (const equip of crewEquipment) {
        await storage.addTimesheetEquipment({
          timesheetId: timesheet.id,
          equipmentDescription: equip.type || 'Equipment',
          equipmentNumber: equip.equipmentId || null,
          startTime: startTime || null,
          endTime: stopTime || null,
          totalHours: totalHours,
        });
      }

      // Audit log
      await createAuditLog({
        action: 'timesheet.create_from_roster',
        entityType: 'timesheet',
        entityId: timesheet.id,
        details: { 
          rosterId, 
          crewId, 
          sessionId: timesheet.sessionId, 
          companyId: timesheet.companyId, 
          date: timesheet.date,
          personnelCount: crewPersonnel.length,
          equipmentCount: crewEquipment.length,
        },
        context: getAuditContext(req),
      });
      
      res.json(timesheet);
    } catch (error) {
      console.error('Create timesheet from roster error:', error);
      res.status(400).json({ message: "Failed to create timesheet from roster" });
    }
  });

  // Create timesheet (manual)
  app.post("/api/timesheets", requireAuth, async (req, res) => {
    try {
      const timesheetData = insertTimesheetSchema.parse(req.body);
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureTimesheetCompanyAccess(req.authenticatedUser!, timesheetData.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const timesheet = await storage.createTimesheet(timesheetData);
      
      // Audit log
      await createAuditLog({
        action: 'timesheet.create',
        entityType: 'timesheet',
        entityId: timesheet.id,
        details: { sessionId: timesheet.sessionId, companyId: timesheet.companyId, date: timesheet.date },
        context: getAuditContext(req),
      });
      
      res.json(timesheet);
    } catch (error) {
      console.error('Create timesheet error:', error);
      res.status(400).json({ message: "Invalid timesheet data" });
    }
  });

  // List timesheets (filtered by session or company)
  app.get("/api/timesheets", requireAuth, async (req, res) => {
    try {
      const { sessionId, companyId } = req.query;
      const user = req.authenticatedUser!;
      
      // For UTILITY users, fetch accessible companies once (performance optimization)
      let accessibleCompanyIds: Set<string> | null = null;
      if (user.role === 'UTILITY') {
        const companies = await storage.getUserAccessibleCompanies(user.id);
        accessibleCompanyIds = new Set(companies.map(c => c.id));
      }
      
      let timesheets;
      if (sessionId) {
        const allTimesheets = await storage.getTimesheetsBySession(sessionId as string);
        
        if (user.role === 'ADMIN' || user.role === 'MANAGER') {
          timesheets = allTimesheets;
        } else if (user.role === 'CONTRACTOR') {
          if (!user.companyId) {
            return res.status(403).json({ message: "Company assignment required" });
          }
          timesheets = allTimesheets.filter(t => t.companyId === user.companyId);
        } else if (user.role === 'UTILITY') {
          timesheets = allTimesheets.filter(t => accessibleCompanyIds!.has(t.companyId));
        } else {
          return res.status(403).json({ message: "Access denied" });
        }
      } else if (companyId) {
        if (user.role === 'MANAGER') {
          timesheets = await storage.getTimesheetsByCompany(companyId as string);
        } else if (user.role === 'CONTRACTOR') {
          if (user.companyId !== companyId) {
            return res.status(403).json({ message: "Cannot access timesheets for another company" });
          }
          timesheets = await storage.getTimesheetsByCompany(companyId as string);
        } else if (user.role === 'UTILITY') {
          if (!accessibleCompanyIds!.has(companyId as string)) {
            return res.status(403).json({ message: "Cannot access timesheets for this company" });
          }
          timesheets = await storage.getTimesheetsByCompany(companyId as string);
        } else {
          return res.status(403).json({ message: "Access denied" });
        }
      } else {
        return res.status(400).json({ message: "sessionId or companyId query parameter required" });
      }
      
      res.json(timesheets);
    } catch (error) {
      console.error('List timesheets error:', error);
      res.status(500).json({ message: "Failed to fetch timesheets" });
    }
  });

  // Get single timesheet
  app.get("/api/timesheets/:id", requireAuth, async (req, res) => {
    try {
      const timesheet = await storage.getTimesheet(req.params.id);
      
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureTimesheetCompanyAccess(req.authenticatedUser!, timesheet.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      res.json(timesheet);
    } catch (error) {
      console.error('Get timesheet error:', error);
      res.status(500).json({ message: "Failed to fetch timesheet" });
    }
  });

  // Update timesheet
  app.patch("/api/timesheets/:id", requireAuth, async (req, res) => {
    try {
      const timesheet = await storage.getTimesheet(req.params.id);
      
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureTimesheetCompanyAccess(req.authenticatedUser!, timesheet.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const updates = insertTimesheetSchema.partial().parse(req.body);
      
      // Prevent direct manipulation of workflow fields
      const forbiddenFields = ['status', 'submittedBy', 'approvedBy', 'utilitySignedBy'];
      const attemptedForbiddenFields = forbiddenFields.filter(field => updates.hasOwnProperty(field));
      
      if (attemptedForbiddenFields.length > 0) {
        return res.status(400).json({ 
          message: `Cannot directly update workflow fields: ${attemptedForbiddenFields.join(', ')}. Use submit/approve endpoints instead.`
        });
      }
      
      const updated = await storage.updateTimesheet(req.params.id, updates);
      
      // Audit log
      await createAuditLog({
        action: 'timesheet.update',
        entityType: 'timesheet',
        entityId: req.params.id,
        details: updates,
        context: getAuditContext(req),
      });
      
      res.json(updated);
    } catch (error) {
      console.error('Update timesheet error:', error);
      res.status(400).json({ message: "Invalid timesheet data" });
    }
  });

  // Submit timesheet
  app.post("/api/timesheets/:id/submit", requireAuth, async (req, res) => {
    try {
      const timesheet = await storage.getTimesheet(req.params.id);
      
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureTimesheetCompanyAccess(req.authenticatedUser!, timesheet.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      // Verify status transition (only DRAFT can be submitted)
      if (timesheet.status !== 'DRAFT') {
        return res.status(400).json({ 
          message: `Cannot submit timesheet with status ${timesheet.status}. Only DRAFT timesheets can be submitted.`
        });
      }
      
      const submitted = await storage.submitTimesheet(req.params.id, req.authenticatedUser!.id);
      
      // Audit log
      await createAuditLog({
        action: 'timesheet.submit',
        entityType: 'timesheet',
        entityId: req.params.id,
        context: getAuditContext(req),
      });
      
      res.json(submitted);
    } catch (error) {
      console.error('Submit timesheet error:', error);
      res.status(500).json({ message: "Failed to submit timesheet" });
    }
  });

  // Approve timesheet (MANAGER or UTILITY only)
  app.post("/api/timesheets/:id/approve", requireAuth, requireManagerOrUtility, async (req, res) => {
    try {
      const timesheet = await storage.getTimesheet(req.params.id);
      
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      // Verify status transition (only SUBMITTED can be approved)
      if (timesheet.status !== 'SUBMITTED') {
        return res.status(400).json({ 
          message: `Cannot approve timesheet with status ${timesheet.status}. Only SUBMITTED timesheets can be approved.`
        });
      }
      
      const approved = await storage.approveTimesheet(req.params.id, req.authenticatedUser!.id);
      
      // Audit log
      await createAuditLog({
        action: 'timesheet.approve',
        entityType: 'timesheet',
        entityId: req.params.id,
        context: getAuditContext(req),
      });
      
      res.json(approved);
    } catch (error) {
      console.error('Approve timesheet error:', error);
      res.status(500).json({ message: "Failed to approve timesheet" });
    }
  });

  // Reject timesheet (MANAGER or UTILITY only)
  app.post("/api/timesheets/:id/reject", requireAuth, requireManagerOrUtility, async (req, res) => {
    try {
      const timesheet = await storage.getTimesheet(req.params.id);
      
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      if (timesheet.status !== 'SUBMITTED') {
        return res.status(400).json({ 
          message: `Cannot reject timesheet with status ${timesheet.status}. Only SUBMITTED timesheets can be rejected.`
        });
      }
      
      const { reason } = req.body;
      if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
        return res.status(400).json({ message: "A rejection reason is required." });
      }
      
      const rejected = await storage.rejectTimesheet(req.params.id, req.authenticatedUser!.id, reason.trim());
      
      await createAuditLog({
        action: 'timesheet.reject',
        entityType: 'timesheet',
        entityId: req.params.id,
        context: getAuditContext(req),
      });
      
      res.json(rejected);
    } catch (error) {
      console.error('Reject timesheet error:', error);
      res.status(500).json({ message: "Failed to reject timesheet" });
    }
  });

  // Delete timesheet
  app.delete("/api/timesheets/:id", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const timesheet = await storage.getTimesheet(req.params.id);
      
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      await storage.deleteTimesheet(req.params.id);
      
      // Audit log
      await createAuditLog({
        action: 'timesheet.delete',
        entityType: 'timesheet',
        entityId: req.params.id,
        details: { 
          companyId: timesheet.companyId,
          sessionId: timesheet.sessionId,
          date: timesheet.date
        },
        context: getAuditContext(req),
      });
      
      res.json({ message: "Timesheet deleted successfully" });
    } catch (error) {
      console.error('Delete timesheet error:', error);
      res.status(500).json({ message: "Failed to delete timesheet" });
    }
  });

  // Add timesheet line
  app.post("/api/timesheets/:timesheetId/lines", requireAuth, async (req, res) => {
    try {
      const timesheet = await storage.getTimesheet(req.params.timesheetId);
      
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureTimesheetCompanyAccess(req.authenticatedUser!, timesheet.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const lineData = insertTimesheetLineSchema.parse({ ...req.body, timesheetId: req.params.timesheetId });
      const line = await storage.addTimesheetLine(lineData);
      
      // Audit log
      await createAuditLog({
        action: 'timesheet_line.create',
        entityType: 'timesheet_line',
        entityId: line.id,
        details: { timesheetId: timesheet.id, subjectType: line.subjectType },
        context: getAuditContext(req),
      });
      
      res.json(line);
    } catch (error) {
      console.error('Add timesheet line error:', error);
      res.status(400).json({ message: "Invalid timesheet line data" });
    }
  });

  // List timesheet lines
  app.get("/api/timesheets/:timesheetId/lines", requireAuth, async (req, res) => {
    try {
      const timesheet = await storage.getTimesheet(req.params.timesheetId);
      
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureTimesheetCompanyAccess(req.authenticatedUser!, timesheet.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const lines = await storage.getTimesheetLines(req.params.timesheetId);
      res.json(lines);
    } catch (error) {
      console.error('List timesheet lines error:', error);
      res.status(500).json({ message: "Failed to fetch timesheet lines" });
    }
  });

  // Update timesheet line
  app.patch("/api/timesheet-lines/:id", requireAuth, async (req, res) => {
    try {
      // Get the line to find the timesheetId
      const linesList = await db.select().from(timesheetLines).where(eq(timesheetLines.id, req.params.id));
      const line = linesList[0];
      
      if (!line) {
        return res.status(404).json({ message: "Timesheet line not found" });
      }
      
      // Fetch timesheet to verify company access
      const timesheet = await storage.getTimesheet(line.timesheetId);
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      // Verify company access
      if (req.authenticatedUser?.role !== 'UTILITY' && req.authenticatedUser?.companyId !== timesheet.companyId) {
        return res.status(403).json({ message: "Cannot update line for timesheet from another company" });
      }
      
      const updates = insertTimesheetLineSchema.partial().parse(req.body);
      const updated = await storage.updateTimesheetLine(req.params.id, updates);
      
      // Audit log
      await createAuditLog({
        action: 'timesheet_line.update',
        entityType: 'timesheet_line',
        entityId: req.params.id,
        details: updates,
        context: getAuditContext(req),
      });
      
      res.json(updated);
    } catch (error) {
      console.error('Update timesheet line error:', error);
      res.status(400).json({ message: "Invalid timesheet line data" });
    }
  });

  // Delete timesheet line
  app.delete("/api/timesheet-lines/:id", requireAuth, async (req, res) => {
    try {
      // Get the line to find the timesheetId
      const linesList = await db.select().from(timesheetLines).where(eq(timesheetLines.id, req.params.id));
      const line = linesList[0];
      
      if (!line) {
        return res.status(404).json({ message: "Timesheet line not found" });
      }
      
      // Fetch timesheet to verify company access
      const timesheet = await storage.getTimesheet(line.timesheetId);
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      // Verify company access
      if (req.authenticatedUser?.role !== 'UTILITY' && req.authenticatedUser?.companyId !== timesheet.companyId) {
        return res.status(403).json({ message: "Cannot delete line from timesheet of another company" });
      }
      
      await storage.removeTimesheetLine(req.params.id);
      
      // Audit log
      await createAuditLog({
        action: 'timesheet_line.delete',
        entityType: 'timesheet_line',
        entityId: req.params.id,
        context: getAuditContext(req),
      });
      
      res.json({ message: "Timesheet line deleted successfully" });
    } catch (error) {
      console.error('Delete timesheet line error:', error);
      res.status(500).json({ message: "Failed to delete timesheet line" });
    }
  });

  // ============================================================================
  // TIMESHEET PERSONNEL API
  // ============================================================================

  // Get timesheet personnel
  app.get("/api/timesheets/:timesheetId/personnel", requireAuth, async (req, res) => {
    try {
      const { timesheetId } = req.params;
      
      // Get the timesheet to check company access
      const timesheet = await storage.getTimesheet(timesheetId);
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      // Verify company access
      const accessCheck = await ensureTimesheetCompanyAccess(req.authenticatedUser!, timesheet.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const personnel = await storage.getTimesheetPersonnel(timesheetId);
      res.json(personnel);
    } catch (error) {
      console.error('Get timesheet personnel error:', error);
      res.status(500).json({ message: "Failed to retrieve timesheet personnel" });
    }
  });

  // Add timesheet personnel
  app.post("/api/timesheets/:timesheetId/personnel", requireAuth, async (req, res) => {
    try {
      const { timesheetId } = req.params;
      
      // Get the timesheet to check company access
      const timesheet = await storage.getTimesheet(timesheetId);
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      // Verify company access
      const accessCheck = await ensureTimesheetCompanyAccess(req.authenticatedUser!, timesheet.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const personnelData = { ...req.body, timesheetId };
      const personnel = await storage.addTimesheetPersonnel(personnelData);
      
      await createAuditLog({
        action: 'timesheet_personnel.create',
        entityType: 'timesheet_personnel',
        entityId: personnel.id,
        details: { timesheetId, employeeName: personnel.employeeName },
        context: getAuditContext(req),
      });
      
      res.json(personnel);
    } catch (error) {
      console.error('Add timesheet personnel error:', error);
      res.status(400).json({ message: "Invalid personnel data" });
    }
  });

  // Update timesheet personnel
  app.patch("/api/timesheets/:timesheetId/personnel/:id", requireAuth, async (req, res) => {
    try {
      const { id, timesheetId } = req.params;
      
      // Get the timesheet to check company access
      const timesheet = await storage.getTimesheet(timesheetId);
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      // Verify company access
      const accessCheck = await ensureTimesheetCompanyAccess(req.authenticatedUser!, timesheet.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const updated = await storage.updateTimesheetPersonnel(id, req.body);
      if (!updated) {
        return res.status(404).json({ message: "Personnel not found" });
      }
      
      await createAuditLog({
        action: 'timesheet_personnel.update',
        entityType: 'timesheet_personnel',
        entityId: id,
        details: { timesheetId },
        context: getAuditContext(req),
      });
      
      res.json(updated);
    } catch (error) {
      console.error('Update timesheet personnel error:', error);
      res.status(400).json({ message: "Failed to update personnel" });
    }
  });

  // Delete timesheet personnel
  app.delete("/api/timesheets/:timesheetId/personnel/:id", requireAuth, async (req, res) => {
    try {
      const { id, timesheetId } = req.params;
      
      // Get the timesheet to check company access
      const timesheet = await storage.getTimesheet(timesheetId);
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      // Verify company access
      const accessCheck = await ensureTimesheetCompanyAccess(req.authenticatedUser!, timesheet.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      await storage.removeTimesheetPersonnel(id);
      
      await createAuditLog({
        action: 'timesheet_personnel.delete',
        entityType: 'timesheet_personnel',
        entityId: id,
        details: { timesheetId },
        context: getAuditContext(req),
      });
      
      res.json({ message: "Personnel deleted successfully" });
    } catch (error) {
      console.error('Delete timesheet personnel error:', error);
      res.status(500).json({ message: "Failed to delete personnel" });
    }
  });

  // ============================================================================
  // TIMESHEET EQUIPMENT API
  // ============================================================================

  // Get timesheet equipment
  app.get("/api/timesheets/:timesheetId/equipment", requireAuth, async (req, res) => {
    try {
      const { timesheetId } = req.params;
      
      // Get the timesheet to check company access
      const timesheet = await storage.getTimesheet(timesheetId);
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      // Verify company access
      const accessCheck = await ensureTimesheetCompanyAccess(req.authenticatedUser!, timesheet.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const equipment = await storage.getTimesheetEquipment(timesheetId);
      res.json(equipment);
    } catch (error) {
      console.error('Get timesheet equipment error:', error);
      res.status(500).json({ message: "Failed to retrieve timesheet equipment" });
    }
  });

  // Add timesheet equipment
  app.post("/api/timesheets/:timesheetId/equipment", requireAuth, async (req, res) => {
    try {
      const { timesheetId } = req.params;
      
      // Get the timesheet to check company access
      const timesheet = await storage.getTimesheet(timesheetId);
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      // Verify company access
      const accessCheck = await ensureTimesheetCompanyAccess(req.authenticatedUser!, timesheet.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const equipmentData = { ...req.body, timesheetId };
      const equipment = await storage.addTimesheetEquipment(equipmentData);
      
      await createAuditLog({
        action: 'timesheet_equipment.create',
        entityType: 'timesheet_equipment',
        entityId: equipment.id,
        details: { timesheetId, equipmentDescription: equipment.equipmentDescription },
        context: getAuditContext(req),
      });
      
      res.json(equipment);
    } catch (error) {
      console.error('Add timesheet equipment error:', error);
      res.status(400).json({ message: "Invalid equipment data" });
    }
  });

  // Update timesheet equipment
  app.patch("/api/timesheets/:timesheetId/equipment/:id", requireAuth, async (req, res) => {
    try {
      const { id, timesheetId } = req.params;
      
      // Get the timesheet to check company access
      const timesheet = await storage.getTimesheet(timesheetId);
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      // Verify company access
      const accessCheck = await ensureTimesheetCompanyAccess(req.authenticatedUser!, timesheet.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const updated = await storage.updateTimesheetEquipment(id, req.body);
      if (!updated) {
        return res.status(404).json({ message: "Equipment not found" });
      }
      
      await createAuditLog({
        action: 'timesheet_equipment.update',
        entityType: 'timesheet_equipment',
        entityId: id,
        details: { timesheetId },
        context: getAuditContext(req),
      });
      
      res.json(updated);
    } catch (error) {
      console.error('Update timesheet equipment error:', error);
      res.status(400).json({ message: "Failed to update equipment" });
    }
  });

  // Delete timesheet equipment
  app.delete("/api/timesheets/:timesheetId/equipment/:id", requireAuth, async (req, res) => {
    try {
      const { id, timesheetId } = req.params;
      
      // Get the timesheet to check company access
      const timesheet = await storage.getTimesheet(timesheetId);
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      // Verify company access
      const accessCheck = await ensureTimesheetCompanyAccess(req.authenticatedUser!, timesheet.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      await storage.removeTimesheetEquipment(id);
      
      await createAuditLog({
        action: 'timesheet_equipment.delete',
        entityType: 'timesheet_equipment',
        entityId: id,
        details: { timesheetId },
        context: getAuditContext(req),
      });
      
      res.json({ message: "Equipment deleted successfully" });
    } catch (error) {
      console.error('Delete timesheet equipment error:', error);
      res.status(500).json({ message: "Failed to delete equipment" });
    }
  });

  // ============================================================================
  // EXPENSES API
  // ============================================================================

  // Helper function to check expense company access based on RBAC rules
  async function ensureExpenseCompanyAccess(
    user: { id: string; role: string; companyId: string | null },
    companyId: string
  ): Promise<{ allowed: boolean; message?: string }> {
    if (user.role === 'ADMIN') {
      return { allowed: false, message: "Access denied. This endpoint is not available for your role." };
    }
    if (user.role === 'MANAGER') {
      return { allowed: true };
    }
    if (user.role === 'CONTRACTOR') {
      if (!user.companyId) {
        return { allowed: false, message: "Company assignment required" };
      }
      if (user.companyId !== companyId) {
        return { allowed: false, message: "Cannot access expense for another company" };
      }
      return { allowed: true };
    }
    if (user.role === 'UTILITY') {
      const hasAccess = await storage.hasUtilityCompanyAccess(user.id, companyId);
      if (!hasAccess) {
        return { allowed: false, message: "Cannot access expense for this company" };
      }
      return { allowed: true };
    }
    return { allowed: false, message: "Access denied" };
  }

  // Initialize Object Storage Service
  const objectStorage = new ObjectStorageService();

  // Create expense
  app.post("/api/expenses", requireAuth, async (req, res) => {
    try {
      const expenseData = insertExpenseSchema.parse(req.body);
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureExpenseCompanyAccess(req.authenticatedUser!, expenseData.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      // Set submittedBy to current user
      const expense = await storage.createExpense({
        ...expenseData,
        submittedBy: req.authenticatedUser!.id,
      });
      
      // Audit log
      await createAuditLog({
        action: 'expense.create',
        entityType: 'expense',
        entityId: expense.id,
        details: { sessionId: expense.sessionId, companyId: expense.companyId, category: expense.category, amountCents: expense.amountCents },
        context: getAuditContext(req),
      });
      
      res.json(expense);
    } catch (error) {
      console.error('Create expense error:', error);
      res.status(400).json({ message: "Invalid expense data" });
    }
  });

  // List expenses (filtered by session or company)
  app.get("/api/expenses", requireAuth, async (req, res) => {
    try {
      const { sessionId, companyId } = req.query;
      const user = req.authenticatedUser!;
      
      // ADMIN should not access this endpoint
      if (user.role === 'ADMIN') {
        return res.status(403).json({ 
          message: "Access denied. This endpoint is not available for your role." 
        });
      }
      
      // For UTILITY users, fetch accessible companies once
      let accessibleCompanyIds: Set<string> | null = null;
      if (user.role === 'UTILITY') {
        const companies = await storage.getUserAccessibleCompanies(user.id);
        accessibleCompanyIds = new Set(companies.map(c => c.id));
      }
      
      let expenses;
      if (sessionId) {
        const allExpenses = await storage.getExpensesBySession(sessionId as string);
        
        if (user.role === 'MANAGER') {
          expenses = allExpenses;
        } else if (user.role === 'CONTRACTOR') {
          if (!user.companyId) {
            return res.status(403).json({ message: "Company assignment required" });
          }
          expenses = allExpenses.filter(e => e.companyId === user.companyId);
        } else if (user.role === 'UTILITY') {
          expenses = allExpenses.filter(e => accessibleCompanyIds!.has(e.companyId));
        } else {
          return res.status(403).json({ message: "Access denied" });
        }
      } else if (companyId) {
        if (user.role === 'MANAGER') {
          expenses = await storage.getExpensesByCompany(companyId as string);
        } else if (user.role === 'CONTRACTOR') {
          if (user.companyId !== companyId) {
            return res.status(403).json({ message: "Cannot access expenses for another company" });
          }
          expenses = await storage.getExpensesByCompany(companyId as string);
        } else if (user.role === 'UTILITY') {
          if (!accessibleCompanyIds!.has(companyId as string)) {
            return res.status(403).json({ message: "Cannot access expenses for this company" });
          }
          expenses = await storage.getExpensesByCompany(companyId as string);
        } else {
          return res.status(403).json({ message: "Access denied" });
        }
      } else {
        return res.status(400).json({ message: "sessionId or companyId query parameter required" });
      }
      
      res.json(expenses);
    } catch (error) {
      console.error('List expenses error:', error);
      res.status(500).json({ message: "Failed to fetch expenses" });
    }
  });

  // Get single expense
  app.get("/api/expenses/:id", requireAuth, async (req, res) => {
    try {
      const expense = await storage.getExpense(req.params.id);
      
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureExpenseCompanyAccess(req.authenticatedUser!, expense.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      res.json(expense);
    } catch (error) {
      console.error('Get expense error:', error);
      res.status(500).json({ message: "Failed to fetch expense" });
    }
  });

  // Update expense
  app.patch("/api/expenses/:id", requireAuth, async (req, res) => {
    try {
      const expense = await storage.getExpense(req.params.id);
      
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureExpenseCompanyAccess(req.authenticatedUser!, expense.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const updates = insertExpenseSchema.partial().parse(req.body);
      
      // Prevent direct manipulation of workflow fields
      const forbiddenFields = ['status', 'submittedBy', 'approvedBy'];
      const attemptedForbiddenFields = forbiddenFields.filter(field => updates.hasOwnProperty(field));
      
      if (attemptedForbiddenFields.length > 0) {
        return res.status(400).json({ 
          message: `Cannot directly update workflow fields: ${attemptedForbiddenFields.join(', ')}. Use approve/reject endpoints instead.`
        });
      }

      if (updates.companyId && updates.companyId !== expense.companyId) {
        const newAccessCheck = await ensureExpenseCompanyAccess(req.authenticatedUser!, updates.companyId);
        if (!newAccessCheck.allowed) {
          return res.status(403).json({ message: newAccessCheck.message });
        }
      }
      
      const updated = await storage.updateExpense(req.params.id, updates);
      
      // Audit log
      await createAuditLog({
        action: 'expense.update',
        entityType: 'expense',
        entityId: req.params.id,
        details: updates,
        context: getAuditContext(req),
      });
      
      res.json(updated);
    } catch (error) {
      console.error('Update expense error:', error);
      res.status(400).json({ message: "Invalid expense data" });
    }
  });

  // Approve expense (MANAGER or UTILITY only)
  app.post("/api/expenses/:id/approve", requireAuth, requireManager, async (req, res) => {
    try {
      const expense = await storage.getExpense(req.params.id);
      
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }
      
      // Verify status transition (only SUBMITTED can be approved)
      if (expense.status !== 'SUBMITTED') {
        return res.status(400).json({ 
          message: `Cannot approve expense with status ${expense.status}. Only SUBMITTED expenses can be approved.`
        });
      }
      
      const approved = await storage.approveExpense(req.params.id, req.authenticatedUser!.id);
      
      // Audit log
      await createAuditLog({
        action: 'expense.approve',
        entityType: 'expense',
        entityId: req.params.id,
        context: getAuditContext(req),
      });
      
      res.json(approved);
    } catch (error) {
      console.error('Approve expense error:', error);
      res.status(500).json({ message: "Failed to approve expense" });
    }
  });

  // Reject expense (MANAGER or UTILITY only)
  app.post("/api/expenses/:id/reject", requireAuth, requireManager, async (req, res) => {
    try {
      const expense = await storage.getExpense(req.params.id);
      
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }
      
      // Verify status transition (only SUBMITTED can be rejected)
      if (expense.status !== 'SUBMITTED') {
        return res.status(400).json({ 
          message: `Cannot reject expense with status ${expense.status}. Only SUBMITTED expenses can be rejected.`
        });
      }
      
      const rejected = await storage.rejectExpense(req.params.id, req.authenticatedUser!.id);
      
      // Audit log
      await createAuditLog({
        action: 'expense.reject',
        entityType: 'expense',
        entityId: req.params.id,
        context: getAuditContext(req),
      });
      
      res.json(rejected);
    } catch (error) {
      console.error('Reject expense error:', error);
      res.status(500).json({ message: "Failed to reject expense" });
    }
  });

  // Delete expense
  app.delete("/api/expenses/:id", requireAuth, async (req, res) => {
    try {
      const expense = await storage.getExpense(req.params.id);
      
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureExpenseCompanyAccess(req.authenticatedUser!, expense.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      await storage.deleteExpense(req.params.id);
      
      // Audit log
      await createAuditLog({
        action: 'expense.delete',
        entityType: 'expense',
        entityId: req.params.id,
        context: getAuditContext(req),
      });
      
      res.json({ message: "Expense deleted successfully" });
    } catch (error) {
      console.error('Delete expense error:', error);
      res.status(500).json({ message: "Failed to delete expense" });
    }
  });

  // Upload expense receipt file
  app.post("/api/expenses/:expenseId/files", requireAuth, receiptUpload.single('file'), async (req, res) => {
    try {
      const expense = await storage.getExpense(req.params.expenseId);
      
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureExpenseCompanyAccess(req.authenticatedUser!, expense.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: "No file provided" });
      }
      
      // Generate unique file key
      const fileId = randomUUID();
      const ext = path.extname(req.file.originalname);
      const privateDir = objectStorage.getPrivateObjectDir();
      const fileKey = `${privateDir}/expenses/${req.params.expenseId}/${fileId}${ext}`;
      
      // Parse object path and upload to Object Storage
      const { bucketName, objectName } = parseObjectPath(fileKey);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      // Upload file buffer
      await file.save(req.file.buffer, {
        metadata: {
          contentType: req.file.mimetype,
        },
      });
      
      // Save file metadata to database
      const expenseFile = await storage.addExpenseFile({
        expenseId: req.params.expenseId,
        fileKey,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      });
      
      // Audit log
      await createAuditLog({
        action: 'expense_file.upload',
        entityType: 'expense_file',
        entityId: expenseFile.id,
        details: { expenseId: expense.id, originalName: req.file.originalname, size: req.file.size },
        context: getAuditContext(req),
      });
      
      res.json(expenseFile);
    } catch (error) {
      console.error('Upload expense file error:', error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  // List expense files
  app.get("/api/expenses/:expenseId/files", requireAuth, async (req, res) => {
    try {
      const expense = await storage.getExpense(req.params.expenseId);
      
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureExpenseCompanyAccess(req.authenticatedUser!, expense.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const files = await storage.getExpenseFiles(req.params.expenseId);
      res.json(files);
    } catch (error) {
      console.error('List expense files error:', error);
      res.status(500).json({ message: "Failed to fetch expense files" });
    }
  });

  // Delete expense file
  app.delete("/api/expense-files/:id", requireAuth, async (req, res) => {
    try {
      // Get the file to find the expenseId
      const filesList = await db.select().from(expenseFiles).where(eq(expenseFiles.id, req.params.id));
      const file = filesList[0];
      
      if (!file) {
        return res.status(404).json({ message: "Expense file not found" });
      }
      
      // Fetch expense to verify company access
      const expense = await storage.getExpense(file.expenseId);
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureExpenseCompanyAccess(req.authenticatedUser!, expense.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      // Delete from Object Storage
      try {
        const { bucketName, objectName } = parseObjectPath(file.fileKey);
        const bucket = objectStorageClient.bucket(bucketName);
        const objectFile = bucket.file(objectName);
        await objectFile.delete();
      } catch (error) {
        console.error('Error deleting file from object storage:', error);
        // Continue with database deletion even if object storage deletion fails
      }
      
      await storage.removeExpenseFile(req.params.id);
      
      // Audit log
      await createAuditLog({
        action: 'expense_file.delete',
        entityType: 'expense_file',
        entityId: req.params.id,
        context: getAuditContext(req),
      });
      
      res.json({ message: "Expense file deleted successfully" });
    } catch (error) {
      console.error('Delete expense file error:', error);
      res.status(500).json({ message: "Failed to delete expense file" });
    }
  });

  // ============================================================================
  // INVOICES API
  // ============================================================================

  // Helper function to check invoice company access based on RBAC rules
  async function ensureInvoiceCompanyAccess(
    user: { id: string; role: string; companyId: string | null },
    companyId: string
  ): Promise<{ allowed: boolean; message?: string }> {
    if (user.role === 'ADMIN') {
      return { allowed: false, message: "Access denied. This endpoint is not available for your role." };
    }
    if (user.role === 'MANAGER') {
      return { allowed: true };
    }
    if (user.role === 'CONTRACTOR') {
      if (!user.companyId) {
        return { allowed: false, message: "Company assignment required" };
      }
      if (user.companyId !== companyId) {
        return { allowed: false, message: "Cannot access invoice for another company" };
      }
      return { allowed: true };
    }
    if (user.role === 'UTILITY') {
      const hasAccess = await storage.hasUtilityCompanyAccess(user.id, companyId);
      if (!hasAccess) {
        return { allowed: false, message: "Cannot access invoice for this company" };
      }
      return { allowed: true };
    }
    return { allowed: false, message: "Access denied" };
  }

  // Create invoice
  app.post("/api/invoices", requireAuth, requireManager, async (req, res) => {
    try {
      const invoiceData = insertInvoiceSchema.parse(req.body);
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureInvoiceCompanyAccess(req.authenticatedUser!, invoiceData.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const invoice = await storage.createInvoice(invoiceData);
      
      // Audit log
      await createAuditLog({
        action: 'invoice.create',
        entityType: 'invoice',
        entityId: invoice.id,
        details: { sessionId: invoice.sessionId, companyId: invoice.companyId, status: invoice.status },
        context: getAuditContext(req),
      });
      
      res.json(invoice);
    } catch (error) {
      console.error('Create invoice error:', error);
      res.status(400).json({ message: "Invalid invoice data" });
    }
  });

  // List invoices (filtered by session or company)
  app.get("/api/invoices", requireAuth, async (req, res) => {
    try {
      const { sessionId, companyId } = req.query;
      const user = req.authenticatedUser!;
      
      // ADMIN should not access this endpoint
      if (user.role === 'ADMIN') {
        return res.status(403).json({ 
          message: "Access denied. This endpoint is not available for your role." 
        });
      }
      
      // For UTILITY users, fetch accessible companies once
      let accessibleCompanyIds: Set<string> | null = null;
      if (user.role === 'UTILITY') {
        const companies = await storage.getUserAccessibleCompanies(user.id);
        accessibleCompanyIds = new Set(companies.map(c => c.id));
      }
      
      let invoices;
      if (sessionId) {
        const allInvoices = await storage.getInvoicesBySession(sessionId as string);
        
        if (user.role === 'MANAGER') {
          invoices = allInvoices;
        } else if (user.role === 'CONTRACTOR') {
          if (!user.companyId) {
            return res.status(403).json({ message: "Company assignment required" });
          }
          invoices = allInvoices.filter(i => i.companyId === user.companyId);
        } else if (user.role === 'UTILITY') {
          invoices = allInvoices.filter(i => accessibleCompanyIds!.has(i.companyId));
        } else {
          return res.status(403).json({ message: "Access denied" });
        }
      } else if (companyId) {
        if (user.role === 'MANAGER') {
          invoices = await storage.getInvoicesByCompany(companyId as string);
        } else if (user.role === 'CONTRACTOR') {
          if (user.companyId !== companyId) {
            return res.status(403).json({ message: "Cannot access invoices for another company" });
          }
          invoices = await storage.getInvoicesByCompany(companyId as string);
        } else if (user.role === 'UTILITY') {
          if (!accessibleCompanyIds!.has(companyId as string)) {
            return res.status(403).json({ message: "Cannot access invoices for this company" });
          }
          invoices = await storage.getInvoicesByCompany(companyId as string);
        } else {
          return res.status(403).json({ message: "Access denied" });
        }
      } else {
        return res.status(400).json({ message: "sessionId or companyId query parameter required" });
      }
      
      res.json(invoices);
    } catch (error) {
      console.error('List invoices error:', error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  // Get single invoice
  app.get("/api/invoices/:id", requireAuth, async (req, res) => {
    try {
      const invoice = await storage.getInvoice(req.params.id);
      
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureInvoiceCompanyAccess(req.authenticatedUser!, invoice.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      res.json(invoice);
    } catch (error) {
      console.error('Get invoice error:', error);
      res.status(500).json({ message: "Failed to fetch invoice" });
    }
  });

  // Update invoice
  app.patch("/api/invoices/:id", requireAuth, requireManager, async (req, res) => {
    try {
      const invoice = await storage.getInvoice(req.params.id);
      
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureInvoiceCompanyAccess(req.authenticatedUser!, invoice.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const updates = insertInvoiceSchema.partial().parse(req.body);
      
      // Prevent direct manipulation of workflow and relational fields
      const forbiddenFields = ['status', 'issuedAt', 'companyId', 'sessionId'];
      const attemptedForbiddenFields = forbiddenFields.filter(field => updates.hasOwnProperty(field));
      
      if (attemptedForbiddenFields.length > 0) {
        return res.status(400).json({ 
          message: `Cannot directly update protected fields: ${attemptedForbiddenFields.join(', ')}.`
        });
      }
      
      const updated = await storage.updateInvoice(req.params.id, updates);
      
      // Audit log
      await createAuditLog({
        action: 'invoice.update',
        entityType: 'invoice',
        entityId: req.params.id,
        details: updates,
        context: getAuditContext(req),
      });
      
      res.json(updated);
    } catch (error) {
      console.error('Update invoice error:', error);
      res.status(400).json({ message: "Invalid invoice data" });
    }
  });

  // Issue invoice (MANAGER or UTILITY only)
  app.post("/api/invoices/:id/issue", requireAuth, requireManager, async (req, res) => {
    try {
      const invoice = await storage.getInvoice(req.params.id);
      
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      // Verify status transition (only DRAFT can be issued)
      if (invoice.status !== 'DRAFT') {
        return res.status(400).json({ 
          message: `Cannot issue invoice with status ${invoice.status}. Only DRAFT invoices can be issued.`
        });
      }
      
      const issued = await storage.issueInvoice(req.params.id);
      
      // Audit log
      await createAuditLog({
        action: 'invoice.issue',
        entityType: 'invoice',
        entityId: req.params.id,
        context: getAuditContext(req),
      });
      
      res.json(issued);
    } catch (error) {
      console.error('Issue invoice error:', error);
      res.status(500).json({ message: "Failed to issue invoice" });
    }
  });

  // Mark invoice as paid (UTILITY only)
  app.post("/api/invoices/:id/mark-paid", requireAuth, requireUtility, async (req, res) => {
    try {
      const invoice = await storage.getInvoice(req.params.id);
      
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      // Verify status transition (only ISSUED can be marked as paid)
      if (invoice.status !== 'ISSUED') {
        return res.status(400).json({ 
          message: `Cannot mark invoice as paid with status ${invoice.status}. Only ISSUED invoices can be marked as paid.`
        });
      }
      
      const paid = await storage.markInvoicePaid(req.params.id);
      
      // Audit log
      await createAuditLog({
        action: 'invoice.mark_paid',
        entityType: 'invoice',
        entityId: req.params.id,
        context: getAuditContext(req),
      });
      
      res.json(paid);
    } catch (error) {
      console.error('Mark invoice paid error:', error);
      res.status(500).json({ message: "Failed to mark invoice as paid" });
    }
  });

  // Delete invoice
  app.delete("/api/invoices/:id", requireAuth, requireManager, async (req, res) => {
    try {
      const invoice = await storage.getInvoice(req.params.id);
      
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureInvoiceCompanyAccess(req.authenticatedUser!, invoice.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      await storage.deleteInvoice(req.params.id);
      
      // Audit log
      await createAuditLog({
        action: 'invoice.delete',
        entityType: 'invoice',
        entityId: req.params.id,
        context: getAuditContext(req),
      });
      
      res.json({ message: "Invoice deleted successfully" });
    } catch (error) {
      console.error('Delete invoice error:', error);
      res.status(500).json({ message: "Failed to delete invoice" });
    }
  });

  // Add invoice line
  app.post("/api/invoices/:invoiceId/lines", requireAuth, requireManager, async (req, res) => {
    try {
      const invoice = await storage.getInvoice(req.params.invoiceId);
      
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureInvoiceCompanyAccess(req.authenticatedUser!, invoice.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const lineData = insertInvoiceLineSchema.parse({ ...req.body, invoiceId: req.params.invoiceId });
      const line = await storage.addInvoiceLine(lineData);
      
      // Audit log
      await createAuditLog({
        action: 'invoice_line.create',
        entityType: 'invoice_line',
        entityId: line.id,
        details: { invoiceId: invoice.id, source: line.source, amountCents: line.amountCents },
        context: getAuditContext(req),
      });
      
      res.json(line);
    } catch (error) {
      console.error('Add invoice line error:', error);
      res.status(400).json({ message: "Invalid invoice line data" });
    }
  });

  // List invoice lines
  app.get("/api/invoices/:invoiceId/lines", requireAuth, async (req, res) => {
    try {
      const invoice = await storage.getInvoice(req.params.invoiceId);
      
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureInvoiceCompanyAccess(req.authenticatedUser!, invoice.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const lines = await storage.getInvoiceLines(req.params.invoiceId);
      res.json(lines);
    } catch (error) {
      console.error('List invoice lines error:', error);
      res.status(500).json({ message: "Failed to fetch invoice lines" });
    }
  });

  // Update invoice line
  app.patch("/api/invoice-lines/:id", requireAuth, requireManager, async (req, res) => {
    try {
      // Get the line to find the invoiceId
      const linesList = await db.select().from(invoiceLines).where(eq(invoiceLines.id, req.params.id));
      const line = linesList[0];
      
      if (!line) {
        return res.status(404).json({ message: "Invoice line not found" });
      }
      
      // Fetch invoice to verify company access
      const invoice = await storage.getInvoice(line.invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      // Verify company access using RBAC helper
      const accessCheck = await ensureInvoiceCompanyAccess(req.authenticatedUser!, invoice.companyId);
      if (!accessCheck.allowed) {
        return res.status(403).json({ message: accessCheck.message });
      }
      
      const updates = insertInvoiceLineSchema.partial().parse(req.body);
      
      // Prevent direct manipulation of relational fields
      const forbiddenFields = ['invoiceId'];
      const attemptedForbiddenFields = forbiddenFields.filter(field => updates.hasOwnProperty(field));
      
      if (attemptedForbiddenFields.length > 0) {
        return res.status(400).json({ 
          message: `Cannot directly update protected fields: ${attemptedForbiddenFields.join(', ')}.`
        });
      }
      
      const updated = await storage.updateInvoiceLine(req.params.id, updates);
      
      // Audit log
      await createAuditLog({
        action: 'invoice_line.update',
        entityType: 'invoice_line',
        entityId: req.params.id,
        details: updates,
        context: getAuditContext(req),
      });
      
      res.json(updated);
    } catch (error) {
      console.error('Update invoice line error:', error);
      res.status(400).json({ message: "Invalid invoice line data" });
    }
  });

  // Delete invoice line
  app.delete("/api/invoice-lines/:id", requireAuth, requireManager, async (req, res) => {
    try {
      // Get the line to find the invoiceId
      const linesList = await db.select().from(invoiceLines).where(eq(invoiceLines.id, req.params.id));
      const line = linesList[0];
      
      if (!line) {
        return res.status(404).json({ message: "Invoice line not found" });
      }
      
      // Fetch invoice to verify company access
      const invoice = await storage.getInvoice(line.invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      // Verify company access
      if (req.authenticatedUser?.role === 'MANAGER' && req.authenticatedUser?.companyId !== invoice.companyId) {
        return res.status(403).json({ message: "Cannot delete line from invoice of another company" });
      }
      
      await storage.removeInvoiceLine(req.params.id);
      
      // Audit log
      await createAuditLog({
        action: 'invoice_line.delete',
        entityType: 'invoice_line',
        entityId: req.params.id,
        context: getAuditContext(req),
      });
      
      res.json({ message: "Invoice line deleted successfully" });
    } catch (error) {
      console.error('Delete invoice line error:', error);
      res.status(500).json({ message: "Failed to delete invoice line" });
    }
  });

  // Test database connection early
  try {
    console.log('Testing database connection...');
    await db.select().from(users).limit(1);
    console.log('Database connection successful');
  } catch (error) {
    console.error('Database connection failed:', error);
    // Continue with server startup even if database fails
    // This allows the app to start in a degraded state
  }

  // Lightweight ping endpoint to keep the app awake
  app.get("/api/ping", (req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  // Upload file (KMZ, CSV, or Excel) and parse resources
  app.post("/api/upload-file", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const job = await storage.createAnalysisJob({
        filename: req.file.originalname,
        status: 'processing',
        resourceCount: null,
        error: null,
      });

      // Parse file in background
      setImmediate(async () => {
        try {
          const ext = path.extname(req.file!.originalname).toLowerCase();
          let resourceData;
          let resources = [];

          if (ext === '.kmz' || ext === '.kml') {
            const placemarks = await parseKMZFile(req.file!.path);
            resourceData = convertToResources(placemarks);

            // Clear existing resources
            await storage.deleteAllResources();

            // Insert new resources
            const resources = await Promise.all(
              resourceData.map(data => storage.createResource(data))
            );
          } else if (ext === '.csv') {
            const csvResources = await parseCSVFile(req.file!.path);

            // Only clear contractor resources (preserve storage yards and other non-contractor resources)
            const existingResources = await storage.getAllResources();
            for (const resource of existingResources) {
              if (resource.properties?.contractorId) {
                await storage.deleteResource(resource.id);
              }
            }

            // Save to contractors table and create corresponding resources
            for (const csvResource of csvResources) {
              const companyName = (csvResource as any).company || csvResource.name;
              
              // Try to find existing contractor by company name first, then by name
              const existingContractor = await storage.findContractorByCompany(companyName) || 
                                       await storage.findContractorByName(csvResource.name);
              
              // Extract detailed information from parsed CSV (includes company, contact info, etc.)
              const contractorData = {
                name: csvResource.name,
                company: companyName,
                email: (csvResource as any).email || '',
                phone: (csvResource as any).phone || '',
                category: csvResource.type || 'Unknown',
                city: (csvResource as any).city || '',
                state: (csvResource as any).state || '',
                fullAddress: csvResource.address || '',
                latitude: csvResource.latitude,
                longitude: csvResource.longitude,
                birdRep: (csvResource as any).birdRep || '',
                pipefile: (csvResource as any).pipefile || '',
                avetta: (csvResource as any).avetta || '',
                subRanking: (csvResource as any).subRanking || '',
                fteCountsPerLocation: (csvResource as any).fteCounts || '',
                pipefileUpdates: (csvResource as any).pipefileUpdates || '',
                notes: csvResource.description || '',
                newMsaComplete: (csvResource as any).msaStatus || (csvResource as any).newMsaComplete || '',
                rating: parseFloat((csvResource as any).rating || '0')
              };

              let contractor;
              if (existingContractor) {
                // Update existing contractor
                contractor = await storage.updateContractor(existingContractor.id, contractorData);
              } else {
                // Create new contractor
                contractor = await storage.createContractor(contractorData);
              }

              // Also create a resource entry for map display
              const resourceData = {
                name: contractorData.company,
                type: csvResource.type || 'Contractor',
                latitude: csvResource.latitude,
                longitude: csvResource.longitude,
                description: csvResource.description,
                properties: { 
                  address: csvResource.address,
                  contractorId: contractor.id
                }
              };

              const resource = await storage.createResource(resourceData);
              resources.push(resource);
            }
          } else if (ext === '.xlsx' || ext === '.xls') {
            const excelResources = await parseExcelFile(req.file!.path);
            resourceData = convertCSVToResources(excelResources);

            // Clear existing resources
            await storage.deleteAllResources();

            // Insert new resources
            resources = await Promise.all(
              resourceData.map(data => storage.createResource(data))
            );
          } else {
            throw new Error('Unsupported file type');
          }

          const finalResourceCount = resources.length;

          await storage.updateAnalysisJob(job.id, {
            status: 'completed',
            resourceCount: finalResourceCount,
          });

          // Clean up uploaded file
          await fs.unlink(req.file!.path);
        } catch (error) {
          console.error('KMZ parsing error:', error);
          await storage.updateAnalysisJob(job.id, {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      });

      res.json({ jobId: job.id, message: "File uploaded successfully, processing..." });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  // Get job status
  app.get("/api/jobs/:id", async (req, res) => {
    try {
      const jobId = parseInt(req.params.id);
      const job = await storage.getAnalysisJob(jobId);

      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      res.json(job);
    } catch (error) {
      console.error('Job status error:', error);
      res.status(500).json({ message: "Failed to get job status" });
    }
  });

  // Get all resources - includes both contractors and storage yards
  app.get("/api/resources", async (req, res) => {
    try {
      const contractors = await storage.getAllContractors();
      const storageYardResources = await storage.getAllResources();
      
      // Find contractors without coordinates that need geocoding
      const needsGeocoding = contractors.filter(c => 
        (!c.latitude || !c.longitude || c.latitude === 0 || c.longitude === 0) && 
        (c.fullAddress || c.city)
      );
      
      // Prioritize geocoding pending review contractors, then others
      const needsReviewToGeocode = needsGeocoding.filter(c => c.needsReview);
      const othersToGeocode = needsGeocoding.filter(c => !c.needsReview);
      
      // Geocode up to 20 contractors per request (prioritize pending review)
      const batchSize = 20;
      const toGeocode = [...needsReviewToGeocode.slice(0, batchSize), ...othersToGeocode.slice(0, Math.max(0, batchSize - needsReviewToGeocode.length))];
      
      if (toGeocode.length > 0) {
        console.log(`Geocoding ${toGeocode.length} contractors (${needsReviewToGeocode.length} pending review, ${needsGeocoding.length} total without coordinates)...`);
        
        const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
        await Promise.all(
          toGeocode.map(async (contractor) => {
            const address = contractor.fullAddress || `${contractor.city || ''}, ${contractor.state || ''}`.trim();
            try {
              const encodedQuery = encodeURIComponent(address);
              if (mapboxToken) {
                const geocodeUrl = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodedQuery}&country=us&limit=1&access_token=${mapboxToken}`;
                const response = await fetch(geocodeUrl);
                const data = await response.json();
                
                if (data.features && data.features.length > 0) {
                  const [lng, lat] = data.features[0].geometry.coordinates;
                  
                  // Save geocoded coordinates back to database
                  await storage.updateContractor(contractor.id, {
                    latitude: lat,
                    longitude: lng
                  });
                  
                  // Update the contractor in the array for this response
                  contractor.latitude = lat;
                  contractor.longitude = lng;
                  
                  console.log(`✓ Geocoded ${contractor.company}: ${address}`);
                }
              }
            } catch (geocodeError) {
              console.error(`✗ Failed to geocode ${contractor.company}:`, geocodeError);
            }
          })
        );
      }
      
      // Sync contractors to resources table (ensure all contractors have a resource record)
      // Create a map of contractorId -> resourceId for existing resources
      const contractorResourceMap = new Map();
      storageYardResources.forEach(resource => {
        if (resource.properties?.contractorId) {
          contractorResourceMap.set(resource.properties.contractorId, resource.id);
        }
      });
      
      // Create resources for contractors that don't have one
      const contractorsWithCoords = contractors.filter(
        contractor => contractor.latitude && contractor.longitude && 
                     contractor.latitude !== 0 && contractor.longitude !== 0
      );
      
      for (const contractor of contractorsWithCoords) {
        if (!contractorResourceMap.has(contractor.id)) {
          // Create a resource for this contractor
          const newResource = await storage.createResource({
            name: contractor.company || contractor.name || 'Unknown Company',
            type: contractor.category || 'Unknown',
            latitude: contractor.latitude,
            longitude: contractor.longitude,
            description: contractor.notes || '',
            properties: {
              address: contractor.fullAddress || `${contractor.city || ''} ${contractor.state || ''}`.trim(),
              contractorId: contractor.id,
              needsReview: contractor.needsReview || false
            }
          });
          contractorResourceMap.set(contractor.id, newResource.id);
        } else {
          // Update existing resource to sync ALL contractor fields
          const resourceId = contractorResourceMap.get(contractor.id);
          const existingResource = storageYardResources.find(r => r.id === resourceId);
          if (existingResource) {
            // Check if any fields have changed
            const nameChanged = existingResource.name !== (contractor.company || contractor.name || 'Unknown Company');
            const typeChanged = existingResource.type !== (contractor.category || 'Unknown');
            const coordsChanged = existingResource.latitude !== contractor.latitude || existingResource.longitude !== contractor.longitude;
            const descChanged = existingResource.description !== (contractor.notes || '');
            const addressChanged = existingResource.properties?.address !== (contractor.fullAddress || `${contractor.city || ''} ${contractor.state || ''}`.trim());
            const needsReviewChanged = existingResource.properties?.needsReview !== contractor.needsReview;
            
            if (nameChanged || typeChanged || coordsChanged || descChanged || addressChanged || needsReviewChanged) {
              await storage.updateResource(resourceId, {
                name: contractor.company || contractor.name || 'Unknown Company',
                type: contractor.category || 'Unknown',
                latitude: contractor.latitude,
                longitude: contractor.longitude,
                description: contractor.notes || '',
                properties: {
                  ...existingResource.properties,
                  address: contractor.fullAddress || `${contractor.city || ''} ${contractor.state || ''}`.trim(),
                  contractorId: contractor.id,
                  needsReview: contractor.needsReview || false
                }
              });
              
              // If coordinates changed, log for potential distance recalculation
              if (coordsChanged) {
                console.log(`⚠ Coordinates changed for contractor ${contractor.company} (resource ${resourceId})`);
              }
            }
          }
        }
      }
      
      // Clean up orphaned resources (resources linked to deleted contractors)
      const contractorIds = new Set(contractors.map(c => c.id));
      const orphanedResources = storageYardResources.filter(
        resource => resource.properties?.contractorId && !contractorIds.has(resource.properties.contractorId)
      );
      
      for (const orphan of orphanedResources) {
        console.log(`🗑 Deleting orphaned resource ${orphan.id} (contractor ${orphan.properties.contractorId} no longer exists)`);
        
        // First, delete all distance calculations referencing this resource
        await db.delete(distanceCalculations).where(eq(distanceCalculations.resourceId, orphan.id));
        
        // Then delete the resource
        await storage.deleteResource(orphan.id);
      }
      
      // Now get ALL resources (including newly created ones)
      const allResources = await storage.getAllResources();
      const contractorCount = allResources.filter(r => r.properties?.contractorId).length;
      const storageYardCount = allResources.length - contractorCount;
      
      console.log(`Loaded ${allResources.length} resources (${contractorCount} contractors + ${storageYardCount} storage yards)`);
      res.json(allResources);
    } catch (error) {
      console.error('Get resources error:', error);
      res.status(500).json({ message: "Failed to get resources" });
    }
  });

  // Contractors endpoints
  app.get("/api/contractors", async (req, res) => {
    try {
      const contractors = await storage.getAllContractors();
      res.json(contractors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Export all contractors
  app.get("/api/contractors/export", async (req, res) => {
    try {
      const contractors = await storage.getAllContractors();
      const crewAvailability = await storage.getAllCrewAvailability();
      
      // Create a map of contractor ID to their crew availability records
      const availabilityMap = new Map();
      crewAvailability.forEach(crew => {
        if (!availabilityMap.has(crew.contractorId)) {
          availabilityMap.set(crew.contractorId, []);
        }
        availabilityMap.get(crew.contractorId).push(crew);
      });
      
      // Prepare export data with all contractor information and ALL locations
      const exportData = contractors.map((contractor) => {
        const crewRecords = availabilityMap.get(contractor.id) || [];
        
        // Get departure locations from crew availability
        const departureLocs = crewRecords
          .filter(crew => crew.departureLatitude && crew.departureLongitude)
          .map(crew => ({
            location: crew.departureLocation || `${crew.departureCity || ''}, ${crew.departureState || ''}`.trim(),
            latitude: crew.departureLatitude,
            longitude: crew.departureLongitude
          }));
        
        // Parse departureLocations JSONB if it exists
        let additionalDepartureLocs: any[] = [];
        if (contractor.departureLocations) {
          try {
            additionalDepartureLocs = Array.isArray(contractor.departureLocations) 
              ? contractor.departureLocations 
              : [];
          } catch (e) {
            additionalDepartureLocs = [];
          }
        }
        
        // Combine all departure locations (deduplicate by coordinates)
        const allDepartureLocs = [...departureLocs, ...additionalDepartureLocs];
        const uniqueDepartureLocs = allDepartureLocs.filter((loc, index, self) =>
          loc.latitude && loc.longitude &&
          index === self.findIndex(l => 
            Math.abs(l.latitude - loc.latitude) < 0.0001 && 
            Math.abs(l.longitude - loc.longitude) < 0.0001
          )
        );
        
        const row: any = {
          'ID': contractor.id,
          'Company': contractor.company || '',
          'Contact Name': contractor.name || '',
          'Email': contractor.email || '',
          'Phone': contractor.phone || '',
          'Category': contractor.category || '',
          'City': contractor.city || '',
          'State': contractor.state || '',
          'Full Address': contractor.fullAddress || '',
          
          // Main Location (Mapbox compatible: separate lat/long columns)
          'Main Latitude': contractor.latitude || '',
          'Main Longitude': contractor.longitude || '',
          'Mapbox Main Coords': contractor.latitude && contractor.longitude 
            ? `${contractor.longitude},${contractor.latitude}` 
            : '', // Mapbox format: longitude,latitude
          
          'Bird Rep': contractor.birdRep || '',
          'Pipefile': contractor.pipefile || '',
          'AVETTA': contractor.avetta || '',
          'ISN Complete': contractor.isnComplete ? 'Yes' : 'No',
          'Sub Ranking': contractor.subRanking || '',
          'MSA Status': contractor.newMsaComplete || '',
          'FTE Counts Per Location': contractor.fteCountsPerLocation || '',
          'Pipefile Updates': contractor.pipefileUpdates || '',
          'Notes': contractor.notes || '',
          'Rating': contractor.rating || 0,
          'Created At': contractor.createdAt ? new Date(contractor.createdAt).toLocaleDateString() : '',
          'Updated At': contractor.updatedAt ? new Date(contractor.updatedAt).toLocaleDateString() : '',
        };
        
        // Add departure locations (up to 5 departure locations to avoid excessive columns)
        uniqueDepartureLocs.slice(0, 5).forEach((loc, index) => {
          const num = index + 1;
          row[`Departure ${num} Location`] = loc.location || '';
          row[`Departure ${num} Latitude`] = loc.latitude || '';
          row[`Departure ${num} Longitude`] = loc.longitude || '';
          row[`Mapbox Departure ${num} Coords`] = loc.latitude && loc.longitude 
            ? `${loc.longitude},${loc.latitude}` 
            : '';
        });
        
        // Add total departure location count
        row['Total Departure Locations'] = uniqueDepartureLocs.length;
        
        return row;
      });

      // Get storage yards from resources table
      const allResources = await storage.getAllResources();
      const storageYards = allResources.filter(resource => 
        !resource.properties?.contractorId && resource.type === 'Storage Yard'
      );

      // Prepare storage yard export data
      const storageYardData = storageYards.map((yard) => ({
        'ID': yard.id,
        'Name': yard.name || '',
        'Type': yard.type || '',
        'Description': yard.description || '',
        'Latitude': yard.latitude || '',
        'Longitude': yard.longitude || '',
        'Mapbox Coords': yard.latitude && yard.longitude 
          ? `${yard.longitude},${yard.latitude}` 
          : '', // Mapbox format: longitude,latitude
        'Created At': yard.createdAt ? new Date(yard.createdAt).toLocaleDateString() : '',
      }));

      // Import XLSX dynamically
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      
      // Add Contractors sheet
      const contractorWorksheet = XLSX.utils.json_to_sheet(exportData);
      const contractorHeaders = Object.keys(exportData[0] || {});
      const contractorColWidths: any[] = [];
      contractorHeaders.forEach((header, index) => {
        const maxLength = Math.max(
          header.length,
          ...exportData.map((row: any) => String(row[header] || '').length)
        );
        contractorColWidths[index] = { width: Math.min(Math.max(maxLength + 2, 10), 30) };
      });
      contractorWorksheet['!cols'] = contractorColWidths;
      XLSX.utils.book_append_sheet(workbook, contractorWorksheet, 'Contractors');

      // Add Storage Yards sheet
      if (storageYardData.length > 0) {
        const storageYardWorksheet = XLSX.utils.json_to_sheet(storageYardData);
        const storageYardHeaders = Object.keys(storageYardData[0] || {});
        const storageYardColWidths: any[] = [];
        storageYardHeaders.forEach((header, index) => {
          const maxLength = Math.max(
            header.length,
            ...storageYardData.map((row: any) => String(row[header] || '').length)
          );
          storageYardColWidths[index] = { width: Math.min(Math.max(maxLength + 2, 10), 30) };
        });
        storageYardWorksheet['!cols'] = storageYardColWidths;
        XLSX.utils.book_append_sheet(workbook, storageYardWorksheet, 'Storage Yards');
      }

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="contractors_export_${new Date().toISOString().slice(0, 10)}.xlsx"`);
      res.send(buffer);
    } catch (error) {
      console.error('Export contractors error:', error);
      res.status(500).json({ message: "Failed to export contractors" });
    }
  });

  // GeoJSON API endpoint for all contractor locations (main + departures)
  app.get("/api/geojson/contractors", async (req, res) => {
    try {
      const contractors = await storage.getAllContractors();
      const crewAvailability = await storage.getAllCrewAvailability();
      
      // Create a GeoJSON FeatureCollection
      const features: any[] = [];
      
      for (const contractor of contractors) {
        // Get departure locations from crew availability
        const contractorAvailability = crewAvailability.filter(
          (avail) => avail.contractorId === contractor.id
        );
        
        const departureLocs: Array<{ location: string; latitude: number; longitude: number }> = [];
        
        // Add departure locations from crew availability
        contractorAvailability.forEach((avail) => {
          if (avail.departureLocation && avail.departureLatitude && avail.departureLongitude) {
            departureLocs.push({
              location: avail.departureLocation,
              latitude: avail.departureLatitude,
              longitude: avail.departureLongitude,
            });
          }
        });
        
        // Add departure locations from contractor's departureLocations field
        if (contractor.departureLocations && Array.isArray(contractor.departureLocations)) {
          contractor.departureLocations.forEach((loc: any) => {
            if (loc.latitude && loc.longitude) {
              departureLocs.push({
                location: loc.location || '',
                latitude: loc.latitude,
                longitude: loc.longitude,
              });
            }
          });
        }
        
        // Deduplicate departure locations by coordinates (same logic as export)
        const uniqueDepartureLocs = departureLocs.filter((loc, index, self) => {
          // Filter out invalid coordinates
          if (!loc.latitude || !loc.longitude) return false;
          
          // Find first occurrence with same coordinates (within tolerance)
          return index === self.findIndex((l) =>
            l.latitude && l.longitude &&
            Math.abs(l.latitude - loc.latitude) < 0.0001 &&
            Math.abs(l.longitude - loc.longitude) < 0.0001
          );
        });
        
        // Add main location as a feature
        if (contractor.latitude && contractor.longitude) {
          features.push({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [contractor.longitude, contractor.latitude] // GeoJSON uses [lng, lat]
            },
            properties: {
              id: contractor.id,
              locationType: "main",
              name: contractor.name || '',
              company: contractor.company || '',
              email: contractor.email || '',
              phone: contractor.phone || '',
              fullAddress: contractor.fullAddress || '',
              city: contractor.city || '',
              state: contractor.state || '',
              category: contractor.category || '',
              birdRep: contractor.birdRep || '',
              pipefile: contractor.pipefile || '',
              avetta: contractor.avetta || '',
              subRanking: contractor.subRanking || '',
              notes: contractor.notes || '',
              newMsaComplete: contractor.newMsaComplete || '',
              isnComplete: contractor.isnComplete || false,
              rating: contractor.rating || 0,
              needsReview: contractor.needsReview || false,
              totalDepartureLocations: uniqueDepartureLocs.length
            }
          });
        }
        
        // Add each departure location as a separate feature
        uniqueDepartureLocs.forEach((loc, index) => {
          features.push({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [loc.longitude, loc.latitude] // GeoJSON uses [lng, lat]
            },
            properties: {
              id: `${contractor.id}-dep-${index}`,
              locationType: "departure",
              departureNumber: index + 1,
              departureLocation: loc.location,
              contractorId: contractor.id,
              company: contractor.company || '',
              category: contractor.category || '',
              birdRep: contractor.birdRep || '',
              rating: contractor.rating || 0
            }
          });
        });
      }
      
      const geojson = {
        type: "FeatureCollection",
        features: features
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.json(geojson);
    } catch (error) {
      console.error('GeoJSON contractors error:', error);
      res.status(500).json({ message: "Failed to generate GeoJSON for contractors" });
    }
  });

  // GeoJSON API endpoint for storage yards
  app.get("/api/geojson/storage-yards", async (req, res) => {
    try {
      const allResources = await storage.getAllResources();
      const storageYards = allResources.filter(resource => 
        !resource.properties?.contractorId && resource.type === 'Storage Yard'
      );
      
      const features = storageYards.map((yard) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [yard.longitude, yard.latitude] // GeoJSON uses [lng, lat]
        },
        properties: {
          id: yard.id,
          locationType: "storage-yard",
          name: yard.name || '',
          type: yard.type || '',
          description: yard.description || '',
          createdAt: yard.createdAt ? new Date(yard.createdAt).toISOString() : ''
        }
      }));
      
      const geojson = {
        type: "FeatureCollection",
        features: features
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.json(geojson);
    } catch (error) {
      console.error('GeoJSON storage yards error:', error);
      res.status(500).json({ message: "Failed to generate GeoJSON for storage yards" });
    }
  });

  // GeoJSON API endpoint for all locations (contractors + storage yards)
  app.get("/api/geojson/all", async (req, res) => {
    try {
      const contractors = await storage.getAllContractors();
      const crewAvailability = await storage.getAllCrewAvailability();
      const allResources = await storage.getAllResources();
      const storageYards = allResources.filter(resource => 
        !resource.properties?.contractorId && resource.type === 'Storage Yard'
      );
      
      const features: any[] = [];
      
      // Add contractor locations (main + departures)
      for (const contractor of contractors) {
        const contractorAvailability = crewAvailability.filter(
          (avail) => avail.contractorId === contractor.id
        );
        
        const departureLocs: Array<{ location: string; latitude: number; longitude: number }> = [];
        
        contractorAvailability.forEach((avail) => {
          if (avail.departureLocation && avail.departureLatitude && avail.departureLongitude) {
            departureLocs.push({
              location: avail.departureLocation,
              latitude: avail.departureLatitude,
              longitude: avail.departureLongitude,
            });
          }
        });
        
        if (contractor.departureLocations && Array.isArray(contractor.departureLocations)) {
          contractor.departureLocations.forEach((loc: any) => {
            if (loc.latitude && loc.longitude) {
              departureLocs.push({
                location: loc.location || '',
                latitude: loc.latitude,
                longitude: loc.longitude,
              });
            }
          });
        }
        
        const uniqueDepartureLocs = departureLocs.filter((loc, index, self) => {
          // Filter out invalid coordinates
          if (!loc.latitude || !loc.longitude) return false;
          
          // Find first occurrence with same coordinates (within tolerance)
          return index === self.findIndex((l) =>
            l.latitude && l.longitude &&
            Math.abs(l.latitude - loc.latitude) < 0.0001 &&
            Math.abs(l.longitude - loc.longitude) < 0.0001
          );
        });
        
        if (contractor.latitude && contractor.longitude) {
          features.push({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [contractor.longitude, contractor.latitude]
            },
            properties: {
              id: contractor.id,
              locationType: "main",
              name: contractor.name || '',
              company: contractor.company || '',
              email: contractor.email || '',
              phone: contractor.phone || '',
              fullAddress: contractor.fullAddress || '',
              city: contractor.city || '',
              state: contractor.state || '',
              category: contractor.category || '',
              birdRep: contractor.birdRep || '',
              pipefile: contractor.pipefile || '',
              avetta: contractor.avetta || '',
              subRanking: contractor.subRanking || '',
              notes: contractor.notes || '',
              newMsaComplete: contractor.newMsaComplete || '',
              isnComplete: contractor.isnComplete || false,
              rating: contractor.rating || 0,
              needsReview: contractor.needsReview || false,
              totalDepartureLocations: uniqueDepartureLocs.length
            }
          });
        }
        
        uniqueDepartureLocs.forEach((loc, index) => {
          features.push({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [loc.longitude, loc.latitude]
            },
            properties: {
              id: `${contractor.id}-dep-${index}`,
              locationType: "departure",
              departureNumber: index + 1,
              departureLocation: loc.location,
              contractorId: contractor.id,
              company: contractor.company || '',
              category: contractor.category || '',
              birdRep: contractor.birdRep || '',
              rating: contractor.rating || 0
            }
          });
        });
      }
      
      // Add storage yards
      storageYards.forEach((yard) => {
        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [yard.longitude, yard.latitude]
          },
          properties: {
            id: yard.id,
            locationType: "storage-yard",
            name: yard.name || '',
            type: yard.type || '',
            description: yard.description || '',
            createdAt: yard.createdAt ? new Date(yard.createdAt).toISOString() : ''
          }
        });
      });
      
      const geojson = {
        type: "FeatureCollection",
        features: features
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.json(geojson);
    } catch (error) {
      console.error('GeoJSON all locations error:', error);
      res.status(500).json({ message: "Failed to generate GeoJSON for all locations" });
    }
  });

  app.post("/api/contractors", async (req, res) => {
    try {
      const contractorData = insertContractorSchema.parse(req.body);
      const contractor = await storage.createContractor(contractorData);
      res.status(201).json(contractor);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/contractors/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const contractor = await storage.getContractor(id);
      if (!contractor) {
        return res.status(404).json({ error: "Contractor not found" });
      }
      res.json(contractor);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/contractors/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = insertContractorSchema.partial().parse(req.body);
      const contractor = await storage.updateContractor(id, updates);
      if (!contractor) {
        return res.status(404).json({ error: "Contractor not found" });
      }
      res.json(contractor);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/contractors/:id/departure-locations", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { locations } = req.body;
      
      console.log(`Updating departure locations for contractor ${id}:`, locations);
      
      if (!Array.isArray(locations)) {
        return res.status(400).json({ error: "locations must be an array" });
      }
      
      await storage.setContractorDepartureLocations(id, locations);
      
      // Get the contractor to create resources
      const contractor = await storage.getContractor(id);
      
      if (contractor) {
        console.log(`Found contractor: ${contractor.company}`);
        
        // Delete existing storage yard resources for this contractor
        const allResources = await storage.getAllResources();
        const existingStorageYards = allResources.filter(r => 
          r.type === 'Storage Yard' && r.description?.includes(`Contractor ID: ${id}`)
        );
        
        console.log(`Deleting ${existingStorageYards.length} existing storage yards for contractor ${id}`);
        
        for (const resource of existingStorageYards) {
          try {
            await storage.deleteResource(resource.id);
            console.log(`Deleted storage yard resource ${resource.id}`);
          } catch (e) {
            console.error(`Failed to delete storage yard resource ${resource.id}:`, e);
          }
        }
        
        // Create new resources for each storage yard
        console.log(`Creating ${locations.length} new storage yard resources`);
        let createdCount = 0;
        
        for (const location of locations) {
          if (location.latitude && location.longitude) {
            try {
              const newResource = await storage.createResource({
                name: contractor.company,
                type: 'Storage Yard',
                latitude: location.latitude,
                longitude: location.longitude,
                description: `${location.location}\nContact: ${contractor.name}\nContractor ID: ${id}`,
                properties: {
                  contractorId: id,
                  company: contractor.company,
                  contactName: contractor.name,
                  address: location.location
                }
              });
              console.log(`Created storage yard resource ${newResource.id} for ${contractor.company} at ${location.location}`);
              createdCount++;
            } catch (e) {
              console.error(`Failed to create storage yard resource for location ${location.location}:`, e);
            }
          } else {
            console.warn(`Skipping location without coordinates:`, location);
          }
        }
        
        console.log(`Successfully created ${createdCount} storage yard resources for contractor ${id}`);
      } else {
        console.error(`Contractor ${id} not found`);
      }
      
      res.json(contractor);
    } catch (error: any) {
      console.error('Error updating departure locations:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/contractors/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteContractor(id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Merge contractors - combine sourceId into targetId
  app.post("/api/contractors/merge", async (req, res) => {
    try {
      const { sourceId, targetId, mergedData } = req.body;
      
      if (!sourceId || !targetId) {
        return res.status(400).json({ error: "Both sourceId and targetId are required" });
      }
      
      if (sourceId === targetId) {
        return res.status(400).json({ error: "Cannot merge a contractor with itself" });
      }

      // Get both contractors
      const source = await storage.getContractor(sourceId);
      const target = await storage.getContractor(targetId);

      if (!source || !target) {
        return res.status(404).json({ error: "One or both contractors not found" });
      }

      // Build update data from merged data if provided, otherwise merge automatically
      const updateData: any = {};
      
      if (mergedData) {
        // Use the manually reviewed and merged data from frontend
        if (mergedData.name) {
          updateData.name = mergedData.name;
        }
        if (mergedData.email) {
          updateData.email = mergedData.email;
        }
        if (mergedData.phone) {
          updateData.phone = mergedData.phone;
        }
      } else {
        // Legacy automatic merge logic (for backward compatibility)
        // Merge emails (support both semicolon and comma separators)
        if (source.email && source.email.trim() !== '') {
          const currentEmails = target.email || '';
          const sourceEmails = source.email.split(/[;,]/).map(e => e.trim().toLowerCase());
          const targetEmails = currentEmails.split(/[;,]/).map(e => e.trim().toLowerCase());
          const newEmails = sourceEmails.filter(e => e && !targetEmails.includes(e));
          if (newEmails.length > 0) {
            const mergedEmails = [...currentEmails.split(/[;,]/).map(e => e.trim()).filter(e => e), ...source.email.split(/[;,]/).map(e => e.trim()).filter(e => e)];
            updateData.email = mergedEmails.join('; ');
          }
        }
        
        // Merge phones (support both semicolon and comma separators)
        if (source.phone && source.phone.trim() !== '') {
          const currentPhones = target.phone || '';
          const sourcePhones = source.phone.split(/[;,]/).map(p => p.trim());
          const targetPhones = currentPhones.split(/[;,]/).map(p => p.trim());
          const newPhones = sourcePhones.filter(p => p && !targetPhones.includes(p));
          if (newPhones.length > 0) {
            const mergedPhones = [...currentPhones.split(/[;,]/).map(p => p.trim()).filter(p => p), ...source.phone.split(/[;,]/).map(p => p.trim()).filter(p => p)];
            updateData.phone = mergedPhones.join('; ');
          }
        }
      }
      
      // Update other fields if target doesn't have them
      if (source.city && (!target.city || target.city.trim() === '')) {
        updateData.city = source.city;
      }
      if (source.state && (!target.state || target.state.trim() === '')) {
        updateData.state = source.state;
      }
      if (source.fullAddress && (!target.fullAddress || target.fullAddress.trim() === '')) {
        updateData.fullAddress = source.fullAddress;
      }
      if (source.latitude && (!target.latitude || target.latitude === 0)) {
        updateData.latitude = source.latitude;
      }
      if (source.longitude && (!target.longitude || target.longitude === 0)) {
        updateData.longitude = source.longitude;
      }
      if (source.birdRep && (!target.birdRep || target.birdRep === 'TBD')) {
        updateData.birdRep = source.birdRep;
      }
      if (source.pipefile && (!target.pipefile || target.pipefile.trim() === '')) {
        updateData.pipefile = source.pipefile;
      }
      if (source.avetta && (!target.avetta || target.avetta.trim() === '')) {
        updateData.avetta = source.avetta;
      }
      if (source.subRanking && (!target.subRanking || target.subRanking.trim() === '')) {
        updateData.subRanking = source.subRanking;
      }
      
      // Append notes
      if (source.notes && source.notes.trim() !== '') {
        const currentNotes = target.notes || '';
        if (!currentNotes.includes(source.notes)) {
          updateData.notes = currentNotes ? `${currentNotes}\n\n[Merged from ID ${sourceId}]: ${source.notes}` : source.notes;
        }
      }
      
      // Clear needsReview flag when merging (contractor has been reviewed and merged)
      if (source.needsReview || target.needsReview) {
        updateData.needsReview = false;
      }

      // Update target contractor with merged data
      if (Object.keys(updateData).length > 0) {
        await storage.updateContractor(targetId, updateData);
      }

      // Update all foreign key references in related tables
      await storage.mergeContractorReferences(sourceId, targetId);

      // Collect and update departure locations from all crew availability submissions
      await storage.updateContractorDepartureLocations(targetId);

      // Delete the source contractor
      await storage.deleteContractor(sourceId);

      res.json({ success: true, message: `Successfully merged contractor ${sourceId} into ${targetId}` });
    } catch (error: any) {
      console.error('Merge contractors error:', error);
      res.status(500).json({ error: error.message || "Failed to merge contractors" });
    }
  });

  // Contractor file endpoints
  app.post("/api/contractors/:id/files", upload.single('file'), async (req, res) => {
    try {
      const contractorId = parseInt(req.params.id);

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Check if contractor exists
      const contractor = await storage.getContractor(contractorId);
      if (!contractor) {
        return res.status(404).json({ error: "Contractor not found" });
      }

      const fileData = {
        contractorId,
        filename: req.file.filename,
        originalName: req.file.originalname,
        filePath: req.file.path,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      };

      const contractorFile = await storage.createContractorFile(fileData);
      res.status(201).json(contractorFile);
    } catch (error: any) {
      console.error('File upload error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/contractors/:id/files", async (req, res) => {
    try {
      const contractorId = parseInt(req.params.id);
      const files = await storage.getContractorFiles(contractorId);
      res.json(files);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/contractor-files/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteContractorFile(id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/contractor-files/:id/download", async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      const [file] = await db.select().from(contractorFiles).where(eq(contractorFiles.id, fileId));

      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      res.download(file.filePath, file.originalName);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Contractor review endpoints
  app.post("/api/contractor-reviews", async (req, res) => {
    try {
      const reviewData = insertContractorReviewSchema.parse(req.body);
      const review = await storage.createContractorReview(reviewData);
      res.status(201).json(review);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/contractor-reviews/:contractorId", async (req, res) => {
    try {
      const contractorId = parseInt(req.params.contractorId);
      const reviews = await storage.getContractorReviews(contractorId);
      res.json(reviews);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a contractor review
  app.delete("/api/contractor-reviews/:reviewId", async (req, res) => {
    try {
      const reviewId = parseInt(req.params.reviewId);
      await storage.deleteContractorReview(reviewId);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/contractor-reviews", async (req, res) => {
    try {
      const reviews = await storage.getAllContractorReviews();
      res.json(reviews);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create analysis point
  app.post("/api/analysis-points", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const validatedData = insertAnalysisPointSchema.parse({
        ...req.body,
        sessionId
      });
      const point = await storage.createAnalysisPoint(validatedData);
      res.json(point);
    } catch (error) {
      console.error('Create analysis point error:', error);
      res.status(400).json({ message: "Invalid analysis point data" });
    }
  });

  // Get all analysis points
  app.get("/api/analysis-points", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const points = await storage.getAllAnalysisPoints(sessionId);
      res.json(points);
    } catch (error) {
      console.error('Get analysis points error:', error);
      res.status(500).json({ message: "Failed to get analysis points" });
    }
  });

  // Delete analysis point
  app.delete("/api/analysis-points/:id", async (req, res) => {
    try {
      const pointId = parseInt(req.params.id);
      const sessionId = getSessionId(req);
      await storage.deleteAnalysisPoint(pointId, sessionId);
      res.json({ message: "Analysis point deleted" });
    } catch (error) {
      console.error('Delete analysis point error:', error);
      res.status(500).json({ message: "Failed to delete analysis point" });
    }
  });

  // Calculate distances for a point
  app.post("/api/calculate-distances/:pointId", async (req, res) => {
    try {
      const pointId = parseInt(req.params.pointId);
      const sessionId = getSessionId(req);
      const { maxDistance } = req.body; // Optional max distance in miles
      const points = await storage.getAllAnalysisPoints(sessionId);
      
      // Get ALL contractors and existing resources
      const contractors = await storage.getAllContractors();
      const existingResources = await storage.getAllResources();
      
      // Create a map of contractorId -> resourceId for existing resources
      const contractorResourceMap = new Map();
      existingResources.forEach(resource => {
        if (resource.properties?.contractorId) {
          contractorResourceMap.set(resource.properties.contractorId, resource.id);
        }
      });
      
      // Sync contractors to resources table (create resources for contractors that don't have one)
      const contractorsWithCoords = contractors.filter(
        contractor => contractor.latitude && contractor.longitude && 
                     contractor.latitude !== 0 && contractor.longitude !== 0
      );
      
      for (const contractor of contractorsWithCoords) {
        if (!contractorResourceMap.has(contractor.id)) {
          // Create a resource for this contractor
          const newResource = await storage.createResource({
            name: contractor.name || contractor.company,
            type: contractor.category || 'Unknown',
            latitude: contractor.latitude,
            longitude: contractor.longitude,
            description: contractor.notes || '',
            properties: {
              address: contractor.fullAddress || `${contractor.city || ''} ${contractor.state || ''}`.trim(),
              contractorId: contractor.id,
              needsReview: contractor.needsReview || false
            }
          });
          contractorResourceMap.set(contractor.id, newResource.id);
        }
      }
      
      // Now get ALL resources (including newly created ones)
      const resources = await storage.getAllResources();

      const point = points.find(p => p.id === pointId);
      if (!point) {
        return res.status(404).json({ message: "Analysis point not found" });
      }

      if (resources.length === 0) {
        return res.status(400).json({ message: "No resources available for calculation" });
      }

      const contractorResources = resources.filter(r => r.properties?.contractorId);
      const storageYardResources = resources.filter(r => !r.properties?.contractorId);
      console.log(`Calculating distances for ${resources.length} resources (${contractorResources.length} contractors + ${storageYardResources.length} storage yards) from point: ${point.label}`);

      // Clear existing calculations for this point to avoid duplicates
      await storage.clearCalculationsForPoint(pointId, sessionId);

      // Calculate routes to all resources
      const routes = await routingService.calculateBatchRoutes(point, resources);

      // Convert all routes to calculations and store them (no filtering at storage level)
      const calculationData = routes.map((route, index) => {
        const distanceInMiles = route.distance / 1609.34; // Convert meters to miles
        return {
          route,
          resource: resources[index],
          distanceInMiles,
          calculationData: {
            analysisPointId: pointId,
            resourceId: resources[index].id,
            distance: distanceInMiles,
            duration: route.duration,
            route: route.geometry,
            sessionId: sessionId,
          }
        };
      });

      // Count resources within range for logging (but store all calculations)
      const withinRangeCount = maxDistance 
        ? calculationData.filter(item => item.distanceInMiles <= maxDistance).length
        : calculationData.length;

      console.log(`${withinRangeCount} resources within range`);

      // Store all calculations (let filtering happen when retrieving data)
      const calculations = await Promise.all(
        calculationData.map(item => 
          storage.createDistanceCalculation(item.calculationData)
        )
      );

      res.json({ message: "Distances calculated successfully", count: calculations.length });
    } catch (error) {
      console.error('Calculate distances error:', error);
      res.status(500).json({ message: "Failed to calculate distances" });
    }
  });

  // Get calculations with resources for a point
  app.get("/api/analysis-points/:pointId/calculations", async (req, res) => {
    try {
      const pointId = parseInt(req.params.pointId);
      const sessionId = getSessionId(req);
      const { sort = 'distance' } = req.query;

      const calculations = await storage.getCalculationsWithResources(pointId, sessionId);

      console.log(`Found ${calculations.length} calculations for point ${pointId}`);
      if (calculations.length > 0) {
        console.log('Sample calculation:', JSON.stringify(calculations[0], null, 2));
      }

      // Sort results
      calculations.sort((a: any, b: any) => {
        switch (sort) {
          case 'time':
          case 'duration':
            return a.duration - b.duration;
          case 'name':
            return a.resource.name.localeCompare(b.resource.name);
          case 'distance':
          default:
            return a.distance - b.distance;
        }
      });

      res.json(calculations);
    } catch (error) {
      console.error('Get calculations error:', error);
      res.status(500).json({ message: "Failed to get calculations" });
    }
  });

  // Export results
  app.post("/api/export", async (req, res) => {
    try {
      const { format = 'json', pointId, options = {} } = req.body;

      if (!pointId) {
        return res.status(400).json({ message: "Point ID required for export" });
      }

      const sessionId = getSessionId(req);
      const calculations = await storage.getCalculationsWithResources(pointId, sessionId);
      const selectedPoint = await storage.getAllAnalysisPoints(sessionId);
      const point = selectedPoint.find(p => p.id === pointId);

      switch (format) {
        case 'csv':
          const csvData = generateCSV(calculations, options);
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="distance_analysis_${point?.label.replace(/\s+/g, '_') || 'export'}.csv"`);
          return res.send(csvData);

        case 'excel':
          // Get contractor data to enrich export
          const allContractors = await storage.getAllContractors();
          const contractorMap = new Map(allContractors.map(c => [c.id, c]));
          
          const excelData = calculations.map((calc: any) => {
            // Find contractor associated with this resource
            const contractorId = calc.resource.properties?.contractorId;
            const contractor = contractorMap.get(contractorId);
            
            const row: any = {
              'Resource Name': calc.resource.name,
              'Resource Type': calc.resource.type,
            };

            if (options.includeDistances !== false) {
              row['Distance (miles)'] = parseFloat(calc.distance.toFixed(2)); // Keep as number for sorting
            }

            if (options.includeTimes !== false) {
              row['Travel Time (hours)'] = parseFloat((calc.duration / 3600).toFixed(2)); // Hours as number
              row['Travel Time (formatted)'] = formatDuration(calc.duration); // Formatted string
            }

            row['Latitude'] = parseFloat(calc.resource.latitude.toFixed(6));
            row['Longitude'] = parseFloat(calc.resource.longitude.toFixed(6));
            row['Description'] = calc.resource.description || '';
            
            // Add contractor information if available
            if (contractor) {
              row['Company'] = contractor.company || '';
              row['Contact Name'] = contractor.name || '';
              row['Email'] = contractor.email || '';
              row['Phone'] = contractor.phone || '';
              row['City'] = contractor.city || '';
              row['State'] = contractor.state || '';
              row['Category'] = contractor.category || '';
              row['Rating'] = contractor.rating || 0;
              row['BIRD REP'] = contractor.birdRep || '';
              row['Pipefile'] = contractor.pipefile || '';
              row['AVETTA'] = contractor.avetta || '';
              row['ISN Complete'] = contractor.isnComplete ? 'Yes' : 'No';
            }

            return row;
          });

          const buffer = exportToExcel(excelData, 'distance_analysis');

          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename="distance_analysis_${point?.label.replace(/\s+/g, '_') || 'export'}.xlsx"`);
          return res.send(buffer);

        case 'json':
        default:
          const jsonData: any = {
            exportedAt: new Date().toISOString(),
            pointId,
            calculations: calculations.map((calc: any) => {
              const item: any = {
                resource: calc.resource,
              };

              if (options.includeDistances !== false) {
                item.distance = calc.distance;
              }

              if (options.includeTimes !== false) {
                item.duration = calc.duration;
                item.travelTime = formatDuration(calc.duration);
              }

              return item;
            }),
          };

          res.json(jsonData);
      }
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ message: "Failed to export data" });
    }
  });

  // Export calculations for results table
  app.get("/api/analysis-points/:pointId/calculations/export", async (req, res) => {
    try {
      const pointId = parseInt(req.params.pointId);
      const sessionId = await getEffectiveSessionId(req, pointId);
      const format = req.query.format as string || 'csv';

      console.log(`Export request - pointId: ${pointId}, sessionId: ${sessionId}, format: ${format}`);
      const groupByBirdRep = req.query.groupByBirdRep === 'true'; // New option for Bird Rep grouping
      const maxDistance = req.query.maxDistance ? parseFloat(req.query.maxDistance as string) : null;
      const maxTime = req.query.maxTime ? parseFloat(req.query.maxTime as string) * 60 : null; // Convert minutes to seconds

      let calculations = await storage.getCalculationsWithResources(pointId, sessionId);

      // If no calculations found with sessionId, try without sessionId for backward compatibility
      if (calculations.length === 0) {
        console.log(`No calculations found for sessionId ${sessionId}, trying without sessionId`);
        calculations = await storage.getCalculationsWithResources(pointId);
      }

      // Apply distance filter (same logic as Results Table)
      if (maxDistance) {
        calculations = calculations.filter((calc: any) => calc.distance <= maxDistance);
      }

      // Apply time filter (same logic as Results Table)
      if (maxTime) {
        calculations = calculations.filter((calc: any) => calc.duration <= maxTime);
      }

      // Get unique contractor IDs from the filtered calculations
      const contractorIds = calculations
        .map((calc: any) => calc.resource.properties?.contractorId)
        .filter(id => id !== undefined);

      // Fetch only the contractors that are in the filtered analysis results
      const allContractors = await storage.getAllContractors();
      const relevantContractors = allContractors.filter(c => contractorIds.includes(c.id));

      // Create a map for quick contractor lookup
      const contractorMap = new Map(relevantContractors.map(c => [c.id, c]));

      // Build export data with all contractor fields from database
      console.log(`Found ${calculations.length} calculations for export`);
      console.log('Sample calculation:', calculations[0]);

      const exportData = calculations.map((calc: any) => {
        const contractorId = calc.resource.properties?.contractorId;
        const contractor = contractorId ? contractorMap.get(contractorId) : null;

        return {
          'Name': contractor?.name || calc.resource.name,
          'Distance (miles)': parseFloat(calc.distance.toFixed(2)), // Keep as number for Excel sorting
          'Drive Time (hours)': parseFloat((calc.duration / 3600).toFixed(2)), // Hours as number for Excel sorting
          'Drive Time (formatted)': formatDuration(calc.duration), // Formatted string for readability
          'Company': contractor?.company || '',
          'Category': contractor?.category || calc.resource.type,
          'Pipefile': contractor?.pipefile || '',
          'AVETTA': contractor?.avetta || '',
          'ISN Complete': contractor?.isnComplete ? 'Yes' : 'No',
          'City': contractor?.city || '',
          'State': contractor?.state || '',
          'Full Address': contractor?.fullAddress || '',
          'Latitude': parseFloat((contractor?.latitude || calc.resource.latitude).toFixed(6)),
          'Longitude': parseFloat((contractor?.longitude || calc.resource.longitude).toFixed(6)),
          'Phone': contractor?.phone || '',
          'Email': contractor?.email || '',
          'BIRD REP': contractor?.birdRep || '',
          'SUB Ranking': contractor?.subRanking || '',
          'MSA Status': contractor?.newMsaComplete || '',
          'FTE Counts Per Location': contractor?.fteCountsPerLocation || '',
          'Pipefile updates': contractor?.pipefileUpdates || '',
          'Notes': contractor?.notes || '',
          'Rating': contractor?.rating || 0,
        };
      });

      console.log(`Export data length: ${exportData.length}`);
      if (exportData.length > 0) {
        console.log('Sample export data:', exportData[0]);
      }

      // Filter out rows that are essentially blank (only have distance/time but no meaningful contractor data)
      const filteredExportData = exportData.filter((row: any) => {
        // Keep the row if it has at least one of these key fields populated
        const hasName = row['Name'] && row['Name'].trim() !== '';
        const hasCompany = row['Company'] && row['Company'].trim() !== '';
        const hasPhone = row['Phone'] && row['Phone'].trim() !== '';
        const hasEmail = row['Email'] && row['Email'].trim() !== '';
        const hasCategory = row['Category'] && row['Category'].trim() !== '';
        
        // Row must have a name at minimum
        return hasName && (hasCompany || hasPhone || hasEmail || hasCategory);
      });

      console.log(`Filtered export data length: ${filteredExportData.length} (removed ${exportData.length - filteredExportData.length} blank rows)`);

      // Remove duplicates based on email and phone number
      // Keep the first occurrence (which will be the closest due to distance sorting)
      const seenContacts = new Set<string>();
      const deduplicatedData = filteredExportData.filter((row: any) => {
        const email = (row['Email'] || '').trim().toLowerCase();
        const phone = (row['Phone'] || '').trim();
        
        // Create a unique key from email and/or phone
        // If both are empty, keep the row (might be storage yard or other resource)
        if (!email && !phone) {
          return true;
        }
        
        const contactKey = `${email}|${phone}`;
        
        // If we've seen this exact email/phone combination, skip it
        if (seenContacts.has(contactKey)) {
          return false;
        }
        
        // Mark this contact as seen
        seenContacts.add(contactKey);
        return true;
      });

      console.log(`Deduplicated export data length: ${deduplicatedData.length} (removed ${filteredExportData.length - deduplicatedData.length} duplicates)`);

      if (format === 'excel') {
        const buffer = exportToExcelWithBirdRepSheets(deduplicatedData, 'distance_analysis');

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="distance_analysis.xlsx"');
        return res.send(buffer);
      } else if (format === 'csv') {
        if (groupByBirdRep) {
          // Create ZIP file with separate CSV files for each Bird Rep
          const { files } = exportToCSVWithBirdRepFiles(deduplicatedData, 'distance_analysis');

          // Create ZIP file with archiver

          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', 'attachment; filename="distance_analysis_by_bird_rep.zip"');

          const archive = archiver('zip', { zlib: { level: 9 } });
          archive.pipe(res);

          // Add each CSV file to the archive
          files.forEach(file => {
            archive.append(file.content, { name: file.name });
          });

          await archive.finalize();
          return;
        } else {
          // Regular single CSV export
          const csvHeaders = Object.keys(deduplicatedData[0] || {});
          const csvRows = deduplicatedData.map(row => 
            csvHeaders.map(header => `"${(row as any)[header] || ''}"`).join(',')
          );
          const csv = [csvHeaders.join(','), ...csvRows].join('\n');

          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename="distance_analysis.csv"');
          return res.send(csv);
        }
      } else if (format === 'webeoc') {
        // WebEOC Contact Export - only contact information (using deduplicated data)
        const webeocData = deduplicatedData.map((row: any) => {
          // Split name into first and last name
          const fullName = row['Name'] || '';
          const nameParts = fullName.trim().split(/\s+/);
          const lastName = nameParts.length > 0 ? nameParts[nameParts.length - 1] : '';
          const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : nameParts[0] || '';
          
          return {
            'LAST_NAME': lastName,
            'FIRST_NAME': firstName,
            'CONTACT_EMAIL': row['Email'] || '',
            'CONTACT_PHONE_NUMBER_TEXT': row['Phone'] || '',
          };
        });

        const csvHeaders = ['LAST_NAME', 'FIRST_NAME', 'CONTACT_EMAIL', 'CONTACT_PHONE_NUMBER_TEXT'];
        const csvRows = webeocData.map(row => 
          csvHeaders.map(header => `"${(row as any)[header] || ''}"`).join(',')
        );
        const csv = [csvHeaders.join(','), ...csvRows].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="webeoc_contacts.csv"');
        return res.send(csv);
      }
    } catch (error) {
      console.error('Export calculations error:', error);
      res.status(500).json({ message: "Failed to export calculations" });
    }
  });

  // Clear all database data
  app.post("/api/database/clear", async (req, res) => {
    try {
      await storage.deleteAllResources();
      await db.delete(distanceCalculations);
      await db.delete(analysisPoints);
      await db.delete(contractors);
      res.json({ message: "Database cleared successfully" });
    } catch (error) {
      console.error('Clear database error:', error);
      res.status(500).json({ message: "Failed to clear database" });
    }
  });

  // Note: Authentication routes (/api/login, /api/callback, /api/logout) 
  // are handled by replitAuth.ts setupAuth() which is called in index.ts

  // Contractor Submission Route (Public - No Auth Required)
  app.post("/api/contractor-submissions", async (req, res) => {
    try {
      const { hasSubcontractor, subcontractorData, ...submissionData } = req.body;

      // Create or find the contractor first
      let contractorId;

      // Use enhanced fuzzy matching (handles case, phone formatting, and email variations)
      const existingContractor = await storage.findContractorByNormalizedMatch(
        submissionData.companyName,
        submissionData.contractorName,
        submissionData.email,
        submissionData.phone
      );

      if (existingContractor) {
        contractorId = existingContractor.id;
        console.log(`✓ Matched existing contractor #${contractorId}: ${existingContractor.company}`);

        // Merge new information with existing contractor data
        const updateData: any = {};
        
        // Helper to normalize email for comparison (MUST match storage.ts logic)
        const normalizeEmail = (email: string) => email.toLowerCase().trim();
        
        // Helper to normalize phone for comparison (MUST match storage.ts logic)
        const normalizePhone = (phone: string) => {
          let digits = phone.replace(/\D/g, ''); // Remove all non-digits
          
          // Handle US country code: if starts with "1" and has 11 digits, remove leading "1"
          if (digits.length === 11 && digits.startsWith('1')) {
            digits = digits.substring(1);
          }
          
          // Only keep first 10 digits (ignore extensions)
          if (digits.length > 10) {
            digits = digits.substring(0, 10);
          }
          
          return digits;
        };
        
        // Add email if new and different (using normalized comparison, support both ; and , separators)
        if (submissionData.email && submissionData.email.trim() !== '') {
          const currentEmails = (existingContractor.email || '').split(/[;,]/).map(e => normalizeEmail(e));
          const newEmail = normalizeEmail(submissionData.email);
          
          if (!currentEmails.some(e => e === newEmail)) {
            updateData.email = existingContractor.email ? `${existingContractor.email}; ${submissionData.email.trim()}` : submissionData.email.trim();
            console.log(`  → Adding new email: ${submissionData.email.trim()}`);
          } else {
            console.log(`  → Email already exists (normalized match)`);
          }
        }
        
        // Add phone if new and different (using normalized comparison, support both ; and , separators)
        if (submissionData.phone && submissionData.phone.trim() !== '') {
          const currentPhones = (existingContractor.phone || '').split(/[;,]/).map(p => normalizePhone(p));
          const newPhone = normalizePhone(submissionData.phone);
          
          if (!currentPhones.some(p => p === newPhone && p.length >= 10)) {
            updateData.phone = existingContractor.phone ? `${existingContractor.phone}; ${submissionData.phone.trim()}` : submissionData.phone.trim();
            console.log(`  → Adding new phone: ${submissionData.phone.trim()}`);
          } else {
            console.log(`  → Phone already exists (normalized match)`);
          }
        }
        
        // Update category if provided and not set
        if (submissionData.category && (!existingContractor.category || existingContractor.category === 'Unknown')) {
          updateData.category = submissionData.category;
        }
        
        // Update bird rep if provided and not set
        if (submissionData.birdRep && (!existingContractor.birdRep || existingContractor.birdRep === 'TBD')) {
          updateData.birdRep = submissionData.birdRep;
        }

        if (Object.keys(updateData).length > 0) {
          await storage.updateContractor(contractorId, updateData);
        }
      } else {
        // Create new contractor and mark for review
        const newContractor = await storage.createContractor({
          name: submissionData.contractorName,
          company: submissionData.companyName,
          email: submissionData.email || '',
          phone: submissionData.phone || '',
          category: submissionData.category,
          city: '',
          state: '',
          birdRep: submissionData.birdRep || 'TBD',
          rating: 0,
          notes: 'Created from contractor availability submission',
          needsReview: true
        });
        contractorId = newContractor.id;
      }

      // Create availability submission record
      const submission = await storage.createAvailabilitySubmission({
        filename: 'contractor_form_submission',
        originalName: `Submission from ${submissionData.companyName}`,
        filePath: '',
        submissionType: 'web_form',
        status: 'submitted',
        submittedBy: submissionData.submittedBy || 'contractor'
      });

      // Determine session ID for this submission
      let sessionIdForSubmission = submissionData.sessionId || 'active';
      
      // If a numeric session ID is provided, verify it exists
      if (sessionIdForSubmission !== 'active' && !isNaN(parseInt(sessionIdForSubmission))) {
        const session = await storage.getAvailabilitySessionById(parseInt(sessionIdForSubmission));
        if (!session) {
          // Fall back to active if session doesn't exist
          sessionIdForSubmission = 'active';
        }
      }

      // Create main contractor availability
      const availabilityData = {
        contractorId,
        departureLocation: submissionData.departureLocation,
        departureLatitude: submissionData.departureLatitude || null,
        departureLongitude: submissionData.departureLongitude || null,
        totalFTE: submissionData.totalFTE || 0,
        buckets: submissionData.buckets || 0,
        diggers: submissionData.diggers || 0,
        pickups: submissionData.pickups || 0,
        backyardMachines: submissionData.backyardMachines || 0,
        notes: submissionData.notes || '',
        submittedBy: submissionData.submittedBy || 'contractor',
        availableStartDate: new Date(),
        status: 'submitted',
        sessionId: sessionIdForSubmission
      };

      const availability = await storage.createCrewAvailability(availabilityData);

      // Handle subcontractor if present
      if (hasSubcontractor && subcontractorData) {
        // Check if subcontractor already exists using enhanced fuzzy matching
        let subcontractor = await storage.findContractorByNormalizedMatch(
          subcontractorData.company,
          subcontractorData.name,
          subcontractorData.email,
          subcontractorData.phone
        );
        
        if (!subcontractor) {
          // Create subcontractor record only if it doesn't exist
          subcontractor = await storage.createContractor({
            name: subcontractorData.name,
            company: subcontractorData.company,
            category: 'Subcontractor',
            email: '', 
            phone: '',
            city: '',
            state: '',
            birdRep: submissionData.birdRep || 'TBD',
            rating: 0,
            notes: `Subcontractor brought by ${submissionData.companyName} (ID: ${contractorId})`,
            needsReview: true
          });
        }

        // Create subcontractor availability
        const subAvailabilityData = {
          contractorId: subcontractor.id,
          departureLocation: subcontractorData.departureLocation,
          departureLatitude: subcontractorData.departureLatitude || null,
          departureLongitude: subcontractorData.departureLongitude || null,
          totalFTE: subcontractorData.totalFTE || 0,
          buckets: subcontractorData.buckets || 0,
          diggers: subcontractorData.diggers || 0,
          pickups: subcontractorData.pickups || 0,
          backyardMachines: subcontractorData.backyardMachines || 0,
          notes: `Subcontractor for ${submissionData.companyName}`,
          submittedBy: submissionData.submittedBy || 'contractor',
          availableStartDate: new Date(),
          status: 'submitted',
          sessionId: sessionIdForSubmission
        };

        await storage.createCrewAvailability(subAvailabilityData);
      }

      console.log(`Contractor submission processed successfully for ${submissionData.companyName}`);

      res.json({ 
        message: "Submission received successfully",
        submissionId: submission.id,
        contractorId: contractorId
      });

    } catch (error) {
      console.error('Contractor submission error:', error);
      res.status(500).json({ message: "Failed to process submission" });
    }
  });

  // Availability Sessions endpoints
  app.get("/api/availability-sessions", async (req, res) => {
    try {
      const sessions = await storage.getAvailabilitySessions();
      
      // Get counts for each session
      const sessionsWithCounts = await Promise.all(
        sessions.map(async (session) => {
          const availability = await storage.getCrewAvailabilityBySession(session.id);
          return {
            ...session,
            recordCount: availability.length
          };
        })
      );

      // Get unassigned count
      const unassigned = await storage.getCrewAvailabilityBySession('unassigned');
      
      res.json({
        sessions: sessionsWithCounts,
        unassignedCount: unassigned.length
      });
    } catch (error) {
      console.error('Get availability sessions error:', error);
      res.status(500).json({ message: "Failed to get availability sessions" });
    }
  });

  app.get("/api/availability-sessions/:id", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const session = await storage.getAvailabilitySessionById(sessionId);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      res.json(session);
    } catch (error) {
      console.error('Get availability session error:', error);
      res.status(500).json({ message: "Failed to get availability session" });
    }
  });

  app.post("/api/availability-sessions/start-new", async (req, res) => {
    try {
      const { label } = req.body;
      const newSession = await storage.startNewAvailabilitySession(label);
      res.json(newSession);
    } catch (error) {
      console.error('Start new availability session error:', error);
      res.status(500).json({ message: "Failed to start new availability session" });
    }
  });

  // Crew Availability Routes
  app.get("/api/crew-availability", async (req, res) => {
    try {
      const { sessionId } = req.query;
      
      // Get availability filtered by session
      let availabilities;
      if (sessionId === 'active') {
        availabilities = await storage.getCrewAvailabilityBySession('active');
      } else if (sessionId === 'unassigned') {
        availabilities = await storage.getCrewAvailabilityBySession('unassigned');
      } else if (sessionId && !isNaN(parseInt(sessionId as string))) {
        availabilities = await storage.getCrewAvailabilityBySession(parseInt(sessionId as string));
      } else {
        // Default to active session
        availabilities = await storage.getCrewAvailabilityBySession('active');
      }

      // Get contractor information for each availability
      const availabilitiesWithContractors = await Promise.all(
        availabilities.map(async (availability) => {
          const contractor = await storage.getContractor(availability.contractorId);
          return {
            ...availability,
            contractor: contractor ? {
              name: contractor.name,
              company: contractor.company,
              category: contractor.category,
              email: contractor.email,
              phone: contractor.phone,
              birdRep: contractor.birdRep,
              subRanking: contractor.subRanking,
              newMsaComplete: contractor.newMsaComplete,
              isnComplete: contractor.isnComplete
            } : null
          };
        })
      );

      res.json(availabilitiesWithContractors);
    } catch (error) {
      console.error('Get crew availability error:', error);
      // Fallback to getting all availability if session filtering fails
      try {
        const availabilities = await storage.getAllCrewAvailability();
        const availabilitiesWithContractors = await Promise.all(
          availabilities.map(async (availability) => {
            const contractor = await storage.getContractor(availability.contractorId);
            return {
              ...availability,
              contractor: contractor ? {
                name: contractor.name,
                company: contractor.company,
                category: contractor.category,
                email: contractor.email,
                phone: contractor.phone,
                birdRep: contractor.birdRep,
                subRanking: contractor.subRanking,
                newMsaComplete: contractor.newMsaComplete
              } : null
            };
          })
        );
        res.json(availabilitiesWithContractors);
      } catch (fallbackError) {
        res.status(500).json({ message: "Failed to get crew availability" });
      }
    }
  });

  // Fallback route for availability data when sessions aren't available
  app.get("/api/crew-availability-fallback", async (req, res) => {
    try {
      // Get all availability data using the original method
      const availabilities = await storage.getAllCrewAvailability();

      // Get contractor information for each availability
      const availabilitiesWithContractors = await Promise.all(
        availabilities.map(async (availability) => {
          const contractor = await storage.getContractor(availability.contractorId);
          return {
            ...availability,
            contractor: contractor ? {
              name: contractor.name,
              company: contractor.company,
              category: contractor.category,
              email: contractor.email,
              phone: contractor.phone,
              birdRep: contractor.birdRep,
              subRanking: contractor.subRanking,
              newMsaComplete: contractor.newMsaComplete,
              isnComplete: contractor.isnComplete
            } : null
          };
        })
      );

      res.json(availabilitiesWithContractors);
    } catch (error) {
      console.error('Get crew availability fallback error:', error);
      res.status(500).json({ message: "Failed to get crew availability" });
    }
  });

  app.post("/api/crew-availability", async (req, res) => {
    try {
      const { hasSubcontractor, subcontractorData, isNewCompany, ...availabilityData } = req.body;

      // Debug logging
      console.log('Received crew availability data:', {
        contractorId: availabilityData.contractorId,
        contractorIdType: typeof availabilityData.contractorId,
        isNewCompany,
        fullBody: req.body
      });

      // Validate contractorId
      if (!availabilityData.contractorId) {
        console.error('Missing contractorId in request');
        return res.status(400).json({ message: "Contractor ID is required" });
      }

      // Ensure contractorId is a number
      const contractorId = parseInt(availabilityData.contractorId);
      if (isNaN(contractorId)) {
        console.error('Invalid contractorId:', availabilityData.contractorId);
        return res.status(400).json({ message: "Invalid contractor ID format" });
      }

      // Update the data with parsed contractorId
      availabilityData.contractorId = contractorId;

      // Add default dates if not provided
      const currentDate = new Date();
      const dataWithDefaults = {
        ...availabilityData,
        availableStartDate: availabilityData.availableStartDate || currentDate,
        availableEndDate: availabilityData.availableEndDate || undefined,
        submissionDate: currentDate
      };

      // Create main contractor availability
      const availability = await storage.createCrewAvailability(dataWithDefaults);

      // If there's a subcontractor, create a separate availability record
      if (hasSubcontractor && subcontractorData) {
        // Check if subcontractor already exists using enhanced fuzzy matching
        let subcontractor = await storage.findContractorByNormalizedMatch(
          subcontractorData.company,
          subcontractorData.name,
          subcontractorData.email,
          subcontractorData.phone
        );
        
        if (!subcontractor) {
          // Create subcontractor only if it doesn't exist
          subcontractor = await storage.createContractor({
            name: subcontractorData.name,
            company: subcontractorData.company,
            category: 'Subcontractor',
            email: '',
            phone: '',
            city: '',
            state: '',
            birdRep: '',
            rating: 0,
            notes: `Subcontractor brought by contractor ID ${availabilityData.contractorId}`,
            needsReview: true
          });
        }

        // Create availability record for subcontractor
        await storage.createCrewAvailability({
          contractorId: subcontractor.id,
          availableStartDate: currentDate,
          availableEndDate: undefined,
          submissionDate: currentDate,
          departureLocation: subcontractorData.departureLocation,
          totalFTE: subcontractorData.totalFTE || 0,
          buckets: subcontractorData.buckets || 0,
          diggers: subcontractorData.diggers || 0,
          pickups: subcontractorData.pickups || 0,
          backyardMachines: subcontractorData.backyardMachines || 0,
          linemenCount: 0, // Legacy field
          groundmenCount: 0, // Legacy field
          operatorsCount: 0, // Legacy field
          foremanCount: 0, // Legacy field
          apprenticesCount: 0, // Legacy field
          status: 'submitted',
          notes: `Subcontractor availability brought by contractor ID ${availabilityData.contractorId}`,
          submittedBy: availabilityData.submittedBy
        });
      }

      res.json(availability);
    } catch (error) {
      console.error('Create crew availability error:', error);
      res.status(500).json({ message: "Failed to create crew availability" });
    }
  });

  app.patch("/api/crew-availability/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateCrewAvailability(id, req.body);
      if (!updated) {
        return res.status(404).json({ message: "Crew availability not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error('Update crew availability error:', error);
      res.status(500).json({ message: "Failed to update crew availability" });
    }
  });

  app.delete("/api/crew-availability/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteCrewAvailability(id);
      res.json({ message: "Crew availability deleted successfully" });
    } catch (error) {
      console.error('Delete crew availability error:', error);
      res.status(500).json({ message: "Failed to delete crew availability" });
    }
  });

  // Availability Submissions routes
  app.get("/api/availability-submissions", async (req, res) => {
    try {
      const submissions = await storage.getAvailabilitySubmissions();
      res.json(submissions);
    } catch (error) {
      console.error('Get availability submissions error:', error);
      res.status(500).json({ message: "Failed to get availability submissions" });
    }
  });

  app.patch("/api/availability-submissions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateAvailabilitySubmission(id, req.body);
      if (!updated) {
        return res.status(404).json({ message: "Availability submission not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error('Update availability submission error:', error);
      res.status(500).json({ message: "Failed to update availability submission" });
    }
  });

  // Excel export route for distance analysis
  app.post("/api/export-excel", async (req, res) => {
    try {
      const { data, filename, sheetName } = req.body;

      // Import XLSX dynamically
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(data);

      // Auto-size columns
      const colWidths: any[] = [];
      const headers = Object.keys(data[0] || {});
      headers.forEach((header, index) => {
        const maxLength = Math.max(
          header.length,
          ...data.map((row: any) => String(row[header] || '').length)
        );
        colWidths[index] = { width: Math.min(Math.max(maxLength + 2, 10), 30) };
      });
      worksheet['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || 'Sheet1');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename || 'export.xlsx'}"`);
      res.send(buffer);
    } catch (error) {
      console.error('Excel export error:', error);
      res.status(500).json({ message: "Failed to export Excel file" });
    }
  });

  // Color-coded Excel export route for distance analysis (time only)
  app.post("/api/export-excel-color-coded", async (req, res) => {
    try {
      const { data, filename, sheetName, destinations } = req.body;

      // Import ExcelJS dynamically
      const ExcelJSModule = await import('exceljs');
      const ExcelJS = ExcelJSModule.default || ExcelJSModule;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(sheetName || 'Sheet1');

      // Helper function to get cell fill color based on hours
      const getCellColor = (hours: number): string => {
        if (hours <= 4) return 'FF90EE90'; // Green
        if (hours <= 8) return 'FFFFFF00'; // Yellow
        if (hours <= 12) return 'FFFFA500'; // Orange
        return 'FFADD8E6'; // Light Blue
      };

      // Get headers from data
      const headers = Object.keys(data[0] || {});
      
      // Find time column indices
      const timeColumnIndices: number[] = [];
      headers.forEach((header, index) => {
        if (header.includes('Travel Time')) {
          timeColumnIndices.push(index + 1); // ExcelJS is 1-indexed
        }
      });

      // Add header row with bold formatting
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

      // Add data rows
      data.forEach((row: any) => {
        const rowValues = headers.map(header => row[header]);
        const excelRow = worksheet.addRow(rowValues);
        
        // Apply color to time columns
        timeColumnIndices.forEach(colIndex => {
          const cell = excelRow.getCell(colIndex);
          const hours = cell.value as number;
          
          if (typeof hours === 'number' && hours > 0) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: getCellColor(hours) }
            };
          }
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
      });

      // Auto-size columns
      worksheet.columns.forEach((column, index) => {
        if (column) {
          const header = headers[index];
          const maxLength = Math.max(
            header.length,
            ...data.map((row: any) => String(row[header] || '').length)
          );
          column.width = Math.min(Math.max(maxLength + 2, 10), 30);
        }
      });

      // Write to buffer
      const buffer = await workbook.xlsx.writeBuffer();

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename || 'export-color-coded.xlsx'}"`);
      res.send(buffer);
    } catch (error) {
      console.error('Color-coded Excel export error:', error);
      res.status(500).json({ message: "Failed to export color-coded Excel file" });
    }
  });

  // Export availability submissions endpoint
  app.get("/api/crew-availability/export", async (req, res) => {
    try {
      const format = req.query.format as string || 'excel';
      const sessionParam = req.query.session as string;
      
      // Get availability data filtered by session if provided
      let availabilities;
      let sessionLabel = '';
      
      if (sessionParam) {
        if (sessionParam === 'active') {
          availabilities = await storage.getCrewAvailabilityBySession('active');
          const activeSession = await storage.getActiveAvailabilitySession();
          sessionLabel = activeSession?.label || 'Active Session';
        } else if (sessionParam === 'unassigned') {
          availabilities = await storage.getCrewAvailabilityBySession('unassigned');
          sessionLabel = 'Unassigned';
        } else {
          const sessionId = parseInt(sessionParam);
          availabilities = await storage.getCrewAvailabilityBySession(sessionId);
          const session = await storage.getAvailabilitySessionById(sessionId);
          sessionLabel = session?.label || `Session ${sessionId}`;
        }
      } else {
        availabilities = await storage.getAllCrewAvailability();
        sessionLabel = 'All Sessions';
      }
      
      // Get contractor information for each availability
      const availabilitiesWithContractors = await Promise.all(
        availabilities.map(async (availability) => {
          const contractor = await storage.getContractor(availability.contractorId);
          return {
            ...availability,
            contractor: contractor ? {
              name: contractor.name,
              company: contractor.company,
              category: contractor.category,
              email: contractor.email,
              phone: contractor.phone,
              birdRep: contractor.birdRep,
              subRanking: contractor.subRanking,
              newMsaComplete: contractor.newMsaComplete,
              isnComplete: contractor.isnComplete
            } : null
          };
        })
      );

      // Format export data
      const exportData = availabilitiesWithContractors.map((item) => ({
        'Contractor': item.contractor?.company || 'Unknown',
        'Contact Person': item.contractor?.name || 'Unknown',
        'Category': item.contractor?.category || 'Not specified',

        'Email': item.contractor?.email || 'Not provided',
        'Phone': item.contractor?.phone || 'Not provided',
        'Bird Rep': item.contractor?.birdRep || 'Not assigned',
        'Sub Ranking': item.contractor?.subRanking || '',
        'ISN Complete': item.contractor?.isnComplete ? 'Yes' : 'No',
        'Departure City': item.departureCity || (item.departureLocation ? item.departureLocation.split(',')[0]?.trim() : ''),
        'Departure State': item.departureState || (item.departureLocation ? item.departureLocation.split(',')[1]?.trim() : ''),
        'Total FTE': item.totalFTE || 0,
        'Linemen': item.linemenCount || 0,
        'Groundmen': item.groundmenCount || 0,
        'Operators': item.operatorsCount || 0,
        'Foreman': item.foremanCount || 0,
        'Apprentices': item.apprenticesCount || 0,
        'Buckets': item.buckets || 0,
        'Diggers': item.diggers || 0,
        'Pickups': item.pickups || 0,
        'Backyard Machines': item.backyardMachines || 0,
        'Available Start Date': item.availableStartDate ? new Date(item.availableStartDate).toLocaleDateString() : '',
        'Available End Date': item.availableEndDate ? new Date(item.availableEndDate).toLocaleDateString() : 'Open ended',
        'Status': item.status,
        'Submitted By': item.submittedBy || 'Unknown',
        'Reviewed By': item.reviewedBy || 'Pending',
        'Submission Date': item.submissionDate ? new Date(item.submissionDate).toLocaleDateString() : '',
        'Notes': item.notes || ''
      }));

      if (format === 'excel') {
        // Import XLSX dynamically
        const XLSX = await import('xlsx');
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(exportData);

        // Auto-size columns
        const colWidths: any[] = [];
        const headers = Object.keys(exportData[0] || {});
        headers.forEach((header, index) => {
          const maxLength = Math.max(
            header.length,
            ...exportData.map((row: any) => String(row[header] || '').length)
          );
          colWidths[index] = { width: Math.min(Math.max(maxLength + 2, 10), 30) };
        });
        worksheet['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(workbook, worksheet, 'Availability Submissions');
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        const sanitizedSessionLabel = sessionLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `availability_${sanitizedSessionLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(buffer);
      } else if (format === 'csv') {
        // Generate CSV
        const csvHeaders = Object.keys(exportData[0] || {});
        const csvRows = exportData.map(row => 
          csvHeaders.map(header => `"${(row as any)[header] || ''}"`).join(',')
        );
        const csv = [csvHeaders.join(','), ...csvRows].join('\n');

        const sanitizedSessionLabel = sessionLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `availability_${sanitizedSessionLabel}_${new Date().toISOString().slice(0, 10)}.csv`;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csv);
      }

      res.status(400).json({ message: "Invalid format. Use 'excel' or 'csv'" });
    } catch (error) {
      console.error('Export availability submissions error:', error);
      res.status(500).json({ message: "Failed to export availability submissions" });
    }
  });

  // AI-Enhanced Export availability submissions endpoint
  app.get("/api/crew-availability/export-ai-matched", async (req, res) => {
    try {
      const format = req.query.format as string || 'excel';
      const sessionParam = req.query.session as string;
      
      // Get availability data filtered by session if provided
      let availabilities;
      let sessionLabel = '';
      
      if (sessionParam) {
        if (sessionParam === 'active') {
          availabilities = await storage.getCrewAvailabilityBySession('active');
          const activeSession = await storage.getActiveAvailabilitySession();
          sessionLabel = activeSession?.label || 'Active Session';
        } else if (sessionParam === 'unassigned') {
          availabilities = await storage.getCrewAvailabilityBySession('unassigned');
          sessionLabel = 'Unassigned';
        } else {
          const sessionId = parseInt(sessionParam);
          availabilities = await storage.getCrewAvailabilityBySession(sessionId);
          const session = await storage.getAvailabilitySessionById(sessionId);
          sessionLabel = session?.label || `Session ${sessionId}`;
        }
      } else {
        availabilities = await storage.getAllCrewAvailability();
        sessionLabel = 'All Sessions';
      }
      
      // Get all contractors for AI matching
      const allContractors = await storage.getAllContractors();
      
      console.log(`Starting AI matching for ${availabilities.length} availability submissions against ${allContractors.length} contractors`);
      
      // Process each availability submission with AI matching
      const aiMatchedData = await Promise.all(
        availabilities.map(async (availability) => {
          let contractor = null;
          let matchConfidence = 0;
          let matchReasoning = 'No contractor linked';
          let submissionCompanyName = 'Unknown';
          
          // First try to get the linked contractor (existing system)
          if (availability.contractorId) {
            contractor = await storage.getContractor(availability.contractorId);
            if (contractor) {
              matchConfidence = 1.0;
              matchReasoning = 'Direct database link';
              submissionCompanyName = contractor.company;
            }
          }
          
          // If no direct link, try AI matching using the availability notes or any company name we can extract
          if (!contractor) {
            // Try to extract company name from notes or other fields
            const extractedCompanyName = availability.notes || availability.submittedBy || 'Unknown Company';
            
            if (extractedCompanyName && extractedCompanyName !== 'Unknown Company' && extractedCompanyName !== 'admin') {
              const aiMatch = await findBestContractorMatch(extractedCompanyName, allContractors);
              contractor = aiMatch.contractor;
              matchConfidence = aiMatch.confidence;
              matchReasoning = aiMatch.reasoning;
              submissionCompanyName = extractedCompanyName;
            }
          }
          
          return {
            availability,
            contractor,
            matchConfidence,
            matchReasoning,
            submissionCompanyName
          };
        })
      );
      
      console.log(`AI matching complete. Found matches for ${aiMatchedData.filter(d => d.contractor).length} submissions`);

      // Format export data with AI matching information
      const exportData = aiMatchedData.map((item) => ({
        // Submission Information
        'Submission Company Name': item.submissionCompanyName,
        'Submission Notes': item.availability.notes || '',
        'Submitted By': item.availability.submittedBy || 'Unknown',
        'Submission Date': item.availability.submissionDate ? new Date(item.availability.submissionDate).toLocaleDateString() : '',
        'Status': item.availability.status,
        
        // AI Matching Information
        'Match Confidence': Math.round(item.matchConfidence * 100) + '%',
        'Match Reasoning': item.matchReasoning,
        
        // Matched Contractor Information (from database)
        'Database Company': item.contractor?.company || 'No Match Found',
        'Contact Person': item.contractor?.name || '',
        'Category': item.contractor?.category || '',

        'Email': item.contractor?.email || '',
        'Phone': item.contractor?.phone || '',
        'Bird Rep': item.contractor?.birdRep || '',
        'Sub Ranking': item.contractor?.subRanking || '',
        'Full Address': item.contractor?.fullAddress || '',
        'City': item.contractor?.city || '',
        'State': item.contractor?.state || '',
        'Pipefile': item.contractor?.pipefile || '',
        'AVETTA': item.contractor?.avetta || '',
        'ISN Complete': item.contractor?.isnComplete ? 'Yes' : 'No',
        
        // Availability Details
        'Departure City': item.availability.departureCity || (item.availability.departureLocation ? item.availability.departureLocation.split(',')[0]?.trim() : ''),
        'Departure State': item.availability.departureState || (item.availability.departureLocation ? item.availability.departureLocation.split(',')[1]?.trim() : ''),
        'Total FTE': item.availability.totalFTE || 0,
        'Linemen': item.availability.linemenCount || 0,
        'Groundmen': item.availability.groundmenCount || 0,
        'Operators': item.availability.operatorsCount || 0,
        'Foreman': item.availability.foremanCount || 0,
        'Apprentices': item.availability.apprenticesCount || 0,
        'Buckets': item.availability.buckets || 0,
        'Diggers': item.availability.diggers || 0,
        'Pickups': item.availability.pickups || 0,
        'Backyard Machines': item.availability.backyardMachines || 0,
        'Available Start Date': item.availability.availableStartDate ? new Date(item.availability.availableStartDate).toLocaleDateString() : '',
        'Available End Date': item.availability.availableEndDate ? new Date(item.availability.availableEndDate).toLocaleDateString() : 'Open ended',
        'Reviewed By': item.availability.reviewedBy || 'Pending',
      }));

      if (format === 'excel') {
        // Import XLSX dynamically
        const XLSX = await import('xlsx');
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(exportData);

        // Auto-size columns
        const colWidths: any[] = [];
        const headers = Object.keys(exportData[0] || {});
        headers.forEach((header, index) => {
          const maxLength = Math.max(
            header.length,
            ...exportData.map((row: any) => String(row[header] || '').length)
          );
          colWidths[index] = { width: Math.min(Math.max(maxLength + 2, 10), 30) };
        });
        worksheet['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(workbook, worksheet, 'AI Matched Availability');
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        const sanitizedSessionLabel = sessionLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `ai_matched_${sanitizedSessionLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(buffer);
      } else if (format === 'csv') {
        // Generate CSV
        const csvHeaders = Object.keys(exportData[0] || {});
        const csvRows = exportData.map(row => 
          csvHeaders.map(header => `"${(row as any)[header] || ''}"`).join(',')
        );
        const csv = [csvHeaders.join(','), ...csvRows].join('\n');

        const sanitizedSessionLabel = sessionLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `ai_matched_${sanitizedSessionLabel}_${new Date().toISOString().slice(0, 10)}.csv`;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csv);
      }

      res.status(400).json({ message: "Invalid format. Use 'excel' or 'csv'" });
    } catch (error) {
      console.error('AI-enhanced export error:', error);
      res.status(500).json({ message: "Failed to export AI-matched availability submissions" });
    }
  });

  // Availability File Upload Route
  app.post("/api/availability/upload", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const submittedBy = req.body.submittedBy || 'unknown';
      const filePath = req.file.path;

      // Parse the FTE file
      const { parseFTEFile, convertFTEToAvailabilityData } = require('./services/availabilityParser');
      const fteRows = await parseFTEFile(filePath);

      let recordsCreated = 0;
      const errors: string[] = [];

      // Create availability submission record
      const submission = await storage.createAvailabilitySubmission({
        filename: req.file.filename,
        originalName: req.file.originalname,
        filePath: req.file.path,
        submissionType: 'file_upload',
        status: 'pending',
        submittedBy,
        recordsCreated: 0,
        errors: null
      });

      // Process each FTE row
      for (const fteRow of fteRows) {
        try {
          // Find matching contractor by name
          const contractors = await storage.getAllContractors();
          const matchingContractor = contractors.find(c => 
            c.name.toLowerCase().trim() === fteRow.contractor.toLowerCase().trim()
          );

          if (!matchingContractor) {
            errors.push(`No matching contractor found for: ${fteRow.contractor}`);
            continue;
          }

          // Convert FTE data to availability format
          const availabilityStartDate = new Date();
          availabilityStartDate.setDate(availabilityStartDate.getDate() + 1); // Available from tomorrow

          const { crewAvailability, equipmentAvailability } = convertFTEToAvailabilityData(
            fteRow, 
            matchingContractor.id, 
            availabilityStartDate, 
            submittedBy
          );

          // Create crew availability record
          const createdAvailability = await storage.createCrewAvailability({
            ...crewAvailability,
            contractorId: matchingContractor.id
          });

          // Create equipment availability records
          for (const equipment of equipmentAvailability) {
            await storage.createEquipmentAvailability({
              ...equipment,
              contractorId: matchingContractor.id,
              crewAvailabilityId: createdAvailability.id
            });
          }

          recordsCreated++;
        } catch (error) {
          console.error(`Error processing row for ${fteRow.contractor}:`, error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`Error processing ${fteRow.contractor}: ${errorMessage}`);
        }
      }

      // Update submission status
      await storage.updateAvailabilitySubmission(submission.id, {
        status: errors.length > 0 ? 'failed' : 'processed',
        recordsCreated,
        errors: errors.length > 0 ? JSON.stringify(errors) : null,
        processedAt: new Date()
      });

      res.json({
        message: "File processed successfully",
        recordsCreated,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (error) {
      console.error('Availability upload error:', error);
      res.status(500).json({ message: "Failed to process availability file" });
    }
  });

  // Weather API endpoints
  app.get("/api/weather/spc-outlook", async (req, res) => {
    try {
      const { days = "1,2,3", risks = "ENH,MDT,HIGH" } = req.query;
      const dayList = (days as string).split(',').map(d => parseInt(d.trim()));
      const riskList = (risks as string).split(',').map(r => r.trim());

      console.log('Fetching SPC outlook for days:', dayList, 'risks:', riskList);

      const combinedOutlook = await fetchSPCOutlook(dayList);
      console.log('SPC outlook result:', combinedOutlook.features.length, 'features');

      res.json(combinedOutlook);
    } catch (error) {
      console.error('SPC Outlook fetch error:', error);
      res.status(500).json({ message: "Failed to fetch SPC outlook data" });
    }
  });

  // Custom utility data storage - use file system for persistence
  const UTILITY_DATA_FILE = path.join(process.cwd(), 'data', 'custom_utility_data.json');

  // Ensure data directory exists
  const dataDir = path.dirname(UTILITY_DATA_FILE);
  if (!await fs.access(dataDir).then(() => true).catch(() => false)) {
    await fs.mkdir(dataDir, { recursive: true });
  }

  // Helper function to load custom utility data
  async function loadCustomUtilityData() {
    try {
      const data = await fs.readFile(UTILITY_DATA_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null; // File doesn't exist or is invalid
    }
  }

  // Helper function to save custom utility data
  async function saveCustomUtilityData(data: any) {
    await fs.writeFile(UTILITY_DATA_FILE, JSON.stringify(data, null, 2));
  }

  // Endpoint to upload custom electric utility GeoJSON data
  app.post("/api/weather/electric-utilities", async (req, res) => {
    try {
      const data = req.body;

      // Validate GeoJSON structure
      if (!data || data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
        return res.status(400).json({
          error: "Invalid GeoJSON format. Expected FeatureCollection with features array."
        });
      }

      // Validate features have required properties
      const invalidFeatures = data.features.filter((feature: any) => {
        return !feature.geometry || !feature.properties || 
               (!feature.properties.NAME && !feature.properties.name && !feature.properties.COMPANY);
      });

      if (invalidFeatures.length > 0) {
        return res.status(400).json({
          error: "Some features missing required properties. Each feature needs geometry and properties with NAME/name/COMPANY field."
        });
      }

      // Store the custom data persistently
      await saveCustomUtilityData(data);
      console.log(`Custom electric utility data uploaded: ${data.features.length} utilities`);

      res.json({
        message: "Electric utility data uploaded successfully",
        featureCount: data.features.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error uploading custom utility data:', error);
      res.status(500).json({
        error: "Failed to upload utility data",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get("/api/weather/electric-utilities", async (req, res) => {
    try {
      console.log('Electric utilities API called');

      // Use custom data if available
      const customUtilityData = await loadCustomUtilityData();
      if (customUtilityData) {
        console.log(`Returning custom utility data: ${customUtilityData.features?.length || 0} utilities`);
        res.json({
          ...customUtilityData,
          source: "custom",
          message: "Using custom uploaded utility data"
        });
        return;
      }

      // Fall back to external APIs
      const utilities = await fetchElectricUtilities();

      // Check if this is fallback data
      if (utilities.fallback) {
        console.log('Returning fallback utility data for deployment compatibility');
        res.json({
          ...utilities,
          message: "Using cached utility data - external APIs unavailable in deployment environment"
        });
      } else {
        console.log(`Returning live utility data: ${utilities.features?.length || 0} utilities`);
        res.json(utilities);
      }
    } catch (error) {
      console.error('Electric utilities fetch error:', error);

      // This should not happen with the new fallback system, but provide safety net
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.log(`Electric utilities API completely failed: ${errorMessage}`);

      const fallbackResponse = {
        type: "FeatureCollection",
        features: [],
        error: {
          message: "Electric utilities data temporarily unavailable",
          details: errorMessage,
          timestamp: new Date().toISOString(),
          suggestion: "All utility data sources failed. Contact support if this persists."
        }
      };

      res.json(fallbackResponse);
    }
  });

  app.post("/api/weather/affected-utilities", async (req, res) => {
    try {
      const { outlookGeojson } = req.body;
      if (!outlookGeojson) {
        return res.status(400).json({ message: "Outlook GeoJSON data is required" });
      }

      const affectedUtilities = await calculateAffectedUtilities(outlookGeojson);
      res.json(affectedUtilities);
    } catch (error) {
      console.error('Affected utilities calculation error:', error);
      res.status(500).json({ message: "Failed to calculate affected utilities" });
    }
  });

  // Geocoding endpoint for city/state validation
  app.post("/api/geocode", async (req, res) => {
    try {
      const { location, city, state } = req.body;
      
      // Support both old format (single location string) and new format (city + state)
      let searchQuery: string;
      if (city && state) {
        searchQuery = `${city}, ${state}`;
      } else if (location && typeof location === 'string') {
        searchQuery = location;
      } else {
        return res.status(400).json({ 
          success: false,
          message: "Either location string or city and state are required" 
        });
      }

      // Use Mapbox Geocoding API v6 - cost-effective (100k free requests/month)
      const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
      if (!mapboxToken) {
        throw new Error('Mapbox access token not configured');
      }

      const encodedQuery = encodeURIComponent(searchQuery);
      const mapboxUrl = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodedQuery}&country=us&limit=1&access_token=${mapboxToken}`;
      
      const response = await fetch(mapboxUrl);

      if (!response.ok) {
        throw new Error('Geocoding service unavailable');
      }

      const data = await response.json();

      if (!data.features || data.features.length === 0) {
        return res.json({ 
          success: false,
          message: "Location not found. Please enter a valid city and state (e.g., 'Atlanta, GA')" 
        });
      }

      const result = data.features[0];
      const [longitude, latitude] = result.geometry.coordinates;
      
      res.json({
        success: true,
        latitude: latitude,
        longitude: longitude,
        displayName: result.properties.full_address || result.properties.name || searchQuery
      });

    } catch (error) {
      console.error('Geocoding error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to validate location" 
      });
    }
  });

  // Batch distance calculation endpoint for availability management
  app.post("/api/calculate-distances", async (req, res) => {
    try {
      const { contractors, destinations } = req.body;

      if (!Array.isArray(contractors) || !Array.isArray(destinations)) {
        return res.status(400).json({ 
          message: "contractors and destinations arrays are required" 
        });
      }

      if (destinations.length === 0) {
        return res.status(400).json({ 
          message: "At least one destination is required" 
        });
      }

      // Geocode destinations first using Mapbox Geocoding API (in parallel)
      const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
      const destinationGeocodes = await Promise.all(
        destinations.map(async (location) => {
          try {
            const encodedQuery = encodeURIComponent(location);
            const geocodeUrl = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodedQuery}&country=us&limit=1&access_token=${mapboxToken}`;
            
            const response = await fetch(geocodeUrl);
            const data = await response.json();

            if (!data.features || data.features.length === 0) {
              console.error(`Mapbox Geocoding failed for ${location}: No results`);
              return null;
            }

            const result = data.features[0];
            const [longitude, latitude] = result.geometry.coordinates;
            const formattedAddress = result.properties.full_address || result.properties.name || location;
            
            console.log(`Geocoded "${location}" -> ${formattedAddress}`);

            return {
              location,
              latitude: latitude,
              longitude: longitude,
              formatted_address: formattedAddress
            };
          } catch (error) {
            console.error(`Geocoding error for ${location}:`, error);
            return null;
          }
        })
      );

      // Filter out failed geocodes
      const validDestinations = destinationGeocodes.filter(d => d !== null);

      if (validDestinations.length === 0) {
        return res.status(400).json({ 
          message: "Could not geocode any destinations. Please check the location names." 
        });
      }

      // Log which destinations were successfully geocoded
      console.log(`Successfully geocoded ${validDestinations.length} of ${destinations.length} destinations`);

      // Process each contractor in parallel
      const results = await Promise.all(
        contractors.map(async (contractor) => {
          try {
            // Get contractor coordinates
            let contractorLat = contractor.departureLatitude;
            let contractorLng = contractor.departureLongitude;

            // If no coordinates, geocode the departure location using Mapbox
            if (!contractorLat || !contractorLng) {
              if (!contractor.departureLocation) {
                return { ...contractor, error: "No departure location" };
              }

              try {
                const encodedQuery = encodeURIComponent(contractor.departureLocation);
                const geocodeUrl = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodedQuery}&country=us&limit=1&access_token=${mapboxToken}`;
                
                const response = await fetch(geocodeUrl);
                const data = await response.json();

                if (data.features && data.features.length > 0) {
                  const [longitude, latitude] = data.features[0].geometry.coordinates;
                  contractorLat = latitude;
                  contractorLng = longitude;
                }
              } catch (error) {
                console.error(`Error geocoding contractor location ${contractor.departureLocation}:`, error);
              }
            }

            if (!contractorLat || !contractorLng) {
              return { ...contractor, error: "Could not geocode contractor location" };
            }

            // Calculate routes to all destinations in parallel
            const routePromises = validDestinations.map(async (dest, index) => {
              const from = { 
                latitude: contractorLat, 
                longitude: contractorLng,
                label: '',
                id: 0,
                createdAt: null,
                sessionId: ''
              };
              const to = { 
                latitude: dest.latitude, 
                longitude: dest.longitude,
                name: dest.location,
                type: 'destination',
                id: index,
                description: null,
                properties: {},
                createdAt: null
              };

              try {
                const route = await routingService.calculateRoute(from, to);
                
                // Convert meters to miles
                const distanceMiles = route.distance * 0.000621371;
                
                // Calculate travel time at 55mph (company vehicle speed limit)
                const travelTimeHours55mph = distanceMiles / 55;
                
                // Round travel time UP to nearest whole hour
                const travelTimeHours = Math.ceil(travelTimeHours55mph);
                
                return {
                  index,
                  distance: distanceMiles.toFixed(1),
                  duration: route.duration,
                  durationFormatted: `${travelTimeHours} ${travelTimeHours === 1 ? 'hour' : 'hours'}`,
                  durationHours: travelTimeHours.toString()
                };
              } catch (error) {
                console.error(`Route calculation error for contractor ${contractor.id}:`, error);
                return null;
              }
            });

            const routes = await Promise.all(routePromises);
            
            // Build result object with distances and times for each destination
            const result: any = { ...contractor };
            
            routes.forEach((route, index) => {
              if (route) {
                result[`distance_${index}`] = route.distance;
                result[`travelTime_${index}`] = route.durationFormatted;
                result[`travelTimeHours_${index}`] = route.durationHours;
              }
            });

            return result;
          } catch (error) {
            console.error(`Error processing contractor ${contractor.id}:`, error);
            return { ...contractor, error: "Processing failed" };
          }
        })
      );

      // Sort by distance to first destination
      results.sort((a, b) => {
        const aDistance = parseFloat(a.distance_0) || Infinity;
        const bDistance = parseFloat(b.distance_0) || Infinity;
        return aDistance - bDistance;
      });

      res.json({
        results,
        destinations: validDestinations.map(d => d.location),
        calculatedAt: new Date().toISOString()
      });

    } catch (error) {
      console.error('Batch distance calculation error:', error);
      res.status(500).json({ 
        message: "Failed to calculate distances",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Migration endpoint to populate pending review contractors with departure locations
  app.post("/api/contractors/migrate-locations", async (req, res) => {
    try {
      const pendingReviewContractors = await storage.getAllContractors();
      const needsMigration = pendingReviewContractors.filter(c => c.needsReview);
      
      let migratedCount = 0;
      let skippedCount = 0;
      const results = [];
      
      for (const contractor of needsMigration) {
        // Get all crew availability submissions for this contractor
        const submissions = await storage.getCrewAvailabilityByContractor(contractor.id);
        
        if (submissions.length === 0) {
          skippedCount++;
          continue;
        }
        
        // Collect unique departure locations
        const locationMap = new Map();
        for (const submission of submissions) {
          if (submission.departureLocation && submission.departureLocation.trim()) {
            const key = submission.departureLocation.toLowerCase().trim();
            if (!locationMap.has(key)) {
              locationMap.set(key, {
                location: submission.departureLocation,
                latitude: submission.departureLatitude || null,
                longitude: submission.departureLongitude || null
              });
            }
          }
        }
        
        const locations = Array.from(locationMap.values());
        
        if (locations.length === 0) {
          skippedCount++;
          continue;
        }
        
        // Find first location with coordinates for primary location
        const primaryLocation = locations.find(l => l.latitude && l.longitude) || locations[0];
        
        // Update contractor
        const updates: any = {
          departureLocations: locations
        };
        
        // Set primary coordinates if available and contractor doesn't have them
        if (primaryLocation.latitude && primaryLocation.longitude) {
          if (!contractor.latitude || !contractor.longitude || contractor.latitude === 0 || contractor.longitude === 0) {
            updates.latitude = primaryLocation.latitude;
            updates.longitude = primaryLocation.longitude;
          }
        }
        
        // Set address if not present
        if (!contractor.fullAddress || contractor.fullAddress.trim() === '') {
          updates.fullAddress = primaryLocation.location;
        }
        
        await storage.updateContractor(contractor.id, updates);
        
        migratedCount++;
        results.push({
          id: contractor.id,
          company: contractor.company,
          locationsAdded: locations.length,
          primaryLocation: primaryLocation.location,
          coordinatesSet: !!(updates.latitude && updates.longitude)
        });
      }
      
      res.json({
        success: true,
        migratedCount,
        skippedCount,
        totalPendingReview: needsMigration.length,
        results
      });
    } catch (error: any) {
      console.error('Migration error:', error);
      res.status(500).json({ error: error.message || "Failed to migrate locations" });
    }
  });

  // ===== TICKETING MODULE ROUTES =====

  // Helper: check if user can access a ticket
  function canAccessTicket(user: any, ticket: any): boolean {
    if (!user) return false;
    if (user.role === 'ADMIN' || user.role === 'MANAGER' || user.role === 'UTILITY') return true;
    if (user.role === 'CONTRACTOR' && user.companyId && ticket.companyId === user.companyId) return true;
    return false;
  }

  // Valid status transitions
  const VALID_TRANSITIONS: Record<string, string[]> = {
    CREATED: ['ASSIGNED', 'CANCELLED'],
    ASSIGNED: ['ACCEPTED', 'CANCELLED'],
    ACCEPTED: ['ENROUTE', 'ON_SITE', 'WORKING', 'CANCELLED'],
    ENROUTE: ['ON_SITE', 'WORKING', 'BLOCKED', 'CANCELLED'],
    ON_SITE: ['WORKING', 'COMPLETED', 'BLOCKED', 'CANCELLED'],
    WORKING: ['COMPLETED', 'BLOCKED', 'CANCELLED'],
    BLOCKED: ['WORKING', 'CANCELLED', 'CLOSED'],
    COMPLETED: ['CLOSED'],
  };

  // Issue Types CRUD
  app.get("/api/issue-types", requireAuth, async (req, res) => {
    try {
      const issueTypes = await storage.getAllIssueTypes();
      res.json(issueTypes);
    } catch (error: any) {
      console.error('Error fetching issue types:', error);
      res.status(500).json({ message: error.message || "Failed to fetch issue types" });
    }
  });

  app.post("/api/issue-types", requireAuth, requireManager, async (req, res) => {
    try {
      const parsed = insertIssueTypeSchema.parse(req.body);
      const issueType = await storage.createIssueType(parsed);
      await createAuditLog({ action: 'issue_type.create', entityType: 'issue_types', entityId: issueType.id, details: parsed, context: getAuditContext(req) });
      res.status(201).json(issueType);
    } catch (error: any) {
      console.error('Error creating issue type:', error);
      res.status(400).json({ message: error.message || "Failed to create issue type" });
    }
  });

  app.patch("/api/issue-types/:id", requireAuth, requireManager, async (req, res) => {
    try {
      const result = await storage.updateIssueType(req.params.id, req.body);
      if (!result) return res.status(404).json({ message: "Issue type not found" });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update issue type" });
    }
  });

  // Tickets CRUD
  app.get("/api/tickets", requireAuth, async (req, res) => {
    try {
      const { sessionId, companyId } = req.query;
      let ticketList: any[] = [];

      if (sessionId) {
        ticketList = await storage.getTicketsBySession(sessionId as string);
      } else if (companyId) {
        ticketList = await storage.getTicketsByCompany(companyId as string);
      } else if (req.authenticatedUser?.role === 'CONTRACTOR' && req.authenticatedUser.companyId) {
        ticketList = await storage.getTicketsByCompany(req.authenticatedUser.companyId);
      } else {
        // For MANAGER/UTILITY, return empty unless filtered
        ticketList = [];
      }

      res.json(ticketList);
    } catch (error: any) {
      console.error('Error fetching tickets:', error);
      res.status(500).json({ message: error.message || "Failed to fetch tickets" });
    }
  });

  app.get("/api/tickets/:id", requireAuth, async (req, res) => {
    try {
      const ticket = await storage.getTicket(req.params.id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (!canAccessTicket(req.authenticatedUser, ticket)) return res.status(403).json({ message: "Forbidden" });
      res.json(ticket);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch ticket" });
    }
  });

  app.post("/api/tickets", requireAuth, requireManagerOrUtility, async (req, res) => {
    try {
      const parsed = insertTicketSchema.parse({
        ...req.body,
        createdByUserId: req.authenticatedUser!.id,
      });
      const ticket = await storage.createTicket(parsed);

      // Geocode the address if provided
      if (ticket.addressText && !ticket.lat && !ticket.lon) {
        const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
        if (mapboxToken) {
          try {
            const encodedQuery = encodeURIComponent(ticket.addressText);
            const geocodeUrl = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodedQuery}&country=us&limit=1&access_token=${mapboxToken}`;
            const geoRes = await fetch(geocodeUrl);
            const geoData = await geoRes.json();
            if (geoData.features && geoData.features.length > 0) {
              const [lng, lat] = geoData.features[0].geometry.coordinates;
              await storage.updateTicket(ticket.id, { lat, lon: lng });
              ticket.lat = lat;
              ticket.lon = lng;
              console.log(`✓ Geocoded ticket ${ticket.id}: ${ticket.addressText} → ${lat}, ${lng}`);
            }
          } catch (geoErr) {
            console.error(`✗ Failed to geocode ticket address:`, geoErr);
          }
        }
      }

      // Create initial status event
      await storage.createTicketStatusEvent({
        ticketId: ticket.id,
        oldStatus: null,
        newStatus: 'CREATED',
        changedByUserId: req.authenticatedUser!.id,
        note: 'Ticket created',
      });

      await createAuditLog({ action: 'ticket.create', entityType: 'tickets', entityId: ticket.id, details: { title: ticket.title, sessionId: ticket.sessionId }, context: getAuditContext(req) });
      res.status(201).json(ticket);
    } catch (error: any) {
      console.error('Error creating ticket:', error);
      res.status(400).json({ message: error.message || "Failed to create ticket" });
    }
  });

  app.patch("/api/tickets/:id", requireAuth, requireManagerOrUtility, async (req, res) => {
    try {
      const ticket = await storage.getTicket(req.params.id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });

      const result = await storage.updateTicket(req.params.id, req.body);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update ticket" });
    }
  });

  // Ticket status update with work segment logic
  app.post("/api/tickets/:id/status", requireAuth, async (req, res) => {
    try {
      const ticket = await storage.getTicket(req.params.id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (!canAccessTicket(req.authenticatedUser, ticket)) return res.status(403).json({ message: "Forbidden" });

      const { status, note } = req.body;
      if (!status) return res.status(400).json({ message: "Status is required" });

      const oldStatus = ticket.status;

      // Validate transition
      const allowed = VALID_TRANSITIONS[oldStatus || 'CREATED'] || [];
      if (!allowed.includes(status)) {
        return res.status(400).json({ message: `Invalid status transition from ${oldStatus} to ${status}` });
      }
      const workingStates = ['ON_SITE', 'WORKING'];
      const exitStates = ['COMPLETED', 'BLOCKED', 'CANCELLED', 'CLOSED'];

      // Get active assignment to find crew
      const activeAssignment = await storage.getActiveTicketAssignment(ticket.id);

      // Handle work segment logic
      if (activeAssignment) {
        if (workingStates.includes(status) && !workingStates.includes(oldStatus!)) {
          // Entering working state - create segment
          const existing = await storage.getOpenWorkSegment(ticket.id, activeAssignment.crewId);
          if (!existing) {
            await storage.createTicketWorkSegment({
              ticketId: ticket.id,
              sessionId: ticket.sessionId,
              companyId: activeAssignment.companyId,
              crewId: activeAssignment.crewId,
              startedAt: new Date(),
              createdByUserId: req.authenticatedUser!.id,
            });
          }
        } else if (exitStates.includes(status) && workingStates.includes(oldStatus!)) {
          // Exiting working state - close segment
          const openSegment = await storage.getOpenWorkSegment(ticket.id, activeAssignment.crewId);
          if (openSegment) {
            await storage.closeWorkSegment(openSegment.id);
          }
        }
      }

      // Update ticket status
      const updates: any = { status };
      if (exitStates.includes(status)) {
        updates.closedAt = new Date();
      }
      const updatedTicket = await storage.updateTicket(ticket.id, updates);

      // Create status event
      await storage.createTicketStatusEvent({
        ticketId: ticket.id,
        oldStatus,
        newStatus: status,
        changedByUserId: req.authenticatedUser!.id,
        note: note || null,
      });

      await createAuditLog({ action: 'ticket.status_change', entityType: 'tickets', entityId: ticket.id, details: { oldStatus, newStatus: status }, context: getAuditContext(req) });
      res.json(updatedTicket);
    } catch (error: any) {
      console.error('Error updating ticket status:', error);
      res.status(500).json({ message: error.message || "Failed to update ticket status" });
    }
  });

  // Ticket assignments
  app.get("/api/tickets/:id/assignments", requireAuth, async (req, res) => {
    try {
      const ticket = await storage.getTicket(req.params.id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (!canAccessTicket(req.authenticatedUser, ticket)) return res.status(403).json({ message: "Forbidden" });
      const assignments = await storage.getTicketAssignments(req.params.id);
      res.json(assignments);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch assignments" });
    }
  });

  app.post("/api/tickets/:id/assign", requireAuth, requireManagerOrUtility, async (req, res) => {
    try {
      const ticket = await storage.getTicket(req.params.id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });

      const { companyId, crewId } = req.body;
      if (!companyId || !crewId) return res.status(400).json({ message: "companyId and crewId are required" });

      // Deactivate any existing active assignment
      const existing = await storage.getActiveTicketAssignment(ticket.id);
      if (existing) {
        await storage.updateTicketAssignment(existing.id, { isActive: false, status: 'REASSIGNED' });
      }

      const assignment = await storage.createTicketAssignment({
        ticketId: ticket.id,
        companyId,
        crewId,
        status: 'PENDING_ACCEPT',
        assignedByUserId: req.authenticatedUser!.id,
        isActive: true,
      });

      // Update ticket status and company
      await storage.updateTicket(ticket.id, { status: 'ASSIGNED', companyId });

      // Create status event
      await storage.createTicketStatusEvent({
        ticketId: ticket.id,
        oldStatus: ticket.status,
        newStatus: 'ASSIGNED',
        changedByUserId: req.authenticatedUser!.id,
        note: `Assigned to crew`,
      });

      await createAuditLog({ action: 'ticket.assign', entityType: 'ticket_assignments', entityId: assignment.id, details: { ticketId: ticket.id, companyId, crewId }, context: getAuditContext(req) });
      res.status(201).json(assignment);
    } catch (error: any) {
      console.error('Error assigning ticket:', error);
      res.status(500).json({ message: error.message || "Failed to assign ticket" });
    }
  });

  // Accept/Reject assignment
  app.post("/api/ticket-assignments/:id/respond", requireAuth, async (req, res) => {
    try {
      const { action, note } = req.body;
      if (!action || !['accept', 'reject'].includes(action)) {
        return res.status(400).json({ message: "action must be 'accept' or 'reject'" });
      }

      const assignments = await db.select().from(ticketAssignments).where(eq(ticketAssignments.id, req.params.id));
      const assignment = assignments[0];
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });

      // Only the assigned company can respond
      if (req.authenticatedUser?.role === 'CONTRACTOR' && req.authenticatedUser.companyId !== assignment.companyId) {
        return res.status(403).json({ message: "Forbidden: assignment belongs to another company" });
      }

      if (assignment.status !== 'PENDING_ACCEPT') {
        return res.status(400).json({ message: "Assignment has already been responded to" });
      }

      const ticket = await storage.getTicket(assignment.ticketId);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });

      if (action === 'accept') {
        await storage.updateTicketAssignment(assignment.id, {
          status: 'ACCEPTED',
          respondedAt: new Date(),
          responseNote: note || null,
        });
        await storage.updateTicket(ticket.id, { status: 'ACCEPTED' });
        await storage.createTicketStatusEvent({
          ticketId: ticket.id,
          oldStatus: ticket.status,
          newStatus: 'ACCEPTED',
          changedByUserId: req.authenticatedUser!.id,
          note: 'Assignment accepted',
        });
      } else {
        await storage.updateTicketAssignment(assignment.id, {
          status: 'REJECTED',
          respondedAt: new Date(),
          responseNote: note || null,
        });
        await storage.createTicketStatusEvent({
          ticketId: ticket.id,
          oldStatus: ticket.status,
          newStatus: ticket.status!,
          changedByUserId: req.authenticatedUser!.id,
          note: `Assignment rejected: ${note || 'No reason provided'}`,
        });
      }

      const updated = await storage.getTicket(ticket.id);
      res.json(updated);
    } catch (error: any) {
      console.error('Error responding to assignment:', error);
      res.status(500).json({ message: error.message || "Failed to respond to assignment" });
    }
  });

  // Ticket status events (timeline)
  app.get("/api/tickets/:id/events", requireAuth, async (req, res) => {
    try {
      const ticket = await storage.getTicket(req.params.id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (!canAccessTicket(req.authenticatedUser, ticket)) return res.status(403).json({ message: "Forbidden" });
      const events = await storage.getTicketStatusEvents(req.params.id);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch status events" });
    }
  });

  // Ticket work segments
  app.get("/api/tickets/:id/segments", requireAuth, async (req, res) => {
    try {
      const ticket = await storage.getTicket(req.params.id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (!canAccessTicket(req.authenticatedUser, ticket)) return res.status(403).json({ message: "Forbidden" });
      const segments = await storage.getWorkSegmentsByTicket(req.params.id);
      res.json(segments);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch work segments" });
    }
  });

  // Notifications
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const notifs = await storage.getNotificationsByUser(req.authenticatedUser!.id);
      res.json(notifs);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch notifications" });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const result = await storage.markNotificationRead(req.params.id);
      if (!result) return res.status(404).json({ message: "Notification not found" });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to mark notification read" });
    }
  });

  app.get("/api/export-all-json", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authenticatedUser;
      if (!user || (user.role !== 'MANAGER' && user.role !== 'ADMIN')) {
        return res.status(403).json({ message: "Only MANAGER or ADMIN users can export all data" });
      }

      const data: Record<string, any[]> = {};

      data.resources = await db.select().from(resources);
      data.analysisPoints = await db.select().from(analysisPoints);
      data.distanceCalculations = await db.select().from(distanceCalculations);
      data.contractors = await db.select().from(contractors);
      data.contractorFiles = await db.select().from(contractorFiles);
      data.contractorReviews = await db.select().from(contractorReviews);
      data.analysisJobs = await db.select().from(analysisJobs);
      data.crewAvailability = await db.select().from(crewAvailability);
      data.equipmentAvailability = await db.select().from(equipmentAvailability);
      data.availabilitySubmissions = await db.select().from(availabilitySubmissions);
      data.availabilitySessions = await db.select().from(availabilitySessions);
      data.users = (await db.select().from(users)).map(u => ({ ...u, password: undefined }));
      data.companies = await db.select().from(companies);
      data.userCompanyAccess = await db.select().from(userCompanyAccess);
      data.stormSessions = await db.select().from(stormSessions);
      data.sessionContractors = await db.select().from(sessionContractors);
      data.sessionContractorMembers = await db.select().from(sessionContractorMembers);
      data.userSessions = await db.select().from(userSessions);
      data.rosters = await db.select().from(rosters);
      data.crews = await db.select().from(crews);
      data.rosterPersonnel = await db.select().from(rosterPersonnel);
      data.rosterEquipment = await db.select().from(rosterEquipment);
      data.timesheets = await db.select().from(timesheets);
      data.timesheetPersonnel = await db.select().from(timesheetPersonnel);
      data.timesheetEquipment = await db.select().from(timesheetEquipment);
      data.timesheetLines = await db.select().from(timesheetLines);
      data.expenses = await db.select().from(expenses);
      data.expenseFiles = await db.select().from(expenseFiles);
      data.fteReports = await db.select().from(fteReports);
      data.companyLocations = await db.select().from(companyLocations);
      data.rateTables = await db.select().from(rateTables);
      data.invoices = await db.select().from(invoices);
      data.invoiceLines = await db.select().from(invoiceLines);
      data.auditLogs = await db.select().from(auditLogs);
      data.issueTypes = await db.select().from(issueTypes);
      data.tickets = await db.select().from(tickets);
      data.ticketAssignments = await db.select().from(ticketAssignments);
      data.ticketStatusEvents = await db.select().from(ticketStatusEvents);
      data.ticketWorkSegments = await db.select().from(ticketWorkSegments);
      data.notifications = await db.select().from(notifications);
      data.incidents = await db.select().from(incidents);
      data.incidentAssignments = await db.select().from(incidentAssignments);
      data.crewRosters = await db.select().from(crewRosters);
      data.appConfig = await db.select().from(appConfig);

      const exportPayload = {
        exportedAt: new Date().toISOString(),
        exportedBy: user.username,
        recordCounts: Object.fromEntries(
          Object.entries(data).map(([key, val]) => [key, val.length])
        ),
        data,
      };

      const filename = `storm-response-export-${new Date().toISOString().split('T')[0]}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json(exportPayload);
    } catch (error: any) {
      console.error("Full JSON export error:", error);
      res.status(500).json({ message: error.message || "Failed to export data" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

function generateCSV(calculations: any[], options: any = {}): string {
  const headers = ['Resource Name', 'Type'];

  if (options.includeDistances !== false) {
    headers.push('Distance (miles)');
  }

  if (options.includeTimes !== false) {
    headers.push('Travel Time (minutes)');
  }

  headers.push('Latitude', 'Longitude');

  const rows = calculations.map(calc => {
    const row = [
      calc.resource.name,
      calc.resource.type,
    ];

    if (options.includeDistances !== false) {
      row.push(calc.distance.toFixed(2));
    }

    if (options.includeTimes !== false) {
      row.push(Math.round(calc.duration / 60).toString());
    }

    row.push(calc.resource.latitude.toString(), calc.resource.longitude.toString());

    return row;
  });

  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}m`;
}