import { 
  resources, 
  analysisPoints, 
  distanceCalculations, 
  analysisJobs,
  contractors,
  contractorFiles,
  contractorReviews,
  users,
  userCompanyAccess,
  companies,
  stormSessions,
  sessionContractors,
  rosters,
  crews,
  rosterPersonnel,
  rosterEquipment,
  timesheets,
  timesheetPersonnel,
  timesheetEquipment,
  timesheetLines,
  expenses,
  expenseFiles,
  invoices,
  invoiceLines,
  crewAvailability,
  equipmentAvailability,
  availabilitySubmissions,
  availabilitySessions,
  incidents,
  incidentAssignments,
  crewRosters,
  type Resource, 
  type InsertResource,
  type AnalysisPoint,
  type InsertAnalysisPoint,
  type DistanceCalculation,
  type InsertDistanceCalculation,
  type AnalysisJob,
  type InsertAnalysisJob,
  type Contractor,
  type InsertContractor,
  type ContractorFile,
  type InsertContractorFile,
  type ContractorReview,
  type InsertContractorReview,
  type User,
  type UpsertUser,
  type InsertUser,
  type UserCompanyAccess,
  type InsertUserCompanyAccess,
  type Company,
  type InsertCompany,
  type StormSession,
  type InsertStormSession,
  type Roster,
  type InsertRoster,
  type Crew,
  type InsertCrew,
  type RosterPersonnel,
  type InsertRosterPersonnel,
  type RosterEquipment,
  type InsertRosterEquipment,
  type Timesheet,
  type InsertTimesheet,
  type TimesheetPersonnel,
  type InsertTimesheetPersonnel,
  type TimesheetEquipment,
  type InsertTimesheetEquipment,
  type TimesheetLine,
  type InsertTimesheetLine,
  type Expense,
  type InsertExpense,
  type ExpenseFile,
  type InsertExpenseFile,
  type Invoice,
  type InsertInvoice,
  type InvoiceLine,
  type InsertInvoiceLine,
  type CrewAvailability,
  type InsertCrewAvailability,
  type EquipmentAvailability,
  type InsertEquipmentAvailability,
  type AvailabilitySubmission,
  type InsertAvailabilitySubmission,
  type AvailabilitySession,
  type InsertAvailabilitySession,
  type Incident,
  type InsertIncident,
  type IncidentAssignment,
  type InsertIncidentAssignment,
  type CrewRoster,
  type InsertCrewRoster,
  issueTypes,
  tickets,
  ticketAssignments,
  ticketStatusEvents,
  ticketWorkSegments,
  notifications,
  type IssueType,
  type InsertIssueType,
  type Ticket,
  type InsertTicket,
  type TicketAssignment,
  type InsertTicketAssignment,
  type TicketStatusEvent,
  type InsertTicketStatusEvent,
  type TicketWorkSegment,
  type InsertTicketWorkSegment,
  type Notification,
  type InsertNotification
} from "@shared/schema";

export interface IStorage {
  // Resources
  createResource(resource: InsertResource): Promise<Resource>;
  getAllResources(): Promise<Resource[]>;
  updateResource(id: number, updates: Partial<InsertResource>): Promise<Resource | undefined>;
  deleteResource(id: number): Promise<void>;
  deleteAllResources(): Promise<void>;

  // Contractors
  createContractor(contractor: InsertContractor): Promise<Contractor>;
  getAllContractors(): Promise<Contractor[]>;
  getContractor(id: number): Promise<Contractor | undefined>;
  updateContractor(id: number, updates: Partial<InsertContractor>): Promise<Contractor | undefined>;
  deleteContractor(id: number): Promise<void>;
  collectDepartureLocations(contractorId: number): Promise<any[]>;
  updateContractorDepartureLocations(contractorId: number): Promise<void>;
  setContractorDepartureLocations(contractorId: number, locations: Array<{location: string, latitude: number | null, longitude: number | null}>): Promise<void>;
  mergeContractorReferences(sourceId: number, targetId: number): Promise<void>;

  // Analysis Points
  createAnalysisPoint(point: InsertAnalysisPoint): Promise<AnalysisPoint>;
  getAllAnalysisPoints(sessionId?: string): Promise<AnalysisPoint[]>;
  deleteAnalysisPoint(id: number, sessionId?: string): Promise<void>;

  // Distance Calculations
  createDistanceCalculation(calculation: InsertDistanceCalculation): Promise<DistanceCalculation>;
  getCalculationsByPointId(pointId: number, sessionId?: string): Promise<DistanceCalculation[]>;
  getCalculationsWithResources(pointId: number, sessionId?: string): Promise<(DistanceCalculation & { resource: Resource })[]>;

  clearCalculationsForPoint(pointId: number, sessionId?: string): Promise<void>;

  // Analysis Jobs
  createAnalysisJob(job: InsertAnalysisJob): Promise<AnalysisJob>;
  updateAnalysisJob(id: number, updates: Partial<AnalysisJob>): Promise<AnalysisJob | undefined>;
  getAnalysisJob(id: number): Promise<AnalysisJob | undefined>;

  // Contractor Files
  createContractorFile(file: InsertContractorFile): Promise<ContractorFile>;
  getContractorFiles(contractorId: number): Promise<ContractorFile[]>;
  deleteContractorFile(id: number): Promise<void>;

  // Contractor Reviews
  createContractorReview(review: InsertContractorReview): Promise<ContractorReview>;
  getContractorReviews(contractorId: number): Promise<ContractorReview[]>;
  getAllContractorReviews(): Promise<ContractorReview[]>;
  deleteContractorReview(reviewId: number): Promise<void>;

  // User Authentication (Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<User | undefined>; // Soft delete, returns updated user

  // User Company Access
  grantUserCompanyAccess(access: InsertUserCompanyAccess): Promise<UserCompanyAccess>;
  revokeUserCompanyAccess(accessId: string): Promise<void>;
  getUserCompanyAccesses(userId: string): Promise<UserCompanyAccess[]>;
  getCompanyUserAccesses(companyId: string): Promise<UserCompanyAccess[]>;
  getUserAccessibleCompanies(userId: string): Promise<Company[]>; // Get companies user can access with full company details
  hasUtilityCompanyAccess(userId: string, companyId: string): Promise<boolean>; // Check if UTILITY user has access to specific company

  // Companies (Storm Response Management)
  createCompany(company: InsertCompany): Promise<Company>;
  getAllCompanies(): Promise<Company[]>;
  getCompany(id: string): Promise<Company | undefined>;
  updateCompany(id: string, updates: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: string): Promise<void>;

  // Storm Sessions
  createStormSession(session: InsertStormSession): Promise<StormSession>;
  getAllStormSessions(): Promise<StormSession[]>;
  getStormSession(id: string): Promise<StormSession | undefined>;
  updateStormSession(id: string, updates: Partial<InsertStormSession>): Promise<StormSession | undefined>;
  closeStormSession(id: string): Promise<StormSession | undefined>;
  reopenStormSession(id: string): Promise<StormSession | undefined>;
  activateStormSession(id: string): Promise<StormSession | undefined>;
  deactivateStormSession(id: string): Promise<StormSession | undefined>;
  getActiveStormSession(): Promise<StormSession | undefined>;
  deactivateAllSessions(): Promise<void>;
  addContractorToSession(sessionId: string, contractorCompanyId: string): Promise<void>;
  removeContractorFromSession(sessionId: string, contractorCompanyId: string): Promise<void>;

  // Crew Availability
  createCrewAvailability(availability: InsertCrewAvailability): Promise<CrewAvailability>;
  getCrewAvailabilityByContractor(contractorId: number): Promise<CrewAvailability[]>;
  getAllCrewAvailability(): Promise<CrewAvailability[]>;
  updateCrewAvailability(id: number, updates: Partial<InsertCrewAvailability>): Promise<CrewAvailability | undefined>;
  deleteCrewAvailability(id: number): Promise<void>;

  // Equipment Availability
  createEquipmentAvailability(equipment: InsertEquipmentAvailability): Promise<EquipmentAvailability>;
  getEquipmentAvailabilityByContractor(contractorId: number): Promise<EquipmentAvailability[]>;
  getEquipmentAvailabilityByCrew(crewAvailabilityId: number): Promise<EquipmentAvailability[]>;
  deleteEquipmentAvailability(id: number): Promise<void>;

  // Availability Submissions
  createAvailabilitySubmission(submission: InsertAvailabilitySubmission): Promise<AvailabilitySubmission>;
  getAvailabilitySubmissions(): Promise<AvailabilitySubmission[]>;
  updateAvailabilitySubmission(id: number, updates: Partial<AvailabilitySubmission>): Promise<AvailabilitySubmission | undefined>;

  // Availability Sessions
  createAvailabilitySession(session: InsertAvailabilitySession): Promise<AvailabilitySession>;
  getAvailabilitySessions(): Promise<AvailabilitySession[]>;
  getAvailabilitySessionById(id: number): Promise<AvailabilitySession | undefined>;
  getActiveAvailabilitySession(): Promise<AvailabilitySession | undefined>;
  closeAvailabilitySession(id: number): Promise<AvailabilitySession | undefined>;
  startNewAvailabilitySession(): Promise<AvailabilitySession>;
  getCrewAvailabilityBySession(sessionId?: number | 'active' | 'unassigned'): Promise<CrewAvailability[]>;
  assignUnassignedToSession(sessionId: number): Promise<void>;

