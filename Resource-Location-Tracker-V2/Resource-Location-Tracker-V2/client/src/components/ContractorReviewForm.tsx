import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertContractorReviewSchema, type InsertContractorReview, type Contractor } from "@shared/schema";
import { Star, CheckCircle } from "lucide-react";
import { z } from "zod";

// Extend the schema to add submitter name
const reviewFormSchema = insertContractorReviewSchema.extend({
  submitterName: z.string().min(1, "Submitter name is required"),
});

type ReviewFormData = z.infer<typeof reviewFormSchema>;

interface ContractorReviewFormProps {
  contractor: Contractor;
  onSubmit: () => void;
  onSkip: () => void;
  currentIndex: number;
  totalCount: number;
  isTargetedReview?: boolean;
}

const StarRating = ({ value, onChange }: { value: number; onChange: (value: number) => void }) => {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="focus:outline-none hover:scale-110 transition-transform"
        >
          <Star
            className={`w-6 h-6 ${
              star <= value
                ? "fill-yellow-400 text-yellow-400"
                : "text-gray-300 hover:text-yellow-300"
            }`}
          />
        </button>
      ))}
    </div>
  );
};

export default function ContractorReviewForm({
  contractor,
  onSubmit,
  onSkip,
  currentIndex,
  totalCount,
  isTargetedReview = false,
}: ContractorReviewFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ReviewFormData>({
    resolver: zodResolver(reviewFormSchema),
    key: contractor.id, // This ensures form resets when contractor changes
    defaultValues: {
      contractorId: contractor.id,
      submitterName: "",
      communicationRating: 0,
      workQualityRating: 0,
      collaborationRating: 0,
      documentationRating: 0,
      hadConflicts: false,
      conflictDetails: "",
      strengths: "",
      improvementAreas: "",
      metSafetyStandards: true,
      safetyIssues: "",
      adheredToSchedule: true,
      scheduleIssues: "",
      wouldRecommend: true,
      additionalComments: "",
    },
  });

  // Reset form when contractor changes
  useEffect(() => {
    form.reset({
      contractorId: contractor.id,
      submitterName: "",
      communicationRating: 0,
      workQualityRating: 0,
      collaborationRating: 0,
      documentationRating: 0,
      hadConflicts: false,
      conflictDetails: "",
      strengths: "",
      improvementAreas: "",
      metSafetyStandards: true,
      safetyIssues: "",
      adheredToSchedule: true,
      scheduleIssues: "",
      wouldRecommend: true,
      additionalComments: "",
    });
  }, [contractor.id, form]);

  const reviewMutation = useMutation({
    mutationFn: (data: InsertContractorReview) =>
      apiRequest("POST", "/api/contractor-reviews", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractor-reviews"] });
      toast({
        description: "Review submitted successfully",
        className: "bg-green-50 border-green-200",
      });
      onSubmit();
    },
    onError: (error: any) => {
      toast({
        description: `Failed to submit review: ${error?.message || "Unknown error"}`,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: ReviewFormData) => {
    reviewMutation.mutate(data);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Contractor Storm Response Review Form
            </h1>
            <p className="text-gray-600 dark:text-gray-300 mt-1">
              Review contractor performance after storm response participation
            </p>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {currentIndex + 1} of {totalCount}
          </div>
        </div>
        
        <Card className="mb-6 border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="text-lg text-blue-800 dark:text-blue-200">
              Reviewing: {contractor.name}
            </CardTitle>
            <CardDescription className="text-blue-600 dark:text-blue-300">
              {contractor.company} • {contractor.category}
              {contractor.city && contractor.state && ` • ${contractor.city}, ${contractor.state}`}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Reviewer Information</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="submitterName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter your full name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Performance Ratings</CardTitle>
              <CardDescription>Rate each area on a scale of 1-5 stars</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="communicationRating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-medium">
                      How effectively did the contractor communicate with our team during the storm response? *
                    </FormLabel>
                    <FormControl>
                      <StarRating value={field.value} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="workQualityRating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-medium">
                      How would you rate the quality of the contractor's work? *
                    </FormLabel>
                    <FormControl>
                      <StarRating value={field.value} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="collaborationRating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-medium">
                      How effectively did the contractor collaborate with our team and other stakeholders? *
                    </FormLabel>
                    <FormControl>
                      <StarRating value={field.value} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="documentationRating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-medium">
                      How accurate and timely was the contractor's documentation and reporting? *
                    </FormLabel>
                    <FormControl>
                      <StarRating value={field.value} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Issues and Conflicts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="hadConflicts"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-medium">
                      Were there any conflicts or issues that arose? *
                    </FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value.toString()}
                        onValueChange={(value) => field.onChange(value === "true")}
                        className="flex gap-6"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="true" id="conflicts-yes" />
                          <label htmlFor="conflicts-yes">Yes</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="false" id="conflicts-no" />
                          <label htmlFor="conflicts-no">No</label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch("hadConflicts") && (
                <FormField
                  control={form.control}
                  name="conflictDetails"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>What conflicts or issues arose, and how were they resolved?</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe the conflicts/issues and their resolution..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Performance Feedback</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="strengths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-medium">
                      What were the strengths of the contractor's performance?
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the contractor's key strengths..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="improvementAreas"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-medium">
                      What areas could the contractor improve upon for future projects?
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe areas for improvement..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Safety and Compliance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="metSafetyStandards"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-medium">
                      Did the contractor meet all safety and regulatory standards? *
                    </FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value.toString()}
                        onValueChange={(value) => field.onChange(value === "true")}
                        className="flex gap-6"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="true" id="safety-yes" />
                          <label htmlFor="safety-yes">Yes</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="false" id="safety-no" />
                          <label htmlFor="safety-no">No</label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!form.watch("metSafetyStandards") && (
                <FormField
                  control={form.control}
                  name="safetyIssues"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>What safety or regulatory issues were present?</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe the safety or regulatory issues..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Schedule and Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="adheredToSchedule"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-medium">
                      Did the contractor adhere to the agreed-upon timelines and schedules? *
                    </FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value.toString()}
                        onValueChange={(value) => field.onChange(value === "true")}
                        className="flex gap-6"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="true" id="schedule-yes" />
                          <label htmlFor="schedule-yes">Yes</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="false" id="schedule-no" />
                          <label htmlFor="schedule-no">No</label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!form.watch("adheredToSchedule") && (
                <FormField
                  control={form.control}
                  name="scheduleIssues"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>What issues arose regarding time and schedule?</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe the timing and schedule issues..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recommendation and Additional Comments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="wouldRecommend"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-medium">
                      Would you recommend this contractor for future storm response work? *
                    </FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value.toString()}
                        onValueChange={(value) => field.onChange(value === "true")}
                        className="flex gap-6"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="true" id="recommend-yes" />
                          <label htmlFor="recommend-yes">Yes</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="false" id="recommend-no" />
                          <label htmlFor="recommend-no">No</label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="additionalComments"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-medium">
                      Do you have any additional comments or suggestions regarding the contractor's performance?
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Any additional comments or suggestions..."
                        {...field}
                        rows={4}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className={`flex ${isTargetedReview ? 'justify-end' : 'justify-between'} items-center pt-6 border-t`}>
            {!isTargetedReview && (
              <Button
                type="button"
                variant="outline"
                onClick={onSkip}
                disabled={reviewMutation.isPending}
              >
                Skip This Contractor
              </Button>
            )}
            
            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={reviewMutation.isPending}
                className="min-w-[120px]"
              >
                {reviewMutation.isPending ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Submitting...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Submit Review
                  </div>
                )}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}