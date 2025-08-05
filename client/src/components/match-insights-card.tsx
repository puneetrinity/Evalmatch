import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, Target, Users, AlertTriangle, Trophy } from "lucide-react";
import type { MatchInsights } from "@shared/api-contracts";

interface MatchInsightsCardProps {
  insights: MatchInsights;
}

export default function MatchInsightsCard({ insights }: MatchInsightsCardProps) {
  const getMatchStrengthColor = (strength: string) => {
    switch (strength) {
      case 'EXCELLENT': return 'text-green-700 bg-green-50';
      case 'STRONG': return 'text-blue-700 bg-blue-50';
      case 'MODERATE': return 'text-yellow-700 bg-yellow-50';
      case 'WEAK': return 'text-red-700 bg-red-50';
      default: return 'text-gray-700 bg-gray-50';
    }
  };

  const getMatchStrengthIcon = (strength: string) => {
    switch (strength) {
      case 'EXCELLENT': return '🏆';
      case 'STRONG': return '✅';
      case 'MODERATE': return '⚡';
      case 'WEAK': return '⚠️';
      default: return '📊';
    }
  };

  return (
    <Card className="w-full mb-6">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl">Match Analysis</CardTitle>
            <CardDescription className="mt-1">{insights.summary}</CardDescription>
          </div>
          <Badge 
            variant="outline" 
            className={`${getMatchStrengthColor(insights.matchStrength)} border-current`}
          >
            {getMatchStrengthIcon(insights.matchStrength)} {insights.matchStrength}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Key Strengths */}
        {insights.keyStrengths.length > 0 && (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Key Strengths
            </h4>
            <ul className="space-y-2">
              {insights.keyStrengths.map((strength, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="text-green-500 mt-0.5">•</span>
                  <span>{strength}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Domain Expertise */}
        {insights.domainExpertise && (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
              <Trophy className="h-4 w-4 text-purple-600" />
              Domain Expertise
            </h4>
            <div className="flex items-center gap-3">
              <Badge variant="secondary">
                {insights.domainExpertise.domain}
              </Badge>
              <span className="text-sm text-gray-600">
                {insights.domainExpertise.level} Level
                {insights.domainExpertise.bonus > 0 && (
                  <span className="text-green-600 ml-2">
                    (+{insights.domainExpertise.bonus}% bonus)
                  </span>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Areas to Explore */}
        {insights.areasToExplore.length > 0 && (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              Areas to Explore
            </h4>
            <ul className="space-y-2">
              {insights.areasToExplore.map((area, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="text-amber-500 mt-0.5">•</span>
                  <span>{area}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Interview Focus */}
        {insights.interviewFocus.length > 0 && (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
              <Target className="h-4 w-4 text-blue-600" />
              Interview Focus Areas
            </h4>
            <div className="bg-blue-50 rounded-lg p-4">
              <ul className="space-y-2">
                {insights.interviewFocus.map((focus, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-blue-900">
                    <span className="text-blue-600 mt-0.5">→</span>
                    <span>{focus}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Risk Factors */}
        {insights.riskFactors.length > 0 && (
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription>
              <h4 className="font-semibold text-red-900 mb-2">Risk Factors</h4>
              <ul className="space-y-1">
                {insights.riskFactors.map((risk, index) => (
                  <li key={index} className="text-sm text-red-800">
                    • {risk}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}