  // Incident Management
  createIncident(incident: InsertIncident): Promise<Incident>;
  getAllIncidents(): Promise<Incident[]>;
  getIncident(id: number): Promise<Incident | undefined>;
  updateIncident(id: number, updates: Partial<InsertIncident>): Promise<Incident | undefined>;
  deleteIncident(id: number): Promise<void>;

  // Incident Assignments
  createIncidentAssignment(assignment: InsertIncidentAssignment): Promise<IncidentAssignment>;
  getIncidentAssignments(incidentId?: number): Promise<IncidentAssignment[]>;
  updateIncidentAssignment(id: number, updates: Partial<InsertIncidentAssignment>): Promise<IncidentAssignment | undefined>;
  deleteIncidentAssignment(id: number): Promise<void>;

  // Crew Rosters
  createCrewRoster(roster: InsertCrewRoster): Promise<CrewRoster>;
  getCrewRostersByAssignment(assignmentId: number): Promise<CrewRoster[]>;
  updateCrewRoster(id: number, updates: Partial<InsertCrewRoster>): Promise<CrewRoster | undefined>;
  deleteCrewRoster(id: number): Promise<void>;

  // Issue Types
  createIssueType(issueType: InsertIssueType): Promise<IssueType>;
  getAllIssueTypes(): Promise<IssueType[]>;
  getIssueType(id: string): Promise<IssueType | undefined>;
  updateIssueType(id: string, updates: Partial<InsertIssueType>): Promise<IssueType | undefined>;

  // Tickets
  createTicket(ticket: InsertTicket): Promise<Ticket>;
  getTicket(id: string): Promise<Ticket | undefined>;
  getTicketsBySession(sessionId: string): Promise<Ticket[]>;
  getTicketsByCompany(companyId: string): Promise<Ticket[]>;
  updateTicket(id: string, updates: Partial<InsertTicket>): Promise<Ticket | undefined>;

  // Ticket Assignments
  createTicketAssignment(assignment: InsertTicketAssignment): Promise<TicketAssignment>;
  getTicketAssignments(ticketId: string): Promise<TicketAssignment[]>;
  getActiveTicketAssignment(ticketId: string): Promise<TicketAssignment | undefined>;
  updateTicketAssignment(id: string, updates: Partial<InsertTicketAssignment>): Promise<TicketAssignment | undefined>;

  // Ticket Status Events
  createTicketStatusEvent(event: InsertTicketStatusEvent): Promise<TicketStatusEvent>;
  getTicketStatusEvents(ticketId: string): Promise<TicketStatusEvent[]>;

  // Ticket Work Segments
  createTicketWorkSegment(segment: InsertTicketWorkSegment): Promise<TicketWorkSegment>;
  getOpenWorkSegment(ticketId: string, crewId: string): Promise<TicketWorkSegment | undefined>;
  closeWorkSegment(id: string): Promise<TicketWorkSegment | undefined>;
  getWorkSegmentsByTicket(ticketId: string): Promise<TicketWorkSegment[]>;

  // Notifications
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotificationsByUser(userId: string): Promise<Notification[]>;
  markNotificationRead(id: string): Promise<Notification | undefined>;
}

export class MemStorage implements IStorage {
  private resources: Map<number, Resource> = new Map();
  private contractors: Map<number, Contractor> = new Map();
  private analysisPoints: Map<number, AnalysisPoint> = new Map();
  private distanceCalculations: Map<number, DistanceCalculation> = new Map();
  private analysisJobs: Map<number, AnalysisJob> = new Map();
  private users: Map<string, User> = new Map();
  private userCompanyAccesses: Map<string, UserCompanyAccess> = new Map();
  private companies: Map<string, Company> = new Map();
  private currentResourceId = 1;
  private currentContractorId = 1;
  private currentPointId = 1;
  private currentCalculationId = 1;
  private currentJobId = 1;

  async createResource(insertResource: InsertResource): Promise<Resource> {
    const id = this.currentResourceId++;
    const resource: Resource = {
      id,
      name: insertResource.name,
      type: insertResource.type,
      latitude: insertResource.latitude,
      longitude: insertResource.longitude,
      description: insertResource.description || null,
      properties: insertResource.properties || null,
      createdAt: new Date(),
    };
    this.resources.set(id, resource);
    return resource;
  }

  async getAllResources(): Promise<Resource[]> {
    return Array.from(this.resources.values());
  }

  async updateResource(id: number, updates: Partial<InsertResource>): Promise<Resource | undefined> {
    const resource = this.resources.get(id);
    if (!resource) return undefined;
    
    const updated: Resource = {
      ...resource,
      ...updates,
      id: resource.id, // Keep original ID
      createdAt: resource.createdAt // Keep original creation date
    };
    this.resources.set(id, updated);
    return updated;
  }

  async deleteResource(id: number): Promise<void> {
    this.resources.delete(id);
  }

  async deleteAllResources(): Promise<void> {
    this.resources.clear();
    this.currentResourceId = 1;
  }

  async createContractor(insertContractor: InsertContractor): Promise<Contractor> {
    const id = this.currentContractorId++;
    const contractor: Contractor = {
      id,
      name: insertContractor.name,
      company: insertContractor.company,
      email: insertContractor.email || null,
      phone: insertContractor.phone || null,
      category: insertContractor.category,
      city: insertContractor.city || null,
      state: insertContractor.state || null,
      fullAddress: insertContractor.fullAddress || null,
      latitude: insertContractor.latitude || null,
      longitude: insertContractor.longitude || null,
      birdRep: insertContractor.birdRep || null,
      pipefile: insertContractor.pipefile || null,
      avetta: insertContractor.avetta || null,
      subRanking: insertContractor.subRanking || null,
      fteCountsPerLocation: insertContractor.fteCountsPerLocation || null,
      pipefileUpdates: insertContractor.pipefileUpdates || null,
      notes: insertContractor.notes || null,
      rating: insertContractor.rating || 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.contractors.set(id, contractor);
    return contractor;
  }

  async getAllContractors(): Promise<Contractor[]> {
    return Array.from(this.contractors.values());
  }

  async getContractor(id: number): Promise<Contractor | undefined> {
    return this.contractors.get(id);
  }

  async updateContractor(id: number, updates: Partial<InsertContractor>): Promise<Contractor | undefined> {
    const contractor = this.contractors.get(id);
    if (!contractor) return undefined;
    
    const updated: Contractor = {
      ...contractor,
      ...updates,
      updatedAt: new Date(),
    };
    this.contractors.set(id, updated);
    return updated;
  }

  async deleteContractor(id: number): Promise<void> {
    this.contractors.delete(id);
  }

  async collectDepartureLocations(contractorId: number): Promise<any[]> {
    return [];
  }

  async updateContractorDepartureLocations(contractorId: number): Promise<void> {
    // No-op for in-memory storage
  }

  async setContractorDepartureLocations(contractorId: number, locations: Array<{location: string, latitude: number | null, longitude: number | null}>): Promise<void> {
    const contractor = this.contractors.get(contractorId);
    if (contractor) {
      contractor.departureLocations = locations as any;
      this.contractors.set(contractorId, contractor);
    }
  }

  async mergeContractorReferences(sourceId: number, targetId: number): Promise<void> {
    // No-op for in-memory storage
  }

  async createAnalysisPoint(insertPoint: InsertAnalysisPoint): Promise<AnalysisPoint> {
    const id = this.currentPointId++;
    const point: AnalysisPoint = {
      ...insertPoint,
      id,
      createdAt: new Date(),
    };
    this.analysisPoints.set(id, point);
    return point;
  }

  async getAllAnalysisPoints(sessionId?: string): Promise<AnalysisPoint[]> {
    return Array.from(this.analysisPoints.values());
  }

  async deleteAnalysisPoint(id: number, sessionId?: string): Promise<void> {
    this.analysisPoints.delete(id);
    // Also delete related calculations
    const calcIds = Array.from(this.distanceCalculations.entries())
      .filter(([, calc]) => calc.analysisPointId === id)
      .map(([calcId]) => calcId);
    
    calcIds.forEach(calcId => this.distanceCalculations.delete(calcId));
  }

  async createDistanceCalculation(insertCalculation: InsertDistanceCalculation): Promise<DistanceCalculation> {
    const id = this.currentCalculationId++;
    const calculation: DistanceCalculation = {
      id,
      analysisPointId: insertCalculation.analysisPointId || null,
      resourceId: insertCalculation.resourceId || null,
      distance: insertCalculation.distance,
      duration: insertCalculation.duration,
      route: insertCalculation.route || null,
      createdAt: new Date(),
    };
    this.distanceCalculations.set(id, calculation);
    return calculation;
  }

  async getCalculationsByPointId(pointId: number, sessionId?: string): Promise<DistanceCalculation[]> {
    return Array.from(this.distanceCalculations.values()).filter(
      calc => calc.analysisPointId === pointId
    );
  }

  async getCalculationsWithResources(pointId: number, sessionId?: string): Promise<(DistanceCalculation & { resource: Resource })[]> {
    const calculations = await this.getCalculationsByPointId(pointId, sessionId);
    return calculations.map(calc => {
      const resource = this.resources.get(calc.resourceId!);
      return { ...calc, resource: resource! };
    }).filter(calc => calc.resource);
  }

  async clearCalculationsForPoint(pointId: number, sessionId?: string): Promise<void> {
    // Remove all calculations for this point
    const idsToDelete: number[] = [];
    this.distanceCalculations.forEach((calc, id) => {
      if (calc.analysisPointId === pointId) {
        idsToDelete.push(id);
      }
    });
    idsToDelete.forEach(id => this.distanceCalculations.delete(id));
  }

  async createAnalysisJob(insertJob: InsertAnalysisJob): Promise<AnalysisJob> {
    const id = this.currentJobId++;
    const job: AnalysisJob = {
      id,
      filename: insertJob.filename,
      status: insertJob.status,
      resourceCount: insertJob.resourceCount || null,
      error: insertJob.error || null,
      createdAt: new Date(),
    };
    this.analysisJobs.set(id, job);
    return job;
  }

  async updateAnalysisJob(id: number, updates: Partial<AnalysisJob>): Promise<AnalysisJob | undefined> {
    const job = this.analysisJobs.get(id);
    if (!job) return undefined;
    
    const updatedJob = { ...job, ...updates };
    this.analysisJobs.set(id, updatedJob);
    return updatedJob;
  }

  async getAnalysisJob(id: number): Promise<AnalysisJob | undefined> {
    return this.analysisJobs.get(id);
  }

  async createContractorFile(insertFile: InsertContractorFile): Promise<ContractorFile> {
    // MemStorage doesn't support file uploads, return a placeholder
    throw new Error("File uploads not supported in memory storage");
  }

  async getContractorFiles(contractorId: number): Promise<ContractorFile[]> {
    return [];
  }

  async deleteContractorFile(id: number): Promise<void> {
    // No-op for memory storage
  }

  // Contractor Reviews
  async createContractorReview(insertReview: InsertContractorReview): Promise<ContractorReview> {
    throw new Error("Contractor reviews not supported in memory storage");
  }

  async getContractorReviews(contractorId: number): Promise<ContractorReview[]> {
    return [];
  }

  async getAllContractorReviews(): Promise<ContractorReview[]> {
    return [];
  }

  async deleteContractorReview(reviewId: number): Promise<void> {
    throw new Error("Contractor review deletion not supported in memory storage");
  }

  // User Authentication methods (Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      u => u.email === email && !u.deletedAt
    );
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const now = new Date();
    const existing = this.users.get(userData.id);
    
