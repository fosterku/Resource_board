import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowLeft, Plus, Edit, XCircle, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { postJson, patchJson, queryClient } from '@/lib/queryClient';
import type { StormSession, InsertStormSession } from '@shared/schema';
import { insertStormSessionSchema } from '@shared/schema';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

export default function SessionsPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<StormSession | null>(null);
  const [formData, setFormData] = useState<Partial<InsertStormSession>>({
    name: '',
    startDate: undefined,
    location: '',
    client: '',
    status: 'DRAFT',
    isActive: false,
  });

  const resetForm = () => {
    setFormData({
      name: '',
      startDate: undefined,
      location: '',
      client: '',
      status: 'DRAFT',
      isActive: false,
    });
  };

  // Check if user can manage sessions (ADMIN or MANAGER)
  const canManageSessions = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const { data: sessions, isLoading } = useQuery<StormSession[]>({
    queryKey: ['/api/storm-sessions'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertStormSession) => {
      console.log('Creating session with data:', data);
      return await postJson('/api/storm-sessions', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/storm-sessions'] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({ title: 'Session created successfully' });
    },
    onError: (error: any) => {
      console.error('Create session error:', error);
      toast({ title: 'Failed to create session', description: error?.message || 'Unknown error', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertStormSession> }) => {
      return await patchJson(`/api/storm-sessions/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/storm-sessions'] });
      setIsEditDialogOpen(false);
      setSelectedSession(null);
      resetForm();
      toast({ title: 'Session updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update session', variant: 'destructive' });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async (id: string) => {
      return await postJson(`/api/storm-sessions/${id}/close`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/storm-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/storm-sessions/active'] });
      setIsCloseDialogOpen(false);
      setSelectedSession(null);
      toast({ title: 'Session closed successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to close session', variant: 'destructive' });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async (id: string) => {
      return await postJson(`/api/storm-sessions/${id}/reopen`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/storm-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/storm-sessions/active'] });
      toast({ title: 'Session reopened successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to reopen session', variant: 'destructive' });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      return await postJson(`/api/storm-sessions/${id}/activate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/storm-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/storm-sessions/active'] });
      toast({ title: 'Session activated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to activate session', variant: 'destructive' });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      return await postJson(`/api/storm-sessions/${id}/deactivate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/storm-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/storm-sessions/active'] });
      toast({ title: 'Session deactivated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to deactivate session', variant: 'destructive' });
    },
  });

  const handleCreate = () => {
    console.log('handleCreate called with formData:', formData);
    if (!formData.name) {
      toast({ title: 'Please enter a session name', variant: 'destructive' });
      return;
    }
    console.log('Calling createMutation.mutate with:', formData);
    createMutation.mutate(formData as InsertStormSession);
  };

  const handleEdit = (session: StormSession) => {
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

  const handleUpdate = () => {
    if (!selectedSession) return;
    updateMutation.mutate({ id: selectedSession.id, data: formData });
  };

  const handleCloseSession = (session: StormSession) => {
    setSelectedSession(session);
    setIsCloseDialogOpen(true);
  };

  const confirmClose = () => {
    if (!selectedSession) return;
    closeMutation.mutate(selectedSession.id);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      DRAFT: 'secondary',
      ACTIVE: 'default',
      CLOSED: 'outline',
    };
    return <Badge variant={variants[status] || 'default'} data-testid={`badge-status-${status.toLowerCase()}`}>{status}</Badge>;
  };

  const formatDate = (date: Date | null | undefined) => {
    if (!date) return 'Not set';
    return new Date(date).toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Storm Sessions</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">Manage storm response sessions</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Link href="/">
                <Button variant="outline" size="sm" data-testid="button-back-dashboard">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={logout} data-testid="button-logout">
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Sessions</CardTitle>
                <CardDescription>View and manage storm response sessions</CardDescription>
              </div>
              {canManageSessions && (
                <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-session">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Session
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading sessions...</div>
            ) : !sessions || sessions.length === 0 ? (
              <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                No sessions found. {canManageSessions && 'Create one to get started!'}
              </div>
            ) : (
              <Table data-testid="table-sessions">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>Active</TableHead>
                    {canManageSessions && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => (
                    <TableRow key={session.id} data-testid={`row-session-${session.id}`}>
                      <TableCell className="font-medium">{session.name}</TableCell>
                      <TableCell>{session.location || '-'}</TableCell>
                      <TableCell>{session.client || '-'}</TableCell>
                      <TableCell>{getStatusBadge(session.status)}</TableCell>
                      <TableCell>{formatDate(session.startDate)}</TableCell>
                      <TableCell>
                        {canManageSessions ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => session.isActive ? deactivateMutation.mutate(session.id) : activateMutation.mutate(session.id)}
                            disabled={session.status === 'CLOSED' || activateMutation.isPending || deactivateMutation.isPending}
                            data-testid={`button-toggle-active-${session.id}`}
                          >
                            <Star className={`w-5 h-5 ${session.isActive ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'}`} />
                          </Button>
                        ) : (
                          session.isActive && (
                            <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" data-testid={`icon-active-${session.id}`} />
                          )
                        )}
                      </TableCell>
                      {canManageSessions && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {session.status === 'CLOSED' ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => reopenMutation.mutate(session.id)}
                                disabled={reopenMutation.isPending}
                                data-testid={`button-reopen-${session.id}`}
                              >
                                Reopen
                              </Button>
                            ) : (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEdit(session)}
                                  data-testid={`button-edit-${session.id}`}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleCloseSession(session)}
                                  data-testid={`button-close-${session.id}`}
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent data-testid="dialog-create-session">
          <DialogHeader>
            <DialogTitle>Create New Session</DialogTitle>
            <DialogDescription>Create a new storm response session.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Session Name *</Label>
              <Input
                id="name"
                value={formData.name ?? ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Hurricane Response 2024"
                data-testid="input-session-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="startDate">Start Date *</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate ? new Date(formData.startDate).toISOString().split('T')[0] : ''}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value ? new Date(e.target.value) : undefined })}
                data-testid="input-start-date"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="location">Location *</Label>
              <Input
                id="location"
                value={formData.location ?? ''}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g., Florida Panhandle"
                data-testid="input-location"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="client">Client (Optional)</Label>
              <Input
                id="client"
                value={formData.client ?? ''}
                onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                placeholder="e.g., Duke Energy"
                data-testid="input-client"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isActive"
                checked={formData.isActive ?? false}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked as boolean })}
                data-testid="checkbox-is-active"
              />
              <Label htmlFor="isActive" className="text-sm font-normal cursor-pointer">
                Mark as Active Session
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} data-testid="button-cancel-create">
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              data-testid="button-submit-create"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-session">
          <DialogHeader>
            <DialogTitle>Edit Session</DialogTitle>
            <DialogDescription>Update session information.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Session Name *</Label>
              <Input
                id="edit-name"
                value={formData.name ?? ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                data-testid="input-edit-session-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-startDate">Start Date *</Label>
              <Input
                id="edit-startDate"
                type="date"
                value={formData.startDate ? new Date(formData.startDate).toISOString().split('T')[0] : ''}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value ? new Date(e.target.value) : undefined })}
                data-testid="input-edit-start-date"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-location">Location *</Label>
              <Input
                id="edit-location"
                value={formData.location ?? ''}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                data-testid="input-edit-location"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-client">Client (Optional)</Label>
              <Input
                id="edit-client"
                value={formData.client ?? ''}
                onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                data-testid="input-edit-client"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending}
              data-testid="button-submit-edit"
            >
              {updateMutation.isPending ? 'Updating...' : 'Update Session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Session Dialog */}
      <Dialog open={isCloseDialogOpen} onOpenChange={setIsCloseDialogOpen}>
        <DialogContent data-testid="dialog-close-session">
          <DialogHeader>
            <DialogTitle>Close Session</DialogTitle>
            <DialogDescription>
              Are you sure you want to close "{selectedSession?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCloseDialogOpen(false)} data-testid="button-cancel-close">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmClose}
              disabled={closeMutation.isPending}
              data-testid="button-confirm-close"
            >
              {closeMutation.isPending ? 'Closing...' : 'Close Session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
