import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Edit, Plus, Star, CloudUpload, FileArchive, Upload, MapPin, ArrowUpDown, ArrowUp, ArrowDown, Paperclip, Download, X, ClipboardList, Eye, Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Contractor, InsertContractor, ContractorReview } from "@shared/schema";
import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import AppHeader from "@/components/AppHeader";
import ContractorReviewFlow from "@/components/ContractorReviewFlow";
import ContractorReviewsModal from "@/components/ContractorReviewsModal";
import { calculateContractorAverageRating } from "@/utils/reviewUtils";

const categories = ["Union", "Non-Union", "Veg", "HVAC", "DAT", "Consulting"];
const statuses = ["Completed", "Unfinished"];
const avettaStatuses = ["Yes", "No", "N/A"];
const msaStatuses = [
  { value: "none", label: "No Status" },
  { value: "Executed", label: "Executed" },
  { value: "Redlines Returned", label: "Redlines Returned" },
  { value: "NDA Signed", label: "NDA Signed" },
  { value: "Signed Not Exe", label: "Signed Not Exe" }
];

type SortField = 'name' | 'company' | 'category' | 'rating' | 'city' | 'state' | 'pipefile' | 'avetta' | 'isnComplete' | 'newMsaComplete';
type SortDirection = 'asc' | 'desc';