    const user: User = {
      ...userData,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      deletedAt: existing?.deletedAt || null,
    };
    
    this.users.set(userData.id, user);
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values()).filter(u => !u.deletedAt);
  }

  async createUser(userData: InsertUser): Promise<User> {
    const id = crypto.randomUUID();
    const now = new Date();
    
    const user: User = {
      id,
      ...userData,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user || user.deletedAt) return undefined;
    
    const updated: User = {
      ...user,
      ...updates,
      id: user.id,
      createdAt: user.createdAt,
      updatedAt: new Date(),
    };
    
    this.users.set(id, updated);
    return updated;
  }

  async deleteUser(id: string): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const now = new Date();
    const deleted: User = {
      ...user,
      deletedAt: now,
      updatedAt: now,
    };
    
    this.users.set(id, deleted);
    return deleted;
  }

  // User Company Access
  async grantUserCompanyAccess(access: InsertUserCompanyAccess): Promise<UserCompanyAccess> {
    const id = crypto.randomUUID();
    const now = new Date();
    
    const granted: UserCompanyAccess = {
      id,
      ...access,
      grantedAt: now,
    };
    
    this.userCompanyAccesses.set(id, granted);
    return granted;
  }

  async revokeUserCompanyAccess(accessId: string): Promise<void> {
    this.userCompanyAccesses.delete(accessId);
  }

  async getUserCompanyAccesses(userId: string): Promise<UserCompanyAccess[]> {
    return Array.from(this.userCompanyAccesses.values()).filter(
      a => a.userId === userId
    );
  }

  async getCompanyUserAccesses(companyId: string): Promise<UserCompanyAccess[]> {
    return Array.from(this.userCompanyAccesses.values()).filter(
      a => a.companyId === companyId
    );
  }

  async getUserAccessibleCompanies(userId: string): Promise<Company[]> {
    const accesses = Array.from(this.userCompanyAccesses.values()).filter(
      a => a.userId === userId
    );
    
    const companies: Company[] = [];
    for (const access of accesses) {
      const company = this.companies.get(access.companyId);
      if (company && !company.deletedAt) {
        companies.push(company);
      }
    }
    
    return companies;
  }

  async hasUtilityCompanyAccess(userId: string, companyId: string): Promise<boolean> {
    const company = this.companies.get(companyId);
    if (!company || company.deletedAt) return false;
    
    return Array.from(this.userCompanyAccesses.values()).some(
      a => a.userId === userId && a.companyId === companyId
    );
  }

  // Availability-related methods (not supported in memory storage)
  async createCrewAvailability(availability: InsertCrewAvailability): Promise<CrewAvailability> {
    throw new Error("Crew availability not supported in memory storage");
  }

  async getCrewAvailabilityByContractor(contractorId: number): Promise<CrewAvailability[]> {
    return [];
  }

  async getAllCrewAvailability(): Promise<CrewAvailability[]> {
    return [];
  }

  async updateCrewAvailability(id: number, updates: Partial<InsertCrewAvailability>): Promise<CrewAvailability | undefined> {
    throw new Error("Crew availability not supported in memory storage");
  }

  async deleteCrewAvailability(id: number): Promise<void> {
    throw new Error("Crew availability not supported in memory storage");
  }

  async createEquipmentAvailability(equipment: InsertEquipmentAvailability): Promise<EquipmentAvailability> {
    throw new Error("Equipment availability not supported in memory storage");
  }

  async getEquipmentAvailabilityByContractor(contractorId: number): Promise<EquipmentAvailability[]> {
    return [];
  }

  async getEquipmentAvailabilityByCrew(crewAvailabilityId: number): Promise<EquipmentAvailability[]> {
    return [];
  }

  async deleteEquipmentAvailability(id: number): Promise<void> {
    throw new Error("Equipment availability not supported in memory storage");
  }

  async createAvailabilitySubmission(submission: InsertAvailabilitySubmission): Promise<AvailabilitySubmission> {
    throw new Error("Availability submission not supported in memory storage");
  }

  async getAvailabilitySubmissions(): Promise<AvailabilitySubmission[]> {
    return [];
  }

  async updateAvailabilitySubmission(id: number, updates: Partial<AvailabilitySubmission>): Promise<AvailabilitySubmission | undefined> {
    throw new Error("Availability submission not supported in memory storage");
  }

  async createAvailabilitySession(session: InsertAvailabilitySession): Promise<AvailabilitySession> {
    throw new Error("Availability sessions not supported in memory storage");
  }

  async getAvailabilitySessions(): Promise<AvailabilitySession[]> {
    return [];
  }

  async getAvailabilitySessionById(id: number): Promise<AvailabilitySession | undefined> {
    return undefined;
  }

  async getActiveAvailabilitySession(): Promise<AvailabilitySession | undefined> {
    return undefined;
  }

  async closeAvailabilitySession(id: number): Promise<AvailabilitySession | undefined> {
    throw new Error("Availability sessions not supported in memory storage");
  }

  async startNewAvailabilitySession(): Promise<AvailabilitySession> {
    throw new Error("Availability sessions not supported in memory storage");
  }

  async getCrewAvailabilityBySession(sessionId?: number | 'active' | 'unassigned'): Promise<CrewAvailability[]> {
    return [];
  }

  async assignUnassignedToSession(sessionId: number): Promise<void> {
    throw new Error("Availability sessions not supported in memory storage");
  }

  async createIncident(incident: InsertIncident): Promise<Incident> {
    throw new Error("Incidents not supported in memory storage");
  }

  async getAllIncidents(): Promise<Incident[]> {
    return [];
  }

  async getIncident(id: number): Promise<Incident | undefined> {
    return undefined;
  }

  async updateIncident(id: number, updates: Partial<InsertIncident>): Promise<Incident | undefined> {
    throw new Error("Incidents not supported in memory storage");
  }

  async deleteIncident(id: number): Promise<void> {
    throw new Error("Incidents not supported in memory storage");
  }

  async createIncidentAssignment(assignment: InsertIncidentAssignment): Promise<IncidentAssignment> {
    throw new Error("Incident assignments not supported in memory storage");
  }

  async getIncidentAssignments(incidentId?: number): Promise<IncidentAssignment[]> {
    return [];
  }

  async updateIncidentAssignment(id: number, updates: Partial<InsertIncidentAssignment>): Promise<IncidentAssignment | undefined> {
    throw new Error("Incident assignments not supported in memory storage");
  }

  async deleteIncidentAssignment(id: number): Promise<void> {
    throw new Error("Incident assignments not supported in memory storage");
  }

  async createCrewRoster(roster: InsertCrewRoster): Promise<CrewRoster> {
    throw new Error("Crew rosters not supported in memory storage");
  }

  async getCrewRostersByAssignment(assignmentId: number): Promise<CrewRoster[]> {
    return [];
  }

  async updateCrewRoster(id: number, updates: Partial<InsertCrewRoster>): Promise<CrewRoster | undefined> {
    throw new Error("Crew rosters not supported in memory storage");
  }

  async deleteCrewRoster(id: number): Promise<void> {
    throw new Error("Crew rosters not supported in memory storage");
  }

  async findContractorByNormalizedMatch(company: string, name: string): Promise<Contractor | undefined> {
    return undefined;
  }

  async mergeContractorReferences(sourceId: number, targetId: number): Promise<void> {
    throw new Error("Contractor merge not supported in memory storage");
  }
}

// Database implementation
import { db } from "./db";
import { eq, and, isNull } from "drizzle-orm";

export class DatabaseStorage implements IStorage {
  async createResource(insertResource: InsertResource): Promise<Resource> {
    const [resource] = await db.insert(resources).values(insertResource).returning();
    return resource;
  }

