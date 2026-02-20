import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowLeft, Plus, Edit, Trash2, CheckCircle, XCircle, Upload, Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { useActiveSession } from '@/context/ActiveSessionContext';
import { useEmbedded } from '@/context/EmbeddedContext';
import { getJson, postJson, patchJson, deleteJson, queryClient } from '@/lib/queryClient';
import type { Expense, InsertExpense, ExpenseFile, StormSession, Company, Roster, Crew } from '@shared/schema';
import { Badge } from '@/components/ui/badge';

const EXPENSE_CATEGORIES = [
  'Fuel',
  'Lodging',
  'Meals',
  'Equipment Rental',
  'Vehicle Rental',
  'Tools',
  'Materials',
  'Other'
];

export default function ExpensesPage() {
  const { user, logout } = useAuth();
  const { activeSession } = useActiveSession();
  const { embedded, sessionId: embeddedSessionId } = useEmbedded();
  const { toast } = useToast();
  
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [hasUserSelectedSession, setHasUserSelectedSession] = useState(false);
  const [isCreateExpenseOpen, setIsCreateExpenseOpen] = useState(false);
  const [isEditExpenseOpen, setIsEditExpenseOpen] = useState(false);
  const [isDeleteExpenseOpen, setIsDeleteExpenseOpen] = useState(false);
  const [isUploadFileOpen, setIsUploadFileOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [expenseFormData, setExpenseFormData] = useState<Partial<InsertExpense>>({
    sessionId: '',
    companyId: '',
    crewId: null,
    date: new Date(),
    category: 'Fuel',
    amountCents: 0,
    currency: 'USD',
    notes: '',
    status: 'SUBMITTED',
    submittedBy: '',
  });

  const resetExpenseForm = () => {
    setExpenseFormData({
      sessionId: selectedSessionId || '',
      companyId: user?.companyId || '',
      crewId: null,
      date: new Date(),
      category: 'Fuel',
      amountCents: 0,
      currency: 'USD',
      notes: '',
      status: 'SUBMITTED',
      submittedBy: user?.id || '',
    });
  };

  const canManageExpenses = user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'CONTRACTOR' || user?.role === 'UTILITY';
  const canApproveExpenses = user?.role === 'UTILITY';

  // Fetch sessions
  const { data: sessions } = useQuery<StormSession[]>({
    queryKey: ['/api/storm-sessions'],
  });

  const { data: companies, isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ['/api/companies'],
  });

  const { data: sessionRosters } = useQuery<Roster[]>({
    queryKey: ['/api/rosters', selectedSessionId],
    queryFn: () => selectedSessionId ? getJson<Roster[]>(`/api/rosters?sessionId=${selectedSessionId}`) : Promise.resolve([]),
    enabled: !!selectedSessionId,
  });

  const allRosterIds = sessionRosters?.map(r => r.id) || [];

  const { data: allCrewsByRoster } = useQuery<{ rosterId: string; companyId: string; crews: Crew[] }[]>({
    queryKey: ['/api/all-session-crews', selectedSessionId, allRosterIds],
    queryFn: async () => {
      if (!sessionRosters || sessionRosters.length === 0) return [];
      const results = await Promise.all(
        sessionRosters.map(async (roster) => {
          const crews = await getJson<Crew[]>(`/api/rosters/${roster.id}/crews`);
          return { rosterId: roster.id, companyId: roster.companyId, crews };
        })
      );
      return results;
    },
    enabled: !!sessionRosters && sessionRosters.length > 0,
  });

  const allSessionCrews = allCrewsByRoster?.flatMap(r => r.crews) || [];
  const uniqueAllCrews = allSessionCrews.filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);

  const crewsForSelectedCompany = allCrewsByRoster
    ?.filter(r => r.companyId === expenseFormData.companyId)
    ?.flatMap(r => r.crews)
    ?.filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i) || [];
  const uniqueCrews = crewsForSelectedCompany;

  const companyNameMap = new Map<string, string>();
  companies?.forEach(c => companyNameMap.set(c.id, c.name));

  const crewNameMap = new Map<string, string>();
  uniqueAllCrews.forEach(c => crewNameMap.set(c.id, c.crewName));

  // Fetch expenses for selected session
  const { data: expenses, isLoading: expensesLoading } = useQuery<Expense[]>({
    queryKey: ['/api/expenses', selectedSessionId],
    queryFn: () => selectedSessionId ? getJson<Expense[]>(`/api/expenses?sessionId=${selectedSessionId}`) : Promise.resolve([]),
    enabled: !!selectedSessionId,
  });

  // Fetch files for an expense
  const useExpenseFiles = (expenseId: string) => {
    return useQuery<ExpenseFile[]>({
      queryKey: ['/api/expenses', expenseId, 'files'],
      queryFn: () => getJson<ExpenseFile[]>(`/api/expenses/${expenseId}/files`),
      enabled: !!expenseId,
    });
  };

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

  // Create expense mutation
  const createExpenseMutation = useMutation({
    mutationFn: async (data: Partial<InsertExpense>) => {
      const cleanedData = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== undefined)
      );
      return postJson('/api/expenses', cleanedData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/expenses', selectedSessionId] });
      toast({ title: 'Expense created successfully' });
      setIsCreateExpenseOpen(false);
      resetExpenseForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create expense', description: error.message, variant: 'destructive' });
    },
  });

  // Update expense mutation
  const updateExpenseMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertExpense> }) => {
      const cleanedData = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== undefined)
      );
      return patchJson(`/api/expenses/${id}`, cleanedData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/expenses', selectedSessionId] });
      toast({ title: 'Expense updated successfully' });
      setIsEditExpenseOpen(false);
      setSelectedExpense(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update expense', description: error.message, variant: 'destructive' });
    },
  });

  // Delete expense mutation
  const deleteExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      return deleteJson(`/api/expenses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/expenses', selectedSessionId] });
      toast({ title: 'Expense deleted successfully' });
      setIsDeleteExpenseOpen(false);
      setSelectedExpense(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete expense', description: error.message, variant: 'destructive' });
    },
  });

  // Approve expense mutation
  const approveExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      return postJson(`/api/expenses/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/expenses', selectedSessionId] });
      toast({ title: 'Expense approved successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to approve expense', description: error.message, variant: 'destructive' });
    },
  });

  // Reject expense mutation
  const rejectExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      return postJson(`/api/expenses/${id}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/expenses', selectedSessionId] });
      toast({ title: 'Expense rejected successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to reject expense', description: error.message, variant: 'destructive' });
    },
  });

  // Upload file mutation
  const uploadFileMutation = useMutation({
    mutationFn: async ({ expenseId, file }: { expenseId: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      return fetch(`/api/expenses/${expenseId}/files`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      }).then(res => {
        if (!res.ok) throw new Error('Upload failed');
        return res.json();
      });
    },
    onSuccess: (_, { expenseId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/expenses', expenseId, 'files'] });
      toast({ title: 'File uploaded successfully' });
      setIsUploadFileOpen(false);
      setSelectedFile(null);
      setSelectedExpense(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to upload file', description: error.message, variant: 'destructive' });
    },
  });

  const handleCreateExpense = () => {
    if (!expenseFormData.companyId) {
      toast({ title: 'Please select a contractor', variant: 'destructive' });
      return;
    }
    if (!expenseFormData.date || !expenseFormData.category || expenseFormData.amountCents === undefined) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }
    createExpenseMutation.mutate(expenseFormData);
  };

  const handleEditExpense = (expense: Expense) => {
    setSelectedExpense(expense);
    setExpenseFormData({
      sessionId: expense.sessionId,
      companyId: expense.companyId,
      crewId: expense.crewId || null,
      date: new Date(expense.date),
      category: expense.category,
      amountCents: expense.amountCents,
      currency: expense.currency,
      notes: expense.notes ?? '',
      status: expense.status,
      submittedBy: expense.submittedBy,
    });
    setIsEditExpenseOpen(true);
  };

  const handleUpdateExpense = () => {
    if (!selectedExpense) return;
    const { sessionId, submittedBy, ...updateData } = expenseFormData;
    updateExpenseMutation.mutate({ id: selectedExpense.id, data: updateData });
  };

  const handleDeleteExpense = (expense: Expense) => {
    setSelectedExpense(expense);
    setIsDeleteExpenseOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!selectedExpense) return;
    deleteExpenseMutation.mutate(selectedExpense.id);
  };

  const handleApprove = (expense: Expense) => {
    approveExpenseMutation.mutate(expense.id);
  };

  const handleReject = (expense: Expense) => {
    rejectExpenseMutation.mutate(expense.id);
  };

  const handleUploadFile = (expense: Expense) => {
    setSelectedExpense(expense);
    setIsUploadFileOpen(true);
  };

  const handleConfirmUpload = () => {
    if (!selectedExpense || !selectedFile) return;
    uploadFileMutation.mutate({ expenseId: selectedExpense.id, file: selectedFile });
  };

  const formatCurrency = (cents: number, currency: string) => {
    const dollars = cents / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(dollars);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Approved</Badge>;
      case 'REJECTED':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">Rejected</Badge>;
      case 'SUBMITTED':
      default:
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">Submitted</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        {!embedded && (
          <div className="mb-6 flex items-center gap-4">
            <Link href="/" data-testid="link-back">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Expenses</h1>
              <p className="text-gray-600 dark:text-gray-400">Track expenses and receipts</p>
            </div>
          </div>
        )}

        {!embedded && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Select Session</CardTitle>
              <CardDescription>Choose a storm session to view expenses</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
                <SelectTrigger data-testid="select-session">
                  <SelectValue placeholder="Select session" />
                </SelectTrigger>
                <SelectContent>
                  {sessions?.map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      {session.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* Expenses List */}
        {selectedSessionId && (
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base sm:text-lg">Expenses</CardTitle>
                  <CardDescription>Expense submissions for the selected session</CardDescription>
                </div>
                {canManageExpenses && (
                  <Button 
                    onClick={() => {
                      resetExpenseForm();
                      setIsCreateExpenseOpen(true);
                    }} 
                    disabled={user?.role === 'UTILITY' && companiesLoading}
                    data-testid="button-create-expense"
                    size="sm"
                    className="w-full sm:w-auto"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Submit Expense
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {expensesLoading ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading expenses...</div>
              ) : expenses && expenses.length > 0 ? (
                <div className="space-y-4">
                  {expenses.map((expense) => (
                    <ExpenseCard
                      key={expense.id}
                      expense={expense}
                      onEdit={handleEditExpense}
                      onDelete={handleDeleteExpense}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      onUploadFile={handleUploadFile}
                      canEdit={canManageExpenses && expense.status === 'SUBMITTED'}
                      canApprove={canApproveExpenses && expense.status === 'SUBMITTED'}
                      formatCurrency={formatCurrency}
                      getStatusBadge={getStatusBadge}
                      useExpenseFiles={useExpenseFiles}
                      companyNameMap={companyNameMap}
                      crewNameMap={crewNameMap}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No expenses found. Create one to get started.
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Create Expense Dialog */}
        <Dialog open={isCreateExpenseOpen} onOpenChange={setIsCreateExpenseOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Submit New Expense</DialogTitle>
              <DialogDescription>Create a new expense submission.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="companyId">Contractor *</Label>
                <Select
                  value={expenseFormData.companyId || ''}
                  onValueChange={(value) => setExpenseFormData({ ...expenseFormData, companyId: value, crewId: null })}
                >
                  <SelectTrigger id="companyId" data-testid="select-company">
                    <SelectValue placeholder="Select contractor" />
                  </SelectTrigger>
                  <SelectContent>
                    {(user?.role === 'CONTRACTOR' && user?.companyId
                      ? companies?.filter(c => c.id === user.companyId)
                      : companies
                    )?.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {expenseFormData.companyId && uniqueCrews.length > 0 && (
                <div className="grid gap-2">
                  <Label htmlFor="crewId">Crew</Label>
                  <Select
                    value={expenseFormData.crewId || '_none'}
                    onValueChange={(value) => setExpenseFormData({ ...expenseFormData, crewId: value === '_none' ? null : value })}
                  >
                    <SelectTrigger id="crewId" data-testid="select-crew">
                      <SelectValue placeholder="Select crew (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">No specific crew</SelectItem>
                      {uniqueCrews.map((crew) => (
                        <SelectItem key={crew.id} value={crew.id}>
                          {crew.crewName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={expenseFormData.date ? new Date(expenseFormData.date).toISOString().split('T')[0] : ''}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, date: new Date(e.target.value) })}
                  data-testid="input-date"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">Category *</Label>
                <Select value={expenseFormData.category} onValueChange={(value) => setExpenseFormData({ ...expenseFormData, category: value })}>
                  <SelectTrigger id="category" data-testid="select-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="amount">Amount *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={expenseFormData.amountCents ? (expenseFormData.amountCents / 100).toFixed(2) : ''}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, amountCents: Math.round(parseFloat(e.target.value || '0') * 100) })}
                  placeholder="0.00"
                  data-testid="input-amount"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={expenseFormData.notes ?? ''}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, notes: e.target.value })}
                  placeholder="Additional details..."
                  data-testid="textarea-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateExpenseOpen(false)} data-testid="button-cancel">
                Cancel
              </Button>
              <Button onClick={handleCreateExpense} disabled={createExpenseMutation.isPending} data-testid="button-submit">
                {createExpenseMutation.isPending ? 'Creating...' : 'Submit Expense'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Expense Dialog */}
        <Dialog open={isEditExpenseOpen} onOpenChange={setIsEditExpenseOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Expense</DialogTitle>
              <DialogDescription>Update expense details.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-companyId">Contractor *</Label>
                <Select
                  value={expenseFormData.companyId || ''}
                  onValueChange={(value) => setExpenseFormData({ ...expenseFormData, companyId: value, crewId: null })}
                >
                  <SelectTrigger id="edit-companyId" data-testid="select-edit-company">
                    <SelectValue placeholder="Select contractor" />
                  </SelectTrigger>
                  <SelectContent>
                    {(user?.role === 'CONTRACTOR' && user?.companyId
                      ? companies?.filter(c => c.id === user.companyId)
                      : companies
                    )?.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {expenseFormData.companyId && uniqueCrews.length > 0 && (
                <div className="grid gap-2">
                  <Label htmlFor="edit-crewId">Crew</Label>
                  <Select
                    value={expenseFormData.crewId || '_none'}
                    onValueChange={(value) => setExpenseFormData({ ...expenseFormData, crewId: value === '_none' ? null : value })}
                  >
                    <SelectTrigger id="edit-crewId" data-testid="select-edit-crew">
                      <SelectValue placeholder="Select crew (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">No specific crew</SelectItem>
                      {uniqueCrews.map((crew) => (
                        <SelectItem key={crew.id} value={crew.id}>
                          {crew.crewName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="edit-date">Date *</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={expenseFormData.date ? new Date(expenseFormData.date).toISOString().split('T')[0] : ''}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, date: new Date(e.target.value) })}
                  data-testid="input-edit-date"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-category">Category *</Label>
                <Select value={expenseFormData.category} onValueChange={(value) => setExpenseFormData({ ...expenseFormData, category: value })}>
                  <SelectTrigger id="edit-category" data-testid="select-edit-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-amount">Amount *</Label>
                <Input
                  id="edit-amount"
                  type="number"
                  step="0.01"
                  value={expenseFormData.amountCents ? (expenseFormData.amountCents / 100).toFixed(2) : ''}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, amountCents: Math.round(parseFloat(e.target.value || '0') * 100) })}
                  data-testid="input-edit-amount"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={expenseFormData.notes ?? ''}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, notes: e.target.value })}
                  data-testid="textarea-edit-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditExpenseOpen(false)} data-testid="button-cancel-edit">
                Cancel
              </Button>
              <Button onClick={handleUpdateExpense} disabled={updateExpenseMutation.isPending} data-testid="button-update">
                {updateExpenseMutation.isPending ? 'Updating...' : 'Update Expense'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Expense Dialog */}
        <Dialog open={isDeleteExpenseOpen} onOpenChange={setIsDeleteExpenseOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Expense</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this expense? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteExpenseOpen(false)} data-testid="button-cancel-delete">
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleteExpenseMutation.isPending} data-testid="button-confirm-delete">
                {deleteExpenseMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Upload File Dialog */}
        <Dialog open={isUploadFileOpen} onOpenChange={setIsUploadFileOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Upload Receipt</DialogTitle>
              <DialogDescription>Upload a receipt or supporting document for this expense.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="file">File *</Label>
                <Input
                  id="file"
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  data-testid="input-file"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsUploadFileOpen(false)} data-testid="button-cancel-upload">
                Cancel
              </Button>
              <Button onClick={handleConfirmUpload} disabled={!selectedFile || uploadFileMutation.isPending} data-testid="button-upload">
                {uploadFileMutation.isPending ? 'Uploading...' : 'Upload'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function ExpenseCard({
  expense,
  onEdit,
  onDelete,
  onApprove,
  onReject,
  onUploadFile,
  canEdit,
  canApprove,
  formatCurrency,
  getStatusBadge,
  useExpenseFiles,
  companyNameMap,
  crewNameMap,
}: {
  expense: Expense;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  onApprove: (expense: Expense) => void;
  onReject: (expense: Expense) => void;
  onUploadFile: (expense: Expense) => void;
  canEdit: boolean;
  canApprove: boolean;
  formatCurrency: (cents: number, currency: string) => string;
  getStatusBadge: (status: string) => JSX.Element;
  useExpenseFiles: (expenseId: string) => { data?: ExpenseFile[]; isLoading: boolean };
  companyNameMap: Map<string, string>;
  crewNameMap: Map<string, string>;
}) {
  const { data: files, isLoading: filesLoading } = useExpenseFiles(expense.id);
  const companyName = companyNameMap.get(expense.companyId) || 'Unknown';
  const crewName = expense.crewId ? crewNameMap.get(expense.crewId) : null;

  return (
    <div className="border dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow" data-testid={`card-expense-${expense.id}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900 dark:text-white">{expense.category}</h3>
            {getStatusBadge(expense.status)}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {new Date(expense.date).toLocaleDateString()} • {formatCurrency(expense.amountCents, expense.currency)}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {companyName}{crewName ? ` • Crew: ${crewName}` : ''}
          </p>
          {expense.notes && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{expense.notes}</p>
          )}
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <>
              <Button variant="ghost" size="icon" onClick={() => onEdit(expense)} data-testid={`button-edit-${expense.id}`}>
                <Edit className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onDelete(expense)} data-testid={`button-delete-${expense.id}`}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
          {canApprove && (
            <>
              <Button variant="ghost" size="icon" onClick={() => onApprove(expense)} className="text-green-600 hover:text-green-700" data-testid={`button-approve-${expense.id}`}>
                <CheckCircle className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onReject(expense)} className="text-red-600 hover:text-red-700" data-testid={`button-reject-${expense.id}`}>
                <XCircle className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>
      
      {/* Files Section */}
      <div className="mt-3 pt-3 border-t dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Receipts & Documents</h4>
          <Button variant="ghost" size="sm" onClick={() => onUploadFile(expense)} data-testid={`button-upload-file-${expense.id}`}>
            <Upload className="w-3 h-3 mr-1" />
            Upload
          </Button>
        </div>
        {filesLoading ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">Loading files...</p>
        ) : files && files.length > 0 ? (
          <div className="space-y-1">
            {files.map((file) => (
              <div key={file.id} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <FileText className="w-3 h-3" />
                <span className="flex-1 truncate">{file.originalName}</span>
                <a 
                  href={`/api/expenses/${expense.id}/files/${file.id}/download`}
                  download
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  data-testid={`link-download-${file.id}`}
                >
                  <Download className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">No files uploaded</p>
        )}
      </div>
    </div>
  );
}