export default function ContractorsPage() {
  const [editingContractor, setEditingContractor] = useState<Contractor | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isReviewFlowOpen, setIsReviewFlowOpen] = useState(false);
  const [reviewsModalContractor, setReviewsModalContractor] = useState<Contractor | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>('company');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [contractorFiles, setContractorFiles] = useState<any[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'pending'>('all');
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState<number | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [mergeSearchTerm, setMergeSearchTerm] = useState("");
  const [locationsDialogOpen, setLocationsDialogOpen] = useState(false);
  const [locationsContractor, setLocationsContractor] = useState<Contractor | null>(null);
  const [newLocationAddress, setNewLocationAddress] = useState("");
  const [isGeocodingLocation, setIsGeocodingLocation] = useState(false);
  const [mergeStep, setMergeStep] = useState<'select' | 'review'>('select');
  const [mergedEmails, setMergedEmails] = useState<string[]>([]);
  const [mergedPhones, setMergedPhones] = useState<string[]>([]);
  const [mergedNames, setMergedNames] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contractorFileInputRef = useRef<HTMLInputElement>(null);
  const { toast} = useToast();
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();

  // Export all contractors function
  const exportAllContractors = async () => {
    try {
      const response = await fetch('/api/contractors/export');
      
      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      
      const today = new Date().toISOString().slice(0, 10);
      a.download = `contractors_export_${today}.xlsx`;
      
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Export Successful",
        description: `${contractors.length} contractors exported to Excel`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Could not export contractors",
        variant: "destructive",
      });
    }
  };

  const { data: contractors = [], isLoading } = useQuery<Contractor[]>({
    queryKey: ["/api/contractors"],
  });

  const { data: allReviews = [] } = useQuery<ContractorReview[]>({
    queryKey: ["/api/contractor-reviews"],
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertContractor) => apiRequest("POST", "/api/contractors", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      setIsDialogOpen(false);
      setEditingContractor(null);
      toast({ description: "Contractor saved successfully" });
    },
    onError: () => {
      toast({ description: "Failed to save contractor", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertContractor> }) =>
      apiRequest("PUT", `/api/contractors/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      setIsDialogOpen(false);
      setEditingContractor(null);
      toast({ description: "Contractor updated successfully" });
    },
    onError: (error: any) => {
      console.error("Update error:", error);
      toast({ 
        description: `Failed to update contractor: ${error?.message || 'Unknown error'}`, 
        variant: "destructive" 
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/contractors/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      toast({ description: "Contractor deleted successfully" });
    },
    onError: () => {
      toast({ description: "Failed to delete contractor", variant: "destructive" });
    },
  });

  const updateLocationsMutation = useMutation({
    mutationFn: ({ contractorId, locations }: { contractorId: number, locations: Array<{location: string, latitude: number | null, longitude: number | null}> }) =>
      apiRequest("PUT", `/api/contractors/${contractorId}/departure-locations`, { locations }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crew-availability"] });
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      toast({ description: "Departure locations updated successfully" });
    },
    onError: () => {
      toast({ description: "Failed to update departure locations", variant: "destructive" });
    },
  });

  const mergeMutation = useMutation({
    mutationFn: ({ sourceId, targetId, mergedData }: { sourceId: number; targetId: number; mergedData: any }) =>
      apiRequest("POST", "/api/contractors/merge", { sourceId, targetId, mergedData }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      setMergeDialogOpen(false);
      setMergeSourceId(null);
      setMergeTargetId("");
      setMergeSearchTerm("");
      setMergeStep('select');
      setMergedEmails([]);
      setMergedPhones([]);
      setMergedNames([]);
      toast({ 
        title: "Success",
        description: "Contractors merged successfully" 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Merge Failed",
        description: error?.message || "Failed to merge contractors", 
        variant: "destructive" 
      });
    },
  });

  // Function to prepare merged data when target is selected
  const prepareMergeData = () => {
    if (!mergeSourceId || !mergeTargetId) return;
    
    const source = contractors.find(c => c.id === mergeSourceId);
    const target = contractors.find(c => c.id === parseInt(mergeTargetId));
    
    if (!source || !target) return;
    
    // Parse and merge emails (support both semicolon and comma separators)
    const sourceEmails = (source.email || '').split(/[;,]/).map(e => e.trim()).filter(e => e);
    const targetEmails = (target.email || '').split(/[;,]/).map(e => e.trim()).filter(e => e);
    const allEmails = Array.from(new Set([...targetEmails, ...sourceEmails]));
    setMergedEmails(allEmails.length > 0 ? allEmails : ['']);
    
    // Parse and merge phones (support both semicolon and comma separators)
    const sourcePhones = (source.phone || '').split(/[;,]/).map(p => p.trim()).filter(p => p);
    const targetPhones = (target.phone || '').split(/[;,]/).map(p => p.trim()).filter(p => p);
    const allPhones = Array.from(new Set([...targetPhones, ...sourcePhones]));
    setMergedPhones(allPhones.length > 0 ? allPhones : ['']);
    
    // Parse and merge names
    const sourceNames = source.name.split(',').map(n => n.trim()).filter(n => n);
    const targetNames = target.name.split(',').map(n => n.trim()).filter(n => n);
    const allNames = Array.from(new Set([...targetNames, ...sourceNames]));
    setMergedNames(allNames.length > 0 ? allNames : [target.name]);
    
    setMergeStep('review');
  };

  const ratingMutation = useMutation({
    mutationFn: ({ id, rating }: { id: number; rating: number }) =>
      apiRequest("PUT", `/api/contractors/${id}`, { rating }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
    },
    onError: () => {
      toast({ description: "Failed to update rating", variant: "destructive" });
    },
  });

  const uploadFileMutation = useMutation({
    mutationFn: ({ contractorId, file }: { contractorId: number; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      return fetch(`/api/contractors/${contractorId}/files`, {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: () => {
      toast({ description: "File uploaded successfully" });
      if (editingContractor) {
        loadContractorFiles(editingContractor.id);
      }
    },
    onError: () => {
      toast({ description: "Failed to upload file", variant: "destructive" });
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: (fileId: number) => apiRequest("DELETE", `/api/contractor-files/${fileId}`),
    onSuccess: () => {
      toast({ description: "File deleted successfully" });
      if (editingContractor) {
        loadContractorFiles(editingContractor.id);
      }
    },
    onError: () => {
      toast({ description: "Failed to delete file", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const contractorData: InsertContractor = {
      name: formData.get("name") as string,
      company: formData.get("company") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string,
      category: formData.get("category") as string,
      city: formData.get("city") as string,
      state: formData.get("state") as string,
      fullAddress: formData.get("fullAddress") as string,
      latitude: formData.get("latitude") ? parseFloat(formData.get("latitude") as string) : null,
      longitude: formData.get("longitude") ? parseFloat(formData.get("longitude") as string) : null,
      pipefile: formData.get("pipefile") as string,
      avetta: formData.get("avetta") as string,
      isnComplete: formData.get("isnComplete") === "Yes",
      subRanking: formData.get("subRanking") as string || "",
      fteCountsPerLocation: formData.get("fteCountsPerLocation") as string,
      pipefileUpdates: formData.get("pipefileUpdates") as string,
      birdRep: formData.get("birdRep") as string,
      notes: formData.get("notes") as string,
      newMsaComplete: formData.get("newMsaComplete") === "none" ? "" : formData.get("newMsaComplete") as string || "",
      rating: formData.get("rating") ? parseFloat(formData.get("rating") as string) : 0,
    };

    console.log("Submitting contractor data:", contractorData);
    console.log("Editing contractor:", editingContractor);

    if (editingContractor) {
      console.log("Updating contractor with ID:", editingContractor.id);
      updateMutation.mutate({ id: editingContractor.id, data: contractorData });
    } else {
      console.log("Creating new contractor");
      createMutation.mutate(contractorData);
    }
  };

  const handleEdit = (contractor: Contractor) => {
    setEditingContractor(contractor);
    setIsDialogOpen(true);
    loadContractorFiles(contractor.id);
  };

  const loadContractorFiles = async (contractorId: number) => {
    try {
      const response = await fetch(`/api/contractors/${contractorId}/files`);
      if (response.ok) {
        const files = await response.json();
        setContractorFiles(files);
      }
    } catch (error) {
      console.error('Failed to load contractor files:', error);
    }
  };

  const handleFileUploadForContractor = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editingContractor) {
      setUploadingFile(true);
      uploadFileMutation.mutate({ contractorId: editingContractor.id, file }, {
        onSettled: () => setUploadingFile(false)
      });
    }
  };

  const handleDeleteFile = (fileId: number) => {
    if (window.confirm("Are you sure you want to delete this file?")) {
      deleteFileMutation.mutate(fileId);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDelete = (id: number) => {
    if (window.confirm("Are you sure you want to delete this contractor?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleManageLocations = (contractor: Contractor) => {
    setLocationsContractor(contractor);
    setLocationsDialogOpen(true);
    setNewLocationAddress("");
  };

  const handleAddLocation = async () => {
    if (!newLocationAddress.trim() || !locationsContractor) return;
    
    setIsGeocodingLocation(true);
    try {
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ location: newLocationAddress }),
      });
      
      if (!response.ok) throw new Error('Geocoding failed');
      
      const data = await response.json();
      
      if (!data.success) {
        toast({ 
          description: data.message || "Failed to geocode location", 
          variant: "destructive" 
        });
        setIsGeocodingLocation(false);
        return;
      }
      
      const currentLocations = (locationsContractor.departureLocations as any) || [];
      
      const newLocations = [
        ...currentLocations,
        {
          location: newLocationAddress,
          latitude: data.latitude,
          longitude: data.longitude
        }
      ];
      
      await updateLocationsMutation.mutateAsync({
        contractorId: locationsContractor.id,
        locations: newLocations
      });
      
      setNewLocationAddress("");
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      const updatedContractor = await queryClient.fetchQuery({ queryKey: ["/api/contractors"] });
      const updated = Array.isArray(updatedContractor) ? updatedContractor.find((c: any) => c.id === locationsContractor.id) : null;
      if (updated) setLocationsContractor(updated);
    } catch (error) {
      console.error('Geocoding error:', error);
      toast({ description: "Failed to add location", variant: "destructive" });
    } finally {
      setIsGeocodingLocation(false);
    }
  };

  const handleRemoveLocation = async (index: number) => {
    if (!locationsContractor) return;
    
    const currentLocations = (locationsContractor.departureLocations as any) || [];
    const newLocations = currentLocations.filter((_: any, i: number) => i !== index);
    
    await updateLocationsMutation.mutateAsync({
      contractorId: locationsContractor.id,
      locations: newLocations
    });
    
    queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
    const updatedContractor = await queryClient.fetchQuery({ queryKey: ["/api/contractors"] });
    const updated = Array.isArray(updatedContractor) ? updatedContractor.find((c: any) => c.id === locationsContractor.id) : null;
    if (updated) setLocationsContractor(updated);
  };

  const handleRating = (contractorId: number, rating: number) => {
    ratingMutation.mutate({ id: contractorId, rating });
  };

  const handleSort = (field: SortField) => {
    setSortField(field);
    // Keep current direction when changing fields
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4 text-gray-400" />;
    }
    return sortDirection === 'asc' ? 
      <ArrowUp className="w-4 h-4 text-blue-600" /> : 
      <ArrowDown className="w-4 h-4 text-blue-600" />;
  };

  // File upload handlers
  const handleFileUpload = async (file: File) => {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setIsUploading(true);
    try {
      const response = await fetch('/api/upload-file', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();
      
      // Poll for job completion
      const pollJob = async (jobId: number) => {
        const jobResponse = await fetch(`/api/jobs/${jobId}`);
        const job = await jobResponse.json();
        
        if (job.status === 'completed') {
          toast({ description: `Successfully imported ${job.resourceCount} contractors from ${file.name}` });
          queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
          queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
        } else if (job.status === 'failed') {
          throw new Error(job.error || 'Import failed');
        } else {
          // Still processing, poll again in 1 second
          setTimeout(() => pollJob(jobId), 1000);
        }
      };
      
      await pollJob(result.jobId);
    } catch (error) {
      toast({ 
        description: `Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        variant: "destructive" 
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const StarRating = ({ contractorId }: { contractorId: number }) => {
    const contractorReviews = allReviews.filter(review => review.contractorId === contractorId);
    const averageRating = calculateContractorAverageRating(contractorReviews);
    
    if (averageRating.reviewCount === 0) {
      return (
        <div className="flex gap-1 items-center">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star key={star} className="w-4 h-4 text-gray-300" />
          ))}
          <span className="text-xs text-gray-500 ml-1">No reviews yet</span>
        </div>
      );
    }

    return (
      <div className="flex gap-1 items-center">
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = star <= averageRating.averageRating;
          const isPartial = star > averageRating.averageRating && star - 1 < averageRating.averageRating;
          
          return (
            <Star
              key={star}
              className={`w-4 h-4 ${
                isFilled ? "fill-red-500 text-red-500" : 
                isPartial ? "fill-red-300 text-red-300" : "text-gray-300"
              }`}
            />
          );
        })}
        <span className="text-xs text-gray-500 ml-1">
          ({averageRating.averageRating.toFixed(1)}) - {averageRating.reviewCount} review{averageRating.reviewCount !== 1 ? 's' : ''}
        </span>
      </div>
    );
  };

  // Split contractors into regular and pending review
  const regularContractors = contractors.filter(c => !c.needsReview);
  const pendingReviewContractors = contractors.filter(c => c.needsReview);

  const filteredContractors = (activeTab === 'pending' ? pendingReviewContractors : regularContractors)
    .filter((contractor) => {
      const matchesSearch = 
        contractor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contractor.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contractor.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contractor.state?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = categoryFilter === "all" || contractor.category === categoryFilter;
      
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];
      
      // Handle null/undefined values
      if (aValue == null) aValue = '';
      if (bValue == null) bValue = '';
      
      // Handle numeric sorting for rating
      if (sortField === 'rating') {
        aValue = Number(aValue) || 0;
        bValue = Number(bValue) || 0;
      } else {
        // Convert to string for text sorting
        aValue = String(aValue).toLowerCase();
        bValue = String(bValue).toLowerCase();
      }
      
      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

  if (isLoading) {
    return <div className="p-6">Loading contractors...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <AppHeader />

      <div className="container mx-auto px-4 py-6 max-w-full overflow-x-hidden pt-28 sm:pt-32 md:pt-36">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h2 className="text-2xl font-bold">Contractors Management</h2>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Button onClick={() => setIsDialogOpen(true)} className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Add Contractor
            </Button>
            <Button 
              onClick={() => setIsReviewFlowOpen(true)} 
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
            >
              <ClipboardList className="w-4 h-4 mr-2" />
              Review Contractors
            </Button>
            <Button 
              variant="outline" 
              className="w-full sm:w-auto"
              onClick={exportAllContractors}
              data-testid="button-export-contractors"
            >
              <Download className="w-4 h-4 mr-2" />
              Export All
            </Button>
            <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto">
                  <Upload className="w-4 h-4 mr-2" />
                  Import
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Import Contractors</DialogTitle>
                <DialogDescription>Upload CSV, Excel, or KMZ files</DialogDescription>
              </DialogHeader>
              <div 
                className={`border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer ${
                  isDragOver 
                    ? 'border-primary bg-primary/5' 
                    : 'border-gray-300 hover:border-primary/60'
                } ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => !isUploading && fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="text-center">
                  {isUploading ? (
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                  ) : (
                    <CloudUpload className="mx-auto text-gray-400 mb-2" size={32} />
                  )}
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    {isUploading ? 'Processing...' : 'Drop file or click to browse'}
                  </p>
                  <p className="text-xs text-gray-500">
                    .csv, .xlsx, .xls, .kmz, .kml
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".kmz,.kml,.csv,.xlsx,.xls"
                  onChange={handleFileInputChange}
                  disabled={isUploading}
                />
              </div>
              {contractors.length > 0 && (
                <div className="mt-3 flex items-center justify-between p-2 bg-emerald-50 border border-emerald-200 rounded">
                  <div className="flex items-center space-x-2">
                    <FileArchive className="text-emerald-600" size={16} />
                    <span className="text-xs font-medium text-emerald-800">Contractors loaded</span>
                  </div>
                  <Badge variant="secondary" className="text-emerald-600 bg-emerald-100">
                    {contractors.length}
                  </Badge>
                </div>
              )}
            </DialogContent>
          </Dialog>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingContractor ? "Edit Contractor" : "Add New Contractor"}
              </DialogTitle>
              <DialogDescription>
                {editingContractor ? "Update contractor information" : "Enter contractor details"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Contact Name</Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={editingContractor?.name || ""}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input
                    id="company"
                    name="company"
                    defaultValue={editingContractor?.company || ""}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="text"
                    placeholder="email1@example.com; email2@example.com"
                    defaultValue={editingContractor?.email || ""}
                  />
                  <p className="text-xs text-muted-foreground">Separate multiple emails with semicolons (;)</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    name="phone"
                    defaultValue={editingContractor?.phone || ""}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select name="category" defaultValue={editingContractor?.category || ""} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pipefile">Pipefile</Label>
                  <Select name="pipefile" defaultValue={editingContractor?.pipefile || ""}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select pipefile status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Completed">Completed</SelectItem>
                      <SelectItem value="Unfinished">Unfinished</SelectItem>
                      <SelectItem value="N/A">N/A</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="avetta">AVETTA</Label>
                  <Select name="avetta" defaultValue={editingContractor?.avetta || ""}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select AVETTA status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                      <SelectItem value="N/A">N/A</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="isnComplete">ISN Complete</Label>
                  <Select name="isnComplete" defaultValue={editingContractor?.isnComplete ? "Yes" : "No"}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select ISN status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    name="city"
                    defaultValue={editingContractor?.city || ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    name="state"
                    defaultValue={editingContractor?.state || ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subRanking">Sub Ranking (0-5)</Label>
                  <Input
                    id="subRanking"
                    name="subRanking"
                    type="number"
                    min="0"
                    max="5"
                    defaultValue={editingContractor?.subRanking || ""}
                    placeholder="0-5"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="birdRep">Bird Rep</Label>
                <Input
                  id="birdRep"
                  name="birdRep"
                  defaultValue={editingContractor?.birdRep || ""}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullAddress">Full Address</Label>
                <Input
                  id="fullAddress"
                  name="fullAddress"
                  defaultValue={editingContractor?.fullAddress || ""}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="latitude">Latitude</Label>
                  <Input
                    id="latitude"
                    name="latitude"
                    type="number"
                    step="any"
                    defaultValue={editingContractor?.latitude || ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="longitude">Longitude</Label>
                  <Input
                    id="longitude"
                    name="longitude"
                    type="number"
                    step="any"
                    defaultValue={editingContractor?.longitude || ""}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fteCountsPerLocation">FTE Counts Per Location</Label>
                <Input
                  id="fteCountsPerLocation"
                  name="fteCountsPerLocation"
                  defaultValue={editingContractor?.fteCountsPerLocation || ""}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pipefileUpdates">Pipefile Updates</Label>
                <Input
                  id="pipefileUpdates"
                  name="pipefileUpdates"
                  defaultValue={editingContractor?.pipefileUpdates || ""}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rating">Rating (0-5, decimals allowed)</Label>
                <div className="flex items-center gap-4">
                  <Input
                    id="rating"
                    name="rating"
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    defaultValue={editingContractor?.rating || 0}
                    className="w-24"
                  />
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const rating = editingContractor?.rating || 0;
                      const isFilled = star <= rating;
                      const isPartial = star > rating && star - 1 < rating;
                      
                      return (
                        <Star
                          key={star}
                          className={`w-5 h-5 ${
                            isFilled ? "fill-red-500 text-red-500" : 
                            isPartial ? "fill-red-300 text-red-300" : "text-gray-300"
                          }`}
                        />
                      );
                    })}
                  </div>
                  <span className="text-sm text-gray-500">({(editingContractor?.rating || 0).toFixed(1)})</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  defaultValue={editingContractor?.notes || ""}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="newMsaComplete">MSA Status</Label>
                <Select name="newMsaComplete" defaultValue={editingContractor?.newMsaComplete || "none"}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select MSA status" />
                  </SelectTrigger>
                  <SelectContent>
                    {msaStatuses.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* File Upload Section */}
              {editingContractor && (
                <div className="space-y-4 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-medium">Attached Files</Label>
                    <div className="flex items-center gap-2">
                      <input
                        ref={contractorFileInputRef}
                        type="file"
                        className="hidden"
                        accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.csv,.xlsx,.xls"
                        onChange={handleFileUploadForContractor}
                        disabled={uploadingFile}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => contractorFileInputRef.current?.click()}
                        disabled={uploadingFile}
                      >
                        {uploadingFile ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        ) : (
                          <Paperclip className="w-4 h-4 mr-2" />
                        )}
                        {uploadingFile ? "Uploading..." : "Add File"}
                      </Button>
                    </div>
                  </div>
                  
                  {contractorFiles.length > 0 ? (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {contractorFiles.map((file) => (
                        <div key={file.id} className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <Paperclip className="w-4 h-4 text-gray-500 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{file.originalName}</p>
                              <p className="text-xs text-gray-500">
                                {formatFileSize(file.fileSize)} • {new Date(file.uploadedAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(`/api/contractor-files/${file.id}/download`, '_blank')}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteFile(file.id)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-4">No files uploaded yet</p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    setContractorFiles([]);
                    setEditingContractor(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editingContractor ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 min-w-0">
            <Input
              placeholder="Search contractors by name, company, or location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-48 flex-shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tabs for All Contractors and Pending Review */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'all' | 'pending')} className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="all">All Contractors</TabsTrigger>
            <TabsTrigger value="pending">
              Pending Review
              {pendingReviewContractors.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {pendingReviewContractors.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-0">
            {/* Sort Controls */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
                <span className="text-sm font-medium text-gray-700">Sort by:</span>
                <Select value={sortField} onValueChange={(value: SortField) => handleSort(value)}>
                  <SelectTrigger className="w-full sm:w-48 flex-shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">Company</SelectItem>
                    <SelectItem value="name">Contact Name</SelectItem>
                    <SelectItem value="category">Category</SelectItem>
                    <SelectItem value="rating">Rating</SelectItem>
                    <SelectItem value="newMsaComplete">MSA Status</SelectItem>
                    <SelectItem value="city">City</SelectItem>
                    <SelectItem value="state">State</SelectItem>
                    <SelectItem value="pipefile">Pipefile</SelectItem>
                    <SelectItem value="avetta">AVETTA</SelectItem>
                    <SelectItem value="isnComplete">ISN Complete</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                  className="flex items-center gap-1"
                >
                  {sortDirection === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                  {sortDirection === 'asc' ? 'A-Z' : 'Z-A'}
                </Button>
              </div>
              <div className="text-sm text-gray-500 flex-shrink-0">
                {filteredContractors.length} contractors
              </div>
            </div>

            <div className="grid gap-4 lg:gap-6 w-full">
        {filteredContractors.map((contractor) => (
          <Card key={contractor.id} className="w-full">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg truncate">{contractor.company}</CardTitle>
                  <CardDescription className="truncate">{contractor.name}</CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex gap-1 items-center">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const rating = contractor.rating || 0;
                      const isFilled = star <= rating;
                      const isPartial = star > rating && star - 1 < rating;
                      
                      return (
                        <Star
                          key={star}
                          className={`w-4 h-4 ${
                            isFilled ? "fill-red-500 text-red-500" : 
                            isPartial ? "fill-red-300 text-red-300" : "text-gray-300"
                          }`}
                        />
                      );
                    })}
                    <span className="text-xs text-gray-500 ml-1">
                      ({(contractor.rating || 0).toFixed(1)})
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReviewsModalContractor(contractor)}
                    title="View Reviews"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button
                    data-testid={`button-merge-${contractor.id}`}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMergeSourceId(contractor.id);
                      setMergeDialogOpen(true);
                    }}
                    title="Merge with Another Contractor"
                    className={activeTab === 'pending' ? "bg-blue-50 hover:bg-blue-100" : ""}
                  >
                    <Link2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(contractor)}
                    title="Edit Contractor"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(contractor.id)}
                    title="Delete Contractor"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="font-medium">Category:</span>
                  <Badge variant="secondary" className="ml-2">
                    {contractor.category}
                  </Badge>
                </div>
                <div>
                  <span className="font-medium">Pipefile:</span>
                  <Badge 
                    variant={contractor.pipefile === "Completed" ? "default" : "outline"}
                    className="ml-2"
                  >
                    {contractor.pipefile || 'N/A'}
                  </Badge>
                </div>
                <div>
                  <span className="font-medium">AVETTA:</span>
                  <Badge 
                    variant={contractor.avetta === "Yes" ? "default" : "outline"}
                    className="ml-2"
                  >
                    {contractor.avetta || 'N/A'}
                  </Badge>
                </div>
                <div>
                  <span className="font-medium">ISN Complete:</span>
                  <Badge 
                    variant={contractor.isnComplete ? "default" : "outline"}
                    className="ml-2"
                  >
                    {contractor.isnComplete ? 'Yes' : 'No'}
                  </Badge>
                </div>
                <div>
                  <span className="font-medium">Location:</span>
                  <span className="ml-2">{contractor.city}, {contractor.state}</span>
                </div>
              </div>
              
              {contractor.email && (
                <div className="mt-2 text-sm">
                  <span className="font-medium">Email:</span>
                  <span className="ml-2">{contractor.email}</span>
                </div>
              )}
              
              {contractor.phone && (
                <div className="mt-1 text-sm">
                  <span className="font-medium">Phone:</span>
                  <span className="ml-2">{contractor.phone}</span>
                </div>
              )}
              
              {contractor.birdRep && (
                <div className="mt-1 text-sm">
                  <span className="font-medium">Bird Rep:</span>
                  <span className="ml-2">{contractor.birdRep}</span>
                </div>
              )}
              
              {contractor.newMsaComplete && (
                <div className="mt-2 text-sm">
                  <span className="font-medium">MSA Status:</span>
                  <Badge 
                    variant="default"
                    className="ml-2"
                  >
                    {contractor.newMsaComplete}
                  </Badge>
                </div>
              )}

              {contractor.notes && (
                <div className="mt-2 text-sm">
                  <span className="font-medium">Notes:</span>
                  <p className="mt-1 text-gray-600">{contractor.notes}</p>
                </div>
              )}

              <div className="mt-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Storage Yards / Departure Locations:</span>
                  <Button
                    data-testid={`button-manage-locations-${contractor.id}`}
                    variant="outline"
                    size="sm"
                    onClick={() => handleManageLocations(contractor)}
                    className="h-7 text-xs"
                  >
                    <MapPin className="w-3 h-3 mr-1" />
                    Manage Locations
                  </Button>
                </div>
                {contractor.departureLocations && Array.isArray(contractor.departureLocations) && contractor.departureLocations.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {contractor.departureLocations.map((loc: any, idx: number) => (
                      <Badge key={idx} variant="outline" className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {loc.location}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        
          {filteredContractors.length === 0 && (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-gray-500">No contractors found matching your search criteria.</p>
              </CardContent>
            </Card>
          )}
            </div>
          </TabsContent>

          <TabsContent value="pending" className="mt-0">
            {/* Sort Controls */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
                <span className="text-sm font-medium text-gray-700">Sort by:</span>
                <Select value={sortField} onValueChange={(value: SortField) => handleSort(value)}>
                  <SelectTrigger className="w-full sm:w-48 flex-shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">Company</SelectItem>
                    <SelectItem value="name">Contact Name</SelectItem>
                    <SelectItem value="category">Category</SelectItem>
                    <SelectItem value="rating">Rating</SelectItem>
                    <SelectItem value="newMsaComplete">MSA Status</SelectItem>
                    <SelectItem value="city">City</SelectItem>
                    <SelectItem value="state">State</SelectItem>
                    <SelectItem value="pipefile">Pipefile</SelectItem>
                    <SelectItem value="avetta">AVETTA</SelectItem>
                    <SelectItem value="isnComplete">ISN Complete</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                  className="flex items-center gap-1"
                >
                  {sortDirection === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                  {sortDirection === 'asc' ? 'A-Z' : 'Z-A'}
                </Button>
              </div>
              <div className="text-sm text-gray-500 flex-shrink-0">
                {filteredContractors.length} contractors
              </div>
            </div>

            <div className="grid gap-4 lg:gap-6 w-full">
              {filteredContractors.map((contractor) => (
                <Card key={contractor.id} className="w-full">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate">{contractor.company}</CardTitle>
                        <CardDescription className="truncate">{contractor.name}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="flex gap-1 items-center">
                          {[1, 2, 3, 4, 5].map((star) => {
                            const rating = contractor.rating || 0;
                            const isFilled = star <= rating;
                            const isPartial = star > rating && star - 1 < rating;
                            
                            return (
                              <Star
                                key={star}
                                className={`w-4 h-4 ${
                                  isFilled ? "fill-red-500 text-red-500" : 
                                  isPartial ? "fill-red-300 text-red-300" : "text-gray-300"
                                }`}
                              />
                            );
                          })}
                          <span className="text-xs text-gray-500 ml-1">
                            ({(contractor.rating || 0).toFixed(1)})
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setReviewsModalContractor(contractor)}
                          title="View Reviews"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {activeTab === 'pending' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setMergeSourceId(contractor.id);
                              setMergeDialogOpen(true);
                            }}
                            title="Combine with Existing"
                            className="bg-blue-50 hover:bg-blue-100"
                          >
                            <Link2 className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(contractor)}
                          title="Edit Contractor"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(contractor.id)}
                          title="Delete Contractor"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Category:</span>
                        <Badge variant="secondary" className="ml-2">
                          {contractor.category}
                        </Badge>
                      </div>
                      <div>
                        <span className="font-medium">Pipefile:</span>
                        <Badge 
                          variant={contractor.pipefile === "Completed" ? "default" : "outline"}
                          className="ml-2"
                        >
                          {contractor.pipefile || 'N/A'}
                        </Badge>
                      </div>
                      <div>
                        <span className="font-medium">AVETTA:</span>
                        <Badge 
                          variant={contractor.avetta === "Yes" ? "default" : "outline"}
                          className="ml-2"
                        >
                          {contractor.avetta || 'N/A'}
                        </Badge>
                      </div>
                      <div>
                        <span className="font-medium">ISN Complete:</span>
                        <Badge 
                          variant={contractor.isnComplete ? "default" : "outline"}
                          className="ml-2"
                        >
                          {contractor.isnComplete ? 'Yes' : 'No'}
                        </Badge>
                      </div>
                      <div>
                        <span className="font-medium">Location:</span>
                        <span className="ml-2">{contractor.city}, {contractor.state}</span>
                      </div>
                    </div>
                    
                    {contractor.email && (
                      <div className="mt-2 text-sm">
                        <span className="font-medium">Email:</span>
                        <span className="ml-2">{contractor.email}</span>
                      </div>
                    )}
                    
                    {contractor.phone && (
                      <div className="mt-1 text-sm">
                        <span className="font-medium">Phone:</span>
                        <span className="ml-2">{contractor.phone}</span>
                      </div>
                    )}
                    
                    {contractor.birdRep && (
                      <div className="mt-1 text-sm">
                        <span className="font-medium">Bird Rep:</span>
                        <span className="ml-2">{contractor.birdRep}</span>
                      </div>
                    )}
                    
                    {contractor.newMsaComplete && (
                      <div className="mt-2 text-sm">
                        <span className="font-medium">MSA Status:</span>
                        <Badge 
                          variant="default"
                          className="ml-2"
                        >
                          {contractor.newMsaComplete}
                        </Badge>
                      </div>
                    )}

                    {contractor.notes && (
                      <div className="mt-2 text-sm">
                        <span className="font-medium">Notes:</span>
                        <p className="mt-1 text-gray-600">{contractor.notes}</p>
                      </div>
                    )}

                    <div className="mt-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Storage Yards / Departure Locations:</span>
                        <Button
                          data-testid={`button-manage-locations-pending-${contractor.id}`}
                          variant="outline"
                          size="sm"
                          onClick={() => handleManageLocations(contractor)}
                          className="h-7 text-xs"
                        >
                          <MapPin className="w-3 h-3 mr-1" />
                          Manage Locations
                        </Button>
                      </div>
                      {contractor.departureLocations && Array.isArray(contractor.departureLocations) && contractor.departureLocations.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-2">
                          {contractor.departureLocations.map((loc: any, idx: number) => (
                            <Badge key={idx} variant="outline" className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {loc.location}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {filteredContractors.length === 0 && (
                <Card>
                  <CardContent className="text-center py-8">
                    <p className="text-gray-500">No contractors found matching your search criteria.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Merge Dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={(open) => {
        setMergeDialogOpen(open);
        if (!open) {
          setMergeStep('select');
          setMergeTargetId("");
          setMergeSearchTerm("");
          setMergedEmails([]);
          setMergedPhones([]);
          setMergedNames([]);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {mergeStep === 'select' ? 'Combine Contractor with Existing Record' : 'Review Combined Data'}
            </DialogTitle>
            <DialogDescription>
              {mergeStep === 'select' 
                ? 'Select an existing contractor to merge this record into.' 
                : 'Review and edit the combined information. Remove any duplicate or incorrect entries.'}
            </DialogDescription>
          </DialogHeader>
          
          {mergeStep === 'select' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="merge-search">Search Contractors</Label>
                <Input
                  id="merge-search"
                  placeholder="Search by name or company..."
                  value={mergeSearchTerm}
                  onChange={(e) => setMergeSearchTerm(e.target.value)}
                />
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {regularContractors
                  .filter((c) =>
                    c.name.toLowerCase().includes(mergeSearchTerm.toLowerCase()) ||
                    c.company.toLowerCase().includes(mergeSearchTerm.toLowerCase())
                  )
                  .map((contractor) => (
                    <Card
                      key={contractor.id}
                      className={`cursor-pointer transition-all ${
                        mergeTargetId === contractor.id.toString()
                          ? 'border-blue-500 bg-blue-50'
                          : 'hover:border-gray-400'
                      }`}
                      onClick={() => setMergeTargetId(contractor.id.toString())}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-semibold">{contractor.company}</h4>
                            <p className="text-sm text-gray-600">{contractor.name}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {contractor.city}, {contractor.state}
                            </p>
                          </div>
                          <Badge variant="secondary">{contractor.category}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                
                {regularContractors.filter((c) =>
                  c.name.toLowerCase().includes(mergeSearchTerm.toLowerCase()) ||
                  c.company.toLowerCase().includes(mergeSearchTerm.toLowerCase())
                ).length === 0 && (
                  <p className="text-center text-gray-500 py-4">No contractors found</p>
                )}
              </div>

              {mergeTargetId && (
                <div className="pt-4 border-t">
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setMergeDialogOpen(false);
                        setMergeTargetId("");
                        setMergeSearchTerm("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button onClick={prepareMergeData}>
                      Next: Review Data
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Names */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Contact Names</Label>
                {mergedNames.map((name, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={name}
                      onChange={(e) => {
                        const updated = [...mergedNames];
                        updated[index] = e.target.value;
                        setMergedNames(updated);
                      }}
                      placeholder="Name"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setMergedNames(mergedNames.filter((_, i) => i !== index));
                      }}
                      disabled={mergedNames.length === 1}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMergedNames([...mergedNames, ''])}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Name
                </Button>
              </div>

              {/* Emails */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Email Addresses</Label>
                {mergedEmails.map((email, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        const updated = [...mergedEmails];
                        updated[index] = e.target.value;
                        setMergedEmails(updated);
                      }}
                      placeholder="email@example.com"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setMergedEmails(mergedEmails.filter((_, i) => i !== index));
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMergedEmails([...mergedEmails, ''])}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Email
                </Button>
              </div>

              {/* Phone Numbers */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Phone Numbers</Label>
                {mergedPhones.map((phone, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        const updated = [...mergedPhones];
                        updated[index] = e.target.value;
                        setMergedPhones(updated);
                      }}
                      placeholder="(555) 123-4567"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setMergedPhones(mergedPhones.filter((_, i) => i !== index));
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMergedPhones([...mergedPhones, ''])}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Phone
                </Button>
              </div>

              <div className="pt-4 border-t flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setMergeStep('select');
                    setMergedEmails([]);
                    setMergedPhones([]);
                    setMergedNames([]);
                  }}
                >
                  Back
                </Button>
                <Button
                  onClick={() => {
                    if (mergeSourceId && mergeTargetId) {
                      const mergedData = {
                        name: mergedNames.filter(n => n.trim()).join(', '),
                        email: mergedEmails.filter(e => e.trim()).join('; '),
                        phone: mergedPhones.filter(p => p.trim()).join('; ')
                      };
                      mergeMutation.mutate({
                        sourceId: mergeSourceId,
                        targetId: parseInt(mergeTargetId),
                        mergedData
                      });
                    }
                  }}
                  disabled={mergeMutation.isPending}
                >
                  {mergeMutation.isPending ? 'Merging...' : 'Confirm Merge'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Departure Locations Management Dialog */}
      <Dialog open={locationsDialogOpen} onOpenChange={setLocationsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Storage Yards / Departure Locations</DialogTitle>
            <DialogDescription>
              {locationsContractor && `Managing locations for ${locationsContractor.company}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add New Location */}
            <div className="space-y-2">
              <Label htmlFor="new-location">Add New Location</Label>
              <div className="flex gap-2">
                <Input
                  id="new-location"
                  data-testid="input-new-location"
                  placeholder="Enter address (e.g., 123 Main St, City, State ZIP)"
                  value={newLocationAddress}
                  onChange={(e) => setNewLocationAddress(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isGeocodingLocation) {
                      handleAddLocation();
                    }
                  }}
                />
                <Button
                  data-testid="button-add-location"
                  onClick={handleAddLocation}
                  disabled={!newLocationAddress.trim() || isGeocodingLocation}
                >
                  {isGeocodingLocation ? 'Adding...' : <><Plus className="w-4 h-4 mr-1" /> Add</>}
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                The address will be geocoded automatically to get coordinates for distance calculations.
              </p>
            </div>

            {/* Existing Locations List */}
            <div className="space-y-2">
              <Label>Current Locations ({(locationsContractor?.departureLocations as any)?.length || 0})</Label>
              {locationsContractor?.departureLocations && Array.isArray(locationsContractor.departureLocations) && locationsContractor.departureLocations.length > 0 ? (
                <div className="space-y-2">
                  {(locationsContractor.departureLocations as any[]).map((loc: any, idx: number) => (
                    <Card key={idx} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-blue-600" />
                            <span className="font-medium">{loc.location}</span>
                          </div>
                          {loc.latitude && loc.longitude && (
                            <p className="text-xs text-gray-500 mt-1 ml-6">
                              Coordinates: {loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}
                            </p>
                          )}
                        </div>
                        <Button
                          data-testid={`button-remove-location-${idx}`}
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemoveLocation(idx)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No locations added yet. Add locations above to get started.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review Flow Modal */}
      {isReviewFlowOpen && (
        <div className="fixed inset-0 z-[9000] bg-white dark:bg-gray-900 overflow-y-auto">
          <AppHeader />
          <div className="pt-16 sm:pt-20">
            <ContractorReviewFlow
              onComplete={() => setIsReviewFlowOpen(false)}
              onCancel={() => setIsReviewFlowOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Reviews Modal */}
      {reviewsModalContractor && (
        <ContractorReviewsModal
          contractor={reviewsModalContractor}
          isOpen={!!reviewsModalContractor}
          onClose={() => setReviewsModalContractor(null)}
        />
      )}
    </div>
  );
}