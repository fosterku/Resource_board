import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, UserCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { User, Company, UserCompanyAccess } from "@shared/schema";
import { useAuth } from "@/context/AuthContext";
import AppHeader from "@/components/AppHeader";

export default function AccessManagementPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // MANAGER-only protection
  if (user?.role !== 'MANAGER') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <AppHeader />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Access Denied</CardTitle>
              <CardDescription>This page is only accessible to MANAGER users.</CardDescription>
            </CardHeader>
          </Card>
        </main>
      </div>
    );
  }

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: accessGrants = [], isLoading } = useQuery<UserCompanyAccess[]>({
    queryKey: ["/api/user-company-access"],
  });

  const grantMutation = useMutation({
    mutationFn: (data: { userId: string; companyId: string }) =>
      apiRequest("POST", "/api/user-company-access", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-company-access"] });
      setIsDialogOpen(false);
      setSelectedUserId("");
      setSelectedCompanyId("");
      toast({ description: "Access granted successfully" });
    },
    onError: () => {
      toast({ description: "Failed to grant access", variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: ({ userId, companyId }: { userId: string; companyId: string }) =>
      apiRequest("DELETE", `/api/user-company-access/${userId}/${companyId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-company-access"] });
      toast({ description: "Access revoked successfully" });
    },
    onError: () => {
      toast({ description: "Failed to revoke access", variant: "destructive" });
    },
  });

  const handleGrant = () => {
    if (!selectedUserId || !selectedCompanyId) {
      toast({ description: "Please select both user and company", variant: "destructive" });
      return;
    }
    grantMutation.mutate({ userId: selectedUserId, companyId: selectedCompanyId });
  };

  // Get UTILITY users only
  const utilityUsers = users.filter(u => u.role === 'UTILITY');

  // Group grants by user
  const grantsByUser = accessGrants.reduce((acc, grant) => {
    if (!acc[grant.userId]) {
      acc[grant.userId] = [];
    }
    acc[grant.userId].push(grant);
    return acc;
  }, {} as Record<string, UserCompanyAccess[]>);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AppHeader />
      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Access Management</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Grant UTILITY users access to specific companies</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-grant-access">
                <Plus className="mr-2 h-4 w-4" />
                Grant Access
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="dialog-grant-access">
              <DialogHeader>
                <DialogTitle>Grant Company Access</DialogTitle>
                <DialogDescription>
                  Allow a UTILITY user to access a specific company
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">UTILITY User</label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger data-testid="select-grant-user">
                      <SelectValue placeholder="Select user..." />
                    </SelectTrigger>
                    <SelectContent>
                      {utilityUsers.map(u => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.firstName} {u.lastName} ({u.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Company</label>
                  <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                    <SelectTrigger data-testid="select-grant-company">
                      <SelectValue placeholder="Select company..." />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleGrant}
                  className="w-full"
                  disabled={!selectedUserId || !selectedCompanyId}
                  data-testid="button-submit-grant"
                >
                  Grant Access
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Access Grants ({accessGrants.length})</CardTitle>
            <CardDescription>UTILITY users and their company access</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading access grants...</div>
            ) : utilityUsers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No UTILITY users found</div>
            ) : (
              <div className="space-y-6">
                {utilityUsers.map(u => {
                  const userGrants = grantsByUser[u.id] || [];
                  return (
                    <div key={u.id} className="border rounded-lg p-4" data-testid={`section-user-grants-${u.id}`}>
                      <div className="flex items-center gap-3 mb-3">
                        <UserCheck className="h-5 w-5 text-gray-500" />
                        <div>
                          <h3 className="font-medium" data-testid={`text-user-name-${u.id}`}>
                            {u.firstName} {u.lastName}
                          </h3>
                          <p className="text-sm text-gray-500">{u.email}</p>
                        </div>
                        <Badge className="ml-auto bg-orange-500">UTILITY</Badge>
                      </div>
                      
                      {userGrants.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">No company access granted</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {userGrants.map(grant => {
                            const company = companies.find(c => c.id === grant.companyId);
                            return (
                              <div
                                key={`${grant.userId}-${grant.companyId}`}
                                className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded p-2"
                                data-testid={`grant-${grant.userId}-${grant.companyId}`}
                              >
                                <span className="text-sm font-medium">{company?.name || 'Unknown Company'}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    if (confirm(`Revoke ${company?.name} access for ${u.firstName} ${u.lastName}?`)) {
                                      revokeMutation.mutate({ userId: grant.userId, companyId: grant.companyId });
                                    }
                                  }}
                                  data-testid={`button-revoke-${grant.userId}-${grant.companyId}`}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
