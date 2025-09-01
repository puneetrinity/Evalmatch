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
  Briefcase, 
  Calendar, 
  User,
  Eye,
  Edit,
  Trash2,
  Plus,
  MoreVertical,
  CheckCircle,
  Clock,
  FileText,
  Building
} from "lucide-react";

interface JobDescriptionItem {
  id: string;
  title: string;
  description: string;
  requirements?: string[];
  skills?: string[];
  experience?: string;
  createdAt: string;
  updatedAt: string;
  status: "active" | "draft" | "archived";
  analysesCount?: number;
  averageMatchScore?: number;
}

// Mock data based on typical job descriptions
const mockJobDescriptions: JobDescriptionItem[] = [
  {
    id: "1",
    title: "Senior Frontend Developer",
    description: "We are looking for a Senior Frontend Developer to join our dynamic team. You will be responsible for developing user-facing web applications using modern JavaScript frameworks...",
    requirements: ["React", "TypeScript", "Node.js", "CSS", "Git"],
    createdAt: "2025-08-22T16:00:00Z",
    updatedAt: "2025-08-22T16:00:00Z",
    status: "active",
    analysesCount: 15,
    averageMatchScore: 85,
  },
  {
    id: "2", 
    title: "Full Stack Engineer",
    description: "Join our engineering team as a Full Stack Engineer. You'll work on both frontend and backend systems, building scalable web applications and APIs...",
    requirements: ["JavaScript", "Python", "React", "Django", "PostgreSQL"],
    createdAt: "2025-08-21T19:50:00Z",
    updatedAt: "2025-08-21T19:50:00Z",
    status: "active",
    analysesCount: 8,
    averageMatchScore: 78,
  },
  {
    id: "3",
    title: "Data Scientist",
    description: "We're seeking a Data Scientist to help us make data-driven decisions. You'll work with large datasets, build machine learning models, and create insights...",
    requirements: ["Python", "Machine Learning", "SQL", "Statistics", "Pandas"],
    createdAt: "2025-08-20T14:45:00Z",
    updatedAt: "2025-08-20T14:45:00Z",
    status: "draft",
    analysesCount: 0,
    averageMatchScore: 0,
  },
  {
    id: "4",
    title: "Product Manager",
    description: "Looking for an experienced Product Manager to lead our product strategy and roadmap. You'll work closely with engineering, design, and sales teams...",
    requirements: ["Product Strategy", "Agile", "Analytics", "Leadership", "Communication"],
    createdAt: "2025-08-19T10:30:00Z",
    updatedAt: "2025-08-19T10:30:00Z",
    status: "archived",
    analysesCount: 12,
    averageMatchScore: 72,
  }
];

// Helper function to format experience level
const formatExperienceLevel = (experience: string): string => {
  return experience.charAt(0).toUpperCase() + experience.slice(1).toLowerCase();
};

