import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Edit, Plus, Search, ArrowUpDown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { User, InsertUser, Company } from "@shared/schema";
import { useAuth } from "@/context/AuthContext";
import AppHeader from "@/components/AppHeader";

type SortField = 'firstName' | 'email' | 'role' | 'company';
type SortDirection = 'asc' | 'desc';

export default function UsersPage() {
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>('firstName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // ADMIN-only protection
  if (user?.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <AppHeader />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Access Denied</CardTitle>
              <CardDescription>This page is only accessible to ADMIN users.</CardDescription>
            </CardHeader>
          </Card>
        </main>
      </div>
    );
  }

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertUser) => apiRequest("POST", "/api/users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsDialogOpen(false);
      setEditingUser(null);
      toast({ description: "User created successfully" });
    },
    onError: () => {
      toast({ description: "Failed to create user", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertUser> }) =>
      apiRequest("PATCH", `/api/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsDialogOpen(false);
      setEditingUser(null);
      toast({ description: "User updated successfully" });
    },
    onError: () => {
      toast({ description: "Failed to update user", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/users/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ description: "User deleted successfully" });
    },
    onError: () => {
      toast({ description: "Failed to delete user", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const companyIdStr = formData.get("companyId") as string;
    
    const data: InsertUser = {
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      email: formData.get("email") as string,
      role: formData.get("role") as "ADMIN" | "MANAGER" | "CONTRACTOR" | "UTILITY",
      companyId: companyIdStr && companyIdStr !== "" ? companyIdStr : null,
      profileImageUrl: null,
    };

    if (editingUser) {
      const updates: Partial<InsertUser> = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        role: data.role,
        companyId: data.companyId,
      };
      updateMutation.mutate({ id: editingUser.id, data: updates });
    } else {
      createMutation.mutate(data);
    }
  };

  // Filter and sort users
  const filteredUsers = users
    .filter(u => {
      const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim();
      const matchesSearch = fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (u.email || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = roleFilter === "all" || u.role === roleFilter;
      return matchesSearch && matchesRole;
    })
    .sort((a, b) => {
      let aVal, bVal;
      if (sortField === 'company') {
        const aCompany = companies.find(c => c.id === a.companyId);
        const bCompany = companies.find(c => c.id === b.companyId);
        aVal = aCompany?.name || '';
        bVal = bCompany?.name || '';
      } else {
        aVal = a[sortField] || '';
        bVal = b[sortField] || '';
      }
      
      if (typeof aVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal);
      }
      return 0;
    });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-purple-500';
      case 'MANAGER': return 'bg-blue-500';
      case 'CONTRACTOR': return 'bg-green-500';
      case 'UTILITY': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AppHeader />
      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">User Management</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Manage system users and their roles</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingUser(null)} data-testid="button-create-user">
                <Plus className="mr-2 h-4 w-4" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="dialog-user-form">
              <DialogHeader>
                <DialogTitle>{editingUser ? "Edit User" : "Create User"}</DialogTitle>
                <DialogDescription>
                  {editingUser ? "Update user details" : "Add a new user to the system"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    defaultValue={editingUser?.firstName || ""}
                    required
                    data-testid="input-user-firstName"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    defaultValue={editingUser?.lastName || ""}
                    required
                    data-testid="input-user-lastName"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    defaultValue={editingUser?.email || ""}
                    required
                    data-testid="input-user-email"
                  />
                </div>
                <div>
                  <Label htmlFor="role">Role</Label>
                  <Select name="role" defaultValue={editingUser?.role || "CONTRACTOR"} required>
                    <SelectTrigger data-testid="select-user-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">ADMIN - User management only</SelectItem>
                      <SelectItem value="MANAGER">MANAGER - Full system access</SelectItem>
                      <SelectItem value="CONTRACTOR">CONTRACTOR - Own company only</SelectItem>
                      <SelectItem value="UTILITY">UTILITY - Granted companies</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="companyId">Company (optional)</Label>
                  <Select name="companyId" defaultValue={editingUser?.companyId || ""}>
                    <SelectTrigger data-testid="select-user-company">
                      <SelectValue placeholder="No company" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No company</SelectItem>
                      {companies.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" data-testid="button-save-user">
                  {editingUser ? "Update" : "Create"} User
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Users ({filteredUsers.length})</CardTitle>
            <CardDescription>Search and filter users</CardDescription>
            <div className="flex gap-4 mt-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-users"
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-48" data-testid="select-filter-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="ADMIN">ADMIN</SelectItem>
                  <SelectItem value="MANAGER">MANAGER</SelectItem>
                  <SelectItem value="CONTRACTOR">CONTRACTOR</SelectItem>
                  <SelectItem value="UTILITY">UTILITY</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading users...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No users found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b">
                    <tr>
                      <th className="text-left py-3 px-4">
                        <button
                          onClick={() => toggleSort('firstName')}
                          className="flex items-center gap-2 hover:text-blue-600"
                          data-testid="sort-name"
                        >
                          Name
                          <ArrowUpDown className="h-4 w-4" />
                        </button>
                      </th>
                      <th className="text-left py-3 px-4">
                        <button
                          onClick={() => toggleSort('email')}
                          className="flex items-center gap-2 hover:text-blue-600"
                          data-testid="sort-email"
                        >
                          Email
                          <ArrowUpDown className="h-4 w-4" />
                        </button>
                      </th>
                      <th className="text-left py-3 px-4">
                        <button
                          onClick={() => toggleSort('role')}
                          className="flex items-center gap-2 hover:text-blue-600"
                          data-testid="sort-role"
                        >
                          Role
                          <ArrowUpDown className="h-4 w-4" />
                        </button>
                      </th>
                      <th className="text-left py-3 px-4">
                        <button
                          onClick={() => toggleSort('company')}
                          className="flex items-center gap-2 hover:text-blue-600"
                          data-testid="sort-company"
                        >
                          Company
                          <ArrowUpDown className="h-4 w-4" />
                        </button>
                      </th>
                      <th className="text-right py-3 px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(u => {
                      const company = companies.find(c => c.id === u.companyId);
                      const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim();
                      return (
                        <tr key={u.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800" data-testid={`row-user-${u.id}`}>
                          <td className="py-3 px-4 font-medium" data-testid={`text-user-name-${u.id}`}>{fullName}</td>
                          <td className="py-3 px-4 text-gray-600 dark:text-gray-400" data-testid={`text-user-email-${u.id}`}>{u.email}</td>
                          <td className="py-3 px-4">
                            <Badge className={getRoleBadgeColor(u.role)} data-testid={`badge-user-role-${u.id}`}>
                              {u.role}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-gray-600 dark:text-gray-400" data-testid={`text-user-company-${u.id}`}>
                            {company?.name || <span className="text-gray-400">None</span>}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingUser(u);
                                  setIsDialogOpen(true);
                                }}
                                data-testid={`button-edit-user-${u.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim();
                                  if (confirm(`Delete user ${fullName}?`)) {
                                    deleteMutation.mutate(u.id);
                                  }
                                }}
                                disabled={u.id === user?.id}
                                data-testid={`button-delete-user-${u.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
