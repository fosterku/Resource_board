import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Company } from "@shared/schema";
import { useAuth } from "@/context/AuthContext";
import AppHeader from "@/components/AppHeader";

export default function ContractorProfilePage() {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Company>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // CONTRACTOR-only protection
  if (user?.role !== 'CONTRACTOR') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <AppHeader />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Access Denied</CardTitle>
              <CardDescription>This page is only accessible to CONTRACTOR users.</CardDescription>
            </CardHeader>
          </Card>
        </main>
      </div>
    );
  }

  const { data: company, isLoading: loadingCompany } = useQuery<Company>({
    queryKey: ["/api/profile"],
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Company>) => apiRequest("PATCH", "/api/profile", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      setIsEditing(false);
      toast({ description: "Company profile updated successfully" });
    },
    onError: () => {
      toast({ description: "Failed to update profile", variant: "destructive" });
    },
  });

  const handleEdit = () => {
    setFormData(company || {});
    setIsEditing(true);
  };

  const handleCancel = () => {
    setFormData({});
    setIsEditing(false);
  };

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AppHeader />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Company Profile</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">View and manage your company information</p>
          </div>

          {loadingCompany ? (
            <Card>
              <CardContent className="py-8">
                <div className="text-center text-gray-500">Loading profile...</div>
              </CardContent>
            </Card>
          ) : !company ? (
            <Card>
              <CardContent className="py-8">
                <div className="text-center text-gray-500">No company assigned to your account</div>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Company Information</CardTitle>
                      <CardDescription>Basic company details</CardDescription>
                    </div>
                    {!isEditing ? (
                      <Button onClick={handleEdit} data-testid="button-edit-profile">
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button onClick={handleSave} data-testid="button-save-profile">
                          <Save className="mr-2 h-4 w-4" />
                          Save
                        </Button>
                        <Button variant="outline" onClick={handleCancel} data-testid="button-cancel-edit">
                          <X className="mr-2 h-4 w-4" />
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!isEditing ? (
                    <>
                      <div>
                        <Label className="text-gray-600">Company Name</Label>
                        <p className="font-medium" data-testid="text-company-name">{company.name}</p>
                      </div>
                      <div>
                        <Label className="text-gray-600">Contact Name</Label>
                        <p className="font-medium" data-testid="text-contact-name">
                          {company.contactName || <span className="text-gray-400">Not provided</span>}
                        </p>
                      </div>
                      <div>
                        <Label className="text-gray-600">Contact Email</Label>
                        <p className="font-medium" data-testid="text-contact-email">
                          {company.contactEmail || <span className="text-gray-400">Not provided</span>}
                        </p>
                      </div>
                      <div>
                        <Label className="text-gray-600">Contact Phone</Label>
                        <p className="font-medium" data-testid="text-contact-phone">
                          {company.contactPhone || <span className="text-gray-400">Not provided</span>}
                        </p>
                      </div>
                      <div>
                        <Label className="text-gray-600">Billing Address</Label>
                        <p className="font-medium whitespace-pre-wrap" data-testid="text-billing-address">
                          {company.billingAddress || <span className="text-gray-400">Not provided</span>}
                        </p>
                      </div>
                      <div>
                        <Label className="text-gray-600">Notes</Label>
                        <p className="font-medium whitespace-pre-wrap" data-testid="text-notes">
                          {company.notes || <span className="text-gray-400">No notes</span>}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <Label htmlFor="name">Company Name</Label>
                        <Input
                          id="name"
                          value={formData.name || ""}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                          data-testid="input-company-name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="contactName">Contact Name</Label>
                        <Input
                          id="contactName"
                          value={formData.contactName || ""}
                          onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                          data-testid="input-contact-name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="contactEmail">Contact Email</Label>
                        <Input
                          id="contactEmail"
                          type="email"
                          value={formData.contactEmail || ""}
                          onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                          data-testid="input-contact-email"
                        />
                      </div>
                      <div>
                        <Label htmlFor="contactPhone">Contact Phone</Label>
                        <Input
                          id="contactPhone"
                          value={formData.contactPhone || ""}
                          onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                          data-testid="input-contact-phone"
                        />
                      </div>
                      <div>
                        <Label htmlFor="billingAddress">Billing Address</Label>
                        <Textarea
                          id="billingAddress"
                          value={formData.billingAddress || ""}
                          onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
                          rows={3}
                          data-testid="input-billing-address"
                        />
                      </div>
                      <div>
                        <Label htmlFor="notes">Notes</Label>
                        <Textarea
                          id="notes"
                          value={formData.notes || ""}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          rows={3}
                          data-testid="input-notes"
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
