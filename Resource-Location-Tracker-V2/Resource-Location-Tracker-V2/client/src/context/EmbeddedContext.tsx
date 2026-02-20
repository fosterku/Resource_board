import { createContext, useContext, ReactNode } from 'react';

interface EmbeddedContextValue {
  embedded: boolean;
  sessionId: string;
}

const EmbeddedContext = createContext<EmbeddedContextValue>({ embedded: false, sessionId: '' });

export function EmbeddedProvider({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  return (
    <EmbeddedContext.Provider value={{ embedded: true, sessionId }}>
      {children}
    </EmbeddedContext.Provider>
  );
}

export function useEmbedded() {
  return useContext(EmbeddedContext);
}
