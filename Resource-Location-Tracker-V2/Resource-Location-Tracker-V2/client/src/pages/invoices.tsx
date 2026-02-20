import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowLeft, Plus, Edit, Trash2, Send, DollarSign, ChevronDown, ChevronRight, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { useEmbedded } from '@/context/EmbeddedContext';
import { getJson, postJson, patchJson, deleteJson, queryClient } from '@/lib/queryClient';
import type { Invoice, InsertInvoice, InvoiceLine, InsertInvoiceLine, StormSession, Company } from '@shared/schema';
import { Badge } from '@/components/ui/badge';

export default function InvoicesPage() {
  const { user, logout } = useAuth();
  const { embedded, sessionId: embeddedSessionId } = useEmbedded();
  const { toast } = useToast();
  
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());
  const [isCreateInvoiceOpen, setIsCreateInvoiceOpen] = useState(false);
  const [isEditInvoiceOpen, setIsEditInvoiceOpen] = useState(false);
  const [isDeleteInvoiceOpen, setIsDeleteInvoiceOpen] = useState(false);
  const [isAddLineOpen, setIsAddLineOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceFormData, setInvoiceFormData] = useState<Partial<InsertInvoice>>({
    sessionId: '',
    companyId: '',
    status: 'DRAFT',
    issuedAt: undefined,
    dueAt: undefined,
    totalsJson: undefined,
  });
  const [lineFormData, setLineFormData] = useState<Partial<InsertInvoiceLine>>({
    invoiceId: '',
    source: 'TIMESHEET',
    sourceId: undefined,
    description: '',
    qty: 1,
    unitRateCents: 0,
    amountCents: 0,
  });

  const resetInvoiceForm = () => {
    setInvoiceFormData({
      sessionId: selectedSessionId || '',
      companyId: '',
      status: 'DRAFT',
      issuedAt: undefined,
      dueAt: undefined,
      totalsJson: undefined,
    });
  };

  const resetLineForm = () => {
    setLineFormData({
      invoiceId: '',
      source: 'TIMESHEET',
      sourceId: undefined,
      description: '',
      qty: 1,
      unitRateCents: 0,
      amountCents: 0,
    });
  };

  const canManageInvoices = user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'CONTRACTOR' || user?.role === 'UTILITY';

  // Fetch sessions
  const { data: sessions } = useQuery<StormSession[]>({
    queryKey: ['/api/storm-sessions'],
  });

  // Fetch companies (for company selector)
  const { data: companies, isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ['/api/companies'],
    enabled: canManageInvoices,
  });

  // Fetch invoices for selected session
  const { data: invoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ['/api/invoices', selectedSessionId],
    queryFn: () => selectedSessionId ? getJson<Invoice[]>(`/api/invoices?sessionId=${selectedSessionId}`) : Promise.resolve([]),
    enabled: !!selectedSessionId,
  });


  // Auto-select first session if available
  useEffect(() => {
    if (embedded && embeddedSessionId) {
      setSelectedSessionId(embeddedSessionId);
      return;
    }
    if (sessions && sessions.length > 0 && !selectedSessionId) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [embedded, embeddedSessionId, sessions, selectedSessionId]);

  // Create invoice mutation
  const createInvoiceMutation = useMutation({
    mutationFn: async (data: Partial<InsertInvoice>) => {
      const cleanedData = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== undefined)
      );
      return postJson('/api/invoices', cleanedData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', selectedSessionId] });
      toast({ title: 'Invoice created successfully' });
      setIsCreateInvoiceOpen(false);
      resetInvoiceForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create invoice', description: error.message, variant: 'destructive' });
    },
  });

  // Update invoice mutation
  const updateInvoiceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertInvoice> }) => {
      const cleanedData = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== undefined)
      );
      return patchJson(`/api/invoices/${id}`, cleanedData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', selectedSessionId] });
      toast({ title: 'Invoice updated successfully' });
      setIsEditInvoiceOpen(false);
      setSelectedInvoice(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update invoice', description: error.message, variant: 'destructive' });
    },
  });

  // Delete invoice mutation
  const deleteInvoiceMutation = useMutation({
    mutationFn: async (id: string) => {
      return deleteJson(`/api/invoices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', selectedSessionId] });
      toast({ title: 'Invoice deleted successfully' });
      setIsDeleteInvoiceOpen(false);
      setSelectedInvoice(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete invoice', description: error.message, variant: 'destructive' });
    },
  });

  // Issue invoice mutation
  const issueInvoiceMutation = useMutation({
    mutationFn: async (id: string) => {
      return postJson(`/api/invoices/${id}/issue`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', selectedSessionId] });
      toast({ title: 'Invoice issued successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to issue invoice', description: error.message, variant: 'destructive' });
    },
  });

  // Mark paid mutation
  const markPaidMutation = useMutation({
    mutationFn: async (id: string) => {
      return postJson(`/api/invoices/${id}/mark-paid`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', selectedSessionId] });
      toast({ title: 'Invoice marked as paid successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to mark invoice as paid', description: error.message, variant: 'destructive' });
    },
  });

  // Add invoice line mutation
  const addLineMutation = useMutation({
    mutationFn: async ({ invoiceId, data }: { invoiceId: string; data: Partial<InsertInvoiceLine> }) => {
      const cleanedData = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== undefined)
      );
      return postJson(`/api/invoices/${invoiceId}/lines`, cleanedData);
    },
    onSuccess: (_, { invoiceId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', invoiceId, 'lines'] });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', selectedSessionId] });
      toast({ title: 'Invoice line added successfully' });
      setIsAddLineOpen(false);
      resetLineForm();
      setSelectedInvoice(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to add invoice line', description: error.message, variant: 'destructive' });
    },
  });

  const handleCreateInvoice = () => {
    if (!invoiceFormData.companyId) {
      toast({ title: 'Company assignment required', variant: 'destructive' });
      return;
    }
    createInvoiceMutation.mutate(invoiceFormData);
  };

  const handleEditInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setInvoiceFormData({
      sessionId: invoice.sessionId,
      companyId: invoice.companyId,
      status: invoice.status,
      issuedAt: invoice.issuedAt ? new Date(invoice.issuedAt) : undefined,
      dueAt: invoice.dueAt ? new Date(invoice.dueAt) : undefined,
      totalsJson: invoice.totalsJson,
    });
    setIsEditInvoiceOpen(true);
  };

  const handleUpdateInvoice = () => {
    if (!selectedInvoice) return;
    const { sessionId, companyId, ...updateData } = invoiceFormData;
    updateInvoiceMutation.mutate({ id: selectedInvoice.id, data: updateData });
  };

  const handleDeleteInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsDeleteInvoiceOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!selectedInvoice) return;
    deleteInvoiceMutation.mutate(selectedInvoice.id);
  };

  const handleIssue = (invoice: Invoice) => {
    issueInvoiceMutation.mutate(invoice.id);
  };

  const handleMarkPaid = (invoice: Invoice) => {
    markPaidMutation.mutate(invoice.id);
  };

  const handleAddLine = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setLineFormData({
      invoiceId: invoice.id,
      source: 'TIMESHEET',
      sourceId: undefined,
      description: '',
      qty: 1,
      unitRateCents: 0,
      amountCents: 0,
    });
    setIsAddLineOpen(true);
  };

  const handleSubmitLine = () => {
    if (!selectedInvoice) return;
    if (!lineFormData.description || lineFormData.qty === undefined || lineFormData.unitRateCents === undefined) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }
    // Calculate amountCents from qty and unitRateCents
    const calculatedAmount = (lineFormData.qty || 0) * (lineFormData.unitRateCents || 0);
    addLineMutation.mutate({
      invoiceId: selectedInvoice.id,
      data: { ...lineFormData, amountCents: calculatedAmount },
    });
  };

  const toggleInvoice = (invoiceId: string) => {
    setExpandedInvoices(prev => {
      const next = new Set(prev);
      if (next.has(invoiceId)) {
        next.delete(invoiceId);
      } else {
        next.add(invoiceId);
      }
      return next;
    });
  };

  const formatCurrency = (cents: number) => {
    const dollars = cents / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(dollars);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Paid</Badge>;
      case 'ISSUED':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">Issued</Badge>;
      case 'DRAFT':
      default:
        return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100">Draft</Badge>;
    }
  };

  const calculateInvoiceTotal = (lines: InvoiceLine[] | undefined) => {
    if (!lines) return 0;
    return lines.reduce((sum, line) => sum + line.amountCents, 0);
  };

  if (!canManageInvoices) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Invoices</h1>
          <p className="text-gray-600 dark:text-gray-400">
            You do not have permission to access invoice management.
          </p>
        </div>
      </div>
    );
  }

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
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Invoices</h1>
              <p className="text-gray-600 dark:text-gray-400">Generate and manage invoices</p>
            </div>
          </div>
        )}

        {!embedded && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Select Session</CardTitle>
              <CardDescription>Choose a storm session to view invoices</CardDescription>
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

        {/* Invoices List */}
        {selectedSessionId && (
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base sm:text-lg">Invoices</CardTitle>
                  <CardDescription>Generated invoices for the selected session</CardDescription>
                </div>
                <Button 
                  onClick={() => {
                    resetInvoiceForm();
                    setIsCreateInvoiceOpen(true);
                  }} 
                  disabled={companiesLoading}
                  data-testid="button-create-invoice"
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Invoice
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {invoicesLoading ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading invoices...</div>
              ) : invoices && invoices.length > 0 ? (
                <div className="space-y-4">
                  {invoices.map((invoice) => (
                    <InvoiceCard
                      key={invoice.id}
                      invoice={invoice}
                      isExpanded={expandedInvoices.has(invoice.id)}
                      onToggle={() => toggleInvoice(invoice.id)}
                      onEdit={handleEditInvoice}
                      onDelete={handleDeleteInvoice}
                      onIssue={handleIssue}
                      onMarkPaid={handleMarkPaid}
                      onAddLine={handleAddLine}
                      getStatusBadge={getStatusBadge}
                      formatCurrency={formatCurrency}
                      companies={companies}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No invoices found. Create one to get started.
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Create Invoice Dialog */}
        <Dialog open={isCreateInvoiceOpen} onOpenChange={setIsCreateInvoiceOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Invoice</DialogTitle>
              <DialogDescription>Create a new invoice for billing.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="companyId">Company *</Label>
                <Select value={invoiceFormData.companyId} onValueChange={(value) => setInvoiceFormData({ ...invoiceFormData, companyId: value })}>
                  <SelectTrigger id="companyId" data-testid="select-company">
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies?.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dueAt">Due Date</Label>
                <Input
                  id="dueAt"
                  type="date"
                  value={invoiceFormData.dueAt ? new Date(invoiceFormData.dueAt).toISOString().split('T')[0] : ''}
                  onChange={(e) => setInvoiceFormData({ ...invoiceFormData, dueAt: e.target.value ? new Date(e.target.value) : undefined })}
                  data-testid="input-due-date"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateInvoiceOpen(false)} data-testid="button-cancel">
                Cancel
              </Button>
              <Button onClick={handleCreateInvoice} disabled={createInvoiceMutation.isPending} data-testid="button-submit">
                {createInvoiceMutation.isPending ? 'Creating...' : 'Create Invoice'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Invoice Dialog */}
        <Dialog open={isEditInvoiceOpen} onOpenChange={setIsEditInvoiceOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Invoice</DialogTitle>
              <DialogDescription>Update invoice details.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-dueAt">Due Date</Label>
                <Input
                  id="edit-dueAt"
                  type="date"
                  value={invoiceFormData.dueAt ? new Date(invoiceFormData.dueAt).toISOString().split('T')[0] : ''}
                  onChange={(e) => setInvoiceFormData({ ...invoiceFormData, dueAt: e.target.value ? new Date(e.target.value) : undefined })}
                  data-testid="input-edit-due-date"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditInvoiceOpen(false)} data-testid="button-cancel-edit">
                Cancel
              </Button>
              <Button onClick={handleUpdateInvoice} disabled={updateInvoiceMutation.isPending} data-testid="button-update">
                {updateInvoiceMutation.isPending ? 'Updating...' : 'Update Invoice'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Invoice Dialog */}
        <Dialog open={isDeleteInvoiceOpen} onOpenChange={setIsDeleteInvoiceOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Invoice</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this invoice? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteInvoiceOpen(false)} data-testid="button-cancel-delete">
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleteInvoiceMutation.isPending} data-testid="button-confirm-delete">
                {deleteInvoiceMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Invoice Line Dialog */}
        <Dialog open={isAddLineOpen} onOpenChange={setIsAddLineOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Invoice Line</DialogTitle>
              <DialogDescription>Add a line item to the invoice.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="line-source">Source *</Label>
                <Select value={lineFormData.source} onValueChange={(value) => setLineFormData({ ...lineFormData, source: value })}>
                  <SelectTrigger id="line-source" data-testid="select-line-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TIMESHEET">Timesheet</SelectItem>
                    <SelectItem value="EXPENSE">Expense</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="line-description">Description *</Label>
                <Textarea
                  id="line-description"
                  value={lineFormData.description ?? ''}
                  onChange={(e) => setLineFormData({ ...lineFormData, description: e.target.value })}
                  placeholder="Labor, equipment rental, etc."
                  data-testid="textarea-line-description"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="line-qty">Quantity *</Label>
                <Input
                  id="line-qty"
                  type="number"
                  step="0.01"
                  value={lineFormData.qty ?? 1}
                  onChange={(e) => setLineFormData({ ...lineFormData, qty: parseFloat(e.target.value || '1') })}
                  data-testid="input-line-qty"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="line-rate">Unit Rate *</Label>
                <Input
                  id="line-rate"
                  type="number"
                  step="0.01"
                  value={lineFormData.unitRateCents ? (lineFormData.unitRateCents / 100).toFixed(2) : ''}
                  onChange={(e) => setLineFormData({ ...lineFormData, unitRateCents: Math.round(parseFloat(e.target.value || '0') * 100) })}
                  placeholder="0.00"
                  data-testid="input-line-rate"
                />
              </div>
              <div className="grid gap-2">
                <Label>Total Amount</Label>
                <Input
                  type="text"
                  value={formatCurrency((lineFormData.qty || 0) * (lineFormData.unitRateCents || 0))}
                  disabled
                  data-testid="input-line-total"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddLineOpen(false)} data-testid="button-cancel-add-line">
                Cancel
              </Button>
              <Button onClick={handleSubmitLine} disabled={addLineMutation.isPending} data-testid="button-add-line">
                {addLineMutation.isPending ? 'Adding...' : 'Add Line'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function InvoiceCard({
  invoice,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onIssue,
  onMarkPaid,
  onAddLine,
  getStatusBadge,
  formatCurrency,
  companies,
}: {
  invoice: Invoice;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: (invoice: Invoice) => void;
  onDelete: (invoice: Invoice) => void;
  onIssue: (invoice: Invoice) => void;
  onMarkPaid: (invoice: Invoice) => void;
  onAddLine: (invoice: Invoice) => void;
  getStatusBadge: (status: string) => JSX.Element;
  formatCurrency: (cents: number) => string;
  companies: Company[] | undefined;
}) {
  // Fetch lines for this invoice
  const { data: lines, isLoading: linesLoading } = useQuery<InvoiceLine[]>({
    queryKey: ['/api/invoices', invoice.id, 'lines'],
    queryFn: () => getJson<InvoiceLine[]>(`/api/invoices/${invoice.id}/lines`),
    enabled: isExpanded,
  });

  const company = companies?.find(c => c.id === invoice.companyId);
  
  const calculateTotal = (lines: InvoiceLine[] | undefined) => {
    if (!lines) return 0;
    return lines.reduce((sum, line) => sum + line.amountCents, 0);
  };

  return (
    <div className="border dark:border-gray-700 rounded-lg p-4" data-testid={`card-invoice-${invoice.id}`}>
      <div className="flex items-start justify-between mb-3">
        <button onClick={onToggle} className="flex items-center gap-2 flex-1 text-left" data-testid={`button-toggle-${invoice.id}`}>
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-gray-900 dark:text-white">Invoice #{invoice.id.slice(0, 8)}</h3>
              {getStatusBadge(invoice.status)}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {company?.name || 'Unknown Company'}
              {invoice.dueAt && ` • Due: ${new Date(invoice.dueAt).toLocaleDateString()}`}
            </p>
            {isExpanded && lines && (
              <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                Total: {formatCurrency(calculateTotal(lines))}
              </p>
            )}
          </div>
        </button>
        <div className="flex gap-2">
          {invoice.status === 'DRAFT' && (
            <>
              <Button variant="ghost" size="icon" onClick={() => onEdit(invoice)} data-testid={`button-edit-${invoice.id}`}>
                <Edit className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onAddLine(invoice)} data-testid={`button-add-line-${invoice.id}`}>
                <Plus className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onIssue(invoice)} className="text-blue-600 hover:text-blue-700" data-testid={`button-issue-${invoice.id}`}>
                <Send className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onDelete(invoice)} data-testid={`button-delete-${invoice.id}`}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
          {invoice.status === 'ISSUED' && (
            <Button variant="ghost" size="icon" onClick={() => onMarkPaid(invoice)} className="text-green-600 hover:text-green-700" data-testid={`button-mark-paid-${invoice.id}`}>
              <DollarSign className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Invoice Lines */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Line Items</h4>
          {linesLoading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading lines...</p>
          ) : lines && lines.length > 0 ? (
            <div className="space-y-2">
              {lines.map((line) => (
                <div key={line.id} className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded" data-testid={`line-${line.id}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">{line.description}</p>
                      <p className="text-gray-600 dark:text-gray-400">
                        {line.qty} × {formatCurrency(line.unitRateCents)}
                      </p>
                    </div>
                    <p className="font-medium text-gray-900 dark:text-white">{formatCurrency(line.amountCents)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No line items. Add lines to build the invoice.</p>
          )}
        </div>
      )}
    </div>
  );
}
