import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, postJson, patchJson, deleteJson } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {  Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Building2, Plus, Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';
import type { Company, InsertCompany } from '@shared/schema';
import { insertCompanySchema } from '@shared/schema';

export default function CompaniesPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [formData, setFormData] = useState<Partial<InsertCompany>>({
    name: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    billingAddress: '',
    notes: '',
  });

  // Check UTILITY role
  if (user?.role !== 'UTILITY') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Access Denied</CardTitle>
              <CardDescription>Only UTILITY users can manage companies.</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/">
                <Button variant="outline" data-testid="button-back-access-denied">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Dashboard
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { data: companies, isLoading } = useQuery<Company[]>({
    queryKey: ['/api/companies'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertCompany) => {
      return await postJson('/api/companies', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies'] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({ title: 'Company created successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to create company', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertCompany> }) => {
      return await patchJson(`/api/companies/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies'] });
      setIsEditDialogOpen(false);
      setSelectedCompany(null);
      resetForm();
      toast({ title: 'Company updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update company', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await deleteJson(`/api/companies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies'] });
      setIsDeleteDialogOpen(false);
      setSelectedCompany(null);
      toast({ title: 'Company deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete company', variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      billingAddress: '',
      notes: '',
    });
  };

  const handleCreate = () => {
    try {
      const validData = insertCompanySchema.parse(formData);
      createMutation.mutate(validData);
    } catch (error) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
    }
  };

  const handleEdit = (company: Company) => {
    setSelectedCompany(company);
    setFormData({
      name: company.name,
      contactName: company.contactName ?? '',
      contactEmail: company.contactEmail ?? '',
      contactPhone: company.contactPhone ?? '',
      billingAddress: company.billingAddress ?? '',
      notes: company.notes ?? '',
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedCompany) return;
    updateMutation.mutate({ id: selectedCompany.id, data: formData });
  };

  const handleDelete = (company: Company) => {
    setSelectedCompany(company);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (!selectedCompany) return;
    deleteMutation.mutate(selectedCompany.id);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <Building2 className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Companies Management</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">Manage contractor companies</p>
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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Contractor Companies</CardTitle>
                <CardDescription>View and manage all contractor companies</CardDescription>
              </div>
              <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-company">
                <Plus className="w-4 h-4 mr-2" />
                Add Company
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : !companies || companies.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No companies found. Create your first company to get started.
              </div>
            ) : (
              <Table data-testid="table-companies">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((company) => (
                    <TableRow key={company.id} data-testid={`row-company-${company.id}`}>
                      <TableCell className="font-medium">{company.name}</TableCell>
                      <TableCell>{company.contactName || '-'}</TableCell>
                      <TableCell>{company.contactEmail || '-'}</TableCell>
                      <TableCell>{company.contactPhone || '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(company)}
                            data-testid={`button-edit-${company.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(company)}
                            data-testid={`button-delete-${company.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
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
        <DialogContent data-testid="dialog-create-company">
          <DialogHeader>
            <DialogTitle>Create New Company</DialogTitle>
            <DialogDescription>Add a new contractor company to the system.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Company Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Acme Construction Inc."
                data-testid="input-company-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contactName">Contact Name</Label>
              <Input
                id="contactName"
                value={formData.contactName ?? ''}
                onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                placeholder="John Doe"
                data-testid="input-contact-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contactEmail">Contact Email</Label>
              <Input
                id="contactEmail"
                type="email"
                value={formData.contactEmail ?? ''}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                placeholder="john@acme.com"
                data-testid="input-contact-email"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contactPhone">Contact Phone</Label>
              <Input
                id="contactPhone"
                value={formData.contactPhone ?? ''}
                onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                placeholder="+1 (555) 123-4567"
                data-testid="input-contact-phone"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="billingAddress">Billing Address</Label>
              <Textarea
                id="billingAddress"
                value={formData.billingAddress ?? ''}
                onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
                placeholder="123 Main St, City, State, ZIP"
                data-testid="input-billing-address"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes ?? ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes..."
                data-testid="input-notes"
              />
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
              {createMutation.isPending ? 'Creating...' : 'Create Company'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-company">
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
            <DialogDescription>Update company information.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Company Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                data-testid="input-edit-company-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-contactName">Contact Name</Label>
              <Input
                id="edit-contactName"
                value={formData.contactName ?? ''}
                onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                data-testid="input-edit-contact-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-contactEmail">Contact Email</Label>
              <Input
                id="edit-contactEmail"
                type="email"
                value={formData.contactEmail ?? ''}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                data-testid="input-edit-contact-email"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-contactPhone">Contact Phone</Label>
              <Input
                id="edit-contactPhone"
                value={formData.contactPhone ?? ''}
                onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                data-testid="input-edit-contact-phone"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-billingAddress">Billing Address</Label>
              <Textarea
                id="edit-billingAddress"
                value={formData.billingAddress ?? ''}
                onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
                data-testid="input-edit-billing-address"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes ?? ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                data-testid="input-edit-notes"
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
              {updateMutation.isPending ? 'Updating...' : 'Update Company'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent data-testid="dialog-delete-company">
          <DialogHeader>
            <DialogTitle>Delete Company</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedCompany?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
