import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, Link } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { useActiveSession } from '@/context/ActiveSessionContext';
import { EmbeddedProvider } from '@/context/EmbeddedContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { StormSession } from '@shared/schema';
import {
  ArrowLeft,
  Users,
  Ticket,
  Clock,
  Receipt,
  FileText,
  BarChart3,
  MapPin,
  Star,
  CloudRain,
} from 'lucide-react';

import RostersPage from '@/pages/rosters';
import TicketsPage from '@/pages/tickets';
import TimesheetsPage from '@/pages/timesheets';
import ExpensesPage from '@/pages/expenses';
import InvoicesPage from '@/pages/invoices';
import ReportsPage from '@/pages/reports';

export default function StormManagementPage({ params }: { params: { id: string } }) {
  const sessionId = params.id;
  const { user, logout } = useAuth();
  const { setWorkingSession } = useActiveSession();
  const [, navigate] = useLocation();
  const initialTab = new URLSearchParams(window.location.search).get('tab') || 'rosters';
  const [activeTab, setActiveTab] = useState(initialTab);

  const { data: session, isLoading, isError } = useQuery<StormSession>({
    queryKey: ['/api/storm-sessions', sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/storm-sessions/${sessionId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Session not found');
      return res.json();
    },
    enabled: !!sessionId,
    retry: 1,
  });

  useEffect(() => {
    if (session) {
      setWorkingSession(session);
    }
    return () => {
      setWorkingSession(null);
    };
  }, [session, setWorkingSession]);

  if (isError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <CloudRain className="w-12 h-12 text-gray-400 mx-auto" />
          <p className="text-gray-700 font-medium">Session not found or you don't have access.</p>
          <Link href="/">
            <Button variant="outline">Back to Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading || !session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b px-3 sm:px-4 py-2 sm:py-3 sticky top-0 z-[99999]">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-2 gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Link href="/">
                <Button variant="ghost" size="sm" className="gap-1 flex-shrink-0 px-1.5 sm:px-3">
                  <ArrowLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Home</span>
                </Button>
              </Link>
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <CloudRain className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0" />
                <h1 className="text-sm sm:text-lg font-bold text-gray-900 truncate">{session.name}</h1>
                {session.isActive && <Star className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />}
              </div>
              <Badge variant={session.status === 'CLOSED' ? 'outline' : 'default'} className="text-[10px] sm:text-xs flex-shrink-0">
                {session.status}
              </Badge>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <div className="text-xs text-gray-500 hidden md:flex items-center gap-2">
                {session.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{session.location}</span>}
                {session.client && <span>| {session.client}</span>}
              </div>
              <span className="text-sm text-gray-600 hidden sm:block">{user?.email}</span>
              <Button variant="outline" size="sm" className="text-xs" onClick={logout}>Logout</Button>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="-mx-3 sm:-mx-4 px-3 sm:px-4 overflow-x-auto scrollbar-hide">
              <TabsList className="w-max min-w-full justify-start">
                <TabsTrigger value="rosters" className="gap-1 sm:gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
                  <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Rosters & Crews</span>
                  <span className="sm:hidden">Rosters</span>
                </TabsTrigger>
                <TabsTrigger value="tickets" className="gap-1 sm:gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
                  <Ticket className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Tickets
                </TabsTrigger>
                <TabsTrigger value="timesheets" className="gap-1 sm:gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Timesheets</span>
                  <span className="sm:hidden">Time</span>
                </TabsTrigger>
                <TabsTrigger value="expenses" className="gap-1 sm:gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
                  <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Expenses</span>
                  <span className="sm:hidden">Exp</span>
                </TabsTrigger>
                <TabsTrigger value="invoices" className="gap-1 sm:gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
                  <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Invoices</span>
                  <span className="sm:hidden">Inv</span>
                </TabsTrigger>
                <TabsTrigger value="reports" className="gap-1 sm:gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
                  <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Reports
                </TabsTrigger>
              </TabsList>
            </div>
          </Tabs>
        </div>
      </header>

      <EmbeddedProvider sessionId={sessionId}>
        <div className="max-w-7xl mx-auto">
          {activeTab === 'rosters' && <RostersPage />}
          {activeTab === 'tickets' && <TicketsPage />}
          {activeTab === 'timesheets' && <TimesheetsPage />}
          {activeTab === 'expenses' && <ExpensesPage />}
          {activeTab === 'invoices' && <InvoicesPage />}
          {activeTab === 'reports' && <ReportsPage />}
        </div>
      </EmbeddedProvider>
    </div>
  );
}
