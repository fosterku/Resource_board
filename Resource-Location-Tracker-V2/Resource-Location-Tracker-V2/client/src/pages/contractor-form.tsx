import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Truck, Calendar, Building, User, Phone, Mail, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";

const categories = ["Union", "Non-Union", "Veg", "HVAC", "DAT", "Consulting"];

export default function ContractorAvailabilityForm() {
  const { toast } = useToast();
  const [location] = useLocation();
  const [hasSubcontractor, setHasSubcontractor] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionLabel, setSessionLabel] = useState<string>("");
  const [departureCoords, setDepartureCoords] = useState<{lat: number, lon: number} | null>(null);
  const [subDepartureCoords, setSubDepartureCoords] = useState<{lat: number, lon: number} | null>(null);
  const [isValidatingLocation, setIsValidatingLocation] = useState(false);

  // Extract session ID from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionParam = params.get('session');
    setSessionId(sessionParam);
  }, [location]);

  // Fetch session details if sessionId is provided
  const { data: sessionData, isLoading: isLoadingSession } = useQuery({
    queryKey: ["/api/availability-sessions", sessionId],
    queryFn: async () => {
      if (!sessionId || sessionId === 'active') return null;
      const response = await fetch(`/api/availability-sessions/${sessionId}`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!sessionId && sessionId !== 'active'
  });

  useEffect(() => {
    if (sessionData) {
      setSessionLabel(sessionData.label);
    } else if (sessionId === 'active') {
      setSessionLabel('Active Session');
    } else if (!sessionId) {
      setSessionLabel('Active Session (default)');
    }
  }, [sessionData, sessionId]);

  // Geocoding validation function
  const validateLocation = async (location: string): Promise<{lat: number, lon: number} | null> => {
    try {
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location })
      });
      
      const data = await response.json();
      
      if (data.success) {
        return { lat: data.latitude, lon: data.longitude };
      } else {
        toast({
          title: "Invalid Location",
          description: data.message || "Please enter a valid city and state (e.g., 'Atlanta, GA')",
          variant: "destructive"
        });
        return null;
      }
    } catch (error) {
      toast({
        title: "Validation Error",
        description: "Could not validate location. Please try again.",
        variant: "destructive"
      });
      return null;
    }
  };

  // Form submission mutation
  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/contractor-submissions', data);
    },
    onSuccess: () => {
      setIsSubmitted(true);
      toast({
        title: "Submission Successful",
        description: "Your availability information has been submitted successfully. We will review it and contact you soon.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Could not submit your availability information. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setIsValidatingLocation(true);
    
    const formData = new FormData(event.currentTarget);
    const departureCity = formData.get('departureCity') as string;
    const departureState = formData.get('departureState') as string;
    const departureLocation = `${departureCity}, ${departureState}`;
    
    const subDepartureCity = formData.get('subDepartureCity') as string;
    const subDepartureState = formData.get('subDepartureState') as string;
    const subDepartureLocation = hasSubcontractor && subDepartureCity && subDepartureState 
      ? `${subDepartureCity}, ${subDepartureState}` 
      : '';
    
    // Validate main departure location
    const coords = await validateLocation(departureLocation);
    if (!coords) {
      setIsSubmitting(false);
      setIsValidatingLocation(false);
      return;
    }
    setDepartureCoords(coords);
    
    // Validate subcontractor departure location if present
    let subCoords = null;
    if (hasSubcontractor && subDepartureLocation) {
      subCoords = await validateLocation(subDepartureLocation);
      if (!subCoords) {
        setIsSubmitting(false);
        setIsValidatingLocation(false);
        return;
      }
      setSubDepartureCoords(subCoords);
    }
    
    setIsValidatingLocation(false);
    
    const data = {
      // Company Information
      contractorName: formData.get('contractorName'),
      companyName: formData.get('companyName'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      category: formData.get('category'),
      birdRep: formData.get('birdRep') || 'TBD',
      
      // Availability Information with geocoded coordinates and separate city/state
      departureCity,
      departureState,
      departureLocation,
      departureLatitude: coords.lat,
      departureLongitude: coords.lon,
      totalFTE: parseInt(formData.get('totalFTE') as string) || 0,
      buckets: parseInt(formData.get('buckets') as string) || 0,
      diggers: parseInt(formData.get('diggers') as string) || 0,
      pickups: parseInt(formData.get('pickups') as string) || 0,
      backyardMachines: parseInt(formData.get('backyardMachines') as string) || 0,
      notes: formData.get('notes'),
      submittedBy: 'contractor', // Identify as contractor submission
      
      // Session ID - link submission to specific session
      sessionId: sessionId || 'active',
      
      // Subcontractor data with geocoded coordinates and separate city/state
      hasSubcontractor,
      subcontractorData: hasSubcontractor ? {
        name: formData.get('subName'),
        company: formData.get('subCompany'),
        departureCity: subDepartureCity,
        departureState: subDepartureState,
        departureLocation: subDepartureLocation,
        departureLatitude: subCoords?.lat,
        departureLongitude: subCoords?.lon,
        totalFTE: parseInt(formData.get('subTotalFTE') as string) || 0,
        buckets: parseInt(formData.get('subBuckets') as string) || 0,
        diggers: parseInt(formData.get('subDiggers') as string) || 0,
        pickups: parseInt(formData.get('subPickups') as string) || 0,
        backyardMachines: parseInt(formData.get('subBackyardMachines') as string) || 0,
      } : undefined
    };

    submitMutation.mutate(data);
    setIsSubmitting(false);
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="text-center p-8">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Submission Successful!
            </h2>
            <p className="text-gray-600 mb-6">
              Thank you for submitting your availability information. Our team will review your submission and contact you within 24 hours.
            </p>
            <div className="text-sm text-gray-500">
              <p>Need to make changes?</p>
              <p>Please contact our operations team directly.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-blue-600 p-3 rounded-full">
              <Truck className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Contractor Availability Submission
          </h1>
          {sessionLabel && (
            <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-800 px-4 py-2 rounded-full mb-2">
              <Calendar className="w-4 h-4" />
              <span className="font-semibold">Session: {sessionLabel}</span>
            </div>
          )}
          <p className="text-gray-600 max-w-2xl mx-auto mt-2">
            Submit your crew and equipment availability information. All fields are required unless marked as optional.
          </p>
        </div>

        {/* Warning if no session or invalid session */}
        {!sessionId && (
          <Card className="mb-6 border-yellow-200 bg-yellow-50">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="font-semibold text-yellow-800">No Session Specified</p>
                <p className="text-sm text-yellow-700">
                  This form link doesn't specify a session. Your submission will be added to the active session. 
                  If you received a specific form link, please use that instead.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="w-5 h-5" />
              Company & Contact Information
            </CardTitle>
            <CardDescription>
              Provide your company details and primary contact information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Company Information Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="contractorName">Contact Person Name *</Label>
                  <Input
                    id="contractorName"
                    name="contractorName"
                    placeholder="John Smith"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="companyName">Company Name *</Label>
                  <Input
                    id="companyName"
                    name="companyName"
                    placeholder="ABC Electrical Services"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="contact@company.com"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="category">Company Category *</Label>
                  <Select name="category" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="birdRep">Bird Representative (Optional)</Label>
                  <Input
                    id="birdRep"
                    name="birdRep"
                    placeholder="Representative name"
                  />
                </div>
              </div>

              {/* Availability Information Section */}
              <div className="border-t pt-8">
                <div className="mb-6">
                  <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2 mb-2">
                    <User className="w-5 h-5" />
                    Crew & Equipment Availability
                  </h3>
                  <p className="text-gray-600">
                    Provide details about your available crew and equipment
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="departureCity">Departure City *</Label>
                    <Input
                      id="departureCity"
                      name="departureCity"
                      placeholder="e.g., Atlanta"
                      required
                      data-testid="input-departure-city"
                    />
                  </div>
                  <div>
                    <Label htmlFor="departureState">Departure State *</Label>
                    <Input
                      id="departureState"
                      name="departureState"
                      placeholder="e.g., TX"
                      required
                      data-testid="input-departure-state"
                    />
                  </div>
                  <div>
                    <Label htmlFor="totalFTE">Total FTE (Full Time Equivalent) *</Label>
                    <Input
                      id="totalFTE"
                      name="totalFTE"
                      type="number"
                      min="0"
                      placeholder="0"
                      required
                    />
                  </div>
                </div>

                {/* Equipment Section */}
                <div className="mt-6">
                  <h4 className="text-lg font-medium text-gray-900 mb-4">Equipment Available</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <Label htmlFor="buckets">Bucket Trucks</Label>
                      <Input
                        id="buckets"
                        name="buckets"
                        type="number"
                        min="0"
                        defaultValue="0"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label htmlFor="diggers">Digger Trucks</Label>
                      <Input
                        id="diggers"
                        name="diggers"
                        type="number"
                        min="0"
                        defaultValue="0"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label htmlFor="pickups">Pickup Trucks</Label>
                      <Input
                        id="pickups"
                        name="pickups"
                        type="number"
                        min="0"
                        defaultValue="0"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label htmlFor="backyardMachines">Backyard Machines</Label>
                      <Input
                        id="backyardMachines"
                        name="backyardMachines"
                        type="number"
                        min="0"
                        defaultValue="0"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Subcontractor Section */}
              <div className="border-t pt-8">
                <div className="flex items-center space-x-2 mb-6">
                  <Checkbox 
                    id="hasSubcontractor" 
                    checked={hasSubcontractor} 
                    onCheckedChange={(checked) => setHasSubcontractor(checked === true)}
                  />
                  <Label htmlFor="hasSubcontractor" className="text-lg font-medium">
                    I am bringing subcontractors
                  </Label>
                </div>

                {hasSubcontractor && (
                  <div className="bg-gray-50 rounded-lg p-6 space-y-6">
                    <h4 className="text-lg font-medium text-gray-900">Subcontractor Information</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="subName">Subcontractor Contact Name *</Label>
                        <Input
                          id="subName"
                          name="subName"
                          placeholder="Jane Doe"
                          required={hasSubcontractor}
                        />
                      </div>
                      <div>
                        <Label htmlFor="subCompany">Subcontractor Company Name *</Label>
                        <Input
                          id="subCompany"
                          name="subCompany"
                          placeholder="XYZ Contracting"
                          required={hasSubcontractor}
                        />
                      </div>
                      <div>
                        <Label htmlFor="subDepartureCity">Subcontractor Departure City *</Label>
                        <Input
                          id="subDepartureCity"
                          name="subDepartureCity"
                          placeholder="e.g., Columbus"
                          required={hasSubcontractor}
                          data-testid="input-sub-departure-city"
                        />
                      </div>
                      <div>
                        <Label htmlFor="subDepartureState">Subcontractor Departure State *</Label>
                        <Input
                          id="subDepartureState"
                          name="subDepartureState"
                          placeholder="e.g., TX"
                          required={hasSubcontractor}
                          data-testid="input-sub-departure-state"
                        />
                      </div>
                      <div>
                        <Label htmlFor="subTotalFTE">Subcontractor FTE *</Label>
                        <Input
                          id="subTotalFTE"
                          name="subTotalFTE"
                          type="number"
                          min="0"
                          placeholder="0"
                          required={hasSubcontractor}
                        />
                      </div>
                    </div>

                    <div>
                      <h5 className="text-md font-medium text-gray-900 mb-4">Subcontractor Equipment</h5>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <Label htmlFor="subBuckets">Bucket Trucks</Label>
                          <Input
                            id="subBuckets"
                            name="subBuckets"
                            type="number"
                            min="0"
                            defaultValue="0"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <Label htmlFor="subDiggers">Digger Trucks</Label>
                          <Input
                            id="subDiggers"
                            name="subDiggers"
                            type="number"
                            min="0"
                            defaultValue="0"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <Label htmlFor="subPickups">Pickup Trucks</Label>
                          <Input
                            id="subPickups"
                            name="subPickups"
                            type="number"
                            min="0"
                            defaultValue="0"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <Label htmlFor="subBackyardMachines">Backyard Machines</Label>
                          <Input
                            id="subBackyardMachines"
                            name="subBackyardMachines"
                            type="number"
                            min="0"
                            defaultValue="0"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes Section */}
              <div className="border-t pt-8">
                <div>
                  <Label htmlFor="notes">Additional Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    placeholder="Any additional information about your availability, special requirements, or equipment..."
                    rows={4}
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="border-t pt-8">
                <div className="flex justify-center">
                  <Button 
                    type="submit" 
                    size="lg"
                    disabled={isSubmitting || submitMutation.isPending}
                    className="px-8 py-3"
                  >
                    {isSubmitting || submitMutation.isPending ? (
                      <>
                        <Calendar className="w-4 h-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Submit Availability
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>
            Questions about this form? Contact our operations team for assistance.
          </p>
        </div>
      </div>
    </div>
  );
}