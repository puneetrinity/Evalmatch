/**
 * Combined Confidence & Bias Card Component
 * Displays analysis confidence and bias metrics in a compact format
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface ConfidenceBiasCardProps {
  confidenceLevel: 'low' | 'medium' | 'high';
  fairnessMetrics?: {
    biasConfidenceScore: number;
    fairnessAssessment?: string;
    potentialBiasAreas?: string[];
  };
}

export default function ConfidenceBiasCard({ 
  confidenceLevel, 
  fairnessMetrics 
}: ConfidenceBiasCardProps) {
  const getConfidenceConfig = (level: string) => {
    switch (level) {
      case 'high':
        return {
          color: 'bg-green-100 text-green-800 border-green-200',
          icon: '✓',
          description: 'Analysis based on comprehensive data with clear skill matches.'
        };
      case 'medium':
        return {
          color: 'bg-amber-100 text-amber-800 border-amber-200',
          icon: '◐',
          description: 'Analysis based on adequate data but some areas may need more information.'
        };
      case 'low':
        return {
          color: 'bg-red-100 text-red-800 border-red-200',
          icon: '⚠',
          description: 'Analysis based on limited data. Consider providing more detailed information.'
        };
      default:
        return {
          color: 'bg-gray-100 text-gray-800 border-gray-200',
          icon: '?',
          description: 'Confidence level not available.'
        };
    }
  };

  const getBiasScoreConfig = (score: number) => {
    if (score >= 80) {
      return {
        color: 'text-green-600',
        bgColor: 'bg-green-500',
        status: 'Excellent',
        description: 'Very low bias risk detected in the analysis.'
      };
    } else if (score >= 60) {
      return {
        color: 'text-amber-600',
        bgColor: 'bg-amber-500',
        status: 'Good',
        description: 'Low to moderate bias risk detected.'
      };
    } else {
      return {
        color: 'text-red-600',
        bgColor: 'bg-red-500',
        status: 'Needs Review',
        description: 'Higher bias risk detected. Review recommended.'
      };
    }
  };

  const confidenceConfig = getConfidenceConfig(confidenceLevel);
  const biasConfig = fairnessMetrics ? getBiasScoreConfig(fairnessMetrics.biasConfidenceScore) : null;

  return (
    <Card className="border-l-4 border-l-purple-500">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600">
            <path d="M9 12l2 2 4-4"/>
            <circle cx="12" cy="12" r="9"/>
          </svg>
          Analysis Quality
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Two-column layout for metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Confidence Level */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Confidence Level</span>
              <Badge className={`${confidenceConfig.color} border`}>
                <span className="mr-1">{confidenceConfig.icon}</span>
                {confidenceLevel.toUpperCase()}
              </Badge>
            </div>
            <p className="text-xs text-gray-600">
              {confidenceConfig.description}
            </p>
          </div>

          {/* Bias Confidence Score */}
          {fairnessMetrics && biasConfig && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Fairness Score</span>
                <div className="text-right">
                  <div className={`text-sm font-bold ${biasConfig.color}`}>
                    {fairnessMetrics.biasConfidenceScore}%
                  </div>
                  <div className="text-xs text-gray-500">
                    {biasConfig.status}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Progress 
                  value={fairnessMetrics.biasConfidenceScore} 
                  className="h-2"
                />
                <p className="text-xs text-gray-600">
                  {biasConfig.description}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Bias Areas (if any) */}
        {fairnessMetrics?.potentialBiasAreas && fairnessMetrics.potentialBiasAreas.length > 0 && (
          <div className="pt-3 border-t border-gray-200">
            <h5 className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                <path d="M12 9v4"/>
                <path d="m12 17 .01 0"/>
              </svg>
              Areas to Review
            </h5>
            <div className="flex flex-wrap gap-1">
              {fairnessMetrics.potentialBiasAreas.map((area, index) => (
                <Badge 
                  key={index} 
                  variant="outline" 
                  className="text-xs bg-amber-50 text-amber-700 border-amber-200"
                >
                  {area}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Combined Assessment */}
        {fairnessMetrics?.fairnessAssessment && (
          <div className="bg-gray-50 rounded-lg p-3 border">
            <p className="text-xs text-gray-700">
              <strong>Assessment:</strong> {fairnessMetrics.fairnessAssessment}
            </p>
          </div>
        )}

        {/* Overall Quality Indicator */}
        <div className="flex items-center justify-center pt-2">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span>Analysis Quality:</span>
            {confidenceLevel === 'high' && (!fairnessMetrics || fairnessMetrics.biasConfidenceScore >= 80) && (
              <Badge className="bg-green-100 text-green-800 border-green-200">
                <span className="mr-1">⭐</span>
                Excellent
              </Badge>
            )}
            {confidenceLevel === 'medium' && (!fairnessMetrics || fairnessMetrics.biasConfidenceScore >= 60) && (
              <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                Good
              </Badge>
            )}
            {(confidenceLevel === 'low' || (fairnessMetrics && fairnessMetrics.biasConfidenceScore < 60)) && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                Review Recommended
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}