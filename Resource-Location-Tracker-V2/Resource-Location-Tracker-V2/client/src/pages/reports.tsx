import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowLeft, Download, Users, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { useActiveSession } from '@/context/ActiveSessionContext';
import { useEmbedded } from '@/context/EmbeddedContext';
import type { StormSession, Company, Timesheet, TimesheetPersonnel, TimesheetEquipment, Roster } from '@shared/schema';

interface PersonnelRow {
  companyId: string;
  companyName: string;
  employeeName: string;
  classification: string;
  dailyHours: Record<string, number>;
  totalHours: number;
}

interface EquipmentRow {
  companyId: string;
  companyName: string;
  equipmentDescription: string;
  equipmentNumber: string;
  dailyHours: Record<string, number>;
  totalHours: number;
}

interface CompanyTotals {
  companyId: string;
  companyName: string;
  totalHours: number;
  dailyHours: Record<string, number>;
}

export default function ReportsPage() {
  const { user } = useAuth();
  const { activeSession } = useActiveSession();
  const { embedded, sessionId: embeddedSessionId } = useEmbedded();
  const { toast } = useToast();
  
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [hasUserSelectedSession, setHasUserSelectedSession] = useState(false);

  const canAccessReports = user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'CONTRACTOR' || user?.role === 'UTILITY';

  const { data: sessions } = useQuery<StormSession[]>({
    queryKey: ['/api/storm-sessions'],
  });

  const { data: companies } = useQuery<Company[]>({
    queryKey: ['/api/companies'],
  });

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

  const { data: allTimesheets = [], isLoading: timesheetsLoading } = useQuery<Timesheet[]>({
    queryKey: ['/api/timesheets', selectedSessionId, 'all'],
    queryFn: async () => {
      if (!selectedSessionId) return [];
      const response = await fetch(`/api/timesheets?sessionId=${selectedSessionId}`);
      if (!response.ok) throw new Error('Failed to fetch timesheets');
      return response.json();
    },
    enabled: !!selectedSessionId,
  });

  const sessionCompanyIds = useMemo(() => {
    const ids = new Set<string>();
    rosters.forEach(r => ids.add(r.companyId));
    allTimesheets.forEach(t => ids.add(t.companyId));
    return ids;
  }, [rosters, allTimesheets]);

  const sessionCompanies = useMemo(() => {
    if (!companies) return [];
    return companies.filter(c => sessionCompanyIds.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [companies, sessionCompanyIds]);

  const companyNameMap = useMemo(() => {
    const map = new Map<string, string>();
    companies?.forEach(c => map.set(c.id, c.name));
    return map;
  }, [companies]);

  const approvedTimesheets = useMemo(() => allTimesheets.filter(ts => ts.status === 'APPROVED'), [allTimesheets]);

  const approvedTimesheetIds = useMemo(() => approvedTimesheets.map(t => t.id).sort().join(','), [approvedTimesheets]);

  const { data: allPersonnel } = useQuery<TimesheetPersonnel[]>({
    queryKey: ['/api/timesheets/personnel', approvedTimesheetIds],
    enabled: approvedTimesheets.length > 0,
    queryFn: async () => {
      if (approvedTimesheets.length === 0) return [];
      const personnelByTimesheet = await Promise.all(
        approvedTimesheets.map(async (ts) => {
          const response = await fetch(`/api/timesheets/${ts.id}/personnel`);
          if (!response.ok) throw new Error('Failed to fetch personnel');
          return response.json();
        })
      );
      return personnelByTimesheet.flat();
    },
  });

  const { data: allEquipment } = useQuery<TimesheetEquipment[]>({
    queryKey: ['/api/timesheets/equipment', approvedTimesheetIds],
    enabled: approvedTimesheets.length > 0,
    queryFn: async () => {
      if (approvedTimesheets.length === 0) return [];
      const equipmentByTimesheet = await Promise.all(
        approvedTimesheets.map(async (ts) => {
          const response = await fetch(`/api/timesheets/${ts.id}/equipment`);
          if (!response.ok) throw new Error('Failed to fetch equipment');
          return response.json();
        })
      );
      return equipmentByTimesheet.flat();
    },
  });

  const allDates = useMemo(() => {
    if (!approvedTimesheets.length) return [];
    return Array.from(new Set(approvedTimesheets.map(ts =>
      new Date(ts.date).toLocaleDateString('en-US')
    ))).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  }, [approvedTimesheets]);

  const personnelReport: PersonnelRow[] = useMemo(() => {
    if (!allPersonnel || !approvedTimesheets.length) return [];
    const map = new Map<string, PersonnelRow>();

    allPersonnel.forEach((person) => {
      const timesheet = approvedTimesheets.find(ts => ts.id === person.timesheetId);
      if (!timesheet) return;

      const date = new Date(timesheet.date).toLocaleDateString('en-US');
      const key = `${timesheet.companyId}-${person.employeeName}-${person.classification}`;

      if (!map.has(key)) {
        map.set(key, {
          companyId: timesheet.companyId,
          companyName: companyNameMap.get(timesheet.companyId) || 'Unknown Company',
          employeeName: person.employeeName,
          classification: person.classification,
          dailyHours: {},
          totalHours: 0,
        });
      }

      const record = map.get(key)!;
      record.dailyHours[date] = (record.dailyHours[date] || 0) + (person.totalHours || 0);
      record.totalHours += person.totalHours || 0;
    });

    return Array.from(map.values()).sort((a, b) => {
      const compCmp = a.companyName.localeCompare(b.companyName);
      if (compCmp !== 0) return compCmp;
      return a.employeeName.localeCompare(b.employeeName);
    });
  }, [allPersonnel, approvedTimesheets, companyNameMap]);

  const equipmentReport: EquipmentRow[] = useMemo(() => {
    if (!allEquipment || !approvedTimesheets.length) return [];
    const map = new Map<string, EquipmentRow>();

    allEquipment.forEach((equip) => {
      const timesheet = approvedTimesheets.find(ts => ts.id === equip.timesheetId);
      if (!timesheet) return;

      const date = new Date(timesheet.date).toLocaleDateString('en-US');
      const key = `${timesheet.companyId}-${equip.equipmentDescription}-${equip.equipmentNumber || 'N/A'}`;

      if (!map.has(key)) {
        map.set(key, {
          companyId: timesheet.companyId,
          companyName: companyNameMap.get(timesheet.companyId) || 'Unknown Company',
          equipmentDescription: equip.equipmentDescription,
          equipmentNumber: equip.equipmentNumber || '',
          dailyHours: {},
          totalHours: 0,
        });
      }

      const record = map.get(key)!;
      record.dailyHours[date] = (record.dailyHours[date] || 0) + (equip.totalHours || 0);
      record.totalHours += equip.totalHours || 0;
    });

    return Array.from(map.values()).sort((a, b) => {
      const compCmp = a.companyName.localeCompare(b.companyName);
      if (compCmp !== 0) return compCmp;
      return a.equipmentDescription.localeCompare(b.equipmentDescription);
    });
  }, [allEquipment, approvedTimesheets, companyNameMap]);

  const personnelByCompany = useMemo(() => {
    const grouped = new Map<string, { companyName: string; rows: PersonnelRow[]; totals: CompanyTotals }>();
    personnelReport.forEach(row => {
      if (!grouped.has(row.companyId)) {
        grouped.set(row.companyId, {
          companyName: row.companyName,
          rows: [],
          totals: { companyId: row.companyId, companyName: row.companyName, totalHours: 0, dailyHours: {} },
        });
      }
      const group = grouped.get(row.companyId)!;
      group.rows.push(row);
      group.totals.totalHours += row.totalHours;
      Object.entries(row.dailyHours).forEach(([date, hours]) => {
        group.totals.dailyHours[date] = (group.totals.dailyHours[date] || 0) + hours;
      });
    });
    return Array.from(grouped.values());
  }, [personnelReport]);

  const equipmentByCompany = useMemo(() => {
    const grouped = new Map<string, { companyName: string; rows: EquipmentRow[]; totals: CompanyTotals }>();
    equipmentReport.forEach(row => {
      if (!grouped.has(row.companyId)) {
        grouped.set(row.companyId, {
          companyName: row.companyName,
          rows: [],
          totals: { companyId: row.companyId, companyName: row.companyName, totalHours: 0, dailyHours: {} },
        });
      }
      const group = grouped.get(row.companyId)!;
      group.rows.push(row);
      group.totals.totalHours += row.totalHours;
      Object.entries(row.dailyHours).forEach(([date, hours]) => {
        group.totals.dailyHours[date] = (group.totals.dailyHours[date] || 0) + hours;
      });
    });
    return Array.from(grouped.values());
  }, [equipmentReport]);

  const grandTotalPersonnel = useMemo(() => {
    return personnelReport.reduce((sum, r) => sum + r.totalHours, 0);
  }, [personnelReport]);

  const grandTotalEquipment = useMemo(() => {
    return equipmentReport.reduce((sum, r) => sum + r.totalHours, 0);
  }, [equipmentReport]);

  const exportToCSV = () => {
    if (!approvedTimesheets.length && !personnelReport.length && !equipmentReport.length) {
      toast({ title: 'No data to export', variant: 'destructive' });
      return;
    }

    const lines: string[] = [];
    const sessionName = sessions?.find(s => s.id === selectedSessionId)?.name || 'Session';

    const escapeCSV = (val: string | number) => {
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    if (personnelReport.length > 0) {
      lines.push('PERSONNEL DAILY HOURS');
      lines.push('');
      const header = ['Contractor', 'Employee Name', 'Classification', ...allDates, 'Total Hours'];
      lines.push(header.map(escapeCSV).join(','));

      personnelByCompany.forEach(group => {
        group.rows.forEach(row => {
          const line = [
            row.companyName,
            row.employeeName,
            row.classification,
            ...allDates.map(d => (row.dailyHours[d] || 0).toFixed(2)),
            row.totalHours.toFixed(2),
          ];
          lines.push(line.map(escapeCSV).join(','));
        });
        const subtotalLine = [
          `${group.companyName} - SUBTOTAL`,
          '', '',
          ...allDates.map(d => (group.totals.dailyHours[d] || 0).toFixed(2)),
          group.totals.totalHours.toFixed(2),
        ];
        lines.push(subtotalLine.map(escapeCSV).join(','));
        lines.push('');
      });

      const grandLine = [
        'GRAND TOTAL', '', '',
        ...allDates.map(d => {
          const total = personnelReport.reduce((sum, r) => sum + (r.dailyHours[d] || 0), 0);
          return total.toFixed(2);
        }),
        grandTotalPersonnel.toFixed(2),
      ];
      lines.push(grandLine.map(escapeCSV).join(','));
      lines.push('');
    }

    if (equipmentReport.length > 0) {
      lines.push('');
      lines.push('EQUIPMENT DAILY HOURS');
      lines.push('');
      const header = ['Contractor', 'Equipment Description', 'Equipment Number', ...allDates, 'Total Hours'];
      lines.push(header.map(escapeCSV).join(','));

      equipmentByCompany.forEach(group => {
        group.rows.forEach(row => {
          const line = [
            row.companyName,
            row.equipmentDescription,
            row.equipmentNumber || 'N/A',
            ...allDates.map(d => (row.dailyHours[d] || 0).toFixed(2)),
            row.totalHours.toFixed(2),
          ];
          lines.push(line.map(escapeCSV).join(','));
        });
        const subtotalLine = [
          `${group.companyName} - SUBTOTAL`,
          '', '',
          ...allDates.map(d => (group.totals.dailyHours[d] || 0).toFixed(2)),
          group.totals.totalHours.toFixed(2),
        ];
        lines.push(subtotalLine.map(escapeCSV).join(','));
        lines.push('');
      });

      const grandLine = [
        'GRAND TOTAL', '', '',
        ...allDates.map(d => {
          const total = equipmentReport.reduce((sum, r) => sum + (r.dailyHours[d] || 0), 0);
          return total.toFixed(2);
        }),
        grandTotalEquipment.toFixed(2),
      ];
      lines.push(grandLine.map(escapeCSV).join(','));
    }

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sessionName}_Hours_Report.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: 'Overview CSV exported successfully' });
  };

  const [isFullExporting, setIsFullExporting] = useState(false);

  const exportFullCSV = async () => {
    if (!selectedSessionId) return;
    setIsFullExporting(true);
    try {
      const response = await fetch(`/api/reports/${selectedSessionId}/full-export`, { credentials: 'include' });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: 'Export failed' }));
        throw new Error(err.message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const contentDisposition = response.headers.get('content-disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      link.download = filenameMatch?.[1] || 'Full_Export.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: 'Full export downloaded successfully' });
    } catch (error: any) {
      toast({ title: 'Full export failed', description: error.message, variant: 'destructive' });
    } finally {
      setIsFullExporting(false);
    }
  };

  if (!canAccessReports) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Reports</h1>
          <p className="text-gray-600 dark:text-gray-400">
            You do not have permission to access reports.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        {!embedded && (
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Reports</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Daily hours reports by personnel and equipment
                </p>
              </div>
            </div>
          </div>
        )}

        {!embedded && (
          <Card>
            <CardHeader>
              <CardTitle>Select Storm Session</CardTitle>
              <CardDescription>Choose a session to view reports</CardDescription>
            </CardHeader>
            <CardContent>
              <select
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                value={selectedSessionId}
                onChange={(e) => { setSelectedSessionId(e.target.value); setHasUserSelectedSession(true); }}
              >
                <option value="">Select a session...</option>
                {sessions?.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name} ({new Date(session.startDate).toLocaleDateString()})
                    {activeSession?.id === session.id ? ' ⭐ ACTIVE' : ''}
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>
        )}

        {selectedSessionId && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {sessionCompanies.length} contractor{sessionCompanies.length !== 1 ? 's' : ''} with data in this session
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={exportToCSV}
                  disabled={!personnelReport.length && !equipmentReport.length}
                  data-testid="button-export-overview"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Overview Export
                </Button>
                <Button
                  onClick={exportFullCSV}
                  disabled={isFullExporting}
                  data-testid="button-export-full"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {isFullExporting ? 'Exporting...' : 'Full Export'}
                </Button>
              </div>
            </div>

            {timesheetsLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600 dark:text-gray-400">Loading report data...</p>
              </div>
            ) : !approvedTimesheets?.length ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-gray-600 dark:text-gray-400">
                    No approved timesheets found for this session. Only approved timesheets are included in reports.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Tabs defaultValue="personnel" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="personnel" data-testid="tab-personnel">
                    <Users className="w-4 h-4 mr-2" />
                    Personnel ({personnelReport.length})
                  </TabsTrigger>
                  <TabsTrigger value="equipment" data-testid="tab-equipment">
                    <Wrench className="w-4 h-4 mr-2" />
                    Equipment ({equipmentReport.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="personnel">
                  {personnelByCompany.length === 0 ? (
                    <Card>
                      <CardContent className="py-8">
                        <p className="text-center text-gray-600 dark:text-gray-400">No personnel data available.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-6">
                      {personnelByCompany.map(group => (
                        <Card key={group.companyName}>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-lg">{group.companyName}</CardTitle>
                            <CardDescription>
                              {group.rows.length} personnel | Total: {group.totals.totalHours.toFixed(2)} hours
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="sticky left-0 bg-white dark:bg-gray-950 z-10 min-w-[180px]">Employee Name</TableHead>
                                    <TableHead className="min-w-[120px]">Classification</TableHead>
                                    {allDates.map(date => (
                                      <TableHead key={date} className="text-right min-w-[80px]">{date}</TableHead>
                                    ))}
                                    <TableHead className="text-right font-bold min-w-[90px]">Total</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {group.rows.map((person, idx) => (
                                    <TableRow key={idx}>
                                      <TableCell className="sticky left-0 bg-white dark:bg-gray-950 font-medium">
                                        {person.employeeName}
                                      </TableCell>
                                      <TableCell>{person.classification}</TableCell>
                                      {allDates.map(date => (
                                        <TableCell key={date} className="text-right">
                                          {person.dailyHours[date]?.toFixed(2) || '-'}
                                        </TableCell>
                                      ))}
                                      <TableCell className="text-right font-bold">
                                        {person.totalHours.toFixed(2)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                  <TableRow className="bg-gray-100 dark:bg-gray-900 font-semibold">
                                    <TableCell className="sticky left-0 bg-gray-100 dark:bg-gray-900">
                                      Subtotal
                                    </TableCell>
                                    <TableCell></TableCell>
                                    {allDates.map(date => (
                                      <TableCell key={date} className="text-right">
                                        {(group.totals.dailyHours[date] || 0).toFixed(2)}
                                      </TableCell>
                                    ))}
                                    <TableCell className="text-right font-bold">
                                      {group.totals.totalHours.toFixed(2)}
                                    </TableCell>
                                  </TableRow>
                                </TableBody>
                              </Table>
                            </div>
                          </CardContent>
                        </Card>
                      ))}

                      <Card className="border-2 border-blue-200 dark:border-blue-800">
                        <CardContent className="py-4">
                          <div className="flex justify-between items-center">
                            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                              Grand Total - All Personnel
                            </span>
                            <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                              {grandTotalPersonnel.toFixed(2)} hours
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="equipment">
                  {equipmentByCompany.length === 0 ? (
                    <Card>
                      <CardContent className="py-8">
                        <p className="text-center text-gray-600 dark:text-gray-400">No equipment data available.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-6">
                      {equipmentByCompany.map(group => (
                        <Card key={group.companyName}>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-lg">{group.companyName}</CardTitle>
                            <CardDescription>
                              {group.rows.length} equipment items | Total: {group.totals.totalHours.toFixed(2)} hours
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="sticky left-0 bg-white dark:bg-gray-950 z-10 min-w-[200px]">Equipment Description</TableHead>
                                    <TableHead className="min-w-[120px]">Equipment #</TableHead>
                                    {allDates.map(date => (
                                      <TableHead key={date} className="text-right min-w-[80px]">{date}</TableHead>
                                    ))}
                                    <TableHead className="text-right font-bold min-w-[90px]">Total</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {group.rows.map((equip, idx) => (
                                    <TableRow key={idx}>
                                      <TableCell className="sticky left-0 bg-white dark:bg-gray-950 font-medium">
                                        {equip.equipmentDescription}
                                      </TableCell>
                                      <TableCell>{equip.equipmentNumber || 'N/A'}</TableCell>
                                      {allDates.map(date => (
                                        <TableCell key={date} className="text-right">
                                          {equip.dailyHours[date]?.toFixed(2) || '-'}
                                        </TableCell>
                                      ))}
                                      <TableCell className="text-right font-bold">
                                        {equip.totalHours.toFixed(2)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                  <TableRow className="bg-gray-100 dark:bg-gray-900 font-semibold">
                                    <TableCell className="sticky left-0 bg-gray-100 dark:bg-gray-900">
                                      Subtotal
                                    </TableCell>
                                    <TableCell></TableCell>
                                    {allDates.map(date => (
                                      <TableCell key={date} className="text-right">
                                        {(group.totals.dailyHours[date] || 0).toFixed(2)}
                                      </TableCell>
                                    ))}
                                    <TableCell className="text-right font-bold">
                                      {group.totals.totalHours.toFixed(2)}
                                    </TableCell>
                                  </TableRow>
                                </TableBody>
                              </Table>
                            </div>
                          </CardContent>
                        </Card>
                      ))}

                      <Card className="border-2 border-blue-200 dark:border-blue-800">
                        <CardContent className="py-4">
                          <div className="flex justify-between items-center">
                            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                              Grand Total - All Equipment
                            </span>
                            <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                              {grandTotalEquipment.toFixed(2)} hours
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </>
        )}
      </div>
    </div>
  );
}
