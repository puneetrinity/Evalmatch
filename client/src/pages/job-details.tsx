import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Edit,
  Trash2,
  Upload,
  FileText,
  Eye,
  RefreshCw,
  MoreVertical,
  TrendingUp,
  Users,
  Award,
  Target,
  Loader2,
  AlertCircle,
  ChevronLeft
} from "lucide-react";
import type { MatchedSkill } from "@shared/api-contracts";

interface SkillMatch extends MatchedSkill {
  source: 'exact' | 'semantic' | 'inferred';
}

interface AnalysisResult {
  resumeId: number;
  filename: string;
  candidateName?: string;
  matchPercentage: number;
  matchedSkills: SkillMatch[];
  missingSkills: string[];
  candidateStrengths: string[];
  candidateWeaknesses: string[];
  recommendations: string[];
  confidenceLevel: 'low' | 'medium' | 'high';
  analysisId?: number;
  createdAt?: string;
}

export default function JobDetailsPage() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Extract jobId from URL using Wouter's useRoute
  const [match, params] = useRoute("/job-details/:jobId");
  const jobId = params?.jobId ? parseInt(params.jobId) : null;

  // Extract query params for session/batch context
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('sessionId');
  const batchId = urlParams.get('batchId');

  if (!match || !jobId) {
    setLocation("/my-job-descriptions");
    return null;
  }

  // Fetch job description
  const { data: jobData, isLoading: jobLoading } = useQuery({
    queryKey: [`/api/job-descriptions/${jobId}`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/job-descriptions/${jobId}`);
      const data = await response.json();
      // Server returns { data: { jobDescription, isAnalyzed } }
      return data.data;
    }
  });

  const job = jobData?.jobDescription;

  // Fetch analysis results and statistics
  const { data: analysisData, isLoading: analysisLoading, refetch: refetchAnalysis } = useQuery({
    queryKey: [`/api/analysis/analyze/${jobId}`, sessionId, batchId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (sessionId) params.append('sessionId', sessionId);
      if (batchId) params.append('batchId', batchId);

      const url = `/api/analysis/analyze/${jobId}${params.toString() ? '?' + params.toString() : ''}`;
      const response = await apiRequest("GET", url);
      const data = await response.json();
      // Server returns top-level { results, statistics, ... }
      return data;
    }
  });

  const results: AnalysisResult[] = analysisData?.results || [];
  const stats = analysisData?.statistics || {};

  // Calculate highest match from results
  const highestMatch = results.length > 0
    ? Math.max(...results.map(r => r.matchPercentage))
    : 0;

  // Delete job mutation
  const deleteJobMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/job-descriptions/${jobId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-descriptions'] });
      toast({
        title: "Job Deleted",
        description: "Job description has been deleted successfully.",
      });
      setLocation("/my-job-descriptions");
    },
    onError: (error) => {
      toast({
        title: "Delete Failed",
        description: error instanceof Error ? error.message : "Failed to delete job",
        variant: "destructive"
      });
    }
  });

  // Remove analysis mutation
  const removeAnalysisMutation = useMutation({
    mutationFn: async (resumeId: number) => {
      await apiRequest("DELETE", `/api/analysis/analyze/${jobId}/${resumeId}`);
    },
    onSuccess: () => {
      refetchAnalysis();
      toast({
        title: "Analysis Removed",
        description: "Resume analysis has been removed from this job.",
      });
    },
    onError: (error) => {
      toast({
        title: "Remove Failed",
        description: error instanceof Error ? error.message : "Failed to remove analysis",
        variant: "destructive"
      });
    }
  });

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete "${job?.title}"? This action cannot be undone.`)) {
      deleteJobMutation.mutate();
    }
  };

  const handleRemoveAnalysis = (resumeId: number, filename: string) => {
    if (window.confirm(`Remove analysis for "${filename}"?`)) {
      removeAnalysisMutation.mutate(resumeId);
    }
  };

  const handleAddMoreResumes = () => {
    setLocation("/upload");
  };

  const getConfidenceBadge = (level: string) => {
    switch (level) {
      case 'high':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">High Confidence</span>;
      case 'medium':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">Medium Confidence</span>;
      case 'low':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Low Confidence</span>;
      default:
        return null;
    }
  };

  const getMatchColor = (percentage: number) => {
    if (percentage >= 80) return "text-green-600";
    if (percentage >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  if (jobLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-gray-500">Loading job details...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Job Not Found</h2>
            <p className="text-gray-600 mb-6">The job description you're looking for doesn't exist or you don't have access to it.</p>
            <Button onClick={() => setLocation("/my-job-descriptions")}>
              Go to My Jobs
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => setLocation("/my-job-descriptions")}
          className="mb-6"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back to My Jobs
        </Button>

        {/* Job Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{job.title}</h1>
              <p className="text-gray-600 mb-4">{job.description}</p>
              {(() => {
                const required: string[] = job?.analyzedData?.requiredSkills || [];
                const preferred: string[] = job?.analyzedData?.preferredSkills || [];
                const manual: string[] = job?.skills || [];
                const dedupedManual = manual.filter(
                  (s) => !required.includes(s) && !preferred.includes(s)
                );
                const hasAny = required.length + preferred.length + manual.length > 0;
                if (!hasAny) return null;
                return (
                  <div className="flex flex-wrap gap-2">
                    {required.map((skill: string, idx: number) => (
                      <span
                        key={`req-${idx}`}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-600 text-white"
                      >
                        {skill}
                      </span>
                    ))}
                    {preferred.map((skill: string, idx: number) => (
                      <span
                        key={`pref-${idx}`}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                      >
                        {skill}
                      </span>
                    ))}
                    {dedupedManual.map((skill: string, idx: number) => (
                      <span
                        key={`man-${idx}`}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleAddMoreResumes}
              >
                <Upload className="h-4 w-4 mr-2" />
                Add Resumes
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => toast({ title: "Edit feature coming soon" })}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Job
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleDelete}
                    className="text-red-600"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Job
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Statistics Dashboard */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Analyzed</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.totalResumes || results.length || 0}</p>
                </div>
                <Users className="h-8 w-8 text-blue-600" />
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Average Match</p>
                  <p className="text-3xl font-bold text-gray-900">{Math.round(stats.averageMatch || 0)}%</p>
                </div>
                <Target className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Highest Match</p>
                  <p className="text-3xl font-bold text-gray-900">{Math.round(highestMatch || 0)}%</p>
                </div>
                <Award className="h-8 w-8 text-yellow-600" />
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Successful</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.successful || results.length || 0}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-purple-600" />
              </div>
            </div>
          </div>
        )}

        {/* Analysis Results Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Analysis Results</h2>
              <Button
                variant="outline"
                onClick={() => refetchAnalysis()}
                disabled={analysisLoading}
              >
                {analysisLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </>
                )}
              </Button>
            </div>
          </div>

          {analysisLoading ? (
            <div className="p-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
              <p className="text-gray-500">Loading analysis results...</p>
            </div>
          ) : results.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Analyses Yet</h3>
              <p className="text-gray-500 mb-6">
                Upload resumes and analyze them against this job description to see matches.
              </p>
              <Button onClick={handleAddMoreResumes}>
                <Upload className="h-4 w-4 mr-2" />
                Upload Resumes
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Candidate
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Match %
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Matched Skills
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Missing Skills
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Confidence
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {results.map((result) => (
                    <tr key={result.resumeId} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <FileText className="h-5 w-5 text-gray-400 mr-3" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {result.candidateName || "Unknown"}
                            </div>
                            <div className="text-sm text-gray-500">{result.filename}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`text-2xl font-bold ${getMatchColor(result.matchPercentage)}`}>
                          {Math.round(result.matchPercentage)}%
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {result.matchedSkills.slice(0, 3).map((skillMatch, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800"
                            >
                              {skillMatch.skill}
                            </span>
                          ))}
                          {result.matchedSkills.length > 3 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                              +{result.matchedSkills.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {result.missingSkills.slice(0, 3).map((skill, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800"
                            >
                              {skill}
                            </span>
                          ))}
                          {result.missingSkills.length > 3 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                              +{result.missingSkills.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {getConfidenceBadge(result.confidenceLevel)}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toast({ title: "View details coming soon" })}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveAnalysis(result.resumeId, result.filename)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