  async getAllResources(): Promise<Resource[]> {
    return await db.select().from(resources);
  }

  async updateResource(id: number, updates: Partial<InsertResource>): Promise<Resource | undefined> {
    const [resource] = await db.update(resources)
      .set(updates)
      .where(eq(resources.id, id))
      .returning();
    return resource;
  }

  async deleteResource(id: number): Promise<void> {
    await db.delete(resources).where(eq(resources.id, id));
  }

  async deleteAllResources(): Promise<void> {
    await db.delete(resources);
  }

  async createContractor(insertContractor: InsertContractor): Promise<Contractor> {
    const [contractor] = await db.insert(contractors).values({
      ...insertContractor,
      updatedAt: new Date()
    }).returning();
    return contractor;
  }

  async getAllContractors(): Promise<Contractor[]> {
    return await db.select().from(contractors);
  }

  async getContractor(id: number): Promise<Contractor | undefined> {
    const [contractor] = await db.select().from(contractors).where(eq(contractors.id, id));
    return contractor;
  }

  async updateContractor(id: number, updates: Partial<InsertContractor>): Promise<Contractor | undefined> {
    const [contractor] = await db.update(contractors)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(contractors.id, id))
      .returning();
    return contractor;
  }

  async deleteContractor(id: number): Promise<void> {
    await db.delete(contractors).where(eq(contractors.id, id));
  }

  // Utility function to normalize phone numbers (strips all non-digit characters)
  private normalizePhone(phone: string | null | undefined): string {
    if (!phone) return '';
    
    // Remove all non-digits
    let digits = phone.replace(/\D/g, '');
    
    // Handle country code: if starts with "1" and has 11 digits, remove the leading "1"
    // This handles +1-555-123-4567 vs 555-123-4567
    if (digits.length === 11 && digits.startsWith('1')) {
      digits = digits.substring(1);
    }
    
    // Only keep the main 10 digits (ignore extensions)
    // This handles cases like "555-123-4567 x89" vs "555-123-4567"
    if (digits.length > 10) {
      digits = digits.substring(0, 10);
    }
    
    return digits;
  }

  // Utility function to normalize email addresses
  private normalizeEmail(email: string | null | undefined): string {
    if (!email) return '';
    return email.toLowerCase().trim();
  }

  // Utility function to normalize text (company names, person names)
  private normalizeText(text: string | null | undefined): string {
    if (!text) return '';
    return text.toLowerCase().trim();
  }

  async findContractorByNormalizedMatch(
    company: string, 
    name: string, 
    email?: string, 
    phone?: string
  ): Promise<Contractor | undefined> {
    // Normalize all input data
    const normalizedCompany = this.normalizeText(company);
    const normalizedName = this.normalizeText(name);
    const normalizedEmail = this.normalizeEmail(email);
    const normalizedPhone = this.normalizePhone(phone);
    
    const allContractors = await this.getAllContractors();
    
    // Try multiple matching strategies in order of confidence
    
    // Strategy 1: Exact match on company + name (highest confidence)
    let match = allContractors.find(c => 
      this.normalizeText(c.company) === normalizedCompany &&
      this.normalizeText(c.name) === normalizedName
    );
    if (match) {
      console.log(`  ✓ Matched via Strategy 1 (Company + Name): ${match.company} - ${match.name}`);
      return match;
    }
    
    // Strategy 2: Match on company + email (high confidence)
    if (normalizedEmail && normalizedCompany) {
      match = allContractors.find(c => {
        const contractorEmails = (c.email || '').split(',').map(e => this.normalizeEmail(e));
        return this.normalizeText(c.company) === normalizedCompany &&
               contractorEmails.some(ce => ce === normalizedEmail);
      });
      if (match) {
        console.log(`  ✓ Matched via Strategy 2 (Company + Email): ${match.company} - ${normalizedEmail}`);
        return match;
      }
    }
    
    // Strategy 3: Match on company + phone (high confidence)
    if (normalizedPhone && normalizedCompany) {
      match = allContractors.find(c => {
        const contractorPhones = (c.phone || '').split(',').map(p => this.normalizePhone(p));
        return this.normalizeText(c.company) === normalizedCompany &&
               contractorPhones.some(cp => cp === normalizedPhone && cp.length >= 10);
      });
      if (match) {
        console.log(`  ✓ Matched via Strategy 3 (Company + Phone): ${match.company} - ${normalizedPhone}`);
        return match;
      }
    }
    
    // Strategy 4: Match on email alone (medium confidence - only if email is unique)
    if (normalizedEmail) {
      const emailMatches = allContractors.filter(c => {
        const contractorEmails = (c.email || '').split(',').map(e => this.normalizeEmail(e));
        return contractorEmails.some(ce => ce === normalizedEmail);
      });
      if (emailMatches.length === 1) {
        console.log(`  ✓ Matched via Strategy 4 (Email only): ${emailMatches[0].company} - ${normalizedEmail}`);
        return emailMatches[0];
      }
    }
    
    // Strategy 5: Match on phone alone (medium confidence - only if phone is unique and has 10+ digits)
    if (normalizedPhone && normalizedPhone.length >= 10) {
      const phoneMatches = allContractors.filter(c => {
        const contractorPhones = (c.phone || '').split(',').map(p => this.normalizePhone(p));
        return contractorPhones.some(cp => cp === normalizedPhone);
      });
      if (phoneMatches.length === 1) {
        console.log(`  ✓ Matched via Strategy 5 (Phone only): ${phoneMatches[0].company} - ${normalizedPhone}`);
        return phoneMatches[0];
      }
    }
    
    // No match found
    console.log(`  ✗ No match found for: ${company} / ${name} / ${email || 'no email'} / ${phone || 'no phone'}`);
    return undefined;
  }

  async collectDepartureLocations(contractorId: number): Promise<any[]> {
    // Get all crew availability records for this contractor
    const submissions = await db.select()
      .from(crewAvailability)
      .where(eq(crewAvailability.contractorId, contractorId));
    
    // Extract unique departure locations
    const locationMap = new Map<string, any>();
    
    for (const submission of submissions) {
      if (submission.departureLocation && submission.departureLocation.trim() !== '') {
        const key = submission.departureLocation.toLowerCase().trim();
        
        // Only add if we haven't seen this location before
        if (!locationMap.has(key)) {
          locationMap.set(key, {
            location: submission.departureLocation,
            latitude: submission.departureLatitude || null,
            longitude: submission.departureLongitude || null
          });
        }
      }
    }
    
    return Array.from(locationMap.values());
  }

  async updateContractorDepartureLocations(contractorId: number): Promise<void> {
    const locations = await this.collectDepartureLocations(contractorId);
    
    if (locations.length > 0) {
      await db.update(contractors)
        .set({ 
          departureLocations: locations as any,
          updatedAt: new Date() 
        })
        .where(eq(contractors.id, contractorId));
    }
  }

  async setContractorDepartureLocations(contractorId: number, locations: Array<{location: string, latitude: number | null, longitude: number | null}>): Promise<void> {
    await db.update(contractors)
      .set({ 
        departureLocations: locations as any,
        updatedAt: new Date() 
      })
      .where(eq(contractors.id, contractorId));
  }

  async mergeContractorReferences(sourceId: number, targetId: number): Promise<void> {
    // Update all foreign key references to point to targetId instead of sourceId
    
    // Update crew availability records
    await db.update(crewAvailability)
      .set({ contractorId: targetId })
      .where(eq(crewAvailability.contractorId, sourceId));
    
    // Update equipment availability records
    await db.update(equipmentAvailability)
      .set({ contractorId: targetId })
      .where(eq(equipmentAvailability.contractorId, sourceId));
    
    // Update contractor files
    await db.update(contractorFiles)
      .set({ contractorId: targetId })
      .where(eq(contractorFiles.contractorId, sourceId));
    
    // Update contractor reviews
    await db.update(contractorReviews)
      .set({ contractorId: targetId })
      .where(eq(contractorReviews.contractorId, sourceId));
    
    // Update users (if contractors have associated user accounts)
    await db.update(users)
      .set({ contractorId: targetId })
      .where(eq(users.contractorId, sourceId));
    
    // Note: incidentAssignments and crewRosters are linked through crewAvailability,
    // so updating crewAvailability.contractorId above handles those relationships
  }

  async createAnalysisPoint(insertPoint: InsertAnalysisPoint): Promise<AnalysisPoint> {
    const [point] = await db.insert(analysisPoints).values(insertPoint).returning();
    return point;
  }

  async getAllAnalysisPoints(sessionId?: string): Promise<AnalysisPoint[]> {
    if (sessionId) {
      return await db.select().from(analysisPoints).where(eq(analysisPoints.sessionId, sessionId));
    }
    return await db.select().from(analysisPoints);
  }

  async deleteAnalysisPoint(id: number, sessionId?: string): Promise<void> {
    // First delete related distance calculations
    if (sessionId) {
      await db.delete(distanceCalculations).where(
        and(eq(distanceCalculations.analysisPointId, id), eq(distanceCalculations.sessionId, sessionId))
      );
      // Then delete the analysis point
      await db.delete(analysisPoints).where(
        and(eq(analysisPoints.id, id), eq(analysisPoints.sessionId, sessionId))
      );
    } else {
      await db.delete(distanceCalculations).where(eq(distanceCalculations.analysisPointId, id));
      await db.delete(analysisPoints).where(eq(analysisPoints.id, id));
    }
  }

  async createDistanceCalculation(insertCalculation: InsertDistanceCalculation): Promise<DistanceCalculation> {
    const [calculation] = await db.insert(distanceCalculations).values(insertCalculation).returning();
    return calculation;
  }

  async getCalculationsByPointId(pointId: number, sessionId?: string): Promise<DistanceCalculation[]> {
    if (sessionId) {
      return await db.select().from(distanceCalculations).where(
        and(eq(distanceCalculations.analysisPointId, pointId), eq(distanceCalculations.sessionId, sessionId))
      );
    }
    return await db.select().from(distanceCalculations).where(eq(distanceCalculations.analysisPointId, pointId));
  }

  async getCalculationsWithResources(pointId: number, sessionId?: string): Promise<(DistanceCalculation & { resource: Resource })[]> {
    const calculations = await db.select({
      id: distanceCalculations.id,
      analysisPointId: distanceCalculations.analysisPointId,
      resourceId: distanceCalculations.resourceId,
      distance: distanceCalculations.distance,
      duration: distanceCalculations.duration,
      route: distanceCalculations.route,
      createdAt: distanceCalculations.createdAt,
      sessionId: distanceCalculations.sessionId,
      resource: resources
    })
    .from(distanceCalculations)
    .innerJoin(resources, eq(distanceCalculations.resourceId, resources.id))
    .where(sessionId 
      ? and(eq(distanceCalculations.analysisPointId, pointId), eq(distanceCalculations.sessionId, sessionId))
      : eq(distanceCalculations.analysisPointId, pointId)
    );

    return calculations.map(calc => ({
      ...calc,
      resource: calc.resource
    }));
  }



  async clearCalculationsForPoint(pointId: number, sessionId?: string): Promise<void> {
    if (sessionId) {
      await db.delete(distanceCalculations).where(
        and(eq(distanceCalculations.analysisPointId, pointId), eq(distanceCalculations.sessionId, sessionId))
      );
    } else {
      await db.delete(distanceCalculations).where(eq(distanceCalculations.analysisPointId, pointId));
    }
  }

  async createAnalysisJob(insertJob: InsertAnalysisJob): Promise<AnalysisJob> {
    const [job] = await db.insert(analysisJobs).values(insertJob).returning();
    return job;
  }

  async updateAnalysisJob(id: number, updates: Partial<AnalysisJob>): Promise<AnalysisJob | undefined> {
    const [job] = await db.update(analysisJobs)
      .set(updates)
      .where(eq(analysisJobs.id, id))
      .returning();
    return job;
  }

  async getAnalysisJob(id: number): Promise<AnalysisJob | undefined> {
    const [job] = await db.select().from(analysisJobs).where(eq(analysisJobs.id, id));
    return job;
  }

  async createContractorFile(insertFile: InsertContractorFile): Promise<ContractorFile> {
    const [file] = await db.insert(contractorFiles).values(insertFile).returning();
    return file;
  }

  async getContractorFiles(contractorId: number): Promise<ContractorFile[]> {
    return await db.select().from(contractorFiles).where(eq(contractorFiles.contractorId, contractorId));
  }

  async deleteContractorFile(id: number): Promise<void> {
    await db.delete(contractorFiles).where(eq(contractorFiles.id, id));
  }

  // Contractor Reviews
  async createContractorReview(insertReview: InsertContractorReview): Promise<ContractorReview> {
    const [review] = await db.insert(contractorReviews).values(insertReview).returning();
    return review;
  }

  async getContractorReviews(contractorId: number): Promise<ContractorReview[]> {
    return await db.select().from(contractorReviews).where(eq(contractorReviews.contractorId, contractorId));
  }

  async getAllContractorReviews(): Promise<ContractorReview[]> {
    return await db.select().from(contractorReviews);
  }

  async deleteContractorReview(reviewId: number): Promise<void> {
    await db.delete(contractorReviews).where(eq(contractorReviews.id, reviewId));
  }

  // User Authentication methods (Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).where(isNull(users.deletedAt));
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(
      and(
        eq(users.email, email),
        isNull(users.deletedAt)
      )
    );
    return user;
  }

  async createUser(userData: InsertUser): Promise<User> {
    const now = new Date();
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning();
    return updated;
  }

  async deleteUser(id: string): Promise<User | undefined> {
    const now = new Date();
    const [deleted] = await db
      .update(users)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(users.id, id))
      .returning();
    return deleted;
  }

  // User Company Access
  async grantUserCompanyAccess(access: InsertUserCompanyAccess): Promise<UserCompanyAccess> {
    const [granted] = await db
      .insert(userCompanyAccess)
      .values(access)
      .returning();
    return granted;
  }

  async revokeUserCompanyAccess(accessId: string): Promise<void> {
    await db.delete(userCompanyAccess).where(eq(userCompanyAccess.id, accessId));
  }

  async getUserCompanyAccesses(userId: string): Promise<UserCompanyAccess[]> {
    return await db
      .select()
      .from(userCompanyAccess)
      .where(eq(userCompanyAccess.userId, userId));
  }

  async getCompanyUserAccesses(companyId: string): Promise<UserCompanyAccess[]> {
    return await db
      .select()
      .from(userCompanyAccess)
      .where(eq(userCompanyAccess.companyId, companyId));
  }

  async getUserAccessibleCompanies(userId: string): Promise<Company[]> {
    const result = await db
      .select({
        id: companies.id,
        name: companies.name,
        contactName: companies.contactName,
        contactEmail: companies.contactEmail,
        contactPhone: companies.contactPhone,
        billingAddress: companies.billingAddress,
        notes: companies.notes,
        createdAt: companies.createdAt,
        updatedAt: companies.updatedAt,
        deletedAt: companies.deletedAt,
      })
      .from(userCompanyAccess)
      .innerJoin(companies, eq(userCompanyAccess.companyId, companies.id))
      .where(
        and(
          eq(userCompanyAccess.userId, userId),
          isNull(companies.deletedAt)
        )
      );
    return result;
  }

  async hasUtilityCompanyAccess(userId: string, companyId: string): Promise<boolean> {
    const [access] = await db
      .select()
      .from(userCompanyAccess)
      .innerJoin(companies, eq(userCompanyAccess.companyId, companies.id))
      .where(
        and(
          eq(userCompanyAccess.userId, userId),
          eq(userCompanyAccess.companyId, companyId),
          isNull(companies.deletedAt)
        )
      )
      .limit(1);
    return access !== undefined;
  }

  // Companies (Storm Response Management)
  async createCompany(companyData: InsertCompany): Promise<Company> {
    const [company] = await db.insert(companies).values(companyData).returning();
    return company;
  }

  async getAllCompanies(): Promise<Company[]> {
    return await db.select().from(companies).where(isNull(companies.deletedAt));
  }

  async getCompany(id: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(
      and(
        eq(companies.id, id),
        isNull(companies.deletedAt)
      )
    );
    return company;
  }

  async updateCompany(id: string, updates: Partial<InsertCompany>): Promise<Company | undefined> {
    const [updated] = await db
      .update(companies)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(companies.id, id))
      .returning();
    return updated;
  }

  async deleteCompany(id: string): Promise<void> {
    // Soft delete
    await db
      .update(companies)
      .set({ deletedAt: new Date() })
      .where(eq(companies.id, id));
  }

  // Storm Sessions
  async createStormSession(sessionData: InsertStormSession): Promise<StormSession> {
    const [session] = await db.insert(stormSessions).values(sessionData).returning();
    return session;
  }

  async getAllStormSessions(): Promise<StormSession[]> {
    return await db.select().from(stormSessions).where(isNull(stormSessions.deletedAt));
  }

  async getStormSession(id: string): Promise<StormSession | undefined> {
    const [session] = await db.select().from(stormSessions).where(
      and(
        eq(stormSessions.id, id),
        isNull(stormSessions.deletedAt)
      )
    );
    return session;
  }

  async updateStormSession(id: string, updates: Partial<InsertStormSession>): Promise<StormSession | undefined> {
    const [updated] = await db
      .update(stormSessions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(stormSessions.id, id))
      .returning();
    return updated;
  }

  async closeStormSession(id: string): Promise<StormSession | undefined> {
    const [closed] = await db
      .update(stormSessions)
      .set({ status: 'CLOSED', closedAt: new Date(), updatedAt: new Date() })
      .where(eq(stormSessions.id, id))
      .returning();
    return closed;
  }

  async deactivateAllSessions(): Promise<void> {
    await db
      .update(stormSessions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(isNull(stormSessions.deletedAt));
  }

  async reopenStormSession(id: string): Promise<StormSession | undefined> {
    const [reopened] = await db
      .update(stormSessions)
      .set({ status: 'DRAFT', isActive: false, updatedAt: new Date() })
      .where(eq(stormSessions.id, id))
      .returning();
    return reopened;
  }

  async activateStormSession(id: string): Promise<StormSession | undefined> {
    // First deactivate all sessions
    await this.deactivateAllSessions();
    
    // Then activate the target session and set status to ACTIVE
    const [activated] = await db
      .update(stormSessions)
      .set({ isActive: true, status: 'ACTIVE', updatedAt: new Date() })
      .where(
        and(
          eq(stormSessions.id, id),
          isNull(stormSessions.deletedAt)
        )
      )
      .returning();
    return activated;
  }

  async deactivateStormSession(id: string): Promise<StormSession | undefined> {
    const [deactivated] = await db
      .update(stormSessions)
      .set({ isActive: false, status: 'DRAFT', updatedAt: new Date() })
      .where(eq(stormSessions.id, id))
      .returning();
    return deactivated;
  }

  async getActiveStormSession(): Promise<StormSession | undefined> {
    const [activeSession] = await db
      .select()
      .from(stormSessions)
      .where(
        and(
          eq(stormSessions.isActive, true),
          isNull(stormSessions.deletedAt)
        )
      )
      .limit(1);
    return activeSession;
  }

  async addContractorToSession(sessionId: string, contractorCompanyId: string): Promise<void> {
    await db.insert(sessionContractors).values({
      sessionId,
      contractorCompanyId,
    }).onConflictDoNothing();
  }

  async removeContractorFromSession(sessionId: string, contractorCompanyId: string): Promise<void> {
    await db
      .delete(sessionContractors)
      .where(
        and(
          eq(sessionContractors.sessionId, sessionId),
          eq(sessionContractors.contractorCompanyId, contractorCompanyId)
        )
      );
  }

  // Rosters
  async createRoster(rosterData: InsertRoster): Promise<Roster> {
    const [roster] = await db.insert(rosters).values(rosterData).returning();
    return roster;
  }

  async getRostersBySession(sessionId: string): Promise<Roster[]> {
    return await db
      .select()
      .from(rosters)
      .where(and(eq(rosters.sessionId, sessionId), isNull(rosters.deletedAt)));
  }

  async getRostersByCompany(companyId: string): Promise<Roster[]> {
    return await db
      .select()
      .from(rosters)
      .where(and(eq(rosters.companyId, companyId), isNull(rosters.deletedAt)));
  }

  async getRoster(id: string): Promise<Roster | undefined> {
    const [roster] = await db
      .select()
      .from(rosters)
      .where(and(eq(rosters.id, id), isNull(rosters.deletedAt)));
    return roster;
  }

  async updateRoster(id: string, updates: Partial<InsertRoster>): Promise<Roster | undefined> {
    const [updated] = await db
      .update(rosters)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(rosters.id, id))
      .returning();
    return updated;
  }

  async deleteRoster(id: string): Promise<void> {
    // Soft delete
    await db.update(rosters).set({ deletedAt: new Date() }).where(eq(rosters.id, id));
  }

  // Crews
  async createCrew(crewData: InsertCrew): Promise<Crew> {
    const [crew] = await db.insert(crews).values(crewData).returning();
    return crew;
  }

  async getCrewsByRoster(rosterId: string): Promise<Crew[]> {
    return await db
      .select()
      .from(crews)
      .where(and(eq(crews.rosterId, rosterId), isNull(crews.deletedAt)));
  }

  async getCrew(id: string): Promise<Crew | undefined> {
    const [crew] = await db
      .select()
      .from(crews)
      .where(and(eq(crews.id, id), isNull(crews.deletedAt)));
    return crew;
  }

  async updateCrew(id: string, updates: Partial<InsertCrew>): Promise<Crew | undefined> {
    const [updated] = await db
      .update(crews)
      .set(updates)
      .where(eq(crews.id, id))
      .returning();
    return updated;
  }

  async deleteCrew(id: string): Promise<void> {
    // Soft delete
    await db.update(crews).set({ deletedAt: new Date() }).where(eq(crews.id, id));
  }

  // Roster Personnel
  async addRosterPersonnel(personnelData: InsertRosterPersonnel): Promise<RosterPersonnel> {
    const [personnel] = await db.insert(rosterPersonnel).values(personnelData).returning();
    return personnel;
  }

  async getRosterPersonnel(rosterId: string): Promise<RosterPersonnel[]> {
    return await db
      .select()
      .from(rosterPersonnel)
      .where(and(eq(rosterPersonnel.rosterId, rosterId), isNull(rosterPersonnel.deletedAt)));
  }

  async updateRosterPersonnel(id: string, updates: Partial<InsertRosterPersonnel>): Promise<RosterPersonnel | undefined> {
    const [updated] = await db
      .update(rosterPersonnel)
      .set(updates)
      .where(eq(rosterPersonnel.id, id))
      .returning();
    return updated;
  }

  async removeRosterPersonnel(id: string): Promise<void> {
    // Soft delete
    await db.update(rosterPersonnel).set({ deletedAt: new Date() }).where(eq(rosterPersonnel.id, id));
  }

  // Roster Equipment
  async addRosterEquipment(equipmentData: InsertRosterEquipment): Promise<RosterEquipment> {
    const [equipment] = await db.insert(rosterEquipment).values(equipmentData).returning();
    return equipment;
  }

  async getRosterEquipment(rosterId: string): Promise<RosterEquipment[]> {
    return await db
      .select()
      .from(rosterEquipment)
      .where(and(eq(rosterEquipment.rosterId, rosterId), isNull(rosterEquipment.deletedAt)));
  }

  async updateRosterEquipment(id: string, updates: Partial<InsertRosterEquipment>): Promise<RosterEquipment | undefined> {
    const [updated] = await db
      .update(rosterEquipment)
      .set(updates)
      .where(eq(rosterEquipment.id, id))
      .returning();
    return updated;
  }

  async removeRosterEquipment(id: string): Promise<void> {
    // Soft delete
    await db.update(rosterEquipment).set({ deletedAt: new Date() }).where(eq(rosterEquipment.id, id));
  }

  // Timesheets
  async createTimesheet(timesheetData: InsertTimesheet): Promise<Timesheet> {
    const [timesheet] = await db.insert(timesheets).values(timesheetData).returning();
    return timesheet;
  }

  async getTimesheetsBySession(sessionId: string): Promise<Timesheet[]> {
    return await db
      .select()
      .from(timesheets)
      .where(and(eq(timesheets.sessionId, sessionId), isNull(timesheets.deletedAt)));
  }

  async getTimesheetsByCompany(companyId: string): Promise<Timesheet[]> {
    return await db
      .select()
      .from(timesheets)
      .where(and(eq(timesheets.companyId, companyId), isNull(timesheets.deletedAt)));
  }

  async getTimesheet(id: string): Promise<Timesheet | undefined> {
    const [timesheet] = await db
      .select()
      .from(timesheets)
      .where(and(eq(timesheets.id, id), isNull(timesheets.deletedAt)));
    return timesheet;
  }

  async updateTimesheet(id: string, updates: Partial<InsertTimesheet>): Promise<Timesheet | undefined> {
    const [updated] = await db
      .update(timesheets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(timesheets.id, id))
      .returning();
    return updated;
  }

  async submitTimesheet(id: string, userId: string): Promise<Timesheet | undefined> {
    const [submitted] = await db
      .update(timesheets)
      .set({ 
        status: 'SUBMITTED', 
        submittedBy: userId,
        updatedAt: new Date() 
      })
      .where(eq(timesheets.id, id))
      .returning();
    return submitted;
  }

  async approveTimesheet(id: string, userId: string): Promise<Timesheet | undefined> {
    const [approved] = await db
      .update(timesheets)
      .set({ 
        status: 'APPROVED', 
        approvedBy: userId,
        approvedAt: new Date(),
        updatedAt: new Date() 
      })
      .where(eq(timesheets.id, id))
      .returning();
    return approved;
  }

  async rejectTimesheet(id: string, userId: string, reason: string): Promise<Timesheet | undefined> {
    const [rejected] = await db
      .update(timesheets)
      .set({ 
        status: 'REJECTED', 
        rejectedBy: userId,
        rejectedAt: new Date(),
        rejectionReason: reason,
        updatedAt: new Date() 
      })
      .where(eq(timesheets.id, id))
      .returning();
    return rejected;
  }

  async deleteTimesheet(id: string): Promise<void> {
    // Soft delete
    await db.update(timesheets).set({ deletedAt: new Date() }).where(eq(timesheets.id, id));
  }

  // Timesheet Personnel
  async addTimesheetPersonnel(personnelData: InsertTimesheetPersonnel): Promise<TimesheetPersonnel> {
    const [personnel] = await db.insert(timesheetPersonnel).values(personnelData).returning();
    return personnel;
  }

  async getTimesheetPersonnel(timesheetId: string): Promise<TimesheetPersonnel[]> {
    return await db
      .select()
      .from(timesheetPersonnel)
      .where(and(eq(timesheetPersonnel.timesheetId, timesheetId), isNull(timesheetPersonnel.deletedAt)));
  }

  async updateTimesheetPersonnel(id: string, updates: Partial<InsertTimesheetPersonnel>): Promise<TimesheetPersonnel | undefined> {
    const [updated] = await db
      .update(timesheetPersonnel)
      .set(updates)
      .where(eq(timesheetPersonnel.id, id))
      .returning();
    return updated;
  }

  async removeTimesheetPersonnel(id: string): Promise<void> {
    await db.update(timesheetPersonnel).set({ deletedAt: new Date() }).where(eq(timesheetPersonnel.id, id));
  }

  // Timesheet Equipment
  async addTimesheetEquipment(equipmentData: InsertTimesheetEquipment): Promise<TimesheetEquipment> {
    const [equipment] = await db.insert(timesheetEquipment).values(equipmentData).returning();
    return equipment;
  }

  async getTimesheetEquipment(timesheetId: string): Promise<TimesheetEquipment[]> {
    return await db
      .select()
      .from(timesheetEquipment)
      .where(and(eq(timesheetEquipment.timesheetId, timesheetId), isNull(timesheetEquipment.deletedAt)));
  }

  async updateTimesheetEquipment(id: string, updates: Partial<InsertTimesheetEquipment>): Promise<TimesheetEquipment | undefined> {
    const [updated] = await db
      .update(timesheetEquipment)
      .set(updates)
      .where(eq(timesheetEquipment.id, id))
      .returning();
    return updated;
  }

  async removeTimesheetEquipment(id: string): Promise<void> {
    await db.update(timesheetEquipment).set({ deletedAt: new Date() }).where(eq(timesheetEquipment.id, id));
  }

  // Timesheet Lines (legacy)
  async addTimesheetLine(lineData: InsertTimesheetLine): Promise<TimesheetLine> {
    const [line] = await db.insert(timesheetLines).values(lineData).returning();
    return line;
  }

  async getTimesheetLines(timesheetId: string): Promise<TimesheetLine[]> {
    return await db
      .select()
      .from(timesheetLines)
      .where(and(eq(timesheetLines.timesheetId, timesheetId), isNull(timesheetLines.deletedAt)));
  }

  async updateTimesheetLine(id: string, updates: Partial<InsertTimesheetLine>): Promise<TimesheetLine | undefined> {
    const [updated] = await db
      .update(timesheetLines)
      .set(updates)
      .where(eq(timesheetLines.id, id))
      .returning();
    return updated;
  }

  async removeTimesheetLine(id: string): Promise<void> {
    // Soft delete
    await db.update(timesheetLines).set({ deletedAt: new Date() }).where(eq(timesheetLines.id, id));
  }

  // Expenses
  async createExpense(expenseData: InsertExpense): Promise<Expense> {
    const [expense] = await db.insert(expenses).values(expenseData).returning();
    return expense;
  }

  async getExpensesBySession(sessionId: string): Promise<Expense[]> {
    return await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.sessionId, sessionId), isNull(expenses.deletedAt)));
  }

  async getExpensesByCompany(companyId: string): Promise<Expense[]> {
    return await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.companyId, companyId), isNull(expenses.deletedAt)));
  }

  async getExpense(id: string): Promise<Expense | undefined> {
    const [expense] = await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, id), isNull(expenses.deletedAt)));
    return expense;
  }

  async updateExpense(id: string, updates: Partial<InsertExpense>): Promise<Expense | undefined> {
    const [updated] = await db
      .update(expenses)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(expenses.id, id))
      .returning();
    return updated;
  }

  async approveExpense(id: string, userId: string): Promise<Expense | undefined> {
    const [approved] = await db
      .update(expenses)
      .set({ 
        status: 'APPROVED', 
        approvedBy: userId,
        updatedAt: new Date() 
      })
      .where(eq(expenses.id, id))
      .returning();
    return approved;
  }

  async rejectExpense(id: string, userId: string): Promise<Expense | undefined> {
    const [rejected] = await db
      .update(expenses)
      .set({ 
        status: 'REJECTED', 
        approvedBy: userId,
        updatedAt: new Date() 
      })
      .where(eq(expenses.id, id))
      .returning();
    return rejected;
  }

  async deleteExpense(id: string): Promise<void> {
    // Soft delete
    await db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, id));
  }

  // Expense Files
  async addExpenseFile(fileData: InsertExpenseFile): Promise<ExpenseFile> {
    const [file] = await db.insert(expenseFiles).values(fileData).returning();
    return file;
  }

  async getExpenseFiles(expenseId: string): Promise<ExpenseFile[]> {
    return await db
      .select()
      .from(expenseFiles)
      .where(and(eq(expenseFiles.expenseId, expenseId), isNull(expenseFiles.deletedAt)));
  }

  async removeExpenseFile(id: string): Promise<void> {
    // Soft delete
    await db.update(expenseFiles).set({ deletedAt: new Date() }).where(eq(expenseFiles.id, id));
  }

  // Invoices
  async createInvoice(invoiceData: InsertInvoice): Promise<Invoice> {
    const [invoice] = await db.insert(invoices).values(invoiceData).returning();
    return invoice;
  }

  async getInvoicesBySession(sessionId: string): Promise<Invoice[]> {
    return await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.sessionId, sessionId), isNull(invoices.deletedAt)));
  }

  async getInvoicesByCompany(companyId: string): Promise<Invoice[]> {
    return await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), isNull(invoices.deletedAt)));
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), isNull(invoices.deletedAt)));
    return invoice;
  }

  async updateInvoice(id: string, updates: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    const [updated] = await db
      .update(invoices)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(invoices.id, id))
      .returning();
    return updated;
  }

  async issueInvoice(id: string): Promise<Invoice | undefined> {
    const [issued] = await db
      .update(invoices)
      .set({ 
        status: 'ISSUED', 
        issuedAt: new Date(),
        updatedAt: new Date() 
      })
      .where(eq(invoices.id, id))
      .returning();
    return issued;
  }

  async markInvoicePaid(id: string): Promise<Invoice | undefined> {
    const [paid] = await db
      .update(invoices)
      .set({ 
        status: 'PAID',
        updatedAt: new Date() 
      })
      .where(eq(invoices.id, id))
      .returning();
    return paid;
  }

  async deleteInvoice(id: string): Promise<void> {
    // Soft delete
    await db.update(invoices).set({ deletedAt: new Date() }).where(eq(invoices.id, id));
  }

  // Invoice Lines
  async addInvoiceLine(lineData: InsertInvoiceLine): Promise<InvoiceLine> {
    const [line] = await db.insert(invoiceLines).values(lineData).returning();
    return line;
  }

  async getInvoiceLines(invoiceId: string): Promise<InvoiceLine[]> {
    return await db
      .select()
      .from(invoiceLines)
      .where(and(eq(invoiceLines.invoiceId, invoiceId), isNull(invoiceLines.deletedAt)));
  }

  async updateInvoiceLine(id: string, updates: Partial<InsertInvoiceLine>): Promise<InvoiceLine | undefined> {
    const [updated] = await db
      .update(invoiceLines)
      .set(updates)
      .where(eq(invoiceLines.id, id))
      .returning();
    return updated;
  }

  async removeInvoiceLine(id: string): Promise<void> {
    // Soft delete
    await db.update(invoiceLines).set({ deletedAt: new Date() }).where(eq(invoiceLines.id, id));
  }

  // Crew Availability
  async createCrewAvailability(insertAvailability: InsertCrewAvailability): Promise<CrewAvailability> {
    // Assign to active session if no sessionId provided
    let availabilityData = { ...insertAvailability };
    if (!availabilityData.sessionId) {
      const activeSession = await this.getActiveAvailabilitySession();
      if (activeSession) {
        availabilityData.sessionId = activeSession.id;
      }
    }
    
    const [availability] = await db.insert(crewAvailability).values(availabilityData).returning();
    return availability;
  }

  async getCrewAvailabilityByContractor(contractorId: number): Promise<CrewAvailability[]> {
    return await db.select().from(crewAvailability).where(eq(crewAvailability.contractorId, contractorId));
  }

  async getAllCrewAvailability(): Promise<CrewAvailability[]> {
    return await db.select().from(crewAvailability);
  }

  async updateCrewAvailability(id: number, updates: Partial<InsertCrewAvailability>): Promise<CrewAvailability | undefined> {
    const [updated] = await db.update(crewAvailability)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(crewAvailability.id, id))
      .returning();
    return updated;
  }

  async deleteCrewAvailability(id: number): Promise<void> {
    await db.delete(crewAvailability).where(eq(crewAvailability.id, id));
  }

  // Equipment Availability
  async createEquipmentAvailability(insertEquipment: InsertEquipmentAvailability): Promise<EquipmentAvailability> {
    const [equipment] = await db.insert(equipmentAvailability).values(insertEquipment).returning();
    return equipment;
  }

  async getEquipmentAvailabilityByContractor(contractorId: number): Promise<EquipmentAvailability[]> {
    return await db.select().from(equipmentAvailability).where(eq(equipmentAvailability.contractorId, contractorId));
  }

  async getEquipmentAvailabilityByCrew(crewAvailabilityId: number): Promise<EquipmentAvailability[]> {
    return await db.select().from(equipmentAvailability).where(eq(equipmentAvailability.crewAvailabilityId, crewAvailabilityId));
  }

  async deleteEquipmentAvailability(id: number): Promise<void> {
    await db.delete(equipmentAvailability).where(eq(equipmentAvailability.id, id));
  }

  // Availability Submissions
  async createAvailabilitySubmission(insertSubmission: InsertAvailabilitySubmission): Promise<AvailabilitySubmission> {
    const [submission] = await db.insert(availabilitySubmissions).values(insertSubmission).returning();
    return submission;
  }

  async getAvailabilitySubmissions(): Promise<AvailabilitySubmission[]> {
    return await db.select().from(availabilitySubmissions);
  }

  async updateAvailabilitySubmission(id: number, updates: Partial<AvailabilitySubmission>): Promise<AvailabilitySubmission | undefined> {
    const [updated] = await db.update(availabilitySubmissions)
      .set(updates)
      .where(eq(availabilitySubmissions.id, id))
      .returning();
    return updated;
  }

  // Availability Sessions
  async createAvailabilitySession(insertSession: InsertAvailabilitySession): Promise<AvailabilitySession> {
    const [session] = await db.insert(availabilitySessions).values(insertSession).returning();
    return session;
  }

  async getAvailabilitySessions(): Promise<AvailabilitySession[]> {
    return await db.select().from(availabilitySessions).orderBy(availabilitySessions.createdAt);
  }

  async getAvailabilitySessionById(id: number): Promise<AvailabilitySession | undefined> {
    const [session] = await db.select()
      .from(availabilitySessions)
      .where(eq(availabilitySessions.id, id))
      .limit(1);
    return session;
  }

  async getActiveAvailabilitySession(): Promise<AvailabilitySession | undefined> {
    const [session] = await db.select()
      .from(availabilitySessions)
      .where(eq(availabilitySessions.isActive, true))
      .limit(1);
    return session;
  }

  async closeAvailabilitySession(id: number): Promise<AvailabilitySession | undefined> {
    const [updated] = await db.update(availabilitySessions)
      .set({ isActive: false, endDate: new Date(), closedAt: new Date() })
      .where(eq(availabilitySessions.id, id))
      .returning();
    return updated;
  }

  async startNewAvailabilitySession(label?: string): Promise<AvailabilitySession> {
    // Close any existing active session
    const activeSession = await this.getActiveAvailabilitySession();
    if (activeSession) {
      await this.closeAvailabilitySession(activeSession.id);
    } else {
      // If no active session, create a snapshot session for unassigned records
      const unassignedRecords = await db.select()
        .from(crewAvailability)
        .where(isNull(crewAvailability.sessionId));
      
      if (unassignedRecords.length > 0) {
        const snapshotSession = await this.createAvailabilitySession({
          label: `Historical Data - ${new Date().toLocaleDateString()}`,
          isActive: false,
          endDate: new Date(),
          closedAt: new Date()
        });
        
        // Assign unassigned records to the snapshot
        await this.assignUnassignedToSession(snapshotSession.id);
      }
    }

    // Create new active session with provided label or default
    const newLabel = label || `Week of ${new Date().toLocaleDateString()}`;
    return await this.createAvailabilitySession({
      label: newLabel,
      isActive: true
    });
  }

  async getCrewAvailabilityBySession(sessionId?: number | 'active' | 'unassigned'): Promise<CrewAvailability[]> {
    if (sessionId === 'active') {
      const activeSession = await this.getActiveAvailabilitySession();
      if (!activeSession) return [];
      return await db.select()
        .from(crewAvailability)
        .where(eq(crewAvailability.sessionId, activeSession.id));
    } else if (sessionId === 'unassigned') {
      return await db.select()
        .from(crewAvailability)
        .where(isNull(crewAvailability.sessionId));
    } else if (sessionId) {
      return await db.select()
        .from(crewAvailability)
        .where(eq(crewAvailability.sessionId, sessionId));
    } else {
      // Default to active session
      return await this.getCrewAvailabilityBySession('active');
    }
  }

  async assignUnassignedToSession(sessionId: number): Promise<void> {
    await db.update(crewAvailability)
      .set({ sessionId })
      .where(isNull(crewAvailability.sessionId));
  }

  // Incident Management
  async createIncident(insertIncident: InsertIncident): Promise<Incident> {
    const [incident] = await db.insert(incidents).values(insertIncident).returning();
    return incident;
  }

  async getAllIncidents(): Promise<Incident[]> {
    return await db.select().from(incidents).orderBy(incidents.createdAt);
  }

  async getIncident(id: number): Promise<Incident | undefined> {
    const [incident] = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
    return incident;
  }

  async updateIncident(id: number, updates: Partial<InsertIncident>): Promise<Incident | undefined> {
    const [updated] = await db
      .update(incidents)
      .set(updates)
      .where(eq(incidents.id, id))
      .returning();
    return updated;
  }

  async deleteIncident(id: number): Promise<void> {
    await db.delete(incidents).where(eq(incidents.id, id));
  }

  // Incident Assignments
  async createIncidentAssignment(insertAssignment: InsertIncidentAssignment): Promise<IncidentAssignment> {
    const [assignment] = await db.insert(incidentAssignments).values(insertAssignment).returning();
    return assignment;
  }

  async getIncidentAssignments(incidentId?: number): Promise<IncidentAssignment[]> {
    if (incidentId) {
      return await db.select().from(incidentAssignments).where(eq(incidentAssignments.incidentId, incidentId));
    }
    return await db.select().from(incidentAssignments);
  }

  async updateIncidentAssignment(id: number, updates: Partial<InsertIncidentAssignment>): Promise<IncidentAssignment | undefined> {
    const [updated] = await db
      .update(incidentAssignments)
      .set(updates)
      .where(eq(incidentAssignments.id, id))
      .returning();
    return updated;
  }

  async deleteIncidentAssignment(id: number): Promise<void> {
    await db.delete(incidentAssignments).where(eq(incidentAssignments.id, id));
  }

  // Crew Rosters
  async createCrewRoster(insertRoster: InsertCrewRoster): Promise<CrewRoster> {
    const [roster] = await db.insert(crewRosters).values(insertRoster).returning();
    return roster;
  }

  async getCrewRostersByAssignment(assignmentId: number): Promise<CrewRoster[]> {
    return await db.select().from(crewRosters).where(eq(crewRosters.incidentAssignmentId, assignmentId));
  }

  async updateCrewRoster(id: number, updates: Partial<InsertCrewRoster>): Promise<CrewRoster | undefined> {
    const [updated] = await db
      .update(crewRosters)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(crewRosters.id, id))
      .returning();
    return updated;
  }

  async deleteCrewRoster(id: number): Promise<void> {
    await db.delete(crewRosters).where(eq(crewRosters.id, id));
  }

  // ===== TICKETING MODULE =====

  async createIssueType(insertData: InsertIssueType): Promise<IssueType> {
    const [result] = await db.insert(issueTypes).values(insertData).returning();
    return result;
  }

  async getAllIssueTypes(): Promise<IssueType[]> {
    return await db.select().from(issueTypes).orderBy(issueTypes.name);
  }

  async getIssueType(id: string): Promise<IssueType | undefined> {
    const [result] = await db.select().from(issueTypes).where(eq(issueTypes.id, id)).limit(1);
    return result;
  }

  async updateIssueType(id: string, updates: Partial<InsertIssueType>): Promise<IssueType | undefined> {
    const [result] = await db.update(issueTypes).set({ ...updates, updatedAt: new Date() }).where(eq(issueTypes.id, id)).returning();
    return result;
  }

  async createTicket(insertData: InsertTicket): Promise<Ticket> {
    const [result] = await db.insert(tickets).values(insertData).returning();
    return result;
  }

  async getTicket(id: string): Promise<Ticket | undefined> {
    const [result] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
    return result;
  }

  async getTicketsBySession(sessionId: string): Promise<Ticket[]> {
    return await db.select().from(tickets).where(eq(tickets.sessionId, sessionId)).orderBy(tickets.createdAt);
  }

  async getTicketsByCompany(companyId: string): Promise<Ticket[]> {
    return await db.select().from(tickets).where(eq(tickets.companyId, companyId)).orderBy(tickets.createdAt);
  }

  async updateTicket(id: string, updates: Partial<InsertTicket>): Promise<Ticket | undefined> {
    const [result] = await db.update(tickets).set({ ...updates, updatedAt: new Date() }).where(eq(tickets.id, id)).returning();
    return result;
  }

  async createTicketAssignment(insertData: InsertTicketAssignment): Promise<TicketAssignment> {
    const [result] = await db.insert(ticketAssignments).values(insertData).returning();
    return result;
  }

  async getTicketAssignments(ticketId: string): Promise<TicketAssignment[]> {
    return await db.select().from(ticketAssignments).where(eq(ticketAssignments.ticketId, ticketId));
  }

  async getActiveTicketAssignment(ticketId: string): Promise<TicketAssignment | undefined> {
    const [result] = await db.select().from(ticketAssignments)
      .where(and(eq(ticketAssignments.ticketId, ticketId), eq(ticketAssignments.isActive, true)))
      .limit(1);
    return result;
  }

  async updateTicketAssignment(id: string, updates: Partial<InsertTicketAssignment>): Promise<TicketAssignment | undefined> {
    const [result] = await db.update(ticketAssignments).set(updates).where(eq(ticketAssignments.id, id)).returning();
    return result;
  }

  async createTicketStatusEvent(insertData: InsertTicketStatusEvent): Promise<TicketStatusEvent> {
    const [result] = await db.insert(ticketStatusEvents).values(insertData).returning();
    return result;
  }

  async getTicketStatusEvents(ticketId: string): Promise<TicketStatusEvent[]> {
    return await db.select().from(ticketStatusEvents).where(eq(ticketStatusEvents.ticketId, ticketId)).orderBy(ticketStatusEvents.changedAt);
  }

  async createTicketWorkSegment(insertData: InsertTicketWorkSegment): Promise<TicketWorkSegment> {
    const [result] = await db.insert(ticketWorkSegments).values(insertData).returning();
    return result;
  }

  async getOpenWorkSegment(ticketId: string, crewId: string): Promise<TicketWorkSegment | undefined> {
    const [result] = await db.select().from(ticketWorkSegments)
      .where(and(
        eq(ticketWorkSegments.ticketId, ticketId),
        eq(ticketWorkSegments.crewId, crewId),
        isNull(ticketWorkSegments.endedAt)
      ))
      .limit(1);
    return result;
  }

  async closeWorkSegment(id: string): Promise<TicketWorkSegment | undefined> {
    const [result] = await db.update(ticketWorkSegments)
      .set({ endedAt: new Date() })
      .where(eq(ticketWorkSegments.id, id))
      .returning();
    return result;
  }

  async getWorkSegmentsByTicket(ticketId: string): Promise<TicketWorkSegment[]> {
    return await db.select().from(ticketWorkSegments).where(eq(ticketWorkSegments.ticketId, ticketId));
  }

  async createNotification(insertData: InsertNotification): Promise<Notification> {
    const [result] = await db.insert(notifications).values(insertData).returning();
    return result;
  }

  async getNotificationsByUser(userId: string): Promise<Notification[]> {
    return await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(notifications.createdAt);
  }

  async markNotificationRead(id: string): Promise<Notification | undefined> {
    const [result] = await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id)).returning();
    return result;
  }
}

export const storage = new DatabaseStorage();
