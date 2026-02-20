import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/context/AuthContext';
import { useActiveSession } from '@/context/ActiveSessionContext';
import { useEmbedded } from '@/context/EmbeddedContext';
import AppHeader from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type { Ticket, IssueType, StormSession, Company, Crew } from '@shared/schema';
import {
  Plus,
  Ticket as TicketIcon,
  Filter,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Play,
  Square,
  UserCheck,
  UserX,
  Send,
  ChevronRight,
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  CREATED: 'bg-gray-100 text-gray-800',
  ASSIGNED: 'bg-blue-100 text-blue-800',
  ACCEPTED: 'bg-cyan-100 text-cyan-800',
  ENROUTE: 'bg-yellow-100 text-yellow-800',
  ON_SITE: 'bg-orange-100 text-orange-800',
  WORKING: 'bg-purple-100 text-purple-800',
  BLOCKED: 'bg-red-100 text-red-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-200 text-gray-600',
  CANCELLED: 'bg-red-200 text-red-600',
};

const PRIORITY_COLORS: Record<string, string> = {
  P1: 'bg-red-600 text-white',
  P2: 'bg-orange-500 text-white',
  P3: 'bg-yellow-500 text-white',
};

const ALL_STATUSES = ['CREATED', 'ASSIGNED', 'ACCEPTED', 'ENROUTE', 'ON_SITE', 'WORKING', 'BLOCKED', 'COMPLETED', 'CLOSED', 'CANCELLED'];

