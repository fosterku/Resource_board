import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient, postJson } from '@/lib/queryClient';
import type { StormSession } from '@shared/schema';

interface ActiveSessionContextValue {
  activeSession: StormSession | null;
  workingSession: StormSession | null;
  isLoading: boolean;
  error: Error | null;
  setWorkingSession: (session: StormSession | null) => void;
  activateSession: (session: StormSession) => Promise<void>;
}

const ActiveSessionContext = createContext<ActiveSessionContextValue | undefined>(undefined);

export function ActiveSessionProvider({ children }: { children: ReactNode }) {
  const [workingSession, setWorkingSessionState] = useState<StormSession | null>(null);

  const { data, isLoading, error } = useQuery<{ activeSession: StormSession | null }>({
    queryKey: ['/api/storm-sessions/active'],
    retry: false,
    refetchOnWindowFocus: true,
  });

  const activeSession = data?.activeSession || null;

  const setWorkingSession = useCallback((session: StormSession | null) => {
    setWorkingSessionState(session);
  }, []);

  const activateSession = useCallback(async (session: StormSession) => {
    try {
      await postJson(`/api/storm-sessions/${session.id}/activate`);
      queryClient.invalidateQueries({ queryKey: ['/api/storm-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/storm-sessions/active'] });
      setWorkingSessionState(session);
    } catch (err) {
      console.error('Failed to activate session:', err);
    }
  }, []);

  const value: ActiveSessionContextValue = {
    activeSession,
    workingSession: workingSession || activeSession,
    isLoading,
    error: error as Error | null,
    setWorkingSession,
    activateSession,
  };

  return (
    <ActiveSessionContext.Provider value={value}>
      {children}
    </ActiveSessionContext.Provider>
  );
}

export function useActiveSession() {
  const context = useContext(ActiveSessionContext);
  if (context === undefined) {
    throw new Error('useActiveSession must be used within an ActiveSessionProvider');
  }
  return context;
}