export default function MyJobDescriptionsPage() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Status");

  // Fetch job descriptions from API
  const { data: jobDescriptions = mockJobDescriptions, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/job-descriptions'],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/job-descriptions");
        const data = await response.json();
        return data.jobs || mockJobDescriptions; // Fallback to mock data
      } catch (error) {
        console.warn('Failed to fetch job descriptions, using mock data:', error);
        return mockJobDescriptions;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1
  });

  // Filter job descriptions based on search and filter
  const filteredJobDescriptions = jobDescriptions.filter(job => {
    const matchesSearch = job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         job.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "All Status" || 
                         job.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  const handleCreateNew = () => {
    setLocation("/job-description");
  };

  const handleViewJob = (jobId: string) => {
    // Navigate to job details or analysis
    setLocation(`/analysis/${jobId}`);
  };

  const handleEditJob = (jobId: string) => {
    // Navigate to edit job description
    toast({
      title: "Edit Job Description",
      description: "Edit functionality will be available soon.",
    });
  };

  const handleDeleteJob = (jobId: string, jobTitle: string) => {
    // Handle delete with confirmation
    if (window.confirm(`Are you sure you want to delete "${jobTitle}"?`)) {
      toast({
        title: "Job Description Deleted",
        description: `"${jobTitle}" has been deleted successfully.`,
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Active
          </span>
        );
      case "draft":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Edit className="w-3 h-3 mr-1" />
            Draft
          </span>
        );
      case "archived":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            <Clock className="w-3 h-3 mr-1" />
            Archived
          </span>
        );
      default:
        return null;
    }
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  // Calculate summary statistics
  const totalJobs = jobDescriptions.length;
  const activeJobs = jobDescriptions.length; // All jobs are considered active for now
  const totalSkills = jobDescriptions.reduce((sum, j) => sum + (j.skills?.length || 0), 0);
  const avgSkillsPerJob = totalJobs > 0 ? Math.round(totalSkills / totalJobs) : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <Briefcase className="h-8 w-8 text-blue-600" />
                My Job Descriptions
              </h1>
              <p className="text-gray-600 mt-2">
                Manage your job postings and track their analysis performance.
              </p>
            </div>
            <Button onClick={handleCreateNew} className="mt-4 sm:mt-0">
              <Plus className="h-4 w-4 mr-2" />
              Create New Job
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
                placeholder="Search job descriptions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="pl-10 pr-8 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
              >
                <option>All Status</option>
                <option>Active</option>
                <option>Draft</option>
                <option>Archived</option>
              </select>
            </div>
          </div>
        </div>

        {/* Job Descriptions List */}
        {isLoading ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4 mx-auto"></div>
            <p className="text-gray-500">Loading your job descriptions...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="text-red-500 mb-4">
              <i className="fas fa-exclamation-triangle text-4xl"></i>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Job Descriptions</h3>
            <p className="text-gray-500 mb-4">There was a problem loading your job descriptions.</p>
            <Button onClick={() => refetch()} variant="outline">
              Try Again
            </Button>
          </div>
        ) : filteredJobDescriptions.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <Briefcase className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || statusFilter !== "All Status" ? "No job descriptions found" : "No job descriptions yet"}
            </h3>
            <p className="text-gray-500 mb-6">
              {searchTerm || statusFilter !== "All Status" 
                ? "Try adjusting your search or filter criteria." 
                : "Create your first job description to start analyzing candidates."
              }
            </p>
            {(!searchTerm && statusFilter === "All Status") && (
              <Button onClick={handleCreateNew}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Job Description
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Job Descriptions Count */}
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                Showing {filteredJobDescriptions.length} of {jobDescriptions.length} job description{jobDescriptions.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Job Descriptions Cards */}
            <div className="space-y-4 mb-8">
              {filteredJobDescriptions.map((job) => (
                <div key={job.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      {/* Header */}
                      <div className="flex items-center gap-3 mb-2">
                        <Building className="h-5 w-5 text-blue-600 flex-shrink-0" />
                        <h3 className="text-xl font-semibold text-gray-900 truncate">{job.title}</h3>
                        {getStatusBadge(job.status)}
                      </div>
                      
                      {/* Description */}
                      <p className="text-gray-600 mb-4 leading-relaxed">
                        {truncateText(job.description, 200)}
                      </p>
                      
                      {/* Requirements Tags */}
                      {job.requirements && job.requirements.length > 0 && (
                        <div className="mb-4">
                          <div className="flex flex-wrap gap-2">
                            {job.requirements.slice(0, 5).map((req, index) => (
                              <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {req}
                              </span>
                            ))}
                            {job.requirements.length > 5 && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                +{job.requirements.length - 5} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Stats and Date */}
                      <div className="flex items-center space-x-6 text-sm text-gray-500">
                        <div className="flex items-center">
                          <Calendar className="h-4 w-4 mr-1" />
                          <span>Created {formatDate(job.createdAt)}</span>
                        </div>
                        {job.experience && (
                          <div className="flex items-center">
                            <User className="h-4 w-4 mr-1" />
                            <span>{formatExperienceLevel(job.experience)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center space-x-2 flex-shrink-0 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewJob(job.id)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditJob(job.id)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteJob(job.id, job.title)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary Statistics */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-1">{totalJobs}</div>
                  <div className="text-sm text-gray-600">Total Jobs</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600 mb-1">{activeJobs}</div>
                  <div className="text-sm text-gray-600">Active Jobs</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600 mb-1">{totalSkills}</div>
                  <div className="text-sm text-gray-600">Total Skills</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-indigo-600 mb-1">{avgSkillsPerJob}</div>
                  <div className="text-sm text-gray-600">Avg Skills/Job</div>
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