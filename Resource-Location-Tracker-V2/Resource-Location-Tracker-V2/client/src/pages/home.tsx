import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useActiveSession } from '@/context/ActiveSessionContext';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useQuery, useMutation } from '@tanstack/react-query';
import { postJson, patchJson, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { StormSession, InsertStormSession } from '@shared/schema';
import {
  CloudRain,
  Users,
  MapPin,
  ArrowRight,
  Plus,
  Edit,
  XCircle,
  Star,
  ChevronDown,
  ChevronRight,
  Calendar,
  Building2,
  Settings,
  UserCog,
  Bird,
  Download,
} from 'lucide-react';

export default function HomePage() {
  const { user, logout } = useAuth();
  const { setWorkingSession } = useActiveSession();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showClosed, setShowClosed] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<StormSession | null>(null);
  const [formData, setFormData] = useState<Partial<InsertStormSession>>({
    name: '',
    startDate: undefined,
    location: '',
    client: '',
    status: 'ACTIVE',
    isActive: true,
  });

  const resetForm = () => {
    setFormData({ name: '', startDate: undefined, location: '', client: '', status: 'ACTIVE', isActive: true });
  };

  const canManageSessions = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const isStormUser = user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'UTILITY';

  const { data: sessions = [], isLoading } = useQuery<StormSession[]>({
    queryKey: ['/api/storm-sessions'],
    enabled: !!user,
  });

  const activeSessions = sessions.filter(s => s.status !== 'CLOSED' && !s.deletedAt);
  const closedSessions = sessions.filter(s => s.status === 'CLOSED' && !s.deletedAt);

  const createMutation = useMutation({
    mutationFn: async (data: InsertStormSession) => postJson('/api/storm-sessions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/storm-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/storm-sessions/active'] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({ title: 'Session created successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to create session', description: error?.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertStormSession> }) => patchJson(`/api/storm-sessions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/storm-sessions'] });
      setIsEditDialogOpen(false);
      setSelectedSession(null);
      resetForm();
      toast({ title: 'Session updated' });
    },
    onError: () => toast({ title: 'Failed to update session', variant: 'destructive' }),
  });

  const closeMutation = useMutation({
    mutationFn: async (id: string) => postJson(`/api/storm-sessions/${id}/close`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/storm-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/storm-sessions/active'] });
      setIsCloseDialogOpen(false);
      setSelectedSession(null);
      toast({ title: 'Session closed' });
    },
    onError: () => toast({ title: 'Failed to close session', variant: 'destructive' }),
  });

  const reopenMutation = useMutation({
    mutationFn: async (id: string) => postJson(`/api/storm-sessions/${id}/reopen`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/storm-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/storm-sessions/active'] });
      toast({ title: 'Session reopened' });
    },
    onError: () => toast({ title: 'Failed to reopen session', variant: 'destructive' }),
  });

  const handleSelectSession = (session: StormSession) => {
    setWorkingSession(session);
    navigate(`/storm/${session.id}`);
  };

  const handleCreate = () => {
    if (!formData.name) {
      toast({ title: 'Please enter a session name', variant: 'destructive' });
      return;
    }
    createMutation.mutate(formData as InsertStormSession);
  };

  const handleEdit = (e: React.MouseEvent, session: StormSession) => {
    e.stopPropagation();
    setSelectedSession(session);
    setFormData({
      name: session.name,
      startDate: session.startDate ?? undefined,
      location: session.location || '',
      client: session.client || '',
      status: session.status,
    });
    setIsEditDialogOpen(true);
  };

  const handleCloseSession = (e: React.MouseEvent, session: StormSession) => {
    e.stopPropagation();
    setSelectedSession(session);
    setIsCloseDialogOpen(true);
  };

  const handleReopenSession = (e: React.MouseEvent, session: StormSession) => {
    e.stopPropagation();
    reopenMutation.mutate(session.id);
  };

  const formatDate = (date: Date | null | undefined) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b px-3 sm:px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Bird className="text-white" size={14} />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-bold text-gray-900 truncate">Storm Response Platform</h1>
              <p className="text-[10px] sm:text-xs text-gray-500">Resource Management & Billing</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-2">
              {user?.role === 'ADMIN' && (
                <Link href="/users">
                  <Button variant="outline" size="sm"><Settings className="w-4 h-4 mr-1" /> Users</Button>
                </Link>
              )}
              {user?.role === 'MANAGER' && (
                <Link href="/access-management">
                  <Button variant="outline" size="sm"><UserCog className="w-4 h-4 mr-1" /> Access</Button>
                </Link>
              )}
              {user?.role === 'CONTRACTOR' && (
                <Link href="/profile">
                  <Button variant="outline" size="sm"><Building2 className="w-4 h-4 mr-1" /> Profile</Button>
                </Link>
              )}
              <span className="text-sm text-gray-600 hidden md:block">{user?.email}</span>
            </div>
            <Badge className="text-[10px] sm:text-xs">{user?.role}</Badge>
            <Button variant="outline" size="sm" className="text-xs" onClick={logout}>Logout</Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        <section>
          <div className="flex items-center mb-4">
            <MapPin className="w-5 h-5 text-blue-600 mr-2" />
            <h2 className="text-xl font-bold text-gray-900">Resource Analysis Tools</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/map">
              <Card className="cursor-pointer hover:shadow-md transition-shadow border-blue-200 h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center space-x-2">
                    <MapPin className="w-5 h-5 text-blue-600" />
                    <CardTitle className="text-base">Map Analysis</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">Interactive resource mapping with distance calculations and weather overlay.</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/contractors">
              <Card className="cursor-pointer hover:shadow-md transition-shadow border-purple-200 h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center space-x-2">
                    <Users className="w-5 h-5 text-purple-600" />
                    <CardTitle className="text-base">Contractor Database</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">Manage contractor profiles with ratings, documents, and availability tracking.</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/availability">
              <Card className="cursor-pointer hover:shadow-md transition-shadow border-green-200 h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-5 h-5 text-green-600" />
                    <CardTitle className="text-base">Availability</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">Send availability forms, track responses, and manage crew readiness.</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </section>

        {isStormUser && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <CloudRain className="w-5 h-5 text-blue-600 mr-2" />
                <h2 className="text-xl font-bold text-gray-900">Storm Sessions</h2>
              </div>
              {canManageSessions && (
                <Button onClick={() => setIsCreateDialogOpen(true)} size="sm">
                  <Plus className="w-4 h-4 mr-1" /> New Session
                </Button>
              )}
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading sessions...</div>
            ) : activeSessions.length === 0 && closedSessions.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  No storm sessions yet. {canManageSessions && 'Create one to get started.'}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {activeSessions.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activeSessions.map(session => (
                      <Card
                        key={session.id}
                        className="cursor-pointer hover:shadow-lg transition-all border-2 border-blue-200 hover:border-blue-400"
                        onClick={() => handleSelectSession(session)}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                              {session.isActive && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
                              {session.name}
                            </CardTitle>
                            <Badge variant="default" className="text-xs">{session.status}</Badge>
                          </div>
                          {session.location && (
                            <CardDescription className="flex items-center gap-1 text-xs">
                              <MapPin className="w-3 h-3" /> {session.location}
                            </CardDescription>
                          )}
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between text-sm">
                            <div className="text-gray-500">
                              {session.client && <span className="mr-3">{session.client}</span>}
                              {session.startDate && <span>{formatDate(session.startDate)}</span>}
                            </div>
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              {canManageSessions && (
                                <>
                                  <Button variant="ghost" size="sm" onClick={(e) => handleEdit(e, session)} className="h-7 w-7 p-0">
                                    <Edit className="w-3 h-3" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={(e) => handleCloseSession(e, session)} className="h-7 w-7 p-0">
                                    <XCircle className="w-3 h-3" />
                                  </Button>
                                </>
                              )}
                              <ArrowRight className="w-4 h-4 text-blue-500" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {closedSessions.length > 0 && (
                  <div>
                    <button
                      className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 font-medium mb-2"
                      onClick={() => setShowClosed(!showClosed)}
                    >
                      {showClosed ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      Closed Sessions ({closedSessions.length})
                    </button>
                    {showClosed && (
                      <div className="space-y-2">
                        {closedSessions.map(session => (
                          <Card key={session.id} className="border-gray-200 bg-gray-50">
                            <CardContent className="py-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-sm text-gray-700">{session.name}</span>
                                <Badge variant="outline" className="text-xs">CLOSED</Badge>
                                {session.location && <span className="text-xs text-gray-500">{session.location}</span>}
                                {session.startDate && <span className="text-xs text-gray-500">{formatDate(session.startDate)}</span>}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {canManageSessions && (
                                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={(e) => handleReopenSession(e, session)}>
                                    Reopen
                                  </Button>
                                )}
                                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleSelectSession(session)}>
                                  View <ArrowRight className="w-3 h-3 ml-1" />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {isStormUser && (
          <section>
            <div className="flex items-center mb-4">
              <Building2 className="w-5 h-5 text-emerald-600 mr-2" />
              <h2 className="text-xl font-bold text-gray-900">Administration</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link href="/companies">
                <Card className="cursor-pointer hover:shadow-md transition-shadow border-emerald-200 h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-center space-x-2">
                      <Building2 className="w-5 h-5 text-emerald-600" />
                      <CardTitle className="text-base">Companies</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600">Manage contractor companies with contact and billing details.</p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/sessions">
                <Card className="cursor-pointer hover:shadow-md transition-shadow border-gray-200 h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-center space-x-2">
                      <CloudRain className="w-5 h-5 text-gray-600" />
                      <CardTitle className="text-base">Session Admin</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600">Full session administration with detailed editing and status management.</p>
                  </CardContent>
                </Card>
              </Link>
              <Card
                className="cursor-pointer hover:shadow-md transition-shadow border-blue-200 h-full"
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = '/api/export-all-json';
                  a.download = '';
                  a.click();
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center space-x-2">
                    <Download className="w-5 h-5 text-blue-600" />
                    <CardTitle className="text-base">Export All Data</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">Download the entire system database as a JSON file.</p>
                </CardContent>
              </Card>
            </div>
          </section>
        )}
      </main>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Storm Session</DialogTitle>
            <DialogDescription>Create a new storm response session. It will be set as active automatically.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Session Name *</Label>
              <Input value={formData.name ?? ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Hurricane Response 2024" />
            </div>
            <div className="grid gap-2">
              <Label>Start Date</Label>
              <Input type="date" value={formData.startDate ? new Date(formData.startDate).toISOString().split('T')[0] : ''} onChange={(e) => setFormData({ ...formData, startDate: e.target.value ? new Date(e.target.value) : undefined })} />
            </div>
            <div className="grid gap-2">
              <Label>Location</Label>
              <Input value={formData.location ?? ''} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="Florida Panhandle" />
            </div>
            <div className="grid gap-2">
              <Label>Client</Label>
              <Input value={formData.client ?? ''} onChange={(e) => setFormData({ ...formData, client: e.target.value })} placeholder="Duke Energy" />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox checked={formData.isActive ?? true} onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked as boolean })} />
              <Label className="text-sm font-normal cursor-pointer">Mark as Active Session</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Session</DialogTitle>
            <DialogDescription>Update session information.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Session Name *</Label>
              <Input value={formData.name ?? ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Start Date</Label>
              <Input type="date" value={formData.startDate ? new Date(formData.startDate).toISOString().split('T')[0] : ''} onChange={(e) => setFormData({ ...formData, startDate: e.target.value ? new Date(e.target.value) : undefined })} />
            </div>
            <div className="grid gap-2">
              <Label>Location</Label>
              <Input value={formData.location ?? ''} onChange={(e) => setFormData({ ...formData, location: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Client</Label>
              <Input value={formData.client ?? ''} onChange={(e) => setFormData({ ...formData, client: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => selectedSession && updateMutation.mutate({ id: selectedSession.id, data: formData })} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Updating...' : 'Update Session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCloseDialogOpen} onOpenChange={setIsCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Session</DialogTitle>
            <DialogDescription>
              Are you sure you want to close "{selectedSession?.name}"? You can reopen it later if needed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCloseDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => selectedSession && closeMutation.mutate(selectedSession.id)} disabled={closeMutation.isPending}>
              {closeMutation.isPending ? 'Closing...' : 'Close Session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
