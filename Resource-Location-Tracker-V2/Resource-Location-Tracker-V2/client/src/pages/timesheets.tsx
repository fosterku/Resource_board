import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, Eye, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { useActiveSession } from '@/context/ActiveSessionContext';
import { useEmbedded } from '@/context/EmbeddedContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { Timesheet, StormSession, Company, Crew, Roster } from '@shared/schema';

export default function TimesheetsPage() {
  const { user } = useAuth();
  const { activeSession } = useActiveSession();
  const { embedded, sessionId: embeddedSessionId } = useEmbedded();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [hasUserSelectedSession, setHasUserSelectedSession] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedRosterId, setSelectedRosterId] = useState<string>('');
  const [selectedCrewId, setSelectedCrewId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState<string>('07:00');
  const [stopTime, setStopTime] = useState<string>('17:00');

  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'UTILITY';

  const { data: sessions } = useQuery<StormSession[]>({
    queryKey: ['/api/storm-sessions'],
  });

  const { data: companies } = useQuery<Company[]>({
    queryKey: ['/api/companies'],
    enabled: canManage,
  });

  const { data: timesheets = [], isLoading: timesheetsLoading } = useQuery<Timesheet[]>({
    queryKey: ['/api/timesheets', selectedSessionId],
    queryFn: async () => {
      if (!selectedSessionId) return [];
      const response = await fetch(`/api/timesheets?sessionId=${selectedSessionId}`);
      if (!response.ok) throw new Error('Failed to fetch timesheets');
      return response.json();
    },
    enabled: !!selectedSessionId,
  });

  const { data: rosters = [] } = useQuery<Roster[]>({
    queryKey: ['/api/rosters', selectedSessionId],
    queryFn: async () => {
      if (!selectedSessionId) return [];
      const response = await fetch(`/api/rosters?sessionId=${selectedSessionId}`);
      if (!response.ok) throw new Error('Failed to fetch rosters');
      return response.json();
    },
    enabled: !!selectedSessionId,
  });

  // Fetch crews for selected roster
  const { data: crews = [] } = useQuery<Crew[]>({
    queryKey: ['/api/rosters', selectedRosterId, 'crews'],
    queryFn: async () => {
      if (!selectedRosterId) return [];
      const response = await fetch(`/api/rosters/${selectedRosterId}/crews`);
      if (!response.ok) throw new Error('Failed to fetch crews');
      return response.json();
    },
    enabled: !!selectedRosterId && isCreateDialogOpen,
  });

  // Auto-select active session (or first session as fallback) - only if user hasn't manually selected
  useEffect(() => {
    if (embedded && embeddedSessionId) {
      setSelectedSessionId(embeddedSessionId);
      return;
    }
    if (sessions && sessions.length > 0 && !hasUserSelectedSession) {
      if (!selectedSessionId) {
        if (activeSession && sessions.some(s => s.id === activeSession.id)) {
          setSelectedSessionId(activeSession.id);
        } else {
          setSelectedSessionId(sessions[0].id);
        }
      } else if (activeSession && sessions.some(s => s.id === activeSession.id) && selectedSessionId !== activeSession.id) {
        setSelectedSessionId(activeSession.id);
      }
    }
  }, [embedded, embeddedSessionId, sessions, selectedSessionId, activeSession, hasUserSelectedSession]);

  // Group timesheets by company
  const timesheetsByCompany = timesheets.reduce((acc, timesheet) => {
    if (!acc[timesheet.companyId]) {
      acc[timesheet.companyId] = [];
    }
    acc[timesheet.companyId].push(timesheet);
    return acc;
  }, {} as Record<string, Timesheet[]>);

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; className: string }> = {
      DRAFT: { label: 'Draft', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-300' },
      SUBMITTED: { label: 'Waiting Approval', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-400' },
      APPROVED: { label: 'Approved', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-400' },
      REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-400' },
      SIGNED: { label: 'Signed', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-400' },
    };
    const { label, className } = config[status] || { label: status, className: '' };
    return <Badge variant="outline" className={className}>{label}</Badge>;
  };

  const getCompanyName = (companyId: string) => {
    const company = companies?.find((c) => c.id === companyId);
    return company?.name || 'Unknown Company';
  };

  const createTimesheetMutation = useMutation({
    mutationFn: async (data: { rosterId: string; crewId: string; date: string; startTime?: string; stopTime?: string }) => {
      const response = await apiRequest('POST', '/api/timesheets/from-roster', data);
      return response.json();
    },
    onSuccess: (newTimesheet: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/timesheets', selectedSessionId] });
      toast({ title: 'Timesheet created successfully', description: 'Personnel and equipment auto-populated from roster' });
      setIsCreateDialogOpen(false);
      if (embedded && embeddedSessionId) {
        navigate(`/timesheets/${newTimesheet.id}?from=storm&sessionId=${embeddedSessionId}`);
      } else {
        navigate(`/timesheets/${newTimesheet.id}`);
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to create timesheet',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    },
  });

  const handleOpenCreateDialog = () => {
    setSelectedRosterId('');
    setSelectedCrewId('');
    setSelectedDate(new Date().toISOString().split('T')[0]);
    setStartTime('07:00');
    setStopTime('17:00');
    setIsCreateDialogOpen(true);
  };

  const handleCreateTimesheet = () => {
    if (!selectedRosterId || !selectedCrewId || !selectedDate) {
      toast({
        title: 'Missing information',
        description: 'Please select a roster, crew, and date',
        variant: 'destructive',
      });
      return;
    }

    createTimesheetMutation.mutate({
      rosterId: selectedRosterId,
      crewId: selectedCrewId,
      date: selectedDate,
      startTime,
      stopTime,
    });
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        {!embedded && (
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Link href="/">
                <Button variant="ghost" size="sm" data-testid="button-back">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Timesheets</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Daily crew timesheets with personnel and equipment tracking
                </p>
              </div>
            </div>
          </div>
        )}

        {!embedded && (
          <Card>
            <CardHeader>
              <CardTitle>Select Storm Session</CardTitle>
              <CardDescription>Choose a session to view timesheets</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={selectedSessionId} onValueChange={(value) => { setSelectedSessionId(value); setHasUserSelectedSession(true); }}>
                <SelectTrigger data-testid="select-session">
                  <SelectValue placeholder="Select a session..." />
                </SelectTrigger>
                <SelectContent>
                  {sessions?.map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      {session.name} ({new Date(session.startDate).toLocaleDateString()})
                      {activeSession?.id === session.id && ' ⭐ ACTIVE'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* Timesheets List */}
        {selectedSessionId && (
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base sm:text-lg">Timesheets</CardTitle>
                  <CardDescription>
                    {timesheets.length} timesheet{timesheets.length !== 1 ? 's' : ''} for this session
                  </CardDescription>
                </div>
                {canManage && (
                  <Button onClick={handleOpenCreateDialog} data-testid="button-create-timesheet" className="w-full sm:w-auto" size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Create from Roster
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {timesheetsLoading ? (
                <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading timesheets...</div>
              ) : timesheets.length === 0 ? (
                <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                  No timesheets found for this session. Click "Create from Roster" to get started.
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(timesheetsByCompany).map(([companyId, companyTimesheets]) => (
                    <div key={companyId} className="border border-gray-200 dark:border-gray-800 rounded-lg">
                      <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          {getCompanyName(companyId)}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {companyTimesheets.length} timesheet{companyTimesheets.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      {/* Mobile card view */}
                      <div className="block sm:hidden space-y-2 p-3">
                        {companyTimesheets.map((timesheet) => (
                          <Link
                            key={timesheet.id}
                            href={embedded && embeddedSessionId ? `/timesheets/${timesheet.id}?from=storm&sessionId=${embeddedSessionId}` : `/timesheets/${timesheet.id}`}
                          >
                            <div
                              data-testid={`row-timesheet-${timesheet.id}`}
                              className={`p-3 rounded-lg border cursor-pointer active:bg-gray-100 ${
                                timesheet.status === 'REJECTED' ? 'bg-red-50 border-l-4 border-l-red-500' :
                                timesheet.status === 'APPROVED' ? 'bg-green-50/50 border-l-4 border-l-green-500' :
                                timesheet.status === 'SUBMITTED' ? 'bg-yellow-50/50 border-l-4 border-l-yellow-400' :
                                'bg-white'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-sm">{new Date(timesheet.date).toLocaleDateString()}</span>
                                {getStatusBadge(timesheet.status)}
                              </div>
                              <div className="text-sm text-gray-600">{timesheet.crewForeman || 'Unassigned'}</div>
                              <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                {timesheet.crewIdNumber && <span>Crew {timesheet.crewIdNumber}</span>}
                                {timesheet.projectName && <span>{timesheet.projectName}</span>}
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                      {/* Desktop table view */}
                      <div className="hidden sm:block overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Foreman Name</TableHead>
                              <TableHead>Crew Number</TableHead>
                              <TableHead>Project</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {companyTimesheets.map((timesheet) => (
                              <TableRow
                                key={timesheet.id}
                                data-testid={`row-timesheet-${timesheet.id}`}
                                className={
                                  timesheet.status === 'REJECTED' ? 'bg-red-50 dark:bg-red-950/30 border-l-4 border-l-red-500' :
                                  timesheet.status === 'APPROVED' ? 'bg-green-50/50 dark:bg-green-950/20 border-l-4 border-l-green-500' :
                                  timesheet.status === 'SUBMITTED' ? 'bg-yellow-50/50 dark:bg-yellow-950/20 border-l-4 border-l-yellow-400' :
                                  ''
                                }
                              >
                                <TableCell className="font-medium">
                                  {new Date(timesheet.date).toLocaleDateString()}
                                </TableCell>
                                <TableCell>{timesheet.crewForeman || 'Unassigned'}</TableCell>
                                <TableCell>{timesheet.crewIdNumber || '-'}</TableCell>
                                <TableCell>{timesheet.projectName || '-'}</TableCell>
                                <TableCell>{getStatusBadge(timesheet.status)}</TableCell>
                                <TableCell>
                                  <Link href={embedded && embeddedSessionId ? `/timesheets/${timesheet.id}?from=storm&sessionId=${embeddedSessionId}` : `/timesheets/${timesheet.id}`}>
                                    <Button variant="ghost" size="sm" data-testid={`button-view-${timesheet.id}`}>
                                      <Eye className="w-4 h-4 mr-1" />
                                      {timesheet.status === 'SUBMITTED' && (user?.role === 'MANAGER' || user?.role === 'UTILITY') ? 'Review' : 'View'}
                                    </Button>
                                  </Link>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create Timesheet Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent data-testid="dialog-create-timesheet">
          <DialogHeader>
            <DialogTitle>Create Timesheet from Roster</DialogTitle>
            <DialogDescription>
              Select a roster, crew, and date to create a timesheet with auto-populated personnel and equipment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="roster">Roster</Label>
              <Select value={selectedRosterId} onValueChange={setSelectedRosterId}>
                <SelectTrigger id="roster" data-testid="select-roster">
                  <SelectValue placeholder="Select a roster..." />
                </SelectTrigger>
                <SelectContent>
                  {rosters.map((roster) => {
                    const company = companies?.find((c) => c.id === roster.companyId);
                    return (
                      <SelectItem key={roster.id} value={roster.id}>
                        {company?.name || 'Unknown'} - Roster {roster.status}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="crew">Crew</Label>
              <Select
                value={selectedCrewId}
                onValueChange={setSelectedCrewId}
                disabled={!selectedRosterId}
              >
                <SelectTrigger id="crew" data-testid="select-crew">
                  <SelectValue placeholder={selectedRosterId ? "Select a crew..." : "Select a roster first"} />
                </SelectTrigger>
                <SelectContent>
                  {crews.map((crew) => (
                    <SelectItem key={crew.id} value={crew.id}>
                      {crew.crewName || `Crew ${crew.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                data-testid="input-date"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start-time">Start Time</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  data-testid="input-start-time"
                />
              </div>
              <div>
                <Label htmlFor="stop-time">Stop Time</Label>
                <Input
                  id="stop-time"
                  type="time"
                  value={stopTime}
                  onChange={(e) => setStopTime(e.target.value)}
                  data-testid="input-stop-time"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleCreateTimesheet}
              disabled={!selectedRosterId || !selectedCrewId || !selectedDate || createTimesheetMutation.isPending}
              data-testid="button-create"
            >
              {createTimesheetMutation.isPending ? 'Creating...' : 'Create Timesheet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
