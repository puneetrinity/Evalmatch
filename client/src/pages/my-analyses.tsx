import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { 
  Search, 
  Filter, 
  BarChart3, 
  Users, 
  Calendar, 
  Eye,
  MoreVertical,
  Plus,
  CheckCircle,
  Clock,
  Loader,
  ArrowUpDown,
  AlertTriangle
} from "lucide-react";

interface AnalysisItem {
  id: number;
  jobTitle: string;
  jobDescription: string;
  status: "completed" | "processing" | "failed";
  resumeCount: number;
  totalResumes: number;
  createdAt: string;
  updatedAt: string;
  topMatchScore?: number;
  averageScore?: number;
  results?: any[];
}

export default function MyAnalysesPage() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [sortBy, setSortBy] = useState("Sort by Newest");

  // Fetch real analyses from backend
  const { 
    data: analysesResponse, 
    isLoading, 
    error,
    refetch 
  } = useQuery({
    queryKey: ["my-analyses"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/job-descriptions");
        const data = await response.json();
        
        if (data.success && data.data?.jobDescriptions) {
          // Transform job descriptions into analysis items
          return data.data.jobDescriptions.map((job: any) => ({
            id: job.id,
            jobTitle: job.title || "Untitled Position",
            jobDescription: job.description || "",
            status: job.hasAnalysis ? "completed" : "processing",
            resumeCount: 0, // Will be updated when we get analysis results
            totalResumes: 0,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt || job.createdAt,
            topMatchScore: 0,
            averageScore: 0
          })) as AnalysisItem[];
        }
        return [];
      } catch (error) {
        console.error("Failed to fetch analyses:", error);
        throw new Error("Failed to load analyses");
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });

  const analyses = analysesResponse || [];

  // Filter analyses based on search and filters
  const filteredAnalyses = analyses.filter(analysis => {
    const matchesSearch = analysis.jobTitle.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "All Status" || 
      (statusFilter === "Completed" && analysis.status === "completed") ||
      (statusFilter === "Processing" && analysis.status === "processing") ||
      (statusFilter === "Failed" && analysis.status === "failed");
    return matchesSearch && matchesStatus;
  });

  // Sort analyses
  const sortedAnalyses = [...filteredAnalyses].sort((a, b) => {
    switch (sortBy) {
      case "Sort by Newest":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "Sort by Oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "Sort by Score":
        return (b.topMatchScore || 0) - (a.topMatchScore || 0);
      default:
        return 0;
    }
  });

  const handleNewAnalysis = () => {
    setLocation("/upload");
  };

  const handleViewAnalysis = (analysisId: number) => {
    // Navigate to analysis details page with proper ID
    setLocation(`/analysis/${analysisId}`);
  };

  const handleInterviewPrep = (analysisId: number) => {
    toast({
      title: "Interview Prep",
      description: "Interview preparation feature is coming soon.",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Completed
          </span>
        );
      case "processing":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <Loader className="w-3 h-3 mr-1 animate-spin" />
            Processing
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            <Clock className="w-3 h-3 mr-1" />
            Unknown
          </span>
        );
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return "Unknown date";
    }
  };

  // Calculate summary statistics from real data
  const totalAnalyses = analyses.length;
  const completedAnalyses = analyses.filter(a => a.status === "completed").length;
  const processingAnalyses = analyses.filter(a => a.status === "processing").length;
  const failedAnalyses = analyses.filter(a => a.status === "failed").length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Analyses</h1>
              <p className="text-gray-600 mt-2">
                Track and manage your resume analysis results across different job descriptions.
              </p>
            </div>
            <Button onClick={handleNewAnalysis} className="mt-4 sm:mt-0">
              <Plus className="h-4 w-4 mr-2" />
              New Analysis
            </Button>
          </div>
        </div>

        {/* Summary Statistics */}
        {totalAnalyses > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600 mb-1">{totalAnalyses}</div>
                <div className="text-sm text-gray-600">Total Analyses</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600 mb-1">{completedAnalyses}</div>
                <div className="text-sm text-gray-600">Completed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600 mb-1">{processingAnalyses}</div>
                <div className="text-sm text-gray-600">Processing</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600 mb-1">{failedAnalyses}</div>
                <div className="text-sm text-gray-600">Failed</div>
              </div>
            </div>
          </div>
        )}

        {/* Search and Filter Section */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search analyses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex gap-3">
              <div className="relative">
                <Filter className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="pl-10 pr-8 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
                >
                  <option>All Status</option>
                  <option>Completed</option>
                  <option>Processing</option>
                  <option>Failed</option>
                </select>
              </div>
              <div className="relative">
                <ArrowUpDown className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="pl-10 pr-8 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
                >
                  <option>Sort by Newest</option>
                  <option>Sort by Oldest</option>
                  <option>Sort by Score</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Content Section */}
        {isLoading ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4 mx-auto"></div>
            <p className="text-gray-500">Loading your analyses...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="text-red-500 mb-4">
              <AlertTriangle className="h-16 w-16 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Analyses</h3>
            <p className="text-gray-500 mb-4">There was a problem loading your analyses.</p>
            <Button onClick={() => refetch()} variant="outline">
              Try Again
            </Button>
          </div>
        ) : sortedAnalyses.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <BarChart3 className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || statusFilter !== "All Status" ? "No analyses found" : "No analyses yet"}
            </h3>
            <p className="text-gray-500 mb-6">
              {searchTerm || statusFilter !== "All Status" 
                ? "Try adjusting your search or filter criteria." 
                : "Start your first analysis to see results here."
              }
            </p>
            {(!searchTerm && statusFilter === "All Status") && (
              <Button onClick={handleNewAnalysis}>
                <Plus className="h-4 w-4 mr-2" />
                Start First Analysis
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedAnalyses.map((analysis) => (
              <div key={analysis.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 truncate" title={analysis.jobTitle}>
                      {analysis.jobTitle}
                    </h3>
                    <div className="mt-2">
                      {getStatusBadge(analysis.status)}
                    </div>
                  </div>
                  <button 
                    className="text-gray-400 hover:text-gray-600 p-1"
                    onClick={() => toast({ title: "Options", description: "More options coming soon." })}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </div>

                {/* Job Description Preview */}
                <div className="mb-4">
                  <p className="text-sm text-gray-600 line-clamp-3">
                    {analysis.jobDescription || "No description available"}
                  </p>
                </div>

                {/* Stats */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center text-sm text-gray-600">
                    <Calendar className="h-4 w-4 mr-2" />
                    <span>Created {formatDate(analysis.createdAt)}</span>
                  </div>
                  {analysis.status === "completed" && analysis.resumeCount > 0 && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Users className="h-4 w-4 mr-2" />
                      <span>{analysis.resumeCount} resumes analyzed</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewAnalysis(analysis.id)}
                    className="flex-1"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                  {analysis.status === "completed" && (
                    <Button
                      size="sm"
                      onClick={() => handleInterviewPrep(analysis.id)}
                      className="flex-1"
                      variant="outline"
                    >
                      Interview
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      
      <Footer />
    </div>
  );
}