import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import ContractorReviewForm from "./ContractorReviewForm";
import ContractorSelector from "./ContractorSelector";
import { CheckCircle, Users, ArrowLeft, Search, List } from "lucide-react";
import type { Contractor } from "@shared/schema";

interface ContractorReviewFlowProps {
  onComplete: () => void;
  onCancel: () => void;
}

type ReviewMode = 'selection' | 'sequential' | 'targeted';

export default function ContractorReviewFlow({ onComplete, onCancel }: ContractorReviewFlowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewedContractors, setReviewedContractors] = useState<Set<number>>(new Set());
  const [isComplete, setIsComplete] = useState(false);
  const [reviewMode, setReviewMode] = useState<ReviewMode>('selection');
  const [selectedContractor, setSelectedContractor] = useState<Contractor | null>(null);

  const { data: contractors = [], isLoading } = useQuery<Contractor[]>({
    queryKey: ["/api/contractors"],
  });

  // For sequential review, use all contractors (don't filter out reviewed ones)
  const contractorsToReview = reviewMode === 'sequential' ? contractors : contractors.filter(
    contractor => !reviewedContractors.has(contractor.id)
  );

  const totalContractors = contractors.length;
  const completedReviews = reviewedContractors.size;
  const progressPercentage = totalContractors > 0 ? (completedReviews / totalContractors) * 100 : 0;

  // For sequential mode, current contractor is based on currentIndex
  // For targeted mode, current contractor is selectedContractor
  const currentContractor = reviewMode === 'targeted' 
    ? selectedContractor 
    : (reviewMode === 'sequential' && currentIndex < contractors.length)
      ? contractors[currentIndex]
      : null;

  const handleSubmitReview = () => {
    if (reviewMode === 'targeted' && selectedContractor) {
      // For targeted review, go back to selection after completing
      setSelectedContractor(null);
      setReviewMode('selection');
      return;
    }
    
    // For sequential review, automatically move to next contractor
    if (reviewMode === 'sequential') {
      const currentContractor = contractors[currentIndex];
      if (currentContractor) {
        setReviewedContractors(prev => new Set([...prev, currentContractor.id]));
      }
      
      // Move to next contractor
      const nextIndex = currentIndex + 1;
      if (nextIndex < contractors.length) {
        setCurrentIndex(nextIndex);
        // Scroll to top when moving to next contractor
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        // All contractors have been reviewed
        setIsComplete(true);
      }
    }
  };

  const handleSkipContractor = () => {
    if (reviewMode === 'sequential') {
      const currentContractor = contractors[currentIndex];
      if (currentContractor) {
        setReviewedContractors(prev => new Set([...prev, currentContractor.id]));
      }
      
      // Move to next contractor or complete
      const nextIndex = currentIndex + 1;
      if (nextIndex < contractors.length) {
        setCurrentIndex(nextIndex);
        // Scroll to top when moving to next contractor
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setIsComplete(true);
      }
    }
  };

  // Reset current index when contractors to review list changes
  useEffect(() => {
    if (currentIndex >= contractorsToReview.length && contractorsToReview.length > 0) {
      setCurrentIndex(0);
    }
  }, [contractorsToReview.length, currentIndex]);

  // Mode selection screen
  if (reviewMode === 'selection') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <Button
              onClick={onCancel}
              variant="ghost"
              size="sm"
              className="text-gray-600 dark:text-gray-300 mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Contractors
            </Button>
            <h1 className="text-3xl font-bold mb-2">Contractor Review</h1>
            <p className="text-gray-600 dark:text-gray-300">
              Choose how you'd like to review contractors
            </p>
          </div>

          <div className="space-y-4">
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-blue-300">
              <CardHeader 
                className="pb-3"
                onClick={() => setReviewMode('targeted')}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                    <Search className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Search & Select Contractor</CardTitle>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Find and review a specific contractor
                    </p>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-green-300">
              <CardHeader 
                className="pb-3"
                onClick={() => setReviewMode('sequential')}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                    <List className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Review All Contractors</CardTitle>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Go through all contractors sequentially
                    </p>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Contractor selection screen for targeted review
  if (reviewMode === 'targeted' && !selectedContractor) {
    return (
      <ContractorSelector
        onSelectContractor={(contractor) => {
          setSelectedContractor(contractor);
        }}
        onCancel={() => setReviewMode('selection')}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading contractors...</p>
        </div>
      </div>
    );
  }

  if (isComplete || contractorsToReview.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card className="text-center border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
          <CardHeader>
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl text-green-800 dark:text-green-200">
              Review Process Complete!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-green-700 dark:text-green-300">
              <p className="text-lg mb-2">
                You have completed reviews for all available contractors.
              </p>
              <p className="text-sm">
                {completedReviews} contractor{completedReviews !== 1 ? 's' : ''} reviewed out of {totalContractors} total
              </p>
            </div>
            
            <div className="flex gap-3 justify-center pt-4">
              <Button onClick={onComplete} className="bg-green-600 hover:bg-green-700">
                Return to Contractors Page
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }



  if (!currentContractor && reviewMode === 'sequential') {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="text-center py-8">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-300">
              No contractors available for review.
            </p>
            <Button onClick={onCancel} variant="outline" className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Contractors
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Progress Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 flex-shrink-0">
        <div className="max-w-4xl mx-auto p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Button
                onClick={reviewMode === 'targeted' ? () => setReviewMode('selection') : onCancel}
                variant="ghost"
                size="sm"
                className="text-gray-600 dark:text-gray-300"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {reviewMode === 'targeted' ? 'Back to Selection' : 'Back to Contractors'}
              </Button>
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600"></div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {reviewMode === 'targeted' ? 'Review Selected Contractor' : 'Contractor Review Process'}
              </h2>
            </div>
            {reviewMode === 'sequential' && (
              <div className="text-sm text-gray-600 dark:text-gray-300">
                {completedReviews} / {totalContractors} completed
              </div>
            )}
          </div>
          
          {reviewMode === 'sequential' && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
                <span>Progress</span>
                <span>{Math.round(progressPercentage)}%</span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>
          )}
        </div>
      </div>

      {/* Review Form */}
      <div className="flex-1 overflow-y-auto">
        <ContractorReviewForm
          contractor={currentContractor}
          onSubmit={handleSubmitReview}
          onSkip={handleSkipContractor}
          currentIndex={completedReviews}
          totalCount={totalContractors}
          isTargetedReview={reviewMode === 'targeted'}
        />
      </div>
    </div>
  );
}