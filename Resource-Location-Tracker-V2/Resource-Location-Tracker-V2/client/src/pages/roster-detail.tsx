import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link, useParams, useLocation } from 'wouter';
import { ArrowLeft, Edit2, Save, X, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { getJson, patchJson, deleteJson, postJson, queryClient } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import type { Roster, RosterPersonnel, RosterEquipment, Company } from '@shared/schema';

type PersonnelFormData = {
  personnelId: string;
  firstName: string;
  lastName: string;
  name: string;
  role: string;
  classification: string;
  rateCode: string;
  gender: string;
  stOtPtEligibility: string;
  email: string;
  phone: string;
  teamLead: string;
  crewLeadFlag: string;
  departureCity: string;
  departureState: string;
  notes: string;
};

type EquipmentFormData = {
  equipmentId: string;
  equipmentType: string;
  equipmentDescription: string;
  type: string;
  classification: string;
  rateCode: string;
  ownership: string;
  fuel: string;
  assignedCrewId: string;
  notes: string;
};

export default function RosterDetailPage() {
  const params = useParams();
  const rosterId = params.id as string;
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [editingPersonnelId, setEditingPersonnelId] = useState<string | null>(null);
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(null);
  const [personnelFormData, setPersonnelFormData] = useState<PersonnelFormData>({
    personnelId: '',
    firstName: '',
    lastName: '',
    name: '',
    role: '',
    classification: '',
    rateCode: '',
    gender: '',
    stOtPtEligibility: '',
    email: '',
    phone: '',
    teamLead: '',
    crewLeadFlag: '',
    departureCity: '',
    departureState: '',
    notes: '',
  });
  const [equipmentFormData, setEquipmentFormData] = useState<EquipmentFormData>({
    equipmentId: '',
    equipmentType: '',
    equipmentDescription: '',
    type: '',
    classification: '',
    rateCode: '',
    ownership: '',
    fuel: '',
    assignedCrewId: '',
    notes: '',
  });

  const { data: roster, isLoading: rosterLoading } = useQuery<Roster>({
    queryKey: ['/api/rosters', rosterId],
    queryFn: () => getJson<Roster>(`/api/rosters/${rosterId}`),
  });

  const { data: personnel, isLoading: personnelLoading } = useQuery<RosterPersonnel[]>({
    queryKey: ['/api/rosters', rosterId, 'personnel'],
    queryFn: () => getJson<RosterPersonnel[]>(`/api/rosters/${rosterId}/personnel`),
  });

  const { data: equipment, isLoading: equipmentLoading } = useQuery<RosterEquipment[]>({
    queryKey: ['/api/rosters', rosterId, 'equipment'],
    queryFn: () => getJson<RosterEquipment[]>(`/api/rosters/${rosterId}/equipment`),
  });

  const { data: companies } = useQuery<Company[]>({
    queryKey: ['/api/companies'],
    enabled: user?.role === 'UTILITY',
  });

  const updatePersonnelMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PersonnelFormData> }) => {
      return await patchJson(`/api/personnel/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rosters', rosterId, 'personnel'] });
      setEditingPersonnelId(null);
      toast({ title: 'Personnel updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update personnel', variant: 'destructive' });
    },
  });

  const deletePersonnelMutation = useMutation({
    mutationFn: async (id: string) => {
      return await deleteJson(`/api/personnel/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rosters', rosterId, 'personnel'] });
      toast({ title: 'Personnel deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete personnel', variant: 'destructive' });
    },
  });

  const updateEquipmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<EquipmentFormData> }) => {
      return await patchJson(`/api/equipment/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rosters', rosterId, 'equipment'] });
      setEditingEquipmentId(null);
      toast({ title: 'Equipment updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update equipment', variant: 'destructive' });
    },
  });

  const deleteEquipmentMutation = useMutation({
    mutationFn: async (id: string) => {
      return await deleteJson(`/api/equipment/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rosters', rosterId, 'equipment'] });
      toast({ title: 'Equipment deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete equipment', variant: 'destructive' });
    },
  });

  const handleEditPersonnel = (person: RosterPersonnel) => {
    setEditingPersonnelId(person.id);
    setPersonnelFormData({
      personnelId: person.personnelId || '',
      firstName: person.firstName || '',
      lastName: person.lastName || '',
      name: person.name || '',
      role: person.role || '',
      classification: person.classification || '',
      rateCode: person.rateCode || '',
      gender: person.gender || '',
      stOtPtEligibility: person.stOtPtEligibility || '',
      email: person.email || '',
      phone: person.phone || '',
      teamLead: person.teamLead || '',
      crewLeadFlag: person.crewLeadFlag || '',
      departureCity: person.departureCity || '',
      departureState: person.departureState || '',
      notes: person.notes || '',
    });
  };

  const handleSavePersonnel = () => {
    if (!editingPersonnelId) return;
    updatePersonnelMutation.mutate({
      id: editingPersonnelId,
      data: personnelFormData,
    });
  };

  const handleCancelPersonnelEdit = () => {
    setEditingPersonnelId(null);
    setPersonnelFormData({
      personnelId: '',
      firstName: '',
      lastName: '',
      name: '',
      role: '',
      classification: '',
      rateCode: '',
      gender: '',
      stOtPtEligibility: '',
      email: '',
      phone: '',
      teamLead: '',
      crewLeadFlag: '',
      departureCity: '',
      departureState: '',
      notes: '',
    });
  };

  const handleEditEquipment = (equip: RosterEquipment) => {
    setEditingEquipmentId(equip.id);
    setEquipmentFormData({
      equipmentId: equip.equipmentId || '',
      equipmentType: equip.equipmentType || '',
      equipmentDescription: equip.equipmentDescription || '',
      type: equip.type || '',
      classification: equip.classification || '',
      rateCode: equip.rateCode || '',
      ownership: equip.ownership || '',
      fuel: equip.fuel || '',
      assignedCrewId: equip.assignedCrewId || '',
      notes: equip.notes || '',
    });
  };

  const handleSaveEquipment = () => {
    if (!editingEquipmentId) return;
    updateEquipmentMutation.mutate({
      id: editingEquipmentId,
      data: equipmentFormData,
    });
  };

  const handleCancelEquipmentEdit = () => {
    setEditingEquipmentId(null);
    setEquipmentFormData({
      equipmentId: '',
      equipmentType: '',
      equipmentDescription: '',
      type: '',
      classification: '',
      rateCode: '',
      ownership: '',
      fuel: '',
      assignedCrewId: '',
      notes: '',
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      DRAFT: 'secondary',
      SUBMITTED: 'default',
      APPROVED: 'outline',
      LOCKED: 'destructive',
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  const getCompanyName = (companyId: string) => {
    const company = companies?.find(c => c.id === companyId);
    return company?.name || companyId;
  };

  if (rosterLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading roster...</div>
      </div>
    );
  }

  const backUrl = roster?.sessionId ? `/storm/${roster.sessionId}` : '/rosters';

  if (!roster) {
    /* backUrl will be '/rosters' when roster is null */
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">Roster not found</p>
          <Link href="/rosters">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Rosters
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="w-full px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" onClick={() => setLocation(backUrl)} data-testid="button-back-rosters">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Session
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Roster Details</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {getCompanyName(roster.companyId)} • {getStatusBadge(roster.status)}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={logout} data-testid="button-logout">
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="w-full px-4 py-8">
        <Tabs defaultValue="personnel" className="space-y-6">
          <TabsList>
            <TabsTrigger value="personnel" data-testid="tab-personnel">
              Personnel ({personnel?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="equipment" data-testid="tab-equipment">
              Equipment ({equipment?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="personnel">
            <Card>
              <CardHeader>
                <CardTitle>Personnel</CardTitle>
                <CardDescription>Crew members assigned to this roster</CardDescription>
              </CardHeader>
              <CardContent>
                {personnelLoading ? (
                  <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading personnel...</div>
                ) : !personnel || personnel.length === 0 ? (
                  <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                    No personnel found. Import an Excel roster to add personnel.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="min-w-max">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Personnel ID</TableHead>
                          <TableHead className="whitespace-nowrap">First Name</TableHead>
                          <TableHead className="whitespace-nowrap">Last Name</TableHead>
                          <TableHead className="whitespace-nowrap">Email</TableHead>
                          <TableHead className="whitespace-nowrap">Cell Phone</TableHead>
                          <TableHead className="whitespace-nowrap">Gender</TableHead>
                          <TableHead className="whitespace-nowrap">Team Lead</TableHead>
                          <TableHead className="whitespace-nowrap">Crew Lead</TableHead>
                          <TableHead className="whitespace-nowrap">Team Type</TableHead>
                          <TableHead className="whitespace-nowrap">Resource Type</TableHead>
                          <TableHead className="whitespace-nowrap">Departure City</TableHead>
                          <TableHead className="whitespace-nowrap">Departure State</TableHead>
                          <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {personnel.map((person) => {
                          const isEditing = editingPersonnelId === person.id;
                          
                          return (
                            <TableRow key={person.id} data-testid={`row-personnel-${person.id}`}>
                              <TableCell>
                                {isEditing ? (
                                  <Input
                                    value={personnelFormData.personnelId}
                                    onChange={(e) => setPersonnelFormData({ ...personnelFormData, personnelId: e.target.value })}
                                    className="min-w-[120px]"
                                    data-testid="input-edit-personnelid"
                                  />
                                ) : (
                                  person.personnelId || '-'
                                )}
                              </TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <Input
                                    value={personnelFormData.firstName}
                                    onChange={(e) => setPersonnelFormData({ ...personnelFormData, firstName: e.target.value })}
                                    className="min-w-[120px]"
                                    data-testid="input-edit-firstname"
                                  />
                                ) : (
                                  person.firstName || '-'
                                )}
                              </TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <Input
                                    value={personnelFormData.lastName}
                                    onChange={(e) => setPersonnelFormData({ ...personnelFormData, lastName: e.target.value })}
                                    className="min-w-[120px]"
                                    data-testid="input-edit-lastname"
                                  />
                                ) : (
                                  person.lastName || '-'
                                )}
                              </TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <Input
                                    value={personnelFormData.email}
                                    onChange={(e) => setPersonnelFormData({ ...personnelFormData, email: e.target.value })}
                                    className="min-w-[150px]"
                                    data-testid="input-edit-email"
                                  />
                                ) : (
                                  person.email || '-'
                                )}
                              </TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <Input
                                    value={personnelFormData.phone}
                                    onChange={(e) => setPersonnelFormData({ ...personnelFormData, phone: e.target.value })}
                                    className="min-w-[120px]"
                                    data-testid="input-edit-phone"
                                  />
                                ) : (
                                  person.phone || '-'
                                )}
                              </TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <Input
                                    value={personnelFormData.gender}
                                    onChange={(e) => setPersonnelFormData({ ...personnelFormData, gender: e.target.value })}
                                    className="min-w-[80px]"
                                    data-testid="input-edit-gender"
                                  />
                                ) : (
                                  person.gender || '-'
                                )}
                              </TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <Input
                                    value={personnelFormData.teamLead}
                                    onChange={(e) => setPersonnelFormData({ ...personnelFormData, teamLead: e.target.value })}
                                    className="min-w-[80px]"
                                    data-testid="input-edit-teamlead"
                                  />
                                ) : (
                                  person.teamLead || '-'
                                )}
                              </TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <Input
                                    value={personnelFormData.crewLeadFlag}
                                    onChange={(e) => setPersonnelFormData({ ...personnelFormData, crewLeadFlag: e.target.value })}
                                    className="min-w-[80px]"
                                    data-testid="input-edit-crewlead"
                                  />
                                ) : (
                                  person.crewLeadFlag || '-'
                                )}
                              </TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <Input
                                    value={personnelFormData.role}
                                    onChange={(e) => setPersonnelFormData({ ...personnelFormData, role: e.target.value })}
                                    className="min-w-[120px]"
                                    data-testid="input-edit-role"
                                  />
                                ) : (
                                  person.role || '-'
                                )}
                              </TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <Input
                                    value={personnelFormData.classification}
                                    onChange={(e) => setPersonnelFormData({ ...personnelFormData, classification: e.target.value })}
                                    className="min-w-[140px]"
                                    data-testid="input-edit-classification"
                                  />
                                ) : (
                                  person.classification || '-'
                                )}
                              </TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <Input
                                    value={personnelFormData.departureCity}
                                    onChange={(e) => setPersonnelFormData({ ...personnelFormData, departureCity: e.target.value })}
                                    className="min-w-[120px]"
                                    data-testid="input-edit-departurecity"
                                  />
                                ) : (
                                  person.departureCity || '-'
                                )}
                              </TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <Input
                                    value={personnelFormData.departureState}
                                    onChange={(e) => setPersonnelFormData({ ...personnelFormData, departureState: e.target.value })}
                                    className="min-w-[120px]"
                                    data-testid="input-edit-departurestate"
                                  />
                                ) : (
                                  person.departureState || '-'
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {isEditing ? (
                                  <div className="flex items-center justify-end gap-2">
                                    <Button
                                      size="sm"
                                      onClick={handleSavePersonnel}
                                      disabled={updatePersonnelMutation.isPending}
                                      data-testid="button-save-personnel"
                                    >
                                      <Save className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={handleCancelPersonnelEdit}
                                      data-testid="button-cancel-personnel"
                                    >
                                      <X className="w-4 h-4" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-2">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleEditPersonnel(person)}
                                      data-testid={`button-edit-personnel-${person.id}`}
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => deletePersonnelMutation.mutate(person.id)}
                                      data-testid={`button-delete-personnel-${person.id}`}
                                    >
                                      <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="equipment">
            <Card>
              <CardHeader>
                <CardTitle>Equipment</CardTitle>
                <CardDescription>Equipment assigned to this roster</CardDescription>
              </CardHeader>
              <CardContent>
                {equipmentLoading ? (
                  <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading equipment...</div>
                ) : !equipment || equipment.length === 0 ? (
                  <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                    No equipment found. Import an Excel roster to add equipment.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="min-w-max">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Equipment ID</TableHead>
                          <TableHead className="whitespace-nowrap">Equipment Type</TableHead>
                          <TableHead className="whitespace-nowrap">Equipment Description</TableHead>
                          <TableHead className="whitespace-nowrap">Equipment Fuel Type</TableHead>
                          <TableHead className="whitespace-nowrap">Assigned Equipment Crew ID</TableHead>
                          <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {equipment.map((equip) => {
                          const isEditing = editingEquipmentId === equip.id;
                          
                          return (
                            <TableRow key={equip.id} data-testid={`row-equipment-${equip.id}`}>
                              <TableCell>
                                {isEditing ? (
                                  <Input
                                    value={equipmentFormData.equipmentId}
                                    onChange={(e) => setEquipmentFormData({ ...equipmentFormData, equipmentId: e.target.value })}
                                    className="min-w-[120px]"
                                    data-testid="input-edit-equipmentid"
                                  />
                                ) : (
                                  equip.equipmentId || '-'
                                )}
                              </TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <Input
                                    value={equipmentFormData.equipmentType}
                                    onChange={(e) => setEquipmentFormData({ ...equipmentFormData, equipmentType: e.target.value })}
                                    className="min-w-[150px]"
                                    data-testid="input-edit-equipmenttype"
                                  />
                                ) : (
                                  equip.equipmentType || '-'
                                )}
                              </TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <Input
                                    value={equipmentFormData.equipmentDescription}
                                    onChange={(e) => setEquipmentFormData({ ...equipmentFormData, equipmentDescription: e.target.value })}
                                    className="min-w-[180px]"
                                    data-testid="input-edit-equipmentdescription"
                                  />
                                ) : (
                                  equip.equipmentDescription || '-'
                                )}
                              </TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <Input
                                    value={equipmentFormData.fuel}
                                    onChange={(e) => setEquipmentFormData({ ...equipmentFormData, fuel: e.target.value })}
                                    className="min-w-[120px]"
                                    data-testid="input-edit-fuel"
                                  />
                                ) : (
                                  equip.fuel || '-'
                                )}
                              </TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <Input
                                    value={equipmentFormData.assignedCrewId}
                                    onChange={(e) => setEquipmentFormData({ ...equipmentFormData, assignedCrewId: e.target.value })}
                                    className="min-w-[140px]"
                                    data-testid="input-edit-assignedcrewid"
                                  />
                                ) : (
                                  equip.assignedCrewId || '-'
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {isEditing ? (
                                  <div className="flex items-center justify-end gap-2">
                                    <Button
                                      size="sm"
                                      onClick={handleSaveEquipment}
                                      disabled={updateEquipmentMutation.isPending}
                                      data-testid="button-save-equipment"
                                    >
                                      <Save className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={handleCancelEquipmentEdit}
                                      data-testid="button-cancel-equipment"
                                    >
                                      <X className="w-4 h-4" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-2">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleEditEquipment(equip)}
                                      data-testid={`button-edit-equipment-${equip.id}`}
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => deleteEquipmentMutation.mutate(equip.id)}
                                      data-testid={`button-delete-equipment-${equip.id}`}
                                    >
                                      <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
