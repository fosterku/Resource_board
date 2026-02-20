import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Star, Trash2, Calendar, User, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { calculateContractorAverageRating } from "@/utils/reviewUtils";
import type { Contractor, ContractorReview } from "@shared/schema";

interface ContractorReviewsModalProps {
  contractor: Contractor;
  isOpen: boolean;
  onClose: () => void;
}

const StarDisplay = ({ rating }: { rating: number }) => (
  <div className="flex gap-1">
    {[1, 2, 3, 4, 5].map((star) => (
      <Star
        key={star}
        className={`w-4 h-4 ${
          star <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
        }`}
      />
    ))}
  </div>
);

const BooleanDisplay = ({ value, trueText = "Yes", falseText = "No" }: { 
  value: boolean; 
  trueText?: string; 
  falseText?: string; 
}) => (
  <div className="flex items-center gap-2">
    {value ? (
      <>
        <CheckCircle className="w-4 h-4 text-green-600" />
        <span className="text-green-700">{trueText}</span>
      </>
    ) : (
      <>
        <XCircle className="w-4 h-4 text-red-600" />
        <span className="text-red-700">{falseText}</span>
      </>
    )}
  </div>
);

export default function ContractorReviewsModal({ 
  contractor, 
  isOpen, 
  onClose 
}: ContractorReviewsModalProps) {
  const [deletingReviewId, setDeletingReviewId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allReviews = [], isLoading } = useQuery<ContractorReview[]>({
    queryKey: ["/api/contractor-reviews"],
  });

  const contractorReviews = allReviews.filter(review => review.contractorId === contractor.id);
  const averageRating = calculateContractorAverageRating(contractorReviews);

  const deleteMutation = useMutation({
    mutationFn: async (reviewId: number) => {
      const response = await fetch(`/api/contractor-reviews/${reviewId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error('Failed to delete review');
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractor-reviews"] });
      toast({
        title: "Review deleted",
        description: "The review has been successfully removed.",
      });
      setDeletingReviewId(null);
    },
    onError: (error) => {
      console.error("Error deleting review:", error);
      toast({
        title: "Error",
        description: "Failed to delete review. Please try again.",
        variant: "destructive",
      });
      setDeletingReviewId(null);
    },
  });

  const handleDeleteReview = (reviewId: number) => {
    if (window.confirm("Are you sure you want to delete this review? This action cannot be undone.")) {
      setDeletingReviewId(reviewId);
      deleteMutation.mutate(reviewId);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Reviews for {contractor.company}
          </DialogTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {contractor.name} • {contractor.category}
          </p>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : contractorReviews.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              No reviews have been submitted for this contractor yet.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Card */}
            <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <CardHeader>
                <CardTitle className="text-lg text-blue-900 dark:text-blue-100">
                  Review Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                      {averageRating.averageRating.toFixed(1)}
                    </div>
                    <StarDisplay rating={averageRating.averageRating} />
                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                      Overall Rating
                    </p>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                      {averageRating.reviewCount}
                    </div>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      Total Reviews
                    </p>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                      {averageRating.recommendationPercentage}%
                    </div>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      Would Recommend
                    </p>
                  </div>
                  
                  <div className="text-center">
                    <div className="space-y-1">
                      <div className="text-xs text-blue-700 dark:text-blue-300">
                        Communication: {averageRating.communicationAvg.toFixed(1)}
                      </div>
                      <div className="text-xs text-blue-700 dark:text-blue-300">
                        Work Quality: {averageRating.workQualityAvg.toFixed(1)}
                      </div>
                      <div className="text-xs text-blue-700 dark:text-blue-300">
                        Collaboration: {averageRating.collaborationAvg.toFixed(1)}
                      </div>
                      <div className="text-xs text-blue-700 dark:text-blue-300">
                        Documentation: {averageRating.documentationAvg.toFixed(1)}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Individual Reviews */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Individual Reviews</h3>
              {contractorReviews.map((review) => (
                <Card key={review.id} className="relative">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <User className="w-4 h-4" />
                          {review.submitterName}
                        </CardTitle>
                        <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1 mt-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(review.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteReview(review.id)}
                        disabled={deletingReviewId === review.id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        {deletingReviewId === review.id ? (
                          <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Ratings */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Communication
                        </p>
                        <StarDisplay rating={review.communicationRating} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Work Quality
                        </p>
                        <StarDisplay rating={review.workQualityRating} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Collaboration
                        </p>
                        <StarDisplay rating={review.collaborationRating} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Documentation
                        </p>
                        <StarDisplay rating={review.documentationRating} />
                      </div>
                    </div>

                    <Separator />

                    {/* Boolean Questions */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Had Conflicts
                        </p>
                        <BooleanDisplay value={review.hadConflicts} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Met Safety Standards
                        </p>
                        <BooleanDisplay value={review.metSafetyStandards} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Adhered to Schedule
                        </p>
                        <BooleanDisplay value={review.adheredToSchedule} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Would Recommend
                        </p>
                        <BooleanDisplay value={review.wouldRecommend} />
                      </div>
                    </div>

                    {/* Text Responses */}
                    {(review.strengths || review.improvementAreas || review.conflictDetails || 
                      review.safetyIssues || review.scheduleIssues || review.additionalComments) && (
                      <>
                        <Separator />
                        <div className="space-y-3">
                          {review.strengths && (
                            <div>
                              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Strengths
                              </p>
                              <p className="text-sm text-gray-600 dark:text-gray-400 bg-green-50 dark:bg-green-950 p-2 rounded">
                                {review.strengths}
                              </p>
                            </div>
                          )}
                          
                          {review.improvementAreas && (
                            <div>
                              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Areas for Improvement
                              </p>
                              <p className="text-sm text-gray-600 dark:text-gray-400 bg-yellow-50 dark:bg-yellow-950 p-2 rounded">
                                {review.improvementAreas}
                              </p>
                            </div>
                          )}
                          
                          {review.conflictDetails && (
                            <div>
                              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Conflict Details
                              </p>
                              <p className="text-sm text-gray-600 dark:text-gray-400 bg-red-50 dark:bg-red-950 p-2 rounded">
                                {review.conflictDetails}
                              </p>
                            </div>
                          )}
                          
                          {review.safetyIssues && (
                            <div>
                              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Safety Issues
                              </p>
                              <p className="text-sm text-gray-600 dark:text-gray-400 bg-red-50 dark:bg-red-950 p-2 rounded">
                                {review.safetyIssues}
                              </p>
                            </div>
                          )}
                          
                          {review.scheduleIssues && (
                            <div>
                              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Schedule Issues
                              </p>
                              <p className="text-sm text-gray-600 dark:text-gray-400 bg-orange-50 dark:bg-orange-950 p-2 rounded">
                                {review.scheduleIssues}
                              </p>
                            </div>
                          )}
                          
                          {review.additionalComments && (
                            <div>
                              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Additional Comments
                              </p>
                              <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                {review.additionalComments}
                              </p>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}