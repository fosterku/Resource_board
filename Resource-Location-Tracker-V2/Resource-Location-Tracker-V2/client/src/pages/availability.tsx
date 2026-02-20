import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Upload, Plus, FileSpreadsheet, Users, Truck, Calendar, CheckCircle, Clock, AlertTriangle, Download, ArrowUpDown, Trash2, Map, Building, LogOut, User, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import AppHeader from "@/components/AppHeader";
import type { Contractor } from "@shared/schema";

const categories = ["Union", "Non-Union", "Veg", "HVAC", "DAT", "Consulting"];

interface CrewAvailability {
  id: number;
  contractorId: number;
  submissionDate: string;
  availableStartDate: string;
  availableEndDate?: string;
  departureCity?: string;
  departureState?: string;
  departureLocation?: string; // Legacy field for backward compatibility
  departureLatitude?: number;
  departureLongitude?: number;
  totalFTE?: number;
  buckets?: number;
  diggers?: number;
  pickups?: number;
  backyardMachines?: number;
  // Legacy fields for backward compatibility
  linemenCount: number;
  groundmenCount: number;
  operatorsCount: number;
  foremanCount: number;
  apprenticesCount: number;
  linemenRate?: number;
  groundmenRate?: number;
  operatorsRate?: number;
  foremanRate?: number;
  apprenticesRate?: number;
  status: string;
  notes?: string;
  submittedBy?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  contractor?: {
    name: string;
    company: string;
    category: string;
    birdRep: string;
    departureLocations?: Array<{
      location: string;
      latitude: number | null;
      longitude: number | null;
    }>;
  };
}

