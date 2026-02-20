// Role-Based Access Control (RBAC) middleware
import type { RequestHandler } from "express";
import { storage } from "../storage";

export type UserRole = 'ADMIN' | 'CONTRACTOR' | 'MANAGER' | 'UTILITY';

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: {
        id: string;
        email: string | null;
        role: UserRole | null;
        companyId: string | null;
        firstName: string | null;
        lastName: string | null;
      };
    }
  }
}

/**
 * Middleware to require authentication and attach user to request
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Authentication required" });
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

  // Attach user to request
  req.authenticatedUser = {
    id: user.id,
    email: user.email,
    role: user.role as UserRole | null,
    companyId: user.companyId,
    firstName: user.firstName,
    lastName: user.lastName,
  };

  next();
};

/**
 * Middleware to require specific role(s)
 */
export function requireRole(...allowedRoles: UserRole[]): RequestHandler {
  return async (req, res, next) => {
    // First ensure user is authenticated
    if (!req.authenticatedUser) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userRole = req.authenticatedUser.role;
    
    if (!userRole) {
      return res.status(403).json({ 
        message: "User has no assigned role. Contact your administrator." 
      });
    }

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}` 
      });
    }

    next();
  };
}

/**
 * Middleware to require company membership
 * Ensures user belongs to a company
 */
export const requireCompany: RequestHandler = async (req, res, next) => {
  if (!req.authenticatedUser) {
    return res.status(401).json({ message: "Authentication required" });
  }

  if (!req.authenticatedUser.companyId) {
    return res.status(403).json({ 
      message: "Company membership required. Contact your administrator." 
    });
  }

  next();
};

/**
 * Middleware to check if user has access to a specific company
 * Used for company-scoped operations
 * 
 * Access rules:
 * - ADMIN: NO access to company data (user management only)
 * - MANAGER: Full access to all companies
 * - CONTRACTOR: Access only to own company (companyId match)
 * - UTILITY: Access only to companies granted via userCompanyAccess table
 */
export function requireCompanyAccess(getCompanyId: (req: any) => string | null): RequestHandler {
  return async (req, res, next) => {
    if (!req.authenticatedUser) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const targetCompanyId = getCompanyId(req);
    
    // Short-circuit if no target company resolved
    if (!targetCompanyId) {
      return res.status(400).json({ message: "Company ID required" });
    }

    const userRole = req.authenticatedUser.role;

    // ADMIN has NO access to company data
    if (userRole === 'ADMIN') {
      return res.status(403).json({ 
        message: "Access denied. ADMIN role can only manage users, not company data." 
      });
    }

    // MANAGER has full access to all companies
    if (userRole === 'MANAGER') {
      return next();
    }

    // CONTRACTOR can only access own company
    if (userRole === 'CONTRACTOR') {
      if (req.authenticatedUser.companyId !== targetCompanyId) {
        return res.status(403).json({ 
          message: "Access denied. You can only access your own company's data." 
        });
      }
      return next();
    }

    // UTILITY can only access granted companies (requires DB lookup)
    if (userRole === 'UTILITY') {
      try {
        const hasAccess = await storage.hasUtilityCompanyAccess(
          req.authenticatedUser.id,
          targetCompanyId
        );
        
        if (!hasAccess) {
          return res.status(403).json({ 
            message: "Access denied. You don't have permission to access this company's data." 
          });
        }
        
        return next();
      } catch (error) {
        console.error('Error checking UTILITY company access:', error);
        return res.status(500).json({ 
          message: "Error verifying company access" 
        });
      }
    }

    // Shouldn't reach here, but deny by default
    return res.status(403).json({ message: "Access denied" });
  };
}

/**
 * Helper to check if user is ADMIN (user management only)
 */
export const requireAdminRole: RequestHandler = (req, res, next) => {
  return requireRole('ADMIN')(req, res, next);
};

/**
 * Helper to check if user is MANAGER (full system access)
 */
export const requireManager: RequestHandler = (req, res, next) => {
  return requireRole('MANAGER')(req, res, next);
};

/**
 * Helper to check if user is MANAGER or UTILITY (broad access roles)
 */
export const requireManagerOrUtility: RequestHandler = (req, res, next) => {
  return requireRole('MANAGER', 'UTILITY')(req, res, next);
};

/**
 * Helper to check if user is UTILITY (for utility-specific operations)
 */
export const requireUtility: RequestHandler = (req, res, next) => {
  return requireRole('UTILITY')(req, res, next);
};

/**
 * Helper to check if user is ADMIN or MANAGER (for storm session management)
 */
export const requireAdminOrManager: RequestHandler = (req, res, next) => {
  return requireRole('ADMIN', 'MANAGER')(req, res, next);
};