export default function TicketsPage() {
  const { user } = useAuth();
  const { activeSession } = useActiveSession();
  const { embedded, sessionId: embeddedSessionId } = useEmbedded();
  const { toast } = useToast();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedSessionFilter, setSelectedSessionFilter] = useState<string>('');
  const [hasUserSelectedSession, setHasUserSelectedSession] = useState(false);

  const { data: sessions = [] } = useQuery<StormSession[]>({
    queryKey: ['/api/storm-sessions'],
  });

  useEffect(() => {
    if (embedded && embeddedSessionId) {
      setSelectedSessionFilter(embeddedSessionId);
      return;
    }
    if (!hasUserSelectedSession && activeSession?.id) {
      setSelectedSessionFilter(activeSession.id);
    }
  }, [embedded, embeddedSessionId, activeSession, hasUserSelectedSession]);

  const effectiveSessionId = embedded && embeddedSessionId ? embeddedSessionId : (selectedSessionFilter || activeSession?.id);

  const { data: ticketsList = [], isLoading: ticketsLoading } = useQuery<Ticket[]>({
    queryKey: ['/api/tickets', { sessionId: effectiveSessionId }],
    queryFn: async () => {
      if (!effectiveSessionId) return [];
      const res = await fetch(`/api/tickets?sessionId=${effectiveSessionId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch tickets');
      return res.json();
    },
    enabled: !!effectiveSessionId,
  });

  const { data: issueTypes = [] } = useQuery<IssueType[]>({
    queryKey: ['/api/issue-types'],
  });

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['/api/companies'],
  });

  const { data: selectedTicket } = useQuery<Ticket>({
    queryKey: ['/api/tickets', selectedTicketId],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${selectedTicketId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch ticket');
      return res.json();
    },
    enabled: !!selectedTicketId,
  });

  const { data: ticketEvents = [] } = useQuery<any[]>({
    queryKey: ['/api/tickets', selectedTicketId, 'events'],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${selectedTicketId}/events`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!selectedTicketId,
  });

  const { data: ticketAssignments = [] } = useQuery<any[]>({
    queryKey: ['/api/tickets', selectedTicketId, 'assignments'],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${selectedTicketId}/assignments`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!selectedTicketId,
  });

  const filteredTickets = ticketsList.filter((t) => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        (t.title || '').toLowerCase().includes(q) ||
        (t.externalRef || '').toLowerCase().includes(q) ||
        (t.addressText || '').toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const issueTypeMap = Object.fromEntries(issueTypes.map((it) => [it.id, it]));

  if (!user) return null;

  if (selectedTicketId && selectedTicket) {
    return (
      <div className="min-h-screen bg-gray-50">
        {!embedded && <AppHeader />}
        <div className={`${embedded ? '' : 'pt-24 sm:pt-28'} max-w-5xl mx-auto px-4 py-6`}>
          <TicketDetailView
            ticket={selectedTicket}
            issueTypes={issueTypes}
            events={ticketEvents}
            assignments={ticketAssignments}
            companies={companies}
            user={user}
            onBack={() => setSelectedTicketId(null)}
            onAssign={() => setShowAssignDialog(true)}
            sessionId={effectiveSessionId || ''}
          />
          {showAssignDialog && (
            <AssignDialog
              ticketId={selectedTicket.id}
              sessionId={selectedTicket.sessionId}
              open={showAssignDialog}
              onClose={() => setShowAssignDialog(false)}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {!embedded && <AppHeader />}
      <div className={`${embedded ? '' : 'pt-24 sm:pt-28'} max-w-7xl mx-auto px-4 py-6`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <TicketIcon className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Tickets</h2>
          </div>
          {(user.role === 'MANAGER' || user.role === 'UTILITY') && (
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button size="sm" className="w-full sm:w-auto">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Ticket
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                  <DialogTitle>Create New Ticket</DialogTitle>
                </DialogHeader>
                <CreateTicketForm
                  sessionId={effectiveSessionId || ''}
                  issueTypes={issueTypes}
                  onSuccess={() => setShowCreateDialog(false)}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>

        {!embedded && (
          <div className="mb-4">
            <Select value={selectedSessionFilter || (activeSession?.id || '')} onValueChange={(v) => { setSelectedSessionFilter(v); setHasUserSelectedSession(true); }}>
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder="Select a session" />
              </SelectTrigger>
              <SelectContent>
                {sessions.filter(s => !s.deletedAt).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} {s.isActive ? '(Active)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!effectiveSessionId ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              Select a storm session to view tickets.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 mb-4">
              <Input
                placeholder="Search tickets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64"
              />
              <div className="flex gap-2">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="flex-1 sm:w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {ALL_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterPriority} onValueChange={setFilterPriority}>
                  <SelectTrigger className="w-28 sm:w-32">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="P1">P1</SelectItem>
                    <SelectItem value="P2">P2</SelectItem>
                    <SelectItem value="P3">P3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Summary badges */}
            <div className="flex flex-wrap gap-2 mb-4">
              {['CREATED', 'ASSIGNED', 'ACCEPTED', 'WORKING', 'BLOCKED', 'COMPLETED'].map((s) => {
                const count = ticketsList.filter((t) => t.status === s).length;
                if (count === 0) return null;
                return (
                  <Badge
                    key={s}
                    className={`${STATUS_COLORS[s]} cursor-pointer`}
                    onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)}
                  >
                    {s}: {count}
                  </Badge>
                );
              })}
            </div>

            {ticketsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : filteredTickets.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-gray-500">
                  No tickets found. {user.role === 'MANAGER' || user.role === 'UTILITY' ? 'Create one to get started.' : ''}
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Mobile card view */}
                <div className="block sm:hidden space-y-2">
                {filteredTickets.map((ticket) => (
                  <Card
                    key={ticket.id}
                    className="cursor-pointer active:bg-gray-50"
                    onClick={() => setSelectedTicketId(ticket.id)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <Badge className={PRIORITY_COLORS[ticket.priority || 'P2']}>
                            {ticket.priority}
                          </Badge>
                          <Badge className={STATUS_COLORS[ticket.status || 'CREATED']}>
                            {ticket.status}
                          </Badge>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="font-medium text-sm">{ticket.title || 'Untitled'}</div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        <span>{issueTypeMap[ticket.issueTypeId]?.name || 'Unknown'}</span>
                        {ticket.addressText && (
                          <>
                            <span>·</span>
                            <span className="truncate">{ticket.addressText}</span>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {/* Desktop table view */}
              <Card className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Priority</TableHead>
                      <TableHead>Title / ID</TableHead>
                      <TableHead>Issue Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTickets.map((ticket) => (
                      <TableRow
                        key={ticket.id}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => setSelectedTicketId(ticket.id)}
                      >
                        <TableCell>
                          <Badge className={PRIORITY_COLORS[ticket.priority || 'P2']}>
                            {ticket.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{ticket.title || 'Untitled'}</div>
                          <div className="text-xs text-gray-500">{ticket.id.slice(0, 8)}...</div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {issueTypeMap[ticket.issueTypeId]?.name || ticket.issueTypeId?.slice(0, 8)}
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[ticket.status || 'CREATED']}>
                            {ticket.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600 max-w-[200px] truncate">
                          {ticket.addressText || '-'}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CreateTicketForm({
  sessionId,
  issueTypes,
  onSuccess,
}: {
  sessionId: string;
  issueTypes: IssueType[];
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [issueTypeId, setIssueTypeId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('P2');
  const [addressText, setAddressText] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [feeder, setFeeder] = useState('');
  const [circuit, setCircuit] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedCrewId, setSelectedCrewId] = useState('');

  const { data: rosters = [] } = useQuery<any[]>({
    queryKey: ['/api/rosters', { sessionId }],
    queryFn: async () => {
      if (!sessionId) return [];
      const res = await fetch(`/api/rosters?sessionId=${sessionId}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!sessionId,
  });

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['/api/companies'],
  });

  const companiesWithRosters = companies.filter(c => !c.deletedAt && rosters.some((r: any) => r.companyId === c.id));
  const companyRosters = rosters.filter((r: any) => r.companyId === selectedCompanyId);

  const { data: crewsWithDetails = [] } = useQuery<any[]>({
    queryKey: ['/api/crews-with-details', { rosterIds: companyRosters.map((r: any) => r.id) }],
    queryFn: async () => {
      const results: any[] = [];
      for (const r of companyRosters) {
        const [crewRes, personnelRes, equipmentRes] = await Promise.all([
          fetch(`/api/rosters/${r.id}/crews`, { credentials: 'include' }),
          fetch(`/api/rosters/${r.id}/personnel`, { credentials: 'include' }),
          fetch(`/api/rosters/${r.id}/equipment`, { credentials: 'include' }),
        ]);
        const crews = crewRes.ok ? await crewRes.json() : [];
        const personnel = personnelRes.ok ? await personnelRes.json() : [];
        const equipment = equipmentRes.ok ? await equipmentRes.json() : [];
        for (const crew of crews) {
          const crewPersonnel = personnel.filter((p: any) => p.crewId === crew.id && !p.deletedAt);
          const crewEquipment = equipment.filter((e: any) => e.crewId === crew.id && !e.deletedAt);
          results.push({ ...crew, personnel: crewPersonnel, equipment: crewEquipment });
        }
      }
      return results;
    },
    enabled: companyRosters.length > 0,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/tickets', {
        sessionId,
        issueTypeId,
        title: title || null,
        description: description || null,
        priority,
        addressText: addressText || null,
        externalRef: externalRef || null,
        feeder: feeder || null,
        circuit: circuit || null,
        companyId: selectedCompanyId || null,
      });
      const ticket = await res.json();

      if (selectedCrewId && selectedCompanyId) {
        try {
          await apiRequest('POST', `/api/tickets/${ticket.id}/assign`, {
            companyId: selectedCompanyId,
            crewId: selectedCrewId,
          });
        } catch (assignError: any) {
          toast({ title: 'Ticket created but crew assignment failed', description: assignError.message, variant: 'destructive' });
        }
      }

      return ticket;
    },
    onSuccess: () => {
      toast({ title: 'Ticket created successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      onSuccess();
    },
    onError: (error: any) => {
      toast({ title: 'Error creating ticket', description: error.message, variant: 'destructive' });
    },
  });

  const getCrewForeman = (crew: any) => {
    if (crew.personnel?.length) {
      const foreman = crew.personnel.find((p: any) =>
        p.crewLeadFlag?.toLowerCase() === 'yes' ||
        p.crewLeadFlag?.toLowerCase() === 'y' ||
        p.crewLeadFlag === '1' ||
        p.teamLead?.toLowerCase() === 'yes' ||
        p.teamLead?.toLowerCase() === 'y'
      );
      if (foreman) {
        return { name: foreman.name || `${foreman.firstName || ''} ${foreman.lastName || ''}`.trim(), phone: foreman.phone };
      }
    }
    return { name: crew.crewLead || null, phone: null };
  };

  const formatCrewSummary = (crew: any) => {
    const parts: string[] = [];
    if (crew.personnel?.length) {
      const classMap: Record<string, number> = {};
      crew.personnel.forEach((p: any) => {
        const cls = p.classification || p.role || 'Personnel';
        classMap[cls] = (classMap[cls] || 0) + 1;
      });
      const classStr = Object.entries(classMap).map(([k, v]) => `${v} ${k}`).join(', ');
      parts.push(`${crew.personnel.length} people (${classStr})`);
    } else {
      parts.push('No personnel');
    }
    if (crew.equipment?.length) {
      const eqMap: Record<string, number> = {};
      crew.equipment.forEach((e: any) => {
        const t = e.equipmentType || e.type || 'Equipment';
        eqMap[t] = (eqMap[t] || 0) + 1;
      });
      const eqStr = Object.entries(eqMap).map(([k, v]) => `${v} ${k}`).join(', ');
      parts.push(eqStr);
    }
    return parts.join(' | ');
  };

  return (
    <div className="space-y-4 overflow-y-auto flex-1 pr-1">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Issue Type</label>
          <Select value={issueTypeId} onValueChange={(v) => {
            setIssueTypeId(v);
            const it = issueTypes.find((i) => i.id === v);
            if (it) setPriority(it.defaultPriority || 'P2');
          }}>
            <SelectTrigger>
              <SelectValue placeholder="Select issue type" />
            </SelectTrigger>
            <SelectContent>
              {issueTypes.filter(it => it.isActive).map((it) => (
                <SelectItem key={it.id} value={it.id}>{it.name} ({it.code})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Priority</label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="P1">P1 - Critical</SelectItem>
              <SelectItem value="P2">P2 - High</SelectItem>
              <SelectItem value="P3">P3 - Normal</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Title</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brief ticket title" />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Contractor</label>
        <Select value={selectedCompanyId} onValueChange={(v) => { setSelectedCompanyId(v); setSelectedCrewId(''); }}>
          <SelectTrigger>
            <SelectValue placeholder={companiesWithRosters.length === 0 ? 'No contractors with rosters' : 'Select contractor'} />
          </SelectTrigger>
          <SelectContent>
            {companiesWithRosters.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {companiesWithRosters.length === 0 && rosters.length === 0 && (
          <p className="text-xs text-gray-500 mt-1">No rosters have been loaded for this session yet.</p>
        )}
      </div>
      {selectedCompanyId && (
        <div>
          <label className="text-sm font-medium mb-1 block">Crew</label>
          {crewsWithDetails.length === 0 ? (
            <p className="text-sm text-gray-500">No crews found for this contractor.</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
              {crewsWithDetails.map((crew: any) => {
                const foreman = getCrewForeman(crew);
                return (
                  <div
                    key={crew.id}
                    className={`p-3 rounded-md cursor-pointer border transition-colors ${
                      selectedCrewId === crew.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
                    }`}
                    onClick={() => setSelectedCrewId(selectedCrewId === crew.id ? '' : crew.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{crew.crewName}</span>
                    </div>
                    {foreman.name && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Foreman: <span className="font-medium">{foreman.name}</span></span>
                        {foreman.phone && <span className="text-xs text-gray-500">| {foreman.phone}</span>}
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5">{formatCrewSummary(crew)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      <div>
        <label className="text-sm font-medium mb-1 block">Description</label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detailed description..." rows={2} />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Address / Location</label>
        <Input value={addressText} onChange={(e) => setAddressText(e.target.value)} placeholder="Street address or location description" />
        <p className="text-xs text-gray-400 mt-0.5">Address will be geocoded for mapping</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-sm font-medium mb-1 block">Feeder</label>
          <Input value={feeder} onChange={(e) => setFeeder(e.target.value)} placeholder="Feeder ID" />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Circuit</label>
          <Input value={circuit} onChange={(e) => setCircuit(e.target.value)} placeholder="Circuit ID" />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">External Ref</label>
          <Input value={externalRef} onChange={(e) => setExternalRef(e.target.value)} placeholder="OMS ref #" />
        </div>
      </div>
      <Button
        className="w-full"
        onClick={() => createMutation.mutate()}
        disabled={!sessionId || !issueTypeId || createMutation.isPending}
      >
        {createMutation.isPending ? 'Creating...' : 'Create Ticket'}
      </Button>
    </div>
  );
}

function TicketDetailView({
  ticket,
  issueTypes,
  events,
  assignments,
  companies,
  user,
  onBack,
  onAssign,
  sessionId,
}: {
  ticket: Ticket;
  issueTypes: IssueType[];
  events: any[];
  assignments: any[];
  companies: Company[];
  user: any;
  onBack: () => void;
  onAssign: () => void;
  sessionId: string;
}) {
  const { toast } = useToast();
  const issueType = issueTypes.find((it) => it.id === ticket.issueTypeId);
  const activeAssignment = assignments.find((a: any) => a.isActive);
  const companyName = companies.find((c) => c.id === ticket.companyId)?.name;
  const assignedCompanyName = activeAssignment ? companies.find((c) => c.id === activeAssignment.companyId)?.name : null;

  const { data: assignedCrewDetails } = useQuery<any>({
    queryKey: ['/api/assignment-crew-details', activeAssignment?.crewId],
    queryFn: async () => {
      if (!activeAssignment?.crewId) return null;
      const rosterRes = await fetch(`/api/rosters?sessionId=${ticket.sessionId}`, { credentials: 'include' });
      const rosters = rosterRes.ok ? await rosterRes.json() : [];
      const companyRosters = rosters.filter((r: any) => r.companyId === activeAssignment.companyId);
      for (const r of companyRosters) {
        const [crewRes, personnelRes] = await Promise.all([
          fetch(`/api/rosters/${r.id}/crews`, { credentials: 'include' }),
          fetch(`/api/rosters/${r.id}/personnel`, { credentials: 'include' }),
        ]);
        const crews = crewRes.ok ? await crewRes.json() : [];
        const personnel = personnelRes.ok ? await personnelRes.json() : [];
        const crew = crews.find((c: any) => c.id === activeAssignment.crewId);
        if (crew) {
          const crewPersonnel = personnel.filter((p: any) => p.crewId === crew.id && !p.deletedAt);
          const foreman = crewPersonnel.find((p: any) =>
            p.crewLeadFlag?.toLowerCase() === 'yes' ||
            p.crewLeadFlag?.toLowerCase() === 'y' ||
            p.crewLeadFlag === '1' ||
            p.teamLead?.toLowerCase() === 'yes' ||
            p.teamLead?.toLowerCase() === 'y'
          );
          return {
            crewName: crew.crewName,
            crewLead: crew.crewLead,
            foremanName: foreman ? (foreman.name || `${foreman.firstName || ''} ${foreman.lastName || ''}`.trim()) : crew.crewLead,
            foremanPhone: foreman?.phone || null,
            personnelCount: crewPersonnel.length,
          };
        }
      }
      return null;
    },
    enabled: !!activeAssignment?.crewId,
  });

  const statusMutation = useMutation({
    mutationFn: async ({ status, note }: { status: string; note?: string }) => {
      const res = await apiRequest('POST', `/api/tickets/${ticket.id}/status`, { status, note });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Status updated' });
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const respondMutation = useMutation({
    mutationFn: async ({ assignmentId, action, note }: { assignmentId: string; action: string; note?: string }) => {
      const res = await apiRequest('POST', `/api/ticket-assignments/${assignmentId}/respond`, { action, note });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Response submitted' });
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const getNextActions = () => {
    const actions: { label: string; status: string; icon: any; variant: any }[] = [];
    const s = ticket.status;
    if (s === 'ACCEPTED') {
      actions.push({ label: 'En Route', status: 'ENROUTE', icon: Send, variant: 'outline' as const });
    }
    if (s === 'ENROUTE' || s === 'ACCEPTED') {
      actions.push({ label: 'On Site', status: 'ON_SITE', icon: MapPin, variant: 'outline' as const });
    }
    if (s === 'ON_SITE' || s === 'ACCEPTED' || s === 'ENROUTE') {
      actions.push({ label: 'Start Work', status: 'WORKING', icon: Play, variant: 'default' as const });
    }
    if (s === 'WORKING' || s === 'ON_SITE') {
      actions.push({ label: 'Complete', status: 'COMPLETED', icon: CheckCircle, variant: 'default' as const });
      actions.push({ label: 'Blocked', status: 'BLOCKED', icon: AlertTriangle, variant: 'destructive' as const });
    }
    if (s === 'BLOCKED') {
      actions.push({ label: 'Resume Work', status: 'WORKING', icon: Play, variant: 'default' as const });
    }
    if (s === 'COMPLETED') {
      actions.push({ label: 'Close', status: 'CLOSED', icon: Square, variant: 'outline' as const });
    }
    if (!['CLOSED', 'CANCELLED', 'COMPLETED'].includes(s || '')) {
      actions.push({ label: 'Cancel', status: 'CANCELLED', icon: XCircle, variant: 'destructive' as const });
    }
    return actions;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <Badge className={PRIORITY_COLORS[ticket.priority || 'P2']}>{ticket.priority}</Badge>
        <Badge className={STATUS_COLORS[ticket.status || 'CREATED']}>{ticket.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{ticket.title || 'Untitled Ticket'}</span>
            <span className="text-sm font-normal text-gray-500">ID: {ticket.id?.slice(0, 8)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Issue Type:</span>
              <span className="ml-2 font-medium">{issueType?.name || '-'} ({issueType?.code || '-'})</span>
            </div>
            <div>
              <span className="text-gray-500">External Ref:</span>
              <span className="ml-2 font-medium">{ticket.externalRef || '-'}</span>
            </div>
            <div>
              <span className="text-gray-500">Company:</span>
              <span className="ml-2 font-medium">{companyName || '-'}</span>
            </div>
            <div>
              <span className="text-gray-500">Feeder / Circuit:</span>
              <span className="ml-2 font-medium">{ticket.feeder || '-'} / {ticket.circuit || '-'}</span>
            </div>
          </div>

          {ticket.addressText && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
              <span>{ticket.addressText}</span>
              {ticket.lat && ticket.lon && (
                <span className="text-gray-400">({ticket.lat?.toFixed(4)}, {ticket.lon?.toFixed(4)})</span>
              )}
            </div>
          )}

          {ticket.description && (
            <div className="text-sm">
              <span className="text-gray-500 block mb-1">Description:</span>
              <p className="whitespace-pre-wrap">{ticket.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assignment Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Assignment</CardTitle>
        </CardHeader>
        <CardContent>
          {activeAssignment ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Badge className={
                  activeAssignment.status === 'ACCEPTED' ? 'bg-green-100 text-green-800' :
                  activeAssignment.status === 'PENDING_ACCEPT' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }>
                  {activeAssignment.status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Company:</span>
                  <span className="ml-2 font-medium">{assignedCompanyName || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Crew:</span>
                  <span className="ml-2 font-medium">{assignedCrewDetails?.crewName || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Foreman:</span>
                  <span className="ml-2 font-medium">{assignedCrewDetails?.foremanName || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Phone:</span>
                  <span className="ml-2 font-medium">{assignedCrewDetails?.foremanPhone || '-'}</span>
                </div>
                {assignedCrewDetails?.personnelCount > 0 && (
                  <div>
                    <span className="text-gray-500">Crew Size:</span>
                    <span className="ml-2 font-medium">{assignedCrewDetails.personnelCount} personnel</span>
                  </div>
                )}
              </div>
              {activeAssignment.status === 'PENDING_ACCEPT' && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => respondMutation.mutate({ assignmentId: activeAssignment.id, action: 'accept' })}
                    disabled={respondMutation.isPending}
                  >
                    <UserCheck className="w-4 h-4 mr-1" /> Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => respondMutation.mutate({ assignmentId: activeAssignment.id, action: 'reject' })}
                    disabled={respondMutation.isPending}
                  >
                    <UserX className="w-4 h-4 mr-1" /> Reject
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">No active assignment</span>
              {(user.role === 'MANAGER' || user.role === 'UTILITY') && (
                <Button size="sm" variant="outline" onClick={onAssign}>
                  Assign Crew
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Actions */}
      {getNextActions().length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {getNextActions().map((action) => (
                <Button
                  key={action.status}
                  variant={action.variant}
                  size="sm"
                  onClick={() => statusMutation.mutate({ status: action.status })}
                  disabled={statusMutation.isPending}
                >
                  <action.icon className="w-4 h-4 mr-1" />
                  {action.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-gray-500">No status events yet.</p>
          ) : (
            <div className="space-y-3">
              {events.map((event: any) => (
                <div key={event.id} className="flex items-start gap-3 text-sm border-l-2 border-gray-200 pl-3">
                  <Clock className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      {event.oldStatus && (
                        <>
                          <Badge className={STATUS_COLORS[event.oldStatus] || 'bg-gray-100'} variant="outline">
                            {event.oldStatus}
                          </Badge>
                          <span className="text-gray-400">→</span>
                        </>
                      )}
                      <Badge className={STATUS_COLORS[event.newStatus] || 'bg-gray-100'}>
                        {event.newStatus}
                      </Badge>
                    </div>
                    {event.note && <p className="text-gray-600 mt-1">{event.note}</p>}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(event.changedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AssignDialog({
  ticketId,
  sessionId,
  open,
  onClose,
}: {
  ticketId: string;
  sessionId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedCrewId, setSelectedCrewId] = useState('');

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['/api/companies'],
  });

  const { data: rosters = [] } = useQuery<any[]>({
    queryKey: ['/api/rosters', { sessionId }],
    queryFn: async () => {
      const res = await fetch(`/api/rosters?sessionId=${sessionId}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const companyRosters = rosters.filter((r: any) => !selectedCompanyId || r.companyId === selectedCompanyId);

  const { data: allCrewsWithDetails = [] } = useQuery<any[]>({
    queryKey: ['/api/assign-crews-details', { rosterIds: companyRosters.map((r: any) => r.id) }],
    queryFn: async () => {
      const results: any[] = [];
      for (const r of companyRosters) {
        const [crewRes, personnelRes] = await Promise.all([
          fetch(`/api/rosters/${r.id}/crews`, { credentials: 'include' }),
          fetch(`/api/rosters/${r.id}/personnel`, { credentials: 'include' }),
        ]);
        const crews = crewRes.ok ? await crewRes.json() : [];
        const personnel = personnelRes.ok ? await personnelRes.json() : [];
        for (const crew of crews) {
          const crewPersonnel = personnel.filter((p: any) => p.crewId === crew.id && !p.deletedAt);
          const foreman = crewPersonnel.find((p: any) =>
            p.crewLeadFlag?.toLowerCase() === 'yes' ||
            p.crewLeadFlag?.toLowerCase() === 'y' ||
            p.crewLeadFlag === '1' ||
            p.teamLead?.toLowerCase() === 'yes' ||
            p.teamLead?.toLowerCase() === 'y'
          );
          results.push({
            ...crew,
            foremanName: foreman ? (foreman.name || `${foreman.firstName || ''} ${foreman.lastName || ''}`.trim()) : crew.crewLead,
            foremanPhone: foreman?.phone || null,
            personnelCount: crewPersonnel.length,
          });
        }
      }
      return results;
    },
    enabled: companyRosters.length > 0,
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/tickets/${ticketId}/assign`, {
        companyId: selectedCompanyId,
        crewId: selectedCrewId,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Ticket assigned successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      onClose();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Ticket to Crew</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Company</label>
            <Select value={selectedCompanyId} onValueChange={(v) => { setSelectedCompanyId(v); setSelectedCrewId(''); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Crew</label>
            {allCrewsWithDetails.length === 0 ? (
              <p className="text-sm text-gray-500">{selectedCompanyId ? 'No crews found for this company.' : 'Select a company first.'}</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
                {allCrewsWithDetails.map((crew: any) => (
                  <div
                    key={crew.id}
                    className={`p-3 rounded-md cursor-pointer border transition-colors ${
                      selectedCrewId === crew.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
                    }`}
                    onClick={() => setSelectedCrewId(selectedCrewId === crew.id ? '' : crew.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{crew.crewName}</span>
                      {crew.personnelCount > 0 && <span className="text-xs text-gray-500">{crew.personnelCount} personnel</span>}
                    </div>
                    {crew.foremanName && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Foreman: <span className="font-medium">{crew.foremanName}</span></span>
                        {crew.foremanPhone && <span className="text-xs text-gray-500">| {crew.foremanPhone}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <Button
            className="w-full"
            onClick={() => assignMutation.mutate()}
            disabled={!selectedCompanyId || !selectedCrewId || assignMutation.isPending}
          >
            {assignMutation.isPending ? 'Assigning...' : 'Assign'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
