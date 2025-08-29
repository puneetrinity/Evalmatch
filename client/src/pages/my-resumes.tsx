import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { formatFileSize, getFileIcon } from "@/lib/file-utils";
import { useResumes, getResumeStatusColor, getResumeStatusIcon } from "@/hooks/use-resumes";
import type { ResumeItem } from "@shared/api-contracts";
import { useLocation } from "wouter";
import { Upload, Search, Filter, FileText, Calendar, User } from "lucide-react";

// ResumeItem interface now imported from shared/api-contracts

export default function MyResumesPage() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("All Types");

  // Fetch all user resumes using the new hook
  const { 
    data: resumesData, 
    isLoading, 
    error, 
    refetch 
  } = useResumes({
    page: 1,
    limit: 50, // Get more resumes per page
    ...(filterType !== "All Types" && { fileType: filterType.toLowerCase() }),
  });

  const resumes: ResumeItem[] = resumesData?.resumes || [];

  // Filter resumes based on search (file type filtering is now handled by API)
  const filteredResumes = resumes.filter(resume => {
    const filename = resume.filename || '';
    const originalName = resume.originalName || '';
    return filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
           originalName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleUploadNew = () => {
    setLocation("/upload");
  };

  const handleViewAnalysis = (resumeId: string) => {
    // Navigate to analysis page for this resume
    toast({
      title: "Feature Coming Soon",
      description: "Resume analysis view will be available soon.",
    });
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

  // Status functions now imported from hooks/use-resumes

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm">
          {/* Header Section */}
          <div className="border-b border-gray-200 px-6 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <FileText className="h-6 w-6 text-blue-600" />
                  My Resumes
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  Manage your uploaded resumes and track their analysis status.
                </p>
              </div>
              <Button onClick={handleUploadNew} className="mt-4 sm:mt-0">
                <Upload className="h-4 w-4 mr-2" />
                Upload Resume
              </Button>
            </div>
          </div>

          {/* Search and Filter Section */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search resumes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="relative">
                <Filter className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="pl-10 pr-8 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
                >
                  <option>All Types</option>
                  <option>PDF</option>
                  <option>DOC</option>
                  <option>DOCX</option>
                </select>
              </div>
            </div>
          </div>

          {/* Content Section */}
          <div className="px-6 py-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-gray-500">Loading your resumes...</p>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <div className="text-red-500 mb-4">
                  <i className="fas fa-exclamation-triangle text-4xl"></i>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Resumes</h3>
                <p className="text-gray-500 mb-4">There was a problem loading your resumes.</p>
                <Button onClick={() => refetch()} variant="outline">
                  Try Again
                </Button>
              </div>
            ) : filteredResumes.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-4">
                  <FileText className="h-16 w-16 mx-auto" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchTerm || filterType !== "All Types" ? "No resumes found" : "No resumes uploaded yet"}
                </h3>
                <p className="text-gray-500 mb-6">
                  {searchTerm || filterType !== "All Types" 
                    ? "Try adjusting your search or filter criteria." 
                    : "Upload your first resume to get started with AI-powered analysis."
                  }
                </p>
                {(!searchTerm && filterType === "All Types") && (
                  <Button onClick={handleUploadNew}>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Your First Resume
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Resume Count */}
                <div className="mb-4">
                  <p className="text-sm text-gray-600">
                    Showing {filteredResumes.length} of {resumes.length} resume{resumes.length !== 1 ? 's' : ''}
                  </p>
                </div>

                {/* Resume List */}
                <div className="space-y-4">
                  {filteredResumes.map((resume) => (
                    <div key={resume.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 flex-1">
                          <div className="flex-shrink-0">
                            <i className={`${getFileIcon(resume.mimeType)} text-2xl text-blue-600`} aria-hidden="true"></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-lg font-medium text-gray-900 truncate">{resume.originalName}</h4>
                            <div className="flex items-center space-x-4 mt-1 text-sm text-gray-500">
                              <span className="flex items-center">
                                <Calendar className="h-4 w-4 mr-1" />
                                {formatDate(resume.uploadedAt)}
                              </span>
                              <span>{formatFileSize(resume.fileSize)}</span>
                              <span className="uppercase">{resume.mimeType.split('/')[1] || 'file'}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-3 flex-shrink-0">
                          {/* Status Badge */}
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getResumeStatusColor(resume.status)}`}>
                            <i className={`fas fa-${getResumeStatusIcon(resume.status)} mr-1`} aria-hidden="true"></i>
                            {resume.status.charAt(0).toUpperCase() + resume.status.slice(1)}
                          </span>
                          
                          {/* Actions */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewAnalysis(resume.id.toString())}
                            disabled={resume.status !== "analyzed"}
                          >
                            View Analysis
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Load More / Pagination could go here if needed */}
                {resumes.length > 10 && (
                  <div className="mt-6 text-center">
                    <Button variant="outline">Load More Resumes</Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}