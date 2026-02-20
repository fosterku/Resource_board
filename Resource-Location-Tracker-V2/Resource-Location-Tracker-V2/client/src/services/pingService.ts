
class PingService {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly PING_INTERVAL = 2 * 60 * 1000; // 2 minutes in milliseconds

  start(): void {
    if (this.intervalId) {
      return; // Already running
    }

    this.intervalId = setInterval(() => {
      this.ping();
    }, this.PING_INTERVAL);

    // Send initial ping
    this.ping();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async ping(): Promise<void> {
    try {
      const response = await fetch('/api/ping', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        console.warn('Ping failed:', response.status);
      }
    } catch (error) {
      console.warn('Ping error:', error);
    }
  }
}

export const pingService = new PingService();
