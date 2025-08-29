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
  ArrowUpDown
} from "lucide-react";

interface AnalysisItem {
  id: string;
  jobTitle: string;
  status: "completed" | "running" | "failed";
  resumeCount: number;
  totalResumes: number;
  completedDate: string;
  topMatchScore: number;
  averageScore: number;
  progress?: number;
}

// Mock data based on the screenshot
const mockAnalyses: AnalysisItem[] = [
  {
    id: "1",
    jobTitle: "Senior Frontend Developer",
    status: "completed",
    resumeCount: 15,
    totalResumes: 15,
    completedDate: "Aug 22, 2025, 04:00 PM",
    topMatchScore: 95,
    averageScore: 72,
  },
  {
    id: "2", 
    jobTitle: "Full Stack Engineer",
    status: "completed",
    resumeCount: 8,
    totalResumes: 8,
    completedDate: "Aug 21, 2025, 07:50 PM",
    topMatchScore: 87,
    averageScore: 68,
  },
  {
    id: "3",
    jobTitle: "Data Scientist", 
    status: "running",
    resumeCount: 7,
    totalResumes: 12,
    completedDate: "Aug 20, 2025, 02:45 PM",
    topMatchScore: 0,
    averageScore: 0,
    progress: 7,
  }
];

export default function MyAnalysesPage() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [sortBy, setSortBy] = useState("Sort by Newest");

  // Filter analyses based on search and filters
  const filteredAnalyses = mockAnalyses.filter(analysis => {
    const matchesSearch = analysis.jobTitle.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "All Status" || 
      (statusFilter === "Completed" && analysis.status === "completed") ||
      (statusFilter === "Running" && analysis.status === "running") ||
      (statusFilter === "Failed" && analysis.status === "failed");
    return matchesSearch && matchesStatus;
  });

  // Sort analyses
  const sortedAnalyses = [...filteredAnalyses].sort((a, b) => {
    switch (sortBy) {
      case "Sort by Newest":
        return new Date(b.completedDate).getTime() - new Date(a.completedDate).getTime();
      case "Sort by Oldest":
        return new Date(a.completedDate).getTime() - new Date(b.completedDate).getTime();
      case "Sort by Score":
        return b.topMatchScore - a.topMatchScore;
      default:
        return 0;
    }
  });

  const handleNewAnalysis = () => {
    setLocation("/upload");
  };

  const handleViewAnalysis = (analysisId: string) => {
    // Navigate to analysis details page
    setLocation(`/analysis/${analysisId}`);
  };

  const handleInterviewPrep = (analysisId: string) => {
    // Navigate to interview prep
    toast({
      title: "Interview Prep",
      description: "Redirecting to interview preparation...",
    });
  };

  const getStatusBadge = (status: string, progress?: number) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Completed
          </span>
        );
      case "running":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <Loader className="w-3 h-3 mr-1 animate-spin" />
            Running
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <Clock className="w-3 h-3 mr-1" />
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-blue-600";
    if (score >= 80) return "text-green-600";
    if (score >= 70) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 90) return "Excellent";
    if (score >= 80) return "Excellent";
    if (score >= 70) return "Good";
    return "Fair";
  };

  // Calculate summary statistics from real data
  const totalAnalyses = mockAnalyses.length;
  const completedAnalyses = mockAnalyses.filter(a => a.status === "completed").length;
  const totalJobsAnalyzed = mockAnalyses.filter(a => a.status === "completed").length;
  const avgMatchScore = 0; // Would be calculated from actual analysis results

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
                  <option>Running</option>
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

        {/* Analyses Grid */}
        {sortedAnalyses.length === 0 ? (
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
          <>
            {/* Analysis Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {sortedAnalyses.map((analysis) => (
                <div key={analysis.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">
                        {analysis.jobTitle}
                      </h3>
                      <div className="mt-1">
                        {getStatusBadge(analysis.status, analysis.progress)}
                      </div>
                    </div>
                    <button className="text-gray-400 hover:text-gray-600 p-1">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Stats */}
                  <div className="space-y-3 mb-4">
                    <div className="flex items-center text-sm text-gray-600">
                      <Users className="h-4 w-4 mr-2" />
                      <span>{analysis.resumeCount}/{analysis.totalResumes} resumes</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <Calendar className="h-4 w-4 mr-2" />
                      <span>{analysis.completedDate}</span>
                    </div>
                  </div>

                  {/* Progress or Results */}
                  {analysis.status === "running" ? (
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-gray-600">Progress</span>
                        <span className="text-gray-900 font-medium">{analysis.progress}/{analysis.totalResumes}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${(analysis.progress! / analysis.totalResumes) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  ) : analysis.status === "completed" ? (
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="text-sm text-gray-600 mb-1">Top Match</div>
                        <div className="flex items-center gap-2">
                          <span className={`text-2xl font-bold ${getScoreColor(analysis.topMatchScore)}`}>
                            {analysis.topMatchScore}%
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            analysis.topMatchScore >= 80 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {getScoreLabel(analysis.topMatchScore)}
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600 mb-1">Average</div>
                        <div className={`text-2xl font-bold ${getScoreColor(analysis.averageScore)}`}>
                          {analysis.averageScore}%
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewAnalysis(analysis.id)}
                      className="flex-1"
                      disabled={analysis.status === "running"}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      {analysis.status === "running" ? "View" : "View"}
                    </Button>
                    {analysis.status === "completed" && (
                      <Button
                        size="sm"
                        onClick={() => handleInterviewPrep(analysis.id)}
                        className="flex-1"
                      >
                        Interview Prep
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary Statistics */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-1">{totalAnalyses}</div>
                  <div className="text-sm text-gray-600">Total Analyses</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600 mb-1">{completedAnalyses}</div>
                  <div className="text-sm text-gray-600">Completed</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600 mb-1">{totalJobsAnalyzed}</div>
                  <div className="text-sm text-gray-600">Jobs Analyzed</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-indigo-600 mb-1">{avgMatchScore}%</div>
                  <div className="text-sm text-gray-600">Avg Match Score</div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
      
      <Footer />
    </div>
  );
}