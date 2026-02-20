import type { ContractorReview } from "@shared/schema";

export interface ContractorAverageRating {
  averageRating: number;
  reviewCount: number;
  communicationAvg: number;
  workQualityAvg: number;
  collaborationAvg: number;
  documentationAvg: number;
  recommendationPercentage: number;
}

export function calculateContractorAverageRating(reviews: ContractorReview[]): ContractorAverageRating {
  if (reviews.length === 0) {
    return {
      averageRating: 0,
      reviewCount: 0,
      communicationAvg: 0,
      workQualityAvg: 0,
      collaborationAvg: 0,
      documentationAvg: 0,
      recommendationPercentage: 0,
    };
  }

  const communicationAvg = reviews.reduce((sum, review) => sum + review.communicationRating, 0) / reviews.length;
  const workQualityAvg = reviews.reduce((sum, review) => sum + review.workQualityRating, 0) / reviews.length;
  const collaborationAvg = reviews.reduce((sum, review) => sum + review.collaborationRating, 0) / reviews.length;
  const documentationAvg = reviews.reduce((sum, review) => sum + review.documentationRating, 0) / reviews.length;

  // Overall average is the average of all four rating categories
  const averageRating = (communicationAvg + workQualityAvg + collaborationAvg + documentationAvg) / 4;

  // Calculate recommendation percentage
  const recommendationsCount = reviews.filter(review => review.wouldRecommend).length;
  const recommendationPercentage = (recommendationsCount / reviews.length) * 100;

  return {
    averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
    reviewCount: reviews.length,
    communicationAvg: Math.round(communicationAvg * 10) / 10,
    workQualityAvg: Math.round(workQualityAvg * 10) / 10,
    collaborationAvg: Math.round(collaborationAvg * 10) / 10,
    documentationAvg: Math.round(documentationAvg * 10) / 10,
    recommendationPercentage: Math.round(recommendationPercentage),
  };
}

