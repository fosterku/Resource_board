import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowLeft, Plus, Edit, Trash2, ChevronDown, ChevronRight, Users, Upload, Download, UserPlus, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { useActiveSession } from '@/context/ActiveSessionContext';
import { useEmbedded } from '@/context/EmbeddedContext';
import { getJson, postJson, patchJson, deleteJson, queryClient } from '@/lib/queryClient';
import type { Roster, InsertRoster, Crew, InsertCrew, StormSession, Company, Contractor } from '@shared/schema';
import { insertRosterSchema } from '@shared/schema';
import { Badge } from '@/components/ui/badge';

export default function RostersPage() {
  const { user, logout } = useAuth();
  const { activeSession } = useActiveSession();
  const { embedded, sessionId: embeddedSessionId } = useEmbedded();
  const { toast } = useToast();
  
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [hasUserSelectedSession, setHasUserSelectedSession] = useState(false);
  const [expandedRosters, setExpandedRosters] = useState<Set<string>>(new Set());
  const [isCreateRosterOpen, setIsCreateRosterOpen] = useState(false);
  const [isChooseMethodOpen, setIsChooseMethodOpen] = useState(false);
  const [isImportExcelOpen, setIsImportExcelOpen] = useState(false);
  const [isEditRosterOpen, setIsEditRosterOpen] = useState(false);
  const [isDeleteRosterOpen, setIsDeleteRosterOpen] = useState(false);
  const [isCreateCrewOpen, setIsCreateCrewOpen] = useState(false);
  const [isEditCrewOpen, setIsEditCrewOpen] = useState(false);
  const [isDeleteCrewOpen, setIsDeleteCrewOpen] = useState(false);
  const [selectedRoster, setSelectedRoster] = useState<Roster | null>(null);
  const [selectedCrew, setSelectedCrew] = useState<Crew | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importCompanyId, setImportCompanyId] = useState<string>('');
  const [contractorSearch, setContractorSearch] = useState('');
  const [isCustomContractorOpen, setIsCustomContractorOpen] = useState(false);
  const [customCompanyName, setCustomCompanyName] = useState('');
  const [customContactName, setCustomContactName] = useState('');
  const [customContactEmail, setCustomContactEmail] = useState('');
  const [customContactPhone, setCustomContactPhone] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rosterFormData, setRosterFormData] = useState<Partial<InsertRoster>>({
    sessionId: '',
    companyId: '',
    status: 'DRAFT',
  });
  const [crewFormData, setCrewFormData] = useState<Partial<InsertCrew>>({
    rosterId: '',
    crewName: '',
    crewLead: '',
    workArea: '',
  });

  const resetRosterForm = () => {
    setRosterFormData({
      sessionId: selectedSessionId || '',
      companyId: user?.companyId || '',
      status: 'DRAFT',
    });
  };

  const resetCrewForm = () => {
    setCrewFormData({
      rosterId: '',
      crewName: '',
      crewLead: '',
      workArea: '',
    });
  };

  const resetCustomCompanyForm = () => {
    setCustomCompanyName('');
    setCustomContactName('');
    setCustomContactEmail('');
    setCustomContactPhone('');
  };

  // Check if user can manage rosters
  const canManageRosters = user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'UTILITY';

  // Fetch sessions
  const { data: sessions } = useQuery<StormSession[]>({
    queryKey: ['/api/storm-sessions'],
  });

  // Sync companies from contractors database
  const syncCompaniesMutation = useMutation({
    mutationFn: async () => {
      return await postJson('/api/companies/sync-from-contractors');
    },
    onSuccess: () => {
      // Refresh companies list after sync
      queryClient.invalidateQueries({ queryKey: ['/api/companies'] });
    },
  });

  // Auto-sync companies on mount
  useEffect(() => {
    if (user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'UTILITY') {
      syncCompaniesMutation.mutate();
    }
  }, [user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch companies (for ADMIN, MANAGER, and UTILITY users)
  const { data: companies, isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ['/api/companies'],
    enabled: user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'UTILITY',
  });

  // Fetch contractors for selection
  const { data: contractors = [] } = useQuery<Contractor[]>({
    queryKey: ['/api/contractors'],
    enabled: user?.role === 'ADMIN' || user?.role === 'MANAGER',
  });

  // Filter contractors based on search
  const filteredContractors = contractors.filter(c =>
    c.company.toLowerCase().includes(contractorSearch.toLowerCase()) ||
    c.name.toLowerCase().includes(contractorSearch.toLowerCase()) ||
    c.city?.toLowerCase().includes(contractorSearch.toLowerCase())
  );

  // Fetch rosters for selected session
  const { data: rosters, isLoading: rostersLoading } = useQuery<Roster[]>({
    queryKey: ['/api/rosters', selectedSessionId],
    queryFn: () => selectedSessionId ? getJson<Roster[]>(`/api/rosters?sessionId=${selectedSessionId}`) : Promise.resolve([]),
    enabled: !!selectedSessionId,
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

  const createRosterMutation = useMutation({
    mutationFn: async (data: InsertRoster) => {
      return await postJson('/api/rosters', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rosters'] });
      setIsCreateRosterOpen(false);
      resetRosterForm();
      toast({ title: 'Roster created successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to create roster', variant: 'destructive' });
    },
  });

  const updateRosterMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertRoster> }) => {
      return await patchJson(`/api/rosters/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rosters'] });
      setIsEditRosterOpen(false);
      setSelectedRoster(null);
      resetRosterForm();
      toast({ title: 'Roster updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update roster', variant: 'destructive' });
    },
  });

  const deleteRosterMutation = useMutation({
    mutationFn: async (id: string) => {
      return await deleteJson(`/api/rosters/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rosters'] });
      setIsDeleteRosterOpen(false);
      setSelectedRoster(null);
      toast({ title: 'Roster deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete roster', variant: 'destructive' });
    },
  });

  const importExcelMutation = useMutation({
    mutationFn: async ({ file, sessionId, companyId }: { file: File; sessionId: string; companyId: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sessionId', sessionId);
      formData.append('companyId', companyId);
      
      const response = await fetch('/api/rosters/import-excel', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to import roster');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/rosters', selectedSessionId] });
      setIsImportExcelOpen(false);
      setSelectedFile(null);
      setImportCompanyId('');
      toast({ 
        title: 'Roster imported successfully',
        description: `Created ${data.crewCount} crews from Excel file` 
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to import roster', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const createCrewMutation = useMutation({
    mutationFn: async ({ rosterId, data }: { rosterId: string; data: Omit<InsertCrew, 'rosterId'> }) => {
      return await postJson(`/api/rosters/${rosterId}/crews`, data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/rosters', variables.rosterId, 'crews'] });
      setIsCreateCrewOpen(false);
      resetCrewForm();
      toast({ title: 'Crew added successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to add crew', variant: 'destructive' });
    },
  });

  const updateCrewMutation = useMutation({
    mutationFn: async ({ id, data, rosterId }: { id: string; data: Partial<InsertCrew>; rosterId: string }) => {
      return await patchJson(`/api/crews/${id}`, data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/rosters'] });
      queryClient.invalidateQueries({ queryKey: ['/api/rosters', variables.rosterId, 'crews'] });
      setIsEditCrewOpen(false);
      setSelectedCrew(null);
      resetCrewForm();
      toast({ title: 'Crew updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update crew', variant: 'destructive' });
    },
  });

  const deleteCrewMutation = useMutation({
    mutationFn: async ({ id, rosterId }: { id: string; rosterId: string }) => {
      return await deleteJson(`/api/crews/${id}`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/rosters'] });
      queryClient.invalidateQueries({ queryKey: ['/api/rosters', variables.rosterId, 'crews'] });
      setIsDeleteCrewOpen(false);
      setSelectedCrew(null);
      toast({ title: 'Crew deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete crew', variant: 'destructive' });
    },
  });

  const createCustomCompanyMutation = useMutation({
    mutationFn: async (data: { name: string; contactName?: string; contactEmail?: string; contactPhone?: string }): Promise<Company> => {
      return await postJson('/api/companies', data) as Company;
    },
    onSuccess: (newCompany: Company) => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies'] });
      setIsCustomContractorOpen(false);
      resetCustomCompanyForm();
      setRosterFormData({ ...rosterFormData, companyId: newCompany.id });
      setImportCompanyId(newCompany.id);
      setIsCreateRosterOpen(false);
      setIsChooseMethodOpen(true);
      toast({ title: 'Custom contractor added successfully' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to add contractor', 
        description: error.message || 'Company may already exist',
        variant: 'destructive' 
      });
    },
  });

  const handleCreateCustomCompany = () => {
    if (!customCompanyName.trim()) {
      toast({ title: 'Please enter a company name', variant: 'destructive' });
      return;
    }
    createCustomCompanyMutation.mutate({
      name: customCompanyName.trim(),
      contactName: customContactName.trim() || undefined,
      contactEmail: customContactEmail.trim() || undefined,
      contactPhone: customContactPhone.trim() || undefined,
    });
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch('/api/rosters/template', {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to download template');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'roster-import-template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({ title: 'Template downloaded successfully' });
    } catch (error) {
      toast({ title: 'Failed to download template', variant: 'destructive' });
    }
  };

  const handleCreateRoster = () => {
    const dataToSubmit = {
      ...rosterFormData,
      companyId: (user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'UTILITY') ? rosterFormData.companyId : user?.companyId,
    };
    
    if (!dataToSubmit.companyId) {
      toast({ title: 'Company assignment required', variant: 'destructive' });
      return;
    }
    
    createRosterMutation.mutate(dataToSubmit as InsertRoster);
  };

  const handleEditRoster = (roster: Roster) => {
    setSelectedRoster(roster);
    setRosterFormData({
      sessionId: roster.sessionId,
      companyId: roster.companyId,
      status: roster.status,
    });
    setIsEditRosterOpen(true);
  };

  const handleUpdateRoster = () => {
    if (!selectedRoster) return;
    updateRosterMutation.mutate({ id: selectedRoster.id, data: rosterFormData });
  };

  const handleDeleteRoster = (roster: Roster) => {
    setSelectedRoster(roster);
    setIsDeleteRosterOpen(true);
  };

  const confirmDeleteRoster = () => {
    if (!selectedRoster) return;
    deleteRosterMutation.mutate(selectedRoster.id);
  };

  const handleCreateCrew = (roster: Roster) => {
    setSelectedRoster(roster);
    setCrewFormData({
      rosterId: roster.id,
      crewName: '',
      crewLead: '',
      workArea: '',
    });
    setIsCreateCrewOpen(true);
  };

  const handleSubmitCrew = () => {
    if (!selectedRoster) return;
    if (!crewFormData.crewName) {
      toast({ title: 'Please fill in crew name', variant: 'destructive' });
      return;
    }
    try {
      const { rosterId, ...crewData } = crewFormData;
      createCrewMutation.mutate({ rosterId: selectedRoster.id, data: crewData as Omit<InsertCrew, 'rosterId'> });
    } catch (error) {
      toast({ title: 'Failed to create crew', variant: 'destructive' });
    }
  };

  const handleEditCrew = (crew: Crew) => {
    setSelectedCrew(crew);
    setCrewFormData({
      rosterId: crew.rosterId,
      crewName: crew.crewName,
      crewLead: crew.crewLead ?? '',
      workArea: crew.workArea ?? '',
    });
    setIsEditCrewOpen(true);
  };

  const handleUpdateCrew = () => {
    if (!selectedCrew) return;
    const { rosterId, ...crewData } = crewFormData;
    updateCrewMutation.mutate({ id: selectedCrew.id, data: crewData, rosterId: selectedCrew.rosterId });
  };

  const handleDeleteCrew = (crew: Crew) => {
    setSelectedCrew(crew);
    setIsDeleteCrewOpen(true);
  };

  const confirmDeleteCrew = () => {
    if (!selectedCrew) return;
    deleteCrewMutation.mutate({ id: selectedCrew.id, rosterId: selectedCrew.rosterId });
  };

  const toggleRosterExpanded = (rosterId: string) => {
    const newExpanded = new Set(expandedRosters);
    if (newExpanded.has(rosterId)) {
      newExpanded.delete(rosterId);
    } else {
      newExpanded.add(rosterId);
    }
    setExpandedRosters(newExpanded);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        toast({ 
          title: 'Invalid file type', 
          description: 'Please select an Excel file (.xlsx or .xls)',
          variant: 'destructive' 
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleImportExcel = () => {
    if (!selectedFile || !selectedSessionId) {
      toast({ title: 'Please select a file and session', variant: 'destructive' });
      return;
    }

    const companyId = (user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'UTILITY') ? importCompanyId : user?.companyId;
    if (!companyId) {
      toast({ title: 'Company selection required', variant: 'destructive' });
      return;
    }

    importExcelMutation.mutate({ 
      file: selectedFile, 
      sessionId: selectedSessionId, 
      companyId 
    });
  };

  const openImportDialog = () => {
    setImportCompanyId(user?.companyId || '');
    setSelectedFile(null);
    setIsImportExcelOpen(true);
  };

  const handleExportRoster = async (rosterId: string) => {
    try {
      const response = await fetch(`/api/rosters/${rosterId}/export`, {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to export roster');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roster-${rosterId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({ title: 'Roster exported successfully' });
    } catch (error) {
      toast({ title: 'Failed to export roster', variant: 'destructive' });
    }
  };

  const handleExportAll = async () => {
    try {
      if (!selectedSessionId) {
        toast({ title: 'Please select a session first', variant: 'destructive' });
        return;
      }
      
      const response = await fetch(`/api/rosters/export-all?sessionId=${selectedSessionId}`, {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to export rosters');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `all-rosters-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({ title: 'All rosters exported successfully' });
    } catch (error) {
      toast({ title: 'Failed to export rosters', variant: 'destructive' });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      DRAFT: 'secondary',
      SUBMITTED: 'default',
      APPROVED: 'outline',
      LOCKED: 'destructive',
    };
    return <Badge variant={variants[status] || 'default'} data-testid={`badge-status-${status.toLowerCase()}`}>{status}</Badge>;
  };

  const getCompanyName = (companyId: string) => {
    const company = companies?.find(c => c.id === companyId);
    return company?.name || companyId;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {!embedded && (
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">Rosters & Crews</h1>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Manage crew rosters</p>
              </div>
              <div className="flex items-center space-x-2 flex-shrink-0">
                <Link href="/">
                  <Button variant="outline" size="sm" data-testid="button-back-dashboard" className="hidden sm:flex">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Dashboard
                  </Button>
                  <Button variant="outline" size="sm" data-testid="button-back-dashboard" className="sm:hidden px-2">
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                </Link>
                <Button variant="outline" size="sm" onClick={logout} data-testid="button-logout" className="text-xs">
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </header>
      )}

      <main className="max-w-7xl mx-auto px-4 py-8">
        {!embedded && (
          <div className="mb-6">
            <Label htmlFor="session-select">Select Session</Label>
            <Select value={selectedSessionId} onValueChange={(value) => { setSelectedSessionId(value); setHasUserSelectedSession(true); }}>
              <SelectTrigger id="session-select" className="w-full max-w-md" data-testid="select-session">
                <SelectValue placeholder="Choose a session" />
              </SelectTrigger>
              <SelectContent>
                {sessions?.map((session) => (
                  <SelectItem key={session.id} value={session.id}>
                    {session.name} ({session.status})
                    {activeSession?.id === session.id && ' ⭐ ACTIVE'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {selectedSessionId && (
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base sm:text-lg">Rosters</CardTitle>
                  <CardDescription>Crew rosters for the selected session</CardDescription>
                </div>
                {canManageRosters && (
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button 
                      variant="outline"
                      size="sm"
                      onClick={() => handleExportAll()} 
                      data-testid="button-export-all-rosters"
                      className="flex-1 sm:flex-initial"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Export
                    </Button>
                    <Button size="sm" onClick={() => {
                      resetRosterForm();
                      setIsCreateRosterOpen(true);
                    }} data-testid="button-create-roster" className="flex-1 sm:flex-initial">
                      <Plus className="w-4 h-4 mr-1" />
                      Create
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {rostersLoading ? (
                <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading rosters...</div>
              ) : !rosters || rosters.length === 0 ? (
                <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                  No rosters found. {canManageRosters && 'Create one to get started!'}
                </div>
              ) : (
                <div className="space-y-4">
                  {rosters.map((roster) => (
                    <RosterRow
                      key={roster.id}
                      roster={roster}
                      isExpanded={expandedRosters.has(roster.id)}
                      onToggle={() => toggleRosterExpanded(roster.id)}
                      onEdit={() => handleEditRoster(roster)}
                      onDelete={() => handleDeleteRoster(roster)}
                      onAddCrew={() => handleCreateCrew(roster)}
                      onExport={() => handleExportRoster(roster.id)}
                      getStatusBadge={getStatusBadge}
                      getCompanyName={getCompanyName}
                      canManageRosters={canManageRosters}
                      onEditCrew={handleEditCrew}
                      onDeleteCrew={handleDeleteCrew}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      {/* Create Roster Dialog */}
      <Dialog open={isCreateRosterOpen} onOpenChange={setIsCreateRosterOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]" data-testid="dialog-create-roster">
          <DialogHeader>
            <DialogTitle>Select Contractor for Roster</DialogTitle>
            <DialogDescription>Search and select a contractor, then import or manually create roster.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {canManageRosters && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsCreateRosterOpen(false);
                    setContractorSearch('');
                    setTimeout(() => setIsCustomContractorOpen(true), 150);
                  }}
                  data-testid="button-add-custom-contractor"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add Contractor
                </Button>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="contractor-search">Search Contractors</Label>
              <Input
                id="contractor-search"
                placeholder="Search by company, name, or location..."
                value={contractorSearch}
                onChange={(e) => setContractorSearch(e.target.value)}
                data-testid="input-contractor-search"
              />
            </div>
            <div className="border rounded-lg max-h-[300px] overflow-y-auto">
              {filteredContractors.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {contractorSearch ? 'No contractors found matching your search' : 'Start typing to search contractors'}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredContractors.map((contractor) => {
                    const matchingCompany = companies?.find(c => c.name === contractor.company);
                    return (
                      <div
                        key={contractor.id}
                        className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                        onClick={() => {
                          if (!matchingCompany) {
                            toast({
                              title: 'Company not found',
                              description: 'Please sync companies first',
                              variant: 'destructive'
                            });
                            return;
                          }
                          setRosterFormData({ ...rosterFormData, companyId: matchingCompany.id });
                          setImportCompanyId(matchingCompany.id);
                          setIsCreateRosterOpen(false);
                          setIsChooseMethodOpen(true);
                          setContractorSearch('');
                        }}
                        data-testid={`contractor-item-${contractor.id}`}
                      >
                        <div className="font-medium">{contractor.company}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {contractor.name} • {contractor.city}, {contractor.state}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCreateRosterOpen(false);
              setContractorSearch('');
              resetRosterForm();
            }} data-testid="button-cancel-create-roster">
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Custom Contractor Dialog */}
      <Dialog open={isCustomContractorOpen} onOpenChange={setIsCustomContractorOpen}>
        <DialogContent data-testid="dialog-custom-contractor">
          <DialogHeader>
            <DialogTitle>Add Custom Contractor</DialogTitle>
            <DialogDescription>
              Enter details for a contractor not in the system.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="custom-company-name">Company Name *</Label>
              <Input
                id="custom-company-name"
                placeholder="Enter company name"
                value={customCompanyName}
                onChange={(e) => setCustomCompanyName(e.target.value)}
                data-testid="input-custom-company-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="custom-contact-name">Contact Name</Label>
              <Input
                id="custom-contact-name"
                placeholder="Enter contact name (optional)"
                value={customContactName}
                onChange={(e) => setCustomContactName(e.target.value)}
                data-testid="input-custom-contact-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="custom-contact-email">Contact Email</Label>
              <Input
                id="custom-contact-email"
                type="email"
                placeholder="Enter contact email (optional)"
                value={customContactEmail}
                onChange={(e) => setCustomContactEmail(e.target.value)}
                data-testid="input-custom-contact-email"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="custom-contact-phone">Contact Phone</Label>
              <Input
                id="custom-contact-phone"
                type="tel"
                placeholder="Enter contact phone (optional)"
                value={customContactPhone}
                onChange={(e) => setCustomContactPhone(e.target.value)}
                data-testid="input-custom-contact-phone"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCustomContractorOpen(false);
              resetCustomCompanyForm();
              setTimeout(() => setIsCreateRosterOpen(true), 150);
            }} data-testid="button-back-to-search">
              Back to Search
            </Button>
            <Button 
              onClick={handleCreateCustomCompany}
              disabled={createCustomCompanyMutation.isPending || !customCompanyName.trim()}
              data-testid="button-create-custom-contractor"
            >
              {createCustomCompanyMutation.isPending ? 'Creating...' : 'Add Contractor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Choose Method Dialog */}
      <Dialog open={isChooseMethodOpen} onOpenChange={setIsChooseMethodOpen}>
        <DialogContent data-testid="dialog-choose-method">
          <DialogHeader>
            <DialogTitle>Create Roster</DialogTitle>
            <DialogDescription>
              Contractor selected: {rosterFormData.companyId}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-6">
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                setIsChooseMethodOpen(false);
                setTimeout(() => setIsImportExcelOpen(true), 150);
              }}
              className="h-auto py-6 justify-start"
              data-testid="button-choose-import"
            >
              <div className="text-left">
                <div className="flex items-center gap-2 mb-1">
                  <Upload className="w-5 h-5" />
                  <span className="font-semibold">Import from Excel</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 font-normal">
                  Upload an Excel file with CREW and EQUIPMENTS sheets
                </p>
              </div>
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                setIsChooseMethodOpen(false);
                handleCreateRoster();
              }}
              className="h-auto py-6 justify-start"
              data-testid="button-choose-manual"
            >
              <div className="text-left">
                <div className="flex items-center gap-2 mb-1">
                  <Plus className="w-5 h-5" />
                  <span className="font-semibold">Create Manually</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 font-normal">
                  Add crew and equipment entries one by one
                </p>
              </div>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsChooseMethodOpen(false);
              setTimeout(() => setIsCreateRosterOpen(true), 150);
            }} data-testid="button-back-to-contractor">
              Back to Contractor Selection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Excel Roster Dialog */}
      <Dialog open={isImportExcelOpen} onOpenChange={setIsImportExcelOpen}>
        <DialogContent data-testid="dialog-import-excel">
          <DialogHeader>
            <DialogTitle>Import Roster from Excel</DialogTitle>
            <DialogDescription>
              Contractor: {importCompanyId}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="excel-file">Excel File *</Label>
              <Input
                id="excel-file"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                ref={fileInputRef}
                data-testid="input-excel-file"
              />
              {selectedFile && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Selected: {selectedFile.name}
                </p>
              )}
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Required sheets:</strong> CREW (personnel data) and EQUIPMENTS (optional)
              </p>
              <Button
                variant="link"
                size="sm"
                className="mt-2 h-auto p-0 text-blue-700 dark:text-blue-300"
                onClick={handleDownloadTemplate}
                data-testid="button-download-template"
              >
                <FileDown className="w-4 h-4 mr-1" />
                Download Template
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportExcelOpen(false)} data-testid="button-cancel-import">
              Cancel
            </Button>
            <Button
              onClick={handleImportExcel}
              disabled={!selectedFile || importExcelMutation.isPending}
              data-testid="button-submit-import"
            >
              {importExcelMutation.isPending ? 'Importing...' : 'Import Roster'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Roster Dialog */}
      <Dialog open={isEditRosterOpen} onOpenChange={setIsEditRosterOpen}>
        <DialogContent data-testid="dialog-edit-roster">
          <DialogHeader>
            <DialogTitle>Edit Roster</DialogTitle>
            <DialogDescription>Update roster status.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select value={rosterFormData.status} onValueChange={(value) => setRosterFormData({ ...rosterFormData, status: value })}>
                <SelectTrigger id="edit-status" data-testid="select-edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">DRAFT</SelectItem>
                  <SelectItem value="SUBMITTED">SUBMITTED</SelectItem>
                  <SelectItem value="APPROVED">APPROVED</SelectItem>
                  <SelectItem value="LOCKED">LOCKED</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditRosterOpen(false)} data-testid="button-cancel-edit-roster">
              Cancel
            </Button>
            <Button
              onClick={handleUpdateRoster}
              disabled={updateRosterMutation.isPending}
              data-testid="button-submit-edit-roster"
            >
              {updateRosterMutation.isPending ? 'Updating...' : 'Update Roster'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Roster Dialog */}
      <Dialog open={isDeleteRosterOpen} onOpenChange={setIsDeleteRosterOpen}>
        <DialogContent data-testid="dialog-delete-roster">
          <DialogHeader>
            <DialogTitle>Delete Roster</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this roster? All crews will be deleted. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteRosterOpen(false)} data-testid="button-cancel-delete-roster">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteRoster}
              disabled={deleteRosterMutation.isPending}
              data-testid="button-confirm-delete-roster"
            >
              {deleteRosterMutation.isPending ? 'Deleting...' : 'Delete Roster'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Crew Dialog */}
      <Dialog open={isCreateCrewOpen} onOpenChange={setIsCreateCrewOpen}>
        <DialogContent data-testid="dialog-create-crew">
          <DialogHeader>
            <DialogTitle>Add Crew</DialogTitle>
            <DialogDescription>Add a new crew to the roster.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="crew-name">Crew Name *</Label>
              <Input
                id="crew-name"
                value={crewFormData.crewName ?? ''}
                onChange={(e) => setCrewFormData({ ...crewFormData, crewName: e.target.value })}
                placeholder="Alpha Team"
                data-testid="input-crew-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="crew-lead">Crew Lead</Label>
              <Input
                id="crew-lead"
                value={crewFormData.crewLead ?? ''}
                onChange={(e) => setCrewFormData({ ...crewFormData, crewLead: e.target.value })}
                placeholder="John Smith"
                data-testid="input-crew-lead"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="work-area">Work Area</Label>
              <Input
                id="work-area"
                value={crewFormData.workArea ?? ''}
                onChange={(e) => setCrewFormData({ ...crewFormData, workArea: e.target.value })}
                placeholder="North District"
                data-testid="input-work-area"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateCrewOpen(false)} data-testid="button-cancel-create-crew">
              Cancel
            </Button>
            <Button
              onClick={handleSubmitCrew}
              disabled={createCrewMutation.isPending}
              data-testid="button-submit-create-crew"
            >
              {createCrewMutation.isPending ? 'Adding...' : 'Add Crew'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Crew Dialog */}
      <Dialog open={isEditCrewOpen} onOpenChange={setIsEditCrewOpen}>
        <DialogContent data-testid="dialog-edit-crew">
          <DialogHeader>
            <DialogTitle>Edit Crew</DialogTitle>
            <DialogDescription>Update crew information.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-crew-name">Crew Name *</Label>
              <Input
                id="edit-crew-name"
                value={crewFormData.crewName ?? ''}
                onChange={(e) => setCrewFormData({ ...crewFormData, crewName: e.target.value })}
                data-testid="input-edit-crew-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-crew-lead">Crew Lead</Label>
              <Input
                id="edit-crew-lead"
                value={crewFormData.crewLead ?? ''}
                onChange={(e) => setCrewFormData({ ...crewFormData, crewLead: e.target.value })}
                data-testid="input-edit-crew-lead"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-work-area">Work Area</Label>
              <Input
                id="edit-work-area"
                value={crewFormData.workArea ?? ''}
                onChange={(e) => setCrewFormData({ ...crewFormData, workArea: e.target.value })}
                data-testid="input-edit-work-area"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditCrewOpen(false)} data-testid="button-cancel-edit-crew">
              Cancel
            </Button>
            <Button
              onClick={handleUpdateCrew}
              disabled={updateCrewMutation.isPending}
              data-testid="button-submit-edit-crew"
            >
              {updateCrewMutation.isPending ? 'Updating...' : 'Update Crew'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Crew Dialog */}
      <Dialog open={isDeleteCrewOpen} onOpenChange={setIsDeleteCrewOpen}>
        <DialogContent data-testid="dialog-delete-crew">
          <DialogHeader>
            <DialogTitle>Delete Crew</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedCrew?.crewName}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteCrewOpen(false)} data-testid="button-cancel-delete-crew">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteCrew}
              disabled={deleteCrewMutation.isPending}
              data-testid="button-confirm-delete-crew"
            >
              {deleteCrewMutation.isPending ? 'Deleting...' : 'Delete Crew'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Roster Row Component with Collapsible Crews
function RosterRow({ roster, isExpanded, onToggle, onEdit, onDelete, onAddCrew, onExport, getStatusBadge, getCompanyName, canManageRosters, onEditCrew, onDeleteCrew }: {
  roster: Roster;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddCrew: () => void;
  onExport: () => void;
  getStatusBadge: (status: string) => JSX.Element;
  getCompanyName: (companyId: string) => string;
  canManageRosters: boolean;
  onEditCrew: (crew: Crew) => void;
  onDeleteCrew: (crew: Crew) => void;
}) {
  const { data: crews, isLoading: crewsLoading } = useQuery<Crew[]>({
    queryKey: ['/api/rosters', roster.id, 'crews'],
    queryFn: () => getJson<Crew[]>(`/api/rosters/${roster.id}/crews`),
    enabled: isExpanded,
  });

  // Fetch roster personnel to get counts by crew
  const { data: allPersonnel } = useQuery<any[]>({
    queryKey: ['/api/rosters', roster.id, 'personnel'],
    queryFn: () => getJson<any[]>(`/api/rosters/${roster.id}/personnel`),
    enabled: isExpanded,
  });

  // Fetch roster equipment to get counts by crew
  const { data: allEquipment } = useQuery<any[]>({
    queryKey: ['/api/rosters', roster.id, 'equipment'],
    queryFn: () => getJson<any[]>(`/api/rosters/${roster.id}/equipment`),
    enabled: isExpanded,
  });

  const getCrewCounts = (crewId: string) => {
    const personnelCount = allPersonnel?.filter(p => p.crewId === crewId).length || 0;
    const equipmentCount = allEquipment?.filter(e => e.crewId === crewId).length || 0;
    return { personnelCount, equipmentCount };
  };

  const getCrewForeman = (crewId: string) => {
    const foreman = allPersonnel?.find(p => p.crewId === crewId && p.role?.toLowerCase().includes('foreman'));
    return foreman?.name || crews?.find(c => c.id === crewId)?.crewLead || 'N/A';
  };

  const getCrewPersonnelWithEquipment = (crewId: string) => {
    const crewPersonnel = (allPersonnel?.filter(p => p.crewId === crewId) || []).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
    const crewEquipment = (allEquipment?.filter(e => e.crewId === crewId) || []).sort((a: any, b: any) => (a.equipmentId || '').localeCompare(b.equipmentId || ''));
    const maxLen = Math.max(crewPersonnel.length, crewEquipment.length);
    const paired: Array<{ person: any | null; equipment: any | null }> = [];
    for (let i = 0; i < maxLen; i++) {
      paired.push({
        person: crewPersonnel[i] || null,
        equipment: crewEquipment[i] || null,
      });
    }
    return paired;
  };

  const [expandedCrews, setExpandedCrews] = useState<Set<string>>(new Set());
  const toggleCrewExpanded = (crewId: string) => {
    const next = new Set(expandedCrews);
    if (next.has(crewId)) next.delete(crewId);
    else next.add(crewId);
    setExpandedCrews(next);
  };

  return (
    <div className="border rounded-lg bg-white dark:bg-gray-800" data-testid={`roster-${roster.id}`}>
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center space-x-4 flex-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            data-testid={`button-toggle-${roster.id}`}
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
          <div className="flex-1">
            <div className="flex items-center space-x-3">
              <span className="font-medium">{getCompanyName(roster.companyId)}</span>
              {getStatusBadge(roster.status)}
              <span className="text-sm text-gray-500 dark:text-gray-400">
                <Users className="w-4 h-4 inline mr-1" />
                {crews?.length || 0} crews
              </span>
            </div>
          </div>
        </div>
        {canManageRosters && (
          <div className="flex gap-2">
            <Link href={`/rosters/${roster.id}`}>
              <Button
                variant="outline"
                size="sm"
                data-testid={`button-view-details-${roster.id}`}
              >
                View Details
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              data-testid={`button-export-roster-${roster.id}`}
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onEdit}
              data-testid={`button-edit-roster-${roster.id}`}
            >
              <Edit className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onAddCrew}
              data-testid={`button-add-crew-${roster.id}`}
            >
              <Plus className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              data-testid={`button-delete-roster-${roster.id}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="border-t px-4 py-3 bg-gray-50 dark:bg-gray-900">
          {crewsLoading ? (
            <div className="text-sm text-gray-600 dark:text-gray-400">Loading crews...</div>
          ) : !crews || crews.length === 0 ? (
            <div className="text-sm text-gray-600 dark:text-gray-400">No crews added yet.</div>
          ) : (
            <div className="space-y-2">
              {crews.map((crew) => {
                const { personnelCount, equipmentCount } = getCrewCounts(crew.id);
                const foreman = getCrewForeman(crew.id);
                const isCrewExpanded = expandedCrews.has(crew.id);
                const pairedData = isCrewExpanded ? getCrewPersonnelWithEquipment(crew.id) : [];
                return (
                  <div
                    key={crew.id}
                    className="bg-white dark:bg-gray-800 rounded border"
                    data-testid={`crew-${crew.id}`}
                  >
                    <div className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => toggleCrewExpanded(crew.id)}
                        >
                          {isCrewExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </Button>
                        <div>
                          <div className="font-medium">{crew.crewName}</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            Foreman: {foreman}
                            {' • '}
                            <Users className="w-3 h-3 inline mr-1" />
                            {personnelCount} {personnelCount === 1 ? 'person' : 'people'}
                            {' • '}
                            <span className="inline-flex items-center">
                              <span className="mr-1">⚙️</span>
                              {equipmentCount} {equipmentCount === 1 ? 'piece' : 'pieces'}
                            </span>
                          </div>
                        </div>
                      </div>
                      {canManageRosters && (
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEditCrew(crew)}
                            data-testid={`button-edit-crew-${crew.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDeleteCrew(crew)}
                            data-testid={`button-delete-crew-${crew.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    {isCrewExpanded && pairedData.length > 0 && (
                      <div className="border-t mx-3 mb-3">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-gray-500 dark:text-gray-400 border-b">
                              <th className="py-2 pr-2 font-medium">Personnel Name</th>
                              <th className="py-2 pr-2 font-medium">Role</th>
                              <th className="py-2 pr-2 font-medium">Equipment Type</th>
                              <th className="py-2 font-medium">Equipment Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pairedData.map((pair, idx) => (
                              <tr key={idx} className="border-b last:border-b-0 text-gray-700 dark:text-gray-300">
                                <td className="py-1.5 pr-2">{pair.person?.name || '-'}</td>
                                <td className="py-1.5 pr-2">{pair.person?.role || pair.person?.classification || '-'}</td>
                                <td className="py-1.5 pr-2">{pair.equipment?.equipmentType || '-'}</td>
                                <td className="py-1.5">{pair.equipment?.equipmentDescription || pair.equipment?.type || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {isCrewExpanded && pairedData.length === 0 && (
                      <div className="border-t mx-3 mb-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                        No personnel or equipment assigned to this crew.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
