import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, Star } from "lucide-react";
import type { Contractor, ContractorReview } from "@shared/schema";
import { calculateContractorAverageRating } from "@/utils/reviewUtils";

interface ContractorSelectorProps {
  onSelectContractor: (contractor: Contractor) => void;
  onCancel: () => void;
}

export default function ContractorSelector({ onSelectContractor, onCancel }: ContractorSelectorProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: contractors = [], isLoading } = useQuery<Contractor[]>({
    queryKey: ["/api/contractors"],
  });

  const { data: allReviews = [] } = useQuery<ContractorReview[]>({
    queryKey: ["/api/contractor-reviews"],
  });

  // Filter contractors based on search term
  const filteredContractors = contractors.filter(contractor => 
    contractor.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contractor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contractor.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contractor.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contractor.state?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const StarRating = ({ contractorId }: { contractorId: number }) => {
    const contractorReviews = allReviews.filter(review => review.contractorId === contractorId);
    const averageRating = calculateContractorAverageRating(contractorReviews);
    
    if (averageRating.reviewCount === 0) {
      return (
        <div className="flex gap-1 items-center">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star key={star} className="w-4 h-4 text-gray-300" />
          ))}
          <span className="text-xs text-gray-500 ml-1">No reviews</span>
        </div>
      );
    }

    return (
      <div className="flex gap-1 items-center">
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = star <= averageRating.averageRating;
          
          return (
            <Star
              key={star}
              className={`w-4 h-4 ${
                isFilled ? "fill-red-500 text-red-500" : "text-gray-300"
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <Button
              onClick={onCancel}
              variant="ghost"
              size="sm"
              className="text-gray-600 dark:text-gray-300"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h1 className="text-2xl font-bold">Select Contractor to Review</h1>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search contractors by name, company, category, or location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {filteredContractors.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-gray-500">
                  {searchTerm ? "No contractors found matching your search." : "No contractors available."}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredContractors.map((contractor) => (
              <Card key={contractor.id} className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{contractor.company}</CardTitle>
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{contractor.name}</p>
                    </div>
                    <Button
                      onClick={() => onSelectContractor(contractor)}
                      className="ml-4"
                    >
                      Review
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm mb-4">
                    {contractor.category && (
                      <div>
                        <span className="font-medium">Category:</span>
                        <Badge variant="secondary" className="ml-2">{contractor.category}</Badge>
                      </div>
                    )}
                    
                    {contractor.city && (
                      <div>
                        <span className="font-medium">Location:</span>
                        <span className="ml-2">{contractor.city}{contractor.state ? `, ${contractor.state}` : ''}</span>
                      </div>
                    )}
                    
                    {contractor.email && (
                      <div>
                        <span className="font-medium">Email:</span>
                        <span className="ml-2">{contractor.email}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <StarRating contractorId={contractor.id} />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
        
        {filteredContractors.length > 0 && (
          <div className="mt-6 text-center text-sm text-gray-500">
            Showing {filteredContractors.length} contractor{filteredContractors.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}