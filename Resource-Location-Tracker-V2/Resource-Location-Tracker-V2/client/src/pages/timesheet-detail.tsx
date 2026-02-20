import { useState, useEffect } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Send, Check, Trash2, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getJson, apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/context/AuthContext';
import type { Timesheet, TimesheetPersonnel, TimesheetEquipment, WorkSegment, RosterPersonnel, RosterEquipment } from '@shared/schema';

// Helper: Calculate hours from HH:mm time strings, handle overnight shifts
function calcShiftHours(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;
  
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  
  let startMinutes = startHour * 60 + startMin;
  let endMinutes = endHour * 60 + endMin;
  
  // Handle overnight shifts
  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60;
  }
  
  return Math.round(((endMinutes - startMinutes) / 60) * 100) / 100;
}

export default function TimesheetDetailPage() {
  const params = useParams();
  const timesheetId = params.id as string;
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const searchParams = new URLSearchParams(window.location.search);
  const fromStorm = searchParams.get('from') === 'storm';
  const stormSessionId = searchParams.get('sessionId');
  const backPath = fromStorm && stormSessionId ? `/storm/${stormSessionId}?tab=timesheets` : '/timesheets';

  const [headerData, setHeaderData] = useState<Partial<Timesheet>>({});
  const [editingPersonnel, setEditingPersonnel] = useState<Record<string, Partial<TimesheetPersonnel>>>({});
  const [editingEquipment, setEditingEquipment] = useState<Record<string, Partial<TimesheetEquipment>>>({});
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const { data: timesheet, isLoading: timesheetLoading } = useQuery<Timesheet>({
    queryKey: [`/api/timesheets/${timesheetId}`],
    enabled: !!timesheetId,
  });

  const { data: personnel = [], isLoading: personnelLoading } = useQuery<TimesheetPersonnel[]>({
    queryKey: [`/api/timesheets/${timesheetId}/personnel`],
    enabled: !!timesheetId,
  });

  const { data: equipment = [], isLoading: equipmentLoading } = useQuery<TimesheetEquipment[]>({
    queryKey: [`/api/timesheets/${timesheetId}/equipment`],
    enabled: !!timesheetId,
  });

  // Sync header data when timesheet loads
  useEffect(() => {
    if (timesheet) {
      setHeaderData(timesheet);
    }
  }, [timesheet]);

  const updateTimesheetMutation = useMutation({
    mutationFn: (data: Partial<Timesheet>) =>
      apiRequest('PATCH', `/api/timesheets/${timesheetId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/timesheets/${timesheetId}`] });
      toast({ title: 'Timesheet updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update timesheet', variant: 'destructive' });
    },
  });

  const updatePersonnelMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TimesheetPersonnel> }) =>
      apiRequest('PATCH', `/api/timesheets/${timesheetId}/personnel/${id}`, data),
    onSuccess: (_, variables) => {
      // Clear the editing state for this person
      const newEditing = { ...editingPersonnel };
      delete newEditing[variables.id];
      setEditingPersonnel(newEditing);
      
      queryClient.invalidateQueries({ queryKey: [`/api/timesheets/${timesheetId}/personnel`] });
      toast({ title: 'Personnel updated successfully' });
    },
  });

  const updateEquipmentMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TimesheetEquipment> }) =>
      apiRequest('PATCH', `/api/timesheets/${timesheetId}/equipment/${id}`, data),
    onSuccess: (_, variables) => {
      // Clear the editing state for this equipment
      const newEditing = { ...editingEquipment };
      delete newEditing[variables.id];
      setEditingEquipment(newEditing);
      
      queryClient.invalidateQueries({ queryKey: [`/api/timesheets/${timesheetId}/equipment`] });
      toast({ title: 'Equipment updated successfully' });
    },
  });

  const submitTimesheetMutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/timesheets/${timesheetId}/submit`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/timesheets/${timesheetId}`] });
      toast({ title: 'Timesheet submitted successfully' });
    },
  });

  const approveTimesheetMutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/timesheets/${timesheetId}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/timesheets/${timesheetId}`] });
      toast({ title: 'Timesheet approved' });
    },
    onError: () => {
      toast({ title: 'Failed to approve timesheet', variant: 'destructive' });
    },
  });

  const rejectTimesheetMutation = useMutation({
    mutationFn: (reason: string) => apiRequest('POST', `/api/timesheets/${timesheetId}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/timesheets/${timesheetId}`] });
      setShowRejectDialog(false);
      setRejectionReason('');
      toast({ title: 'Timesheet rejected' });
    },
    onError: () => {
      toast({ title: 'Failed to reject timesheet', variant: 'destructive' });
    },
  });

  const deleteTimesheetMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', `/api/timesheets/${timesheetId}`, {}),
    onSuccess: () => {
      toast({ title: 'Timesheet deleted successfully' });
      navigate(backPath);
    },
    onError: () => {
      toast({ title: 'Failed to delete timesheet', variant: 'destructive' });
    },
  });

  const handleSubmitTimesheet = () => {
    submitTimesheetMutation.mutate();
  };

  const handleApproveTimesheet = () => {
    approveTimesheetMutation.mutate();
  };

  const handleRejectTimesheet = () => {
    if (!rejectionReason.trim()) {
      toast({ title: 'Please provide a reason for rejection', variant: 'destructive' });
      return;
    }
    rejectTimesheetMutation.mutate(rejectionReason.trim());
  };

  const handleDeleteTimesheet = () => {
    if (confirm('Are you sure you want to delete this timesheet? This action cannot be undone.')) {
      deleteTimesheetMutation.mutate();
    }
  };

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

  if (timesheetLoading) {
    return <div className="p-8 text-center">Loading timesheet...</div>;
  }

  if (!timesheet) {
    return <div className="p-8 text-center text-gray-600 dark:text-gray-400">Timesheet not found</div>;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Link href={backPath}>
                <Button variant="ghost" size="sm" data-testid="button-back">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                  Timesheet Detail
                </h1>
                <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  {new Date(timesheet.date).toLocaleDateString()} {getStatusBadge(timesheet.status)}
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {timesheet.status === 'DRAFT' && (
              <Button
                onClick={handleSubmitTimesheet}
                disabled={submitTimesheetMutation.isPending}
                data-testid="button-submit"
              >
                <Send className="w-4 h-4 mr-2" />
                Submit
              </Button>
            )}
            {timesheet.status === 'SUBMITTED' && (user?.role === 'MANAGER' || user?.role === 'UTILITY') && (
              <>
                <Button
                  onClick={handleApproveTimesheet}
                  disabled={approveTimesheetMutation.isPending}
                  data-testid="button-approve"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowRejectDialog(true)}
                  disabled={rejectTimesheetMutation.isPending}
                  data-testid="button-reject"
                >
                  <X className="w-4 h-4 mr-2" />
                  Reject
                </Button>
              </>
            )}
            {user?.role === 'ADMIN' && (
              <Button
                onClick={handleDeleteTimesheet}
                disabled={deleteTimesheetMutation.isPending}
                variant="destructive"
                data-testid="button-delete"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
        </div>

        {/* Rejection Banner */}
        {timesheet.status === 'REJECTED' && (
          <Card className="border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-semibold text-red-800 dark:text-red-200">Timesheet Rejected</h3>
                  {timesheet.rejectionReason && (
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">{timesheet.rejectionReason}</p>
                  )}
                  {timesheet.rejectedAt && (
                    <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                      Rejected on {new Date(timesheet.rejectedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Timesheet Header - Excel Fields */}
        <Card>
          <CardHeader>
            <CardTitle>Timesheet Header</CardTitle>
            <CardDescription>Project and crew information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="projectName">Project Name</Label>
                <Input
                  id="projectName"
                  value={headerData.projectName || ''}
                  onChange={(e) => setHeaderData({ ...headerData, projectName: e.target.value })}
                  placeholder="e.g., National Grid November Storm"
                  disabled={timesheet.status !== 'DRAFT'}
                  data-testid="input-project-name"
                />
              </div>
              <div>
                <Label htmlFor="utilityName">Utility Name</Label>
                <Input
                  id="utilityName"
                  value={headerData.utilityName || ''}
                  onChange={(e) => setHeaderData({ ...headerData, utilityName: e.target.value })}
                  placeholder="e.g., National Grid"
                  disabled={timesheet.status !== 'DRAFT'}
                  data-testid="input-utility-name"
                />
              </div>
              <div>
                <Label htmlFor="teamGeneralForeman">Team General Foreman</Label>
                <Input
                  id="teamGeneralForeman"
                  value={headerData.teamGeneralForeman || ''}
                  onChange={(e) => setHeaderData({ ...headerData, teamGeneralForeman: e.target.value })}
                  disabled={timesheet.status !== 'DRAFT'}
                  data-testid="input-team-gf"
                />
              </div>
              <div>
                <Label htmlFor="crewForeman">Crew Foreman</Label>
                <Input
                  id="crewForeman"
                  value={headerData.crewForeman || ''}
                  onChange={(e) => setHeaderData({ ...headerData, crewForeman: e.target.value })}
                  disabled={timesheet.status !== 'DRAFT'}
                  data-testid="input-crew-foreman"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="jobLocations">Job Locations / Service Addresses</Label>
                <Textarea
                  id="jobLocations"
                  value={headerData.jobLocations || ''}
                  onChange={(e) => setHeaderData({ ...headerData, jobLocations: e.target.value })}
                  disabled={timesheet.status !== 'DRAFT'}
                  data-testid="input-job-locations"
                  rows={2}
                />
              </div>
              <div>
                <Label htmlFor="lodgingProvided">Lodging Provided</Label>
                <Select
                  value={headerData.lodgingProvided === true ? 'yes' : 'no'}
                  onValueChange={(val) => setHeaderData({ ...headerData, lodgingProvided: val === 'yes' })}
                  disabled={timesheet.status !== 'DRAFT'}
                >
                  <SelectTrigger data-testid="select-lodging">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="crewIdNumber">Crew ID #</Label>
                <Input
                  id="crewIdNumber"
                  value={headerData.crewIdNumber || ''}
                  onChange={(e) => setHeaderData({ ...headerData, crewIdNumber: e.target.value })}
                  disabled={timesheet.status !== 'DRAFT'}
                  data-testid="input-crew-id"
                />
              </div>
              <div>
                <Label htmlFor="locationAreaAssigned">Location Area Assigned</Label>
                <Input
                  id="locationAreaAssigned"
                  value={headerData.locationAreaAssigned || ''}
                  onChange={(e) => setHeaderData({ ...headerData, locationAreaAssigned: e.target.value })}
                  disabled={timesheet.status !== 'DRAFT'}
                  data-testid="input-location-area"
                />
              </div>
              <div>
                <Label htmlFor="foremanPhone">Foreman Phone Number</Label>
                <Input
                  id="foremanPhone"
                  value={headerData.foremanPhone || ''}
                  onChange={(e) => setHeaderData({ ...headerData, foremanPhone: e.target.value })}
                  disabled={timesheet.status !== 'DRAFT'}
                  data-testid="input-foreman-phone"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="workDescription">Description of Work Performed</Label>
                <Textarea
                  id="workDescription"
                  value={headerData.workDescription || ''}
                  onChange={(e) => setHeaderData({ ...headerData, workDescription: e.target.value })}
                  disabled={timesheet.status !== 'DRAFT'}
                  placeholder="Include mobilization/demobilization start and stop addresses"
                  data-testid="input-work-description"
                  rows={3}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Personnel Table */}
        <Card>
          <CardHeader>
            <CardTitle>Personnel</CardTitle>
            <CardDescription>Crew members and their work segments for this day</CardDescription>
          </CardHeader>
          <CardContent>
            {personnelLoading ? (
              <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading personnel...</div>
            ) : personnel.length === 0 ? (
              <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                No personnel assigned. Personnel will be auto-populated from the roster.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee Name</TableHead>
                      <TableHead>Classification</TableHead>
                      <TableHead>Start Time</TableHead>
                      <TableHead>End Time</TableHead>
                      <TableHead>Total Hours</TableHead>
                      <TableHead>Meals (Utility)</TableHead>
                      <TableHead>Meals (Per Diem)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {personnel.map((person) => {
                      const editing = editingPersonnel[person.id] || {};
                      // Extract start/end times from segments
                      const firstSegment = (person.segments as WorkSegment[] || [])[0];
                      const personStartTime = firstSegment?.startTime || '';
                      const personEndTime = firstSegment?.endTime || '';
                      
                      // Coerce values to avoid null
                      const classificationValue = editing.classification !== undefined ? editing.classification : (person.classification ?? '');
                      const startTimeValue = editing.startTime !== undefined ? editing.startTime : personStartTime;
                      const endTimeValue = editing.endTime !== undefined ? editing.endTime : personEndTime;
                      const totalHoursValue = editing.totalHours !== undefined ? editing.totalHours : (person.totalHours ?? 0);
                      const mealsUtilityValue = editing.mealsProvidedByUtility !== undefined ? editing.mealsProvidedByUtility : (person.mealsProvidedByUtility ?? 0);
                      const perDiemMealsValue = editing.perDiemMeals !== undefined ? editing.perDiemMeals : (person.perDiemMeals ?? 0);
                      
                      return (
                        <TableRow key={person.id} data-testid={`row-personnel-${person.id}`}>
                          <TableCell className="font-medium">{person.employeeName}</TableCell>
                          <TableCell>
                            <Input
                              value={classificationValue == null ? '' : classificationValue}
                              onChange={(e) => {
                                setEditingPersonnel({
                                  ...editingPersonnel,
                                  [person.id]: { ...editing, classification: e.target.value }
                                });
                              }}
                              onBlur={() => {
                                if (editing.classification !== undefined && editing.classification !== person.classification) {
                                  updatePersonnelMutation.mutate({
                                    id: person.id,
                                    data: { classification: editing.classification }
                                  });
                                }
                              }}
                              disabled={timesheet?.status !== 'DRAFT'}
                              className="w-32"
                              placeholder="e.g., Foreman"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="time"
                              value={startTimeValue == null ? '' : startTimeValue}
                              onChange={(e) => {
                                const newStartTime = e.target.value;
                                const currentEndTime = editing.endTime !== undefined ? editing.endTime : personEndTime;
                                const newTotalHours = calcShiftHours(newStartTime, currentEndTime || '');
                                
                                setEditingPersonnel({
                                  ...editingPersonnel,
                                  [person.id]: { ...editing, startTime: newStartTime, totalHours: newTotalHours }
                                });
                              }}
                              onBlur={() => {
                                if (editing.startTime !== undefined && editing.startTime !== personStartTime) {
                                  const currentEndTime = editing.endTime !== undefined ? editing.endTime : personEndTime;
                                  const updateData: Partial<TimesheetPersonnel> = { 
                                    startTime: editing.startTime,
                                    endTime: currentEndTime || undefined,
                                    segments: [{
                                      activityType: 'S' as const,
                                      startTime: editing.startTime,
                                      endTime: currentEndTime || '',
                                    }]
                                  };
                                  if (editing.totalHours !== undefined) {
                                    updateData.totalHours = editing.totalHours;
                                  }
                                  updatePersonnelMutation.mutate({
                                    id: person.id,
                                    data: updateData
                                  });
                                }
                              }}
                              disabled={timesheet?.status !== 'DRAFT'}
                              className="w-28"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="time"
                              value={endTimeValue == null ? '' : endTimeValue}
                              onChange={(e) => {
                                const newEndTime = e.target.value;
                                const currentStartTime = editing.startTime !== undefined ? editing.startTime : personStartTime;
                                const newTotalHours = calcShiftHours(currentStartTime || '', newEndTime);
                                
                                setEditingPersonnel({
                                  ...editingPersonnel,
                                  [person.id]: { ...editing, endTime: newEndTime, totalHours: newTotalHours }
                                });
                              }}
                              onBlur={() => {
                                if (editing.endTime !== undefined && editing.endTime !== personEndTime) {
                                  const currentStartTime = editing.startTime !== undefined ? editing.startTime : personStartTime;
                                  const updateData: Partial<TimesheetPersonnel> = { 
                                    startTime: currentStartTime || undefined,
                                    endTime: editing.endTime,
                                    segments: [{
                                      activityType: 'S' as const,
                                      startTime: currentStartTime || '',
                                      endTime: editing.endTime,
                                    }]
                                  };
                                  if (editing.totalHours !== undefined) {
                                    updateData.totalHours = editing.totalHours;
                                  }
                                  updatePersonnelMutation.mutate({
                                    id: person.id,
                                    data: updateData
                                  });
                                }
                              }}
                              disabled={timesheet?.status !== 'DRAFT'}
                              className="w-28"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.5"
                              value={totalHoursValue == null ? '' : totalHoursValue}
                              onChange={(e) => {
                                setEditingPersonnel({
                                  ...editingPersonnel,
                                  [person.id]: { ...editing, totalHours: parseFloat(e.target.value) || 0 }
                                });
                              }}
                              onBlur={() => {
                                if (editing.totalHours !== undefined && editing.totalHours !== person.totalHours) {
                                  updatePersonnelMutation.mutate({
                                    id: person.id,
                                    data: { totalHours: editing.totalHours }
                                  });
                                }
                              }}
                              disabled={timesheet?.status !== 'DRAFT'}
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={mealsUtilityValue == null ? '' : mealsUtilityValue}
                              onChange={(e) => {
                                setEditingPersonnel({
                                  ...editingPersonnel,
                                  [person.id]: { ...editing, mealsProvidedByUtility: parseInt(e.target.value) || 0 }
                                });
                              }}
                              onBlur={() => {
                                if (editing.mealsProvidedByUtility !== undefined && editing.mealsProvidedByUtility !== person.mealsProvidedByUtility) {
                                  updatePersonnelMutation.mutate({
                                    id: person.id,
                                    data: { mealsProvidedByUtility: editing.mealsProvidedByUtility }
                                  });
                                }
                              }}
                              disabled={timesheet?.status !== 'DRAFT'}
                              className="w-16"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={perDiemMealsValue == null ? '' : perDiemMealsValue}
                              onChange={(e) => {
                                setEditingPersonnel({
                                  ...editingPersonnel,
                                  [person.id]: { ...editing, perDiemMeals: parseInt(e.target.value) || 0 }
                                });
                              }}
                              onBlur={() => {
                                if (editing.perDiemMeals !== undefined && editing.perDiemMeals !== person.perDiemMeals) {
                                  updatePersonnelMutation.mutate({
                                    id: person.id,
                                    data: { perDiemMeals: editing.perDiemMeals }
                                  });
                                }
                              }}
                              disabled={timesheet?.status !== 'DRAFT'}
                              className="w-16"
                            />
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

        {/* Equipment Table */}
        <Card>
          <CardHeader>
            <CardTitle>Equipment</CardTitle>
            <CardDescription>Equipment used by this crew for the day</CardDescription>
          </CardHeader>
          <CardContent>
            {equipmentLoading ? (
              <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading equipment...</div>
            ) : equipment.length === 0 ? (
              <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                No equipment assigned. Equipment will be auto-populated from the roster.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Equipment Description</TableHead>
                      <TableHead>Equipment #</TableHead>
                      <TableHead>Start Time</TableHead>
                      <TableHead>End Time</TableHead>
                      <TableHead>Total Hours</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {equipment.map((equip) => {
                      const editing = editingEquipment[equip.id] || {};
                      
                      // Coerce values to avoid null
                      const startTimeValue = editing.startTime !== undefined ? editing.startTime : (equip.startTime ?? '');
                      const endTimeValue = editing.endTime !== undefined ? editing.endTime : (equip.endTime ?? '');
                      const totalHoursValue = editing.totalHours !== undefined ? editing.totalHours : (equip.totalHours ?? 0);
                      
                      return (
                        <TableRow key={equip.id} data-testid={`row-equipment-${equip.id}`}>
                          <TableCell className="font-medium">{equip.equipmentDescription}</TableCell>
                          <TableCell>{equip.equipmentNumber || '-'}</TableCell>
                          <TableCell>
                            <Input
                              type="time"
                              value={startTimeValue == null ? '' : startTimeValue}
                              onChange={(e) => {
                                const newStartTime = e.target.value;
                                const currentEndTime = editing.endTime !== undefined ? editing.endTime : (equip.endTime ?? '');
                                const newTotalHours = calcShiftHours(newStartTime, currentEndTime || '');
                                
                                setEditingEquipment({
                                  ...editingEquipment,
                                  [equip.id]: { ...editing, startTime: newStartTime, totalHours: newTotalHours }
                                });
                              }}
                              onBlur={() => {
                                if (editing.startTime !== undefined && editing.startTime !== equip.startTime) {
                                  const updateData: Partial<TimesheetEquipment> = { startTime: editing.startTime };
                                  if (editing.totalHours !== undefined) {
                                    updateData.totalHours = editing.totalHours;
                                  }
                                  updateEquipmentMutation.mutate({
                                    id: equip.id,
                                    data: updateData
                                  });
                                }
                              }}
                              disabled={timesheet?.status !== 'DRAFT'}
                              className="w-32"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="time"
                              value={endTimeValue == null ? '' : endTimeValue}
                              onChange={(e) => {
                                const newEndTime = e.target.value;
                                const currentStartTime = editing.startTime !== undefined ? editing.startTime : (equip.startTime ?? '');
                                const newTotalHours = calcShiftHours(currentStartTime || '', newEndTime);
                                
                                setEditingEquipment({
                                  ...editingEquipment,
                                  [equip.id]: { ...editing, endTime: newEndTime, totalHours: newTotalHours }
                                });
                              }}
                              onBlur={() => {
                                if (editing.endTime !== undefined && editing.endTime !== equip.endTime) {
                                  const updateData: Partial<TimesheetEquipment> = { endTime: editing.endTime };
                                  if (editing.totalHours !== undefined) {
                                    updateData.totalHours = editing.totalHours;
                                  }
                                  updateEquipmentMutation.mutate({
                                    id: equip.id,
                                    data: updateData
                                  });
                                }
                              }}
                              disabled={timesheet?.status !== 'DRAFT'}
                              className="w-32"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.5"
                              value={totalHoursValue == null ? '' : totalHoursValue}
                              onChange={(e) => {
                                setEditingEquipment({
                                  ...editingEquipment,
                                  [equip.id]: { ...editing, totalHours: parseFloat(e.target.value) || 0 }
                                });
                              }}
                              onBlur={() => {
                                if (editing.totalHours !== undefined && editing.totalHours !== equip.totalHours) {
                                  updateEquipmentMutation.mutate({
                                    id: equip.id,
                                    data: { totalHours: editing.totalHours }
                                  });
                                }
                              }}
                              disabled={timesheet?.status !== 'DRAFT'}
                              className="w-20"
                            />
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
      </div>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Timesheet</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this timesheet. The contractor will see this reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="rejection-reason">Reason for Rejection</Label>
              <Textarea
                id="rejection-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this timesheet is being rejected..."
                rows={3}
                data-testid="input-rejection-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectTimesheet}
              disabled={!rejectionReason.trim() || rejectTimesheetMutation.isPending}
              data-testid="button-confirm-reject"
            >
              {rejectTimesheetMutation.isPending ? 'Rejecting...' : 'Reject Timesheet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
