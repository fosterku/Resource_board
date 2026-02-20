import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: 'ADMIN' | 'CONTRACTOR' | 'MANAGER' | 'UTILITY' | null;
  companyId: string | null; // References companies.id (UUID)
}

interface AuthContextType {
  user: User | null;
  login: () => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check authentication status on app load
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/user', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const userData = await response.json();
          setUser(userData);
        } else {
          // Not JSON, user is not authenticated
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      // Silently handle auth check errors (user is simply not authenticated)
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = () => {
    // Redirect to Replit Auth login
    window.location.href = '/api/login';
  };

  const logout = () => {
    // Redirect to Replit Auth logout
    window.location.href = '/api/logout';
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
