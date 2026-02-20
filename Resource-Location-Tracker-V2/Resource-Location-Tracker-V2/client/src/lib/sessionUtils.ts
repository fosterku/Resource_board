// Session utility functions for client-side session management

export function generateSessionId(): string {
  return crypto.randomUUID();
}

export function getSessionId(): string {
  // Check if we already have a session ID stored
  let sessionId = localStorage.getItem('sessionId');
  
  if (!sessionId) {
    // For backward compatibility, try to detect if there's existing data
    // by checking if there are analysis points without a session filter
    // If so, use a special session ID that will be handled by the server
    sessionId = 'auto-detect-session';
    localStorage.setItem('sessionId', sessionId);
  }
  
  return sessionId;
}

export function setSessionId(sessionId: string): void {
  localStorage.setItem('sessionId', sessionId);
}

export function clearSessionId(): void {
  localStorage.removeItem('sessionId');
}

// Function to add session headers to requests
export function getSessionHeaders(): Record<string, string> {
  return {
    'X-Session-ID': getSessionId()
  };
}