export default function AvailabilityPage() {
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const [isFileUploadOpen, setIsFileUploadOpen] = useState(false);
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedContractor, setSelectedContractor] = useState<string>("");
  const [hasSubcontractor, setHasSubcontractor] = useState(false);
  const [isNewCompany, setIsNewCompany] = useState(false);
  const [editingAvailability, setEditingAvailability] = useState<any>(null);
  const [analysisLocations, setAnalysisLocations] = useState<string[]>(['']);
  const [distanceResults, setDistanceResults] = useState<any[]>([]);
  const [isCalculatingDistances, setIsCalculatingDistances] = useState(false);
  const [sortField, setSortField] = useState<string>('distance');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('active');

  // Format duration from seconds to human readable
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  // Fetch availability sessions
  const { data: sessionsData } = useQuery<{ sessions: any[], unassignedCount: number }>({
    queryKey: ["/api/availability-sessions"],
  });

  // Fetch availability data filtered by session
  const { data: availabilityData = [], isLoading } = useQuery<CrewAvailability[]>({
    queryKey: ["/api/crew-availability", selectedSessionId],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/crew-availability?sessionId=${selectedSessionId}`);
        if (!response.ok) {
          // If session filtering fails, fallback to getting all availability data
          const fallbackResponse = await fetch('/api/crew-availability-fallback');
          if (fallbackResponse.ok) {
            return fallbackResponse.json();
          }
          throw new Error('Failed to fetch availability data');
        }
        return response.json();
      } catch (error) {
        // Fallback to basic query without session filtering
        const fallbackResponse = await fetch('/api/crew-availability-fallback');
        if (fallbackResponse.ok) {
          return fallbackResponse.json();
        }
        throw error;
      }
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch contractors for manual entry
  const { data: contractors = [] } = useQuery<Contractor[]>({
    queryKey: ["/api/contractors"]
  });

  // Start new availability session
  const startNewSessionMutation = useMutation({
    mutationFn: async (sessionName: string) => {
      return await apiRequest("POST", "/api/availability-sessions/start-new", { label: sessionName });
    },
    onSuccess: () => {
      toast({
        title: "New Session Started",
        description: `Session "${newSessionName}" has been created and is now active.`,
      });
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/availability-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crew-availability"] });
      // Switch to active session and close dialog
      setSelectedSessionId('active');
      setIsSessionDialogOpen(false);
      setNewSessionName('');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: "Failed to start new session: " + error.message,
        variant: "destructive",
      });
    }
  });

  // Function to handle adding/removing locations
  const addLocation = () => {
    setAnalysisLocations([...analysisLocations, '']);
  };

  const removeLocation = (index: number) => {
    if (analysisLocations.length > 1) {
      const newLocations = analysisLocations.filter((_, i) => i !== index);
      setAnalysisLocations(newLocations);
    }
  };

  const updateLocation = (index: number, value: string) => {
    const newLocations = [...analysisLocations];
    newLocations[index] = value;
    setAnalysisLocations(newLocations);
  };

  // Function to calculate distances for approved contractors
  const calculateDistances = async () => {
    const validLocations = analysisLocations.filter(loc => loc.trim());
    if (validLocations.length === 0) {
      toast({
        title: "Location Required",
        description: "Please enter at least one location for distance analysis",
        variant: "destructive",
      });
      return;
    }

    const approvedContractors = availabilityData.filter((item: any) => item.status === 'approved');
    
    if (approvedContractors.length === 0) {
      toast({
        title: "No Approved Contractors",
        description: "There are no approved contractors to analyze",
        variant: "destructive",
      });
      return;
    }

    setIsCalculatingDistances(true);
    
    try {
      const response = await fetch('/api/calculate-distances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractors: approvedContractors,
          destinations: validLocations
        })
      });

      if (!response.ok) {
        throw new Error('Failed to calculate distances');
      }

      const data = await response.json();
      setDistanceResults(data.results);
      
      toast({
        title: "Distance Analysis Complete",
        description: `Calculated driving distances for ${data.results.length} contractors to ${validLocations.length} location(s)`,
      });
    } catch (error) {
      console.error('Distance calculation error:', error);
      toast({
        title: "Calculation Failed",
        description: "Could not calculate distances. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCalculatingDistances(false);
    }
  };

  // Function to calculate straight-line distance between two locations
  const calculateStraightLineDistance = async (location1: string, location2: string): Promise<number | null> => {
    try {
      // Geocode both locations
      const coords1 = await geocodeLocation(location1);
      const coords2 = await geocodeLocation(location2);
      
      if (!coords1 || !coords2) return null;
      
      // Calculate distance using Haversine formula
      const R = 3959; // Earth's radius in miles
      const dLat = (coords2.lat - coords1.lat) * Math.PI / 180;
      const dLon = (coords2.lng - coords1.lng) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(coords1.lat * Math.PI / 180) * Math.cos(coords2.lat * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;
      
      return distance;
    } catch (error) {
      console.error('Distance calculation error:', error);
      return null;
    }
  };

  // Function to geocode a location using a simple geocoding service
  const geocodeLocation = async (location: string): Promise<{lat: number, lng: number} | null> => {
    try {
      // Using OpenStreetMap Nominatim API (free, no API key required)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(location)}`
      );
      const data = await response.json();
      
      if (data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon)
        };
      }
      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  };

  // Sorting function for distance results
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Get sorted distance results
  const getSortedResults = () => {
    return [...distanceResults].sort((a, b) => {
      let aValue, bValue;
      
      switch (sortField) {
        case 'contractor':
          aValue = a.contractor?.company || '';
          bValue = b.contractor?.company || '';
          break;
        case 'distance':
          aValue = parseFloat(a.distance);
          bValue = parseFloat(b.distance);
          break;
        case 'travelTime':
          aValue = parseFloat(a.travelTimeHours);
          bValue = parseFloat(b.travelTimeHours);
          break;
        case 'totalFTE':
          aValue = getTotalCrew(a);
          bValue = getTotalCrew(b);
          break;
        case 'buckets':
          aValue = a.buckets || 0;
          bValue = b.buckets || 0;
          break;
        case 'diggers':
          aValue = a.diggers || 0;
          bValue = b.diggers || 0;
          break;
        case 'pickups':
          aValue = a.pickups || 0;
          bValue = b.pickups || 0;
          break;
        case 'backyardMachines':
          aValue = a.backyardMachines || 0;
          bValue = b.backyardMachines || 0;
          break;
        default:
          return 0;
      }
      
      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
  };

  // Calculate totals for the results
  const calculateTotals = () => {
    return distanceResults.reduce((totals, result) => ({
      totalFTE: totals.totalFTE + getTotalCrew(result),
      buckets: totals.buckets + (result.buckets || 0),
      diggers: totals.diggers + (result.diggers || 0),
      pickups: totals.pickups + (result.pickups || 0),
      backyardMachines: totals.backyardMachines + (result.backyardMachines || 0),
    }), {
      totalFTE: 0,
      buckets: 0,
      diggers: 0,
      pickups: 0,
      backyardMachines: 0,
    });
  };

  // Export availability data function
  const exportAvailabilityData = async (format: 'excel' | 'csv') => {
    try {
      const sessionParam = selectedSessionId || 'active';
      const response = await fetch(`/api/crew-availability/export?format=${format}&session=${sessionParam}`);
      
      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      
      // Get filename from response header or use default
      const contentDisposition = response.headers.get('content-disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `availability_submissions_${new Date().toISOString().slice(0, 10)}.${format === 'excel' ? 'xlsx' : 'csv'}`;
      
      a.download = filename;
      
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Export Successful",
        description: `Availability submissions exported to ${format.toUpperCase()}`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: `Could not export availability submissions to ${format.toUpperCase()}`,
        variant: "destructive",
      });
    }
  };

  // Export ALL sessions data function
  const exportAllSessionsData = async (format: 'excel' | 'csv') => {
    try {
      // Don't pass a session parameter to get all data
      const response = await fetch(`/api/crew-availability/export?format=${format}`);
      
      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      
      // Get filename from response header or use default
      const contentDisposition = response.headers.get('content-disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `all_sessions_availability_${new Date().toISOString().slice(0, 10)}.${format === 'excel' ? 'xlsx' : 'csv'}`;
      
      a.download = filename;
      
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Export All Sessions Successful",
        description: `All availability data from all sessions exported to ${format.toUpperCase()}`,
      });
    } catch (error) {
      toast({
        title: "Export All Sessions Failed",
        description: `Could not export all sessions data to ${format.toUpperCase()}`,
        variant: "destructive",
      });
    }
  };

  // AI-Enhanced export function
  const exportAIMatchedData = async (format: 'excel' | 'csv') => {
    try {
      toast({
        title: "AI Matching Started",
        description: "Analyzing submissions with AI to match contractors. This may take a moment...",
      });

      const sessionParam = selectedSessionId || 'active';
      const response = await fetch(`/api/crew-availability/export-ai-matched?format=${format}&session=${sessionParam}`);
      
      if (!response.ok) {
        throw new Error('AI export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      
      // Get filename from response header or use default
      const contentDisposition = response.headers.get('content-disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `ai_matched_availability_${new Date().toISOString().slice(0, 10)}.${format === 'excel' ? 'xlsx' : 'csv'}`;
      
      a.download = filename;
      
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "AI Export Complete",
        description: `AI-matched availability data exported to ${format.toUpperCase()} with contractor matching results`,
      });
    } catch (error) {
      toast({
        title: "AI Export Failed",
        description: `Could not export AI-matched data: ${(error as Error).message}`,
        variant: "destructive",
      });
    }
  };

  // Excel export function
  const exportToExcel = async () => {
    try {
      const validLocations = analysisLocations.filter(loc => loc.trim());
      const sortedResults = getSortedResults();
      const totals = calculateTotals();
      
      // Prepare data for export with multiple destination columns
      const exportData = sortedResults.map(result => {
        const row: any = {
          'Contractor': result.contractor?.company || '',
          'Contact Person': result.contractor?.name || '',
          'Email': result.contractor?.email || 'Not provided',
          'Phone': result.contractor?.phone || 'Not provided',
          'Category': result.contractor?.category || 'Not specified',
          'Departure City': result.departureCity || (result.departureLocation ? result.departureLocation.split(',')[0]?.trim() : ''),
          'Departure State': result.departureState || (result.departureLocation ? result.departureLocation.split(',')[1]?.trim() : ''),
          'Total FTE': getTotalCrew(result),
          'Buckets': result.buckets || 0,
          'Diggers': result.diggers || 0,
          'Pickups': result.pickups || 0,
          'BackYard Machines': result.backyardMachines || 0,
        };

        // Add distance and time columns for each destination
        validLocations.forEach((location, index) => {
          row[`Distance to ${location} (miles)`] = parseFloat(result[`distance_${index}`]) || 0;
          row[`Travel Time to ${location} (hours)`] = parseFloat(result[`travelTimeHours_${index}`]) || 0;
        });

        return row;
      });

      // Add totals row
      const totalsRow: any = {
        'Contractor': 'TOTALS',
        'Contact Person': '',
        'Email': '',
        'Phone': '',
        'Category': '',
        'Departure Location': '',
        'Total FTE': totals.totalFTE,
        'Buckets': totals.buckets,
        'Diggers': totals.diggers,
        'Pickups': totals.pickups,
        'BackYard Machines': totals.backyardMachines,
      };

      // Add empty cells for distance/time columns in totals row
      validLocations.forEach((location) => {
        totalsRow[`Distance to ${location} (miles)`] = null;
        totalsRow[`Travel Time to ${location} (hours)`] = null;
      });

      exportData.push(totalsRow);

      const response = await fetch('/api/export-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: exportData,
          filename: `distance-analysis-${validLocations.join('-').replace(/[^a-zA-Z0-9-]/g, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`,
          sheetName: 'Distance Analysis'
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `distance-analysis-${validLocations.join('-').replace(/[^a-zA-Z0-9-]/g, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        toast({
          title: "Export Successful",
          description: "Distance analysis exported to Excel",
        });
      } else {
        throw new Error('Export failed');
      }
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Could not export distance analysis to Excel",
        variant: "destructive",
      });
    }
  };

  // Color-coded Excel export function (time only, no distance)
  const exportToExcelColorCoded = async () => {
    try {
      const validLocations = analysisLocations.filter(loc => loc.trim());
      const sortedResults = getSortedResults();
      const totals = calculateTotals();
      
      // Prepare data for export with only time columns (no distance)
      const exportData = sortedResults.map(result => {
        const row: any = {
          'Contractor': result.contractor?.company || '',
          'Contact Person': result.contractor?.name || '',
          'Email': result.contractor?.email || 'Not provided',
          'Phone': result.contractor?.phone || 'Not provided',
          'Category': result.contractor?.category || 'Not specified',
          'Departure City': result.departureCity || (result.departureLocation ? result.departureLocation.split(',')[0]?.trim() : ''),
          'Departure State': result.departureState || (result.departureLocation ? result.departureLocation.split(',')[1]?.trim() : ''),
          'Total FTE': getTotalCrew(result),
          'Buckets': result.buckets || 0,
          'Diggers': result.diggers || 0,
          'Pickups': result.pickups || 0,
          'BackYard Machines': result.backyardMachines || 0,
        };

        // Add ONLY time columns for each destination (no distance)
        validLocations.forEach((location, index) => {
          row[`Travel Time to ${location} (hours)`] = parseFloat(result[`travelTimeHours_${index}`]) || 0;
        });

        return row;
      });

      // Add totals row
      const totalsRow: any = {
        'Contractor': 'TOTALS',
        'Contact Person': '',
        'Email': '',
        'Phone': '',
        'Category': '',
        'Departure Location': '',
        'Total FTE': totals.totalFTE,
        'Buckets': totals.buckets,
        'Diggers': totals.diggers,
        'Pickups': totals.pickups,
        'BackYard Machines': totals.backyardMachines,
      };

      // Add empty cells for time columns in totals row
      validLocations.forEach((location) => {
        totalsRow[`Travel Time to ${location} (hours)`] = null;
      });

      exportData.push(totalsRow);

      const response = await fetch('/api/export-excel-color-coded', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: exportData,
          filename: `distance-analysis-color-coded-${validLocations.join('-').replace(/[^a-zA-Z0-9-]/g, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`,
          sheetName: 'Color Coded Analysis',
          destinations: validLocations
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `distance-analysis-color-coded-${validLocations.join('-').replace(/[^a-zA-Z0-9-]/g, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        toast({
          title: "Color-Coded Export Successful",
          description: "Color-coded time analysis exported to Excel",
        });
      } else {
        throw new Error('Export failed');
      }
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Could not export color-coded analysis to Excel",
        variant: "destructive",
      });
    }
  };

  // File upload mutation
  const fileUploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/availability/upload', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Upload failed');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-availability"] });
      toast({
        title: "Upload Successful",
        description: `Processed ${data.recordsCreated} availability records`,
      });
      setIsFileUploadOpen(false);
      setSelectedFile(null);
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Could not process the file",
        variant: "destructive",
      });
    }
  });

  // Manual entry mutation
  const manualEntryMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/crew-availability', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-availability"] });
      toast({
        title: "Availability Added",
        description: "Crew availability has been successfully recorded",
      });
      setIsManualEntryOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Availability",
        description: error.message || "Could not save availability data",
        variant: "destructive",
      });
    }
  });

  // Status update mutation
  const statusUpdateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      return await apiRequest('PATCH', `/api/crew-availability/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-availability"] });
      toast({
        title: "Status Updated",
        description: "Availability status has been updated",
      });
    }
  });

  // Edit mutation
  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: any }) => {
      return await apiRequest('PATCH', `/api/crew-availability/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-availability"] });
      toast({
        title: "Entry Updated",
        description: "Crew availability entry has been updated successfully",
      });
      setEditingAvailability(null);
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Could not update availability entry",
        variant: "destructive",
      });
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('DELETE', `/api/crew-availability/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-availability"] });
      toast({
        title: "Entry Deleted",
        description: "Crew availability entry has been deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Could not delete availability entry",
        variant: "destructive",
      });
    }
  });

  const handleFileUpload = () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('submittedBy', 'admin'); // Get from auth context

    fileUploadMutation.mutate(formData);
  };

  const handleManualEntry = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    
    let contractorId;
    
    // If new company, create contractor first
    if (isNewCompany) {
      const newContractorData = {
        name: formData.get('newContractorName'),
        company: formData.get('newCompanyName'),
        category: formData.get('newCategory') || 'Union',
        birdRep: formData.get('newBirdRep') || 'TBD',
        email: formData.get('newEmail') || '',
        phone: formData.get('newPhone') || '',
        rating: 0
      };
      
      try {
        const response = await apiRequest('POST', '/api/contractors', newContractorData);
        const newContractor = await response.json();
        contractorId = newContractor.id;
        console.log('Created new contractor with ID:', contractorId);
        queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      } catch (error) {
        console.error('Failed to create contractor:', error);
        toast({
          title: "Failed to Create Contractor",
          description: "Could not create new contractor entry",
          variant: "destructive",
        });
        return;
      }
    } else {
      // Using existing contractor
      contractorId = parseInt(selectedContractor);
      
      // Update existing contractor information if provided
      const contractorEmail = formData.get('contractorEmail');
      const contractorPhone = formData.get('contractorPhone');
      const contractorCategory = formData.get('contractorCategory');
      
      if (contractorEmail || contractorPhone || contractorCategory) {
        const updateData: any = {};
        if (contractorEmail) updateData.email = contractorEmail;
        if (contractorPhone) updateData.phone = contractorPhone;
        if (contractorCategory) updateData.category = contractorCategory;
        
        try {
          await apiRequest('PATCH', `/api/contractors/${contractorId}`, updateData);
          queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
        } catch (error) {
          console.warn('Failed to update contractor information:', error);
          // Continue with availability creation even if contractor update fails
        }
      }
    }
    
    const departureCity = formData.get('departureCity') as string;
    const departureState = formData.get('departureState') as string;
    const departureLocation = `${departureCity}, ${departureState}`;
    
    const subDepartureCity = formData.get('subDepartureCity') as string;
    const subDepartureState = formData.get('subDepartureState') as string;
    const subDepartureLocation = hasSubcontractor && subDepartureCity && subDepartureState 
      ? `${subDepartureCity}, ${subDepartureState}` 
      : '';
    
    const data = {
      contractorId,
      isNewCompany,
      departureCity,
      departureState,
      departureLocation,
      totalFTE: parseInt(formData.get('totalFTE') as string) || 0,
      buckets: parseInt(formData.get('buckets') as string) || 0,
      diggers: parseInt(formData.get('diggers') as string) || 0,
      pickups: parseInt(formData.get('pickups') as string) || 0,
      backyardMachines: parseInt(formData.get('backyardMachines') as string) || 0,
      notes: formData.get('notes'),
      submittedBy: 'admin', // Get from auth context
      // Subcontractor data
      hasSubcontractor,
      subcontractorData: hasSubcontractor ? {
        name: formData.get('subName'),
        company: formData.get('subCompany'),
        departureCity: subDepartureCity,
        departureState: subDepartureState,
        departureLocation: subDepartureLocation,
        totalFTE: parseInt(formData.get('subTotalFTE') as string) || 0,
        buckets: parseInt(formData.get('subBuckets') as string) || 0,
        diggers: parseInt(formData.get('subDiggers') as string) || 0,
        pickups: parseInt(formData.get('subPickups') as string) || 0,
        backyardMachines: parseInt(formData.get('subBackyardMachines') as string) || 0,
      } : undefined
    };

    // Validate contractorId before submitting
    console.log('Validating contractorId:', contractorId, 'Type:', typeof contractorId, 'isNaN:', isNaN(contractorId));
    if (!contractorId || isNaN(contractorId)) {
      console.error('Invalid contractorId detected:', contractorId);
      toast({
        title: "Invalid Contractor",
        description: `Please select a valid contractor or create a new one. ContractorId: ${contractorId}`,
        variant: "destructive",
      });
      return;
    }

    console.log('Frontend submitting data:', data);
    manualEntryMutation.mutate(data);
    
    // Reset form state
    setSelectedContractor("");
    setHasSubcontractor(false);
    setIsNewCompany(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'submitted':
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Submitted</Badge>;
      case 'approved':
        return <Badge variant="default"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'deployed':
        return <Badge variant="secondary"><Truck className="w-3 h-3 mr-1" />Deployed</Badge>;
      case 'expired':
        return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTotalCrew = (availability: CrewAvailability) => {
    // Use new field structure if available, fallback to legacy fields
    return availability.totalFTE || 
           (availability.linemenCount + availability.groundmenCount + 
            availability.operatorsCount + availability.foremanCount + 
            availability.apprenticesCount);
  };

  const getEquipmentSummary = (availability: CrewAvailability) => {
    const equipment = [];
    if (availability.buckets && availability.buckets > 0) equipment.push(`${availability.buckets} Buckets`);
    if (availability.diggers && availability.diggers > 0) equipment.push(`${availability.diggers} Diggers`);
    if (availability.pickups && availability.pickups > 0) equipment.push(`${availability.pickups} Pickups`);
    if (availability.backyardMachines && availability.backyardMachines > 0) equipment.push(`${availability.backyardMachines} BYM`);
    return equipment.join(', ') || 'No equipment';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="container mx-auto p-4 sm:p-6 space-y-6 pt-28 sm:pt-32 md:pt-36">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Contractor Availability</h1>
          <p className="text-gray-600 mt-2 text-sm sm:text-base">Manage crew and equipment availability submissions</p>
          
          {/* Session Management */}
          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <Label htmlFor="session-select" className="text-sm font-medium">Session:</Label>
              <Select 
                value={selectedSessionId} 
                onValueChange={setSelectedSessionId}
                data-testid="select-availability-session"
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select session" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active Session</SelectItem>
                  {sessionsData?.unassignedCount && sessionsData.unassignedCount > 0 && (
                    <SelectItem value="unassigned">
                      Unassigned ({sessionsData.unassignedCount})
                    </SelectItem>
                  )}
                  {sessionsData?.sessions?.map((session) => (
                    <SelectItem key={session.id} value={session.id.toString()}>
                      {session.label} ({session.recordCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <Button 
              variant="default"
              onClick={() => setIsSessionDialogOpen(true)}
              disabled={startNewSessionMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-save-start-new-session"
            >
              {startNewSessionMutation.isPending ? (
                <>
                  <Clock className="w-4 h-4 mr-2 animate-spin" />
                  Starting New Session...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Save & Start New Session
                </>
              )}
            </Button>
          </div>
          
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800 mb-2">
              <strong>Contractor Submission Form:</strong> Share this link with contractors to submit availability{selectedSessionId !== 'active' && selectedSessionId !== 'unassigned' ? ` for this session` : ''}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-xs bg-white px-2 py-1 rounded border text-blue-900 flex-1 min-w-0 overflow-x-auto">
                {selectedSessionId === 'active' || selectedSessionId === 'unassigned'
                  ? `${window.location.origin}/contractor-availability`
                  : `${window.location.origin}/contractor-availability?session=${selectedSessionId}`}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const formUrl = selectedSessionId === 'active' || selectedSessionId === 'unassigned'
                    ? `${window.location.origin}/contractor-availability`
                    : `${window.location.origin}/contractor-availability?session=${selectedSessionId}`;
                  navigator.clipboard.writeText(formUrl);
                  toast({
                    title: "Link Copied",
                    description: selectedSessionId === 'active' || selectedSessionId === 'unassigned'
                      ? "General contractor form link copied to clipboard"
                      : "Session-specific form link copied to clipboard",
                  });
                }}
                data-testid="button-copy-form-link"
              >
                Copy Link
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const formUrl = selectedSessionId === 'active' || selectedSessionId === 'unassigned'
                    ? '/contractor-availability'
                    : `/contractor-availability?session=${selectedSessionId}`;
                  window.open(formUrl, '_blank');
                }}
                data-testid="button-open-form"
              >
                Open Form
              </Button>
            </div>
            {selectedSessionId !== 'active' && selectedSessionId !== 'unassigned' && (
              <p className="text-xs text-blue-700 mt-2">
                <strong>Note:</strong> Submissions through this link will be saved to the selected session only.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Dialog open={isFileUploadOpen} onOpenChange={setIsFileUploadOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="w-4 h-4 mr-2" />
                Bulk Upload
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Upload FTE File</DialogTitle>
                <DialogDescription>
                  Upload an Excel or CSV file with contractor availability data
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="file">Select File</Label>
                  <Input
                    id="file"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Supported formats: Excel (.xlsx, .xls) or CSV (.csv)
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsFileUploadOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleFileUpload} 
                    disabled={!selectedFile || fileUploadMutation.isPending}
                  >
                    {fileUploadMutation.isPending ? "Uploading..." : "Upload"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isManualEntryOpen} onOpenChange={setIsManualEntryOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Manual Entry
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Crew Availability</DialogTitle>
                <DialogDescription>
                  Manually enter contractor availability information
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleManualEntry} className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <div className="flex items-center space-x-2 mb-2">
                      <Checkbox 
                        id="newCompany" 
                        checked={isNewCompany} 
                        onCheckedChange={(checked) => setIsNewCompany(checked === true)}
                      />
                      <Label htmlFor="newCompany">New Company (not in contractor list)</Label>
                    </div>
                    
                    {!isNewCompany ? (
                      <>
                        <div>
                          <Label htmlFor="contractor">Select Contractor</Label>
                          <Select value={selectedContractor} onValueChange={setSelectedContractor} required={!isNewCompany}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select contractor" />
                            </SelectTrigger>
                            <SelectContent>
                              {contractors
                                .sort((a: any, b: any) => {
                                  // Sort by company first, then by person name
                                  if (a.company !== b.company) {
                                    return a.company.localeCompare(b.company);
                                  }
                                  return a.name.localeCompare(b.name);
                                })
                                .map((contractor: any) => (
                                <SelectItem key={contractor.id} value={contractor.id.toString()}>
                                  {contractor.company} - {contractor.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {selectedContractor && (
                          <div className="grid grid-cols-2 gap-4 mt-4 p-4 bg-gray-50 rounded-lg">
                            <div className="col-span-2">
                              <Label className="text-sm font-medium text-gray-700">Update Contractor Information (Optional)</Label>
                            </div>
                            <div>
                              <Label htmlFor="contractorEmail">Email</Label>
                              <Input
                                id="contractorEmail"
                                name="contractorEmail"
                                type="email"
                                placeholder="contractor@company.com"
                                defaultValue={contractors.find((c: any) => c.id.toString() === selectedContractor)?.email || ''}
                              />
                            </div>
                            <div>
                              <Label htmlFor="contractorPhone">Phone Number</Label>
                              <Input
                                id="contractorPhone"
                                name="contractorPhone"
                                type="tel"
                                placeholder="(555) 123-4567"
                                defaultValue={contractors.find((c: any) => c.id.toString() === selectedContractor)?.phone || ''}
                              />
                            </div>
                            <div>
                              <Label htmlFor="contractorCategory">Category</Label>
                              <Select name="contractorCategory" defaultValue={contractors.find((c: any) => c.id.toString() === selectedContractor)?.category || ''}>
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
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="newCompanyName">Company Name</Label>
                          <Input
                            id="newCompanyName"
                            name="newCompanyName"
                            placeholder="Company name"
                            required={isNewCompany}
                          />
                        </div>
                        <div>
                          <Label htmlFor="newContractorName">Contact Person</Label>
                          <Input
                            id="newContractorName"
                            name="newContractorName"
                            placeholder="Contact person name"
                            required={isNewCompany}
                          />
                        </div>
                        <div>
                          <Label htmlFor="newBirdRep">Bird Rep</Label>
                          <Input
                            id="newBirdRep"
                            name="newBirdRep"
                            placeholder="Bird Representative"
                          />
                        </div>
                        <div>
                          <Label htmlFor="newEmail">Email</Label>
                          <Input
                            id="newEmail"
                            name="newEmail"
                            type="email"
                            placeholder="contractor@company.com"
                          />
                        </div>
                        <div>
                          <Label htmlFor="newPhone">Phone Number</Label>
                          <Input
                            id="newPhone"
                            name="newPhone"
                            type="tel"
                            placeholder="(555) 123-4567"
                          />
                        </div>
                        <div>
                          <Label htmlFor="newCategory">Category</Label>
                          <Select name="newCategory">
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
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="departureCity">Departure City</Label>
                    <Input
                      id="departureCity"
                      name="departureCity"
                      type="text"
                      placeholder="e.g., Detroit"
                      required
                      data-testid="input-departure-city"
                    />
                  </div>
                  <div>
                    <Label htmlFor="departureState">Departure State</Label>
                    <Input
                      id="departureState"
                      name="departureState"
                      type="text"
                      placeholder="e.g., TX"
                      required
                      data-testid="input-departure-state"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold">Crew & Equipment Composition</h4>
                  
                  {/* Total FTE on one line */}
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label htmlFor="totalFTE">Total FTE</Label>
                      <Input
                        id="totalFTE"
                        name="totalFTE"
                        type="number"
                        min="0"
                        defaultValue="0"
                      />
                    </div>
                  </div>
                  
                  {/* Equipment fields below */}
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <Label htmlFor="buckets">Buckets</Label>
                      <Input
                        id="buckets"
                        name="buckets"
                        type="number"
                        min="0"
                        defaultValue="0"
                      />
                    </div>
                    <div>
                      <Label htmlFor="diggers">Diggers</Label>
                      <Input
                        id="diggers"
                        name="diggers"
                        type="number"
                        min="0"
                        defaultValue="0"
                      />
                    </div>
                    <div>
                      <Label htmlFor="pickups">Pickups</Label>
                      <Input
                        id="pickups"
                        name="pickups"
                        type="number"
                        min="0"
                        defaultValue="0"
                      />
                    </div>
                    <div>
                      <Label htmlFor="backyardMachines">BackYard Machines</Label>
                      <Input
                        id="backyardMachines"
                        name="backyardMachines"
                        type="number"
                        min="0"
                        defaultValue="0"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="hasSubcontractor" 
                      checked={hasSubcontractor}
                      onCheckedChange={(checked) => setHasSubcontractor(checked === true)}
                    />
                    <Label htmlFor="hasSubcontractor">This contractor is bringing subcontractors</Label>
                  </div>
                </div>

                {hasSubcontractor && (
                  <div className="space-y-4 border-t pt-4">
                    <h4 className="font-semibold text-lg">Subcontractor Information</h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="subName">Subcontractor Name</Label>
                        <Input
                          id="subName"
                          name="subName"
                          type="text"
                          placeholder="Individual or company name"
                          required={hasSubcontractor}
                        />
                      </div>
                      <div>
                        <Label htmlFor="subCompany">Subcontractor Company</Label>
                        <Input
                          id="subCompany"
                          name="subCompany"
                          type="text"
                          placeholder="Company name"
                          required={hasSubcontractor}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="subDepartureCity">Sub Departure City</Label>
                        <Input
                          id="subDepartureCity"
                          name="subDepartureCity"
                          type="text"
                          placeholder="e.g., Columbus"
                          required={hasSubcontractor}
                          data-testid="input-sub-departure-city"
                        />
                      </div>
                      <div>
                        <Label htmlFor="subDepartureState">Sub Departure State</Label>
                        <Input
                          id="subDepartureState"
                          name="subDepartureState"
                          type="text"
                          placeholder="e.g., TX"
                          required={hasSubcontractor}
                          data-testid="input-sub-departure-state"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h5 className="font-medium">Subcontractor Crew & Equipment</h5>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="subTotalFTE">Sub Total FTE</Label>
                          <Input
                            id="subTotalFTE"
                            name="subTotalFTE"
                            type="number"
                            min="0"
                            defaultValue="0"
                          />
                        </div>
                        <div>
                          <Label htmlFor="subBuckets">Sub Buckets</Label>
                          <Input
                            id="subBuckets"
                            name="subBuckets"
                            type="number"
                            min="0"
                            defaultValue="0"
                          />
                        </div>
                        <div>
                          <Label htmlFor="subDiggers">Sub Diggers</Label>
                          <Input
                            id="subDiggers"
                            name="subDiggers"
                            type="number"
                            min="0"
                            defaultValue="0"
                          />
                        </div>
                        <div>
                          <Label htmlFor="subPickups">Sub Pickups</Label>
                          <Input
                            id="subPickups"
                            name="subPickups"
                            type="number"
                            min="0"
                            defaultValue="0"
                          />
                        </div>
                        <div>
                          <Label htmlFor="subBackyardMachines">Sub BackYard Machines</Label>
                          <Input
                            id="subBackyardMachines"
                            name="subBackyardMachines"
                            type="number"
                            min="0"
                            defaultValue="0"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    placeholder="Additional information about availability..."
                    rows={3}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsManualEntryOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={manualEntryMutation.isPending}>
                    {manualEntryMutation.isPending ? "Saving..." : "Save Availability"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Button 
            variant="default" 
            onClick={() => exportAllSessionsData('excel')}
            data-testid="button-export-all-sessions"
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Export All Sessions
          </Button>

          {/* Edit Dialog */}
          <Dialog open={!!editingAvailability} onOpenChange={() => setEditingAvailability(null)}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Crew Availability</DialogTitle>
                <DialogDescription>
                  Update contractor availability information
                </DialogDescription>
              </DialogHeader>
              {editingAvailability && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  
                  const departureCity = formData.get('departureCity') as string;
                  const departureState = formData.get('departureState') as string;
                  const departureLocation = `${departureCity}, ${departureState}`;
                  
                  const data = {
                    departureCity,
                    departureState,
                    departureLocation,
                    totalFTE: parseInt(formData.get('totalFTE') as string) || 0,
                    buckets: parseInt(formData.get('buckets') as string) || 0,
                    diggers: parseInt(formData.get('diggers') as string) || 0,
                    pickups: parseInt(formData.get('pickups') as string) || 0,
                    backyardMachines: parseInt(formData.get('backyardMachines') as string) || 0,
                    notes: formData.get('notes'),
                    status: formData.get('status'),
                  };

                  editMutation.mutate({ id: editingAvailability.id, data });
                }} className="space-y-4">
                  
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label htmlFor="edit-contractor">Contractor (Read-only)</Label>
                      <Input
                        id="edit-contractor"
                        value={`${editingAvailability.contractor?.company} - ${editingAvailability.contractor?.name}`}
                        disabled
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="edit-departureCity">Departure City</Label>
                      <Input
                        id="edit-departureCity"
                        name="departureCity"
                        type="text"
                        placeholder="e.g., Detroit"
                        defaultValue={editingAvailability.departureCity || (editingAvailability.departureLocation ? editingAvailability.departureLocation.split(',')[0]?.trim() : '')}
                        required
                        data-testid="input-departure-city"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-departureState">Departure State</Label>
                      <Input
                        id="edit-departureState"
                        name="departureState"
                        type="text"
                        placeholder="e.g., TX"
                        defaultValue={editingAvailability.departureState || (editingAvailability.departureLocation ? editingAvailability.departureLocation.split(',')[1]?.trim() : '')}
                        required
                        data-testid="input-departure-state"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold">Crew & Equipment Composition</h4>
                    
                    {/* Total FTE on one line */}
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <Label htmlFor="edit-totalFTE">Total FTE</Label>
                        <Input
                          id="edit-totalFTE"
                          name="totalFTE"
                          type="number"
                          min="0"
                          defaultValue={editingAvailability.totalFTE || 0}
                        />
                      </div>
                    </div>
                    
                    {/* Equipment fields below */}
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <Label htmlFor="edit-buckets">Buckets</Label>
                        <Input
                          id="edit-buckets"
                          name="buckets"
                          type="number"
                          min="0"
                          defaultValue={editingAvailability.buckets || 0}
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-diggers">Diggers</Label>
                        <Input
                          id="edit-diggers"
                          name="diggers"
                          type="number"
                          min="0"
                          defaultValue={editingAvailability.diggers || 0}
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-pickups">Pickups</Label>
                        <Input
                          id="edit-pickups"
                          name="pickups"
                          type="number"
                          min="0"
                          defaultValue={editingAvailability.pickups || 0}
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-backyardMachines">BackYard Machines</Label>
                        <Input
                          id="edit-backyardMachines"
                          name="backyardMachines"
                          type="number"
                          min="0"
                          defaultValue={editingAvailability.backyardMachines || 0}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label htmlFor="edit-status">Status</Label>
                      <Select name="status" defaultValue={editingAvailability.status}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="submitted">Submitted</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="deployed">Deployed</SelectItem>
                          <SelectItem value="expired">Expired</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label htmlFor="edit-notes">Notes (Optional)</Label>
                      <Textarea
                        id="edit-notes"
                        name="notes"
                        rows={3}
                        placeholder="Additional notes or comments"
                        defaultValue={editingAvailability.notes || ''}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" type="button" onClick={() => setEditingAvailability(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={editMutation.isPending}>
                      {editMutation.isPending ? "Updating..." : "Update Entry"}
                    </Button>
                  </div>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Submissions</CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{availabilityData.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Crews</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {availabilityData
                .filter((item: CrewAvailability) => item.status === 'approved')
                .reduce((sum: number, item: CrewAvailability) => sum + getTotalCrew(item), 0)}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {availabilityData.filter((item: CrewAvailability) => item.status === 'submitted').length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Currently Deployed</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {availabilityData.filter((item: CrewAvailability) => item.status === 'deployed').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Approved Contractors Distance Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Approved Contractors - Distance Analysis</CardTitle>
          <CardDescription>
            Calculate travel distances and times at 55mph for approved contractors
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
              <div className="flex-1">
                <Label>Destination Locations</Label>
                <div className="space-y-2">
                  {analysisLocations.map((location, index) => (
                    <div key={index} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Input
                          placeholder={`Location ${index + 1} (e.g., Detroit, MI)`}
                          value={location}
                          onChange={(e) => updateLocation(index, e.target.value)}
                        />
                      </div>
                      {analysisLocations.length > 1 && (
                        <Button 
                          type="button"
                          variant="outline" 
                          size="sm"
                          onClick={() => removeLocation(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={addLocation}
                    className="text-xs"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Destination
                  </Button>
                </div>
              </div>
              <Button 
                onClick={calculateDistances}
                disabled={isCalculatingDistances || analysisLocations.filter(loc => loc.trim()).length === 0}
                className="w-full sm:w-auto"
              >
                {isCalculatingDistances ? "Calculating..." : "Calculate Distances"}
              </Button>
            </div>

            {distanceResults.length > 0 && (
              <div className="mt-6">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-3">
                  <h4 className="font-semibold">Distance Analysis Results</h4>
                  <div className="flex gap-2 flex-col sm:flex-row">
                    <Button onClick={exportToExcel} variant="outline" size="sm" className="w-full sm:w-auto" data-testid="button-export-excel-standard">
                      <Download className="w-4 h-4 mr-2" />
                      Export to Excel
                    </Button>
                    <Button onClick={exportToExcelColorCoded} variant="outline" size="sm" className="w-full sm:w-auto" data-testid="button-export-excel-color-coded">
                      <Download className="w-4 h-4 mr-2" />
                      Color Coded Export
                    </Button>
                  </div>
                </div>
                {/* Desktop/Tablet Table - Show on medium screens and larger */}
                <div className="hidden md:block">
                  <div className="min-w-full overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[20%]">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleSort('contractor')}
                            className="h-8 p-0 font-semibold text-xs"
                          >
                            Contractor
                            <ArrowUpDown className="ml-1 h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead className="w-[15%]">
                          <span className="text-xs font-semibold">Departure</span>
                        </TableHead>
                        {/* Dynamic destination columns - separate distance and time columns */}
                        {analysisLocations.filter(loc => loc.trim()).map((location, index) => [
                          <TableHead key={`${index}-dist`} className="w-[8%]">
                            <div className="text-center">
                              <div className="text-xs font-semibold text-blue-600 mb-1">
                                {location.length > 12 ? location.substring(0, 12) + '...' : location}
                              </div>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleSort(`distance_${index}`)}
                                className="h-6 px-1 font-semibold text-xs"
                              >
                                Distance <ArrowUpDown className="ml-1 h-2 w-2" />
                              </Button>
                            </div>
                          </TableHead>,
                          <TableHead key={`${index}-time`} className="w-[8%]">
                            <div className="text-center">
                              <div className="text-xs font-semibold text-blue-600 mb-1">
                                &nbsp;
                              </div>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleSort(`travelTime_${index}`)}
                                className="h-6 px-1 font-semibold text-xs"
                              >
                                Time <ArrowUpDown className="ml-1 h-2 w-2" />
                              </Button>
                            </div>
                          </TableHead>
                        ]).flat()}
                        <TableHead className="w-[9%]">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleSort('totalFTE')}
                            className="h-8 p-0 font-semibold text-xs"
                          >
                            FTE
                            <ArrowUpDown className="ml-1 h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead className="w-[9%]">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleSort('buckets')}
                            className="h-8 p-0 font-semibold text-xs"
                          >
                            Buckets
                            <ArrowUpDown className="ml-1 h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead className="w-[9%]">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleSort('diggers')}
                            className="h-8 p-0 font-semibold text-xs"
                          >
                            Diggers
                            <ArrowUpDown className="ml-1 h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead className="w-[9%]">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleSort('pickups')}
                            className="h-8 p-0 font-semibold text-xs"
                          >
                            Pickups
                            <ArrowUpDown className="ml-1 h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead className="w-[9%]">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleSort('backyardMachines')}
                            className="h-8 p-0 font-semibold text-xs"
                          >
                            BYM
                            <ArrowUpDown className="ml-1 h-3 w-3" />
                          </Button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getSortedResults().map((result: any) => (
                        <TableRow key={result.id}>
                          <TableCell className="p-2">
                            <div>
                              <div className="font-medium text-xs">{result.contractor?.company}</div>
                              <div className="text-xs text-gray-500">{result.contractor?.name}</div>
                            </div>
                          </TableCell>
                          <TableCell className="p-2">
                            <div className="text-xs flex items-center gap-1">
                              {result.departureLocation}
                              {result.contractor?.departureLocations && result.contractor.departureLocations.length > 1 && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <MapPin className="w-3 h-3 text-blue-600 cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                      <div className="text-xs">
                                        <div className="font-semibold mb-1">All Storage Yards:</div>
                                        {result.contractor.departureLocations.map((loc: any, idx: number) => (
                                          <div key={idx} className="py-0.5">• {loc.location}</div>
                                        ))}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </TableCell>
                          {/* Dynamic destination columns - separate distance and time cells */}
                          {analysisLocations.filter(loc => loc.trim()).map((location, index) => [
                            <TableCell key={`${index}-dist`} className="p-2 text-center">
                              <div className="font-medium text-blue-600 text-xs">
                                {result[`distance_${index}`] || 'N/A'}
                              </div>
                            </TableCell>,
                            <TableCell key={`${index}-time`} className="p-2 text-center">
                              <div className="font-medium text-green-600 text-xs">
                                {result[`travelTime_${index}`] || 'N/A'}
                              </div>
                            </TableCell>
                          ]).flat()}
                          <TableCell className="p-2">
                            <div className="text-center font-medium text-xs">
                              {getTotalCrew(result)}
                            </div>
                          </TableCell>
                          <TableCell className="p-2">
                            <div className="text-center text-xs">
                              {result.buckets || 0}
                            </div>
                          </TableCell>
                          <TableCell className="p-2">
                            <div className="text-center text-xs">
                              {result.diggers || 0}
                            </div>
                          </TableCell>
                          <TableCell className="p-2">
                            <div className="text-center text-xs">
                              {result.pickups || 0}
                            </div>
                          </TableCell>
                          <TableCell className="p-2">
                            <div className="text-center text-xs">
                              {result.backyardMachines || 0}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Totals Row */}
                      <TableRow className="bg-gray-50 font-bold border-t-2">
                        <TableCell colSpan={2 + (analysisLocations.filter(loc => loc.trim()).length * 2)} className="text-right p-2">
                          <strong className="text-xs">TOTALS:</strong>
                        </TableCell>
                        <TableCell className="text-center bg-blue-50 p-2">
                          <strong className="text-xs">{calculateTotals().totalFTE}</strong>
                        </TableCell>
                        <TableCell className="text-center bg-blue-50 p-2">
                          <strong className="text-xs">{calculateTotals().buckets}</strong>
                        </TableCell>
                        <TableCell className="text-center bg-blue-50 p-2">
                          <strong className="text-xs">{calculateTotals().diggers}</strong>
                        </TableCell>
                        <TableCell className="text-center bg-blue-50 p-2">
                          <strong className="text-xs">{calculateTotals().pickups}</strong>
                        </TableCell>
                        <TableCell className="text-center bg-blue-50 p-2">
                          <strong className="text-xs">{calculateTotals().backyardMachines}</strong>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  </div>
                </div>

                {/* Mobile Card Layout */}
                <div className="md:hidden space-y-4">
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Button 
                      variant={sortField === 'distance' ? 'default' : 'outline'} 
                      size="sm" 
                      onClick={() => handleSort('distance')}
                      className="text-xs"
                    >
                      Distance <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                    <Button 
                      variant={sortField === 'totalFTE' ? 'default' : 'outline'} 
                      size="sm" 
                      onClick={() => handleSort('totalFTE')}
                      className="text-xs"
                    >
                      FTE <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                    <Button 
                      variant={sortField === 'contractor' ? 'default' : 'outline'} 
                      size="sm" 
                      onClick={() => handleSort('contractor')}
                      className="text-xs"
                    >
                      Company <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                  </div>

                  {getSortedResults().map((result: any) => (
                    <Card key={result.id} className="p-4">
                      <div className="space-y-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-medium text-sm">{result.contractor?.company}</div>
                            <div className="text-xs text-gray-500">{result.contractor?.name}</div>
                            <div className="text-xs text-blue-600 font-medium mt-1 flex items-center gap-1">
                              <strong>From:</strong> {result.departureLocation}
                              {result.contractor?.departureLocations && result.contractor.departureLocations.length > 1 && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <MapPin className="w-3 h-3 cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                      <div className="text-xs">
                                        <div className="font-semibold mb-1">All Storage Yards:</div>
                                        {result.contractor.departureLocations.map((loc: any, idx: number) => (
                                          <div key={idx} className="py-0.5">• {loc.location}</div>
                                        ))}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Distance and Travel Time Grid for All Destinations */}
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-gray-700">Distances & Travel Times:</div>
                          <div className="grid gap-2">
                            {analysisLocations.filter(loc => loc.trim()).map((location, index) => (
                              <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded text-xs">
                                <div className="font-medium text-blue-600">
                                  {location.length > 20 ? location.substring(0, 20) + '...' : location}
                                </div>
                                <div className="flex gap-3 text-right">
                                  <div>
                                    <span className="font-medium text-blue-600">{result[`distance_${index}`] || 'N/A'}</span>
                                    <span className="text-gray-500"> mi</span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-green-600">{result[`travelTime_${index}`] || 'N/A'}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        {/* Equipment Grid */}
                        <div className="grid grid-cols-5 gap-2 text-center bg-blue-50 p-2 rounded">
                          <div>
                            <div className="text-xs font-medium text-gray-600">FTE</div>
                            <div className="text-sm font-bold text-blue-600">{getTotalCrew(result)}</div>
                          </div>
                          <div>
                            <div className="text-xs font-medium text-gray-600">Buckets</div>
                            <div className="text-sm font-medium">{result.buckets || 0}</div>
                          </div>
                          <div>
                            <div className="text-xs font-medium text-gray-600">Diggers</div>
                            <div className="text-sm font-medium">{result.diggers || 0}</div>
                          </div>
                          <div>
                            <div className="text-xs font-medium text-gray-600">Pickups</div>
                            <div className="text-sm font-medium">{result.pickups || 0}</div>
                          </div>
                          <div>
                            <div className="text-xs font-medium text-gray-600">BYM</div>
                            <div className="text-sm font-medium">{result.backyardMachines || 0}</div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}

                  {/* Mobile Totals Card */}
                  <Card className="p-4 bg-blue-50 border-blue-200">
                    <div className="text-center">
                      <div className="text-sm font-bold mb-2">TOTALS</div>
                      <div className="grid grid-cols-5 gap-2 text-center">
                        <div>
                          <div className="text-xs font-medium text-gray-600">FTE</div>
                          <div className="text-lg font-bold text-blue-600">{calculateTotals().totalFTE}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-600">Buckets</div>
                          <div className="text-lg font-bold text-blue-600">{calculateTotals().buckets}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-600">Diggers</div>
                          <div className="text-lg font-bold text-blue-600">{calculateTotals().diggers}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-600">Pickups</div>
                          <div className="text-lg font-bold text-blue-600">{calculateTotals().pickups}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-600">BYM</div>
                          <div className="text-lg font-bold text-blue-600">{calculateTotals().backyardMachines}</div>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-700">
                    <strong>Analysis Locations:</strong> {analysisLocations.filter(loc => loc.trim()).join(', ')} | 
                    <strong> Approved Contractors Found:</strong> {distanceResults.length} | 
                    <strong> Total Available FTE:</strong> {calculateTotals().totalFTE}
                  </p>
                </div>
              </div>
            )}

            {availabilityData.filter((item: any) => item.status === 'approved').length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No approved contractors available for distance analysis. Approve some contractors first.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Availability Submissions</CardTitle>
              <CardDescription>
                Review and manage contractor availability submissions
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => exportAvailabilityData('csv')}
                data-testid="button-export-csv"
                disabled={availabilityData.length === 0}
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => exportAvailabilityData('excel')}
                data-testid="button-export-excel"
                disabled={availabilityData.length === 0}
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Export Excel
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => exportAIMatchedData('excel')}
                data-testid="button-export-ai-excel"
                disabled={availabilityData.length === 0}
                className="bg-blue-50 hover:bg-blue-100 border-blue-200"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                AI-Enhanced Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading availability data...</div>
          ) : availabilityData.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No availability submissions found. Upload a file or add manually to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contractor</TableHead>
                    <TableHead>Crew & Equipment</TableHead>
                    <TableHead>Departure</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted By</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availabilityData
                    .slice()
                    .sort((a: any, b: any) => new Date(a.submissionDate).getTime() - new Date(b.submissionDate).getTime())
                    .map((availability: CrewAvailability) => (
                    <TableRow key={availability.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{availability.contractor?.company}</div>
                          <div className="text-sm text-gray-500">{availability.contractor?.name}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-medium">Total FTE: {getTotalCrew(availability)}</div>
                          <div className="text-gray-500">{getEquipmentSummary(availability)}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {availability.departureCity && availability.departureState 
                            ? `${availability.departureCity}, ${availability.departureState}`
                            : availability.departureLocation || 'Not specified'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(availability.status)}
                      </TableCell>
                      <TableCell>{availability.submittedBy}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingAvailability(availability)}
                          >
                            Edit
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Availability Entry</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this availability entry for {availability.contractor?.name}? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(availability.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => statusUpdateMutation.mutate({ 
                              id: availability.id, 
                              status: availability.status === 'approved' ? 'submitted' : 'approved' 
                            })}
                            disabled={statusUpdateMutation.isPending}
                          >
                            {availability.status === 'approved' ? 'Unapprove' : 'Approve'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      {/* Session Naming Dialog */}
      <Dialog open={isSessionDialogOpen} onOpenChange={setIsSessionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start New Session</DialogTitle>
            <DialogDescription>
              Enter a name for your new availability session. This will save current submissions and start fresh.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="sessionName">Session Name</Label>
              <Input
                id="sessionName"
                placeholder="e.g., Week of Jan 15, 2025"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                data-testid="input-session-name"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsSessionDialogOpen(false);
                  setNewSessionName('');
                }}
                data-testid="button-cancel-session"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (newSessionName.trim()) {
                    startNewSessionMutation.mutate(newSessionName.trim());
                  } else {
                    toast({
                      title: "Session Name Required",
                      description: "Please enter a name for the new session.",
                      variant: "destructive",
                    });
                  }
                }}
                disabled={startNewSessionMutation.isPending || !newSessionName.trim()}
                className="bg-green-600 hover:bg-green-700"
                data-testid="button-create-session"
              >
                {startNewSessionMutation.isPending ? (
                  <>
                    <Clock className="w-4 h-4 mr-2 animate-spin" />
                    Creating Session...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Create Session
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}