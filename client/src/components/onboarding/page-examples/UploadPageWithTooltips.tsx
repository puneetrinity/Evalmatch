import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { FeatureTooltip } from '../FeatureTooltip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FileText, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

// This is an example component showing how to integrate tooltips with a page
// It's not meant to be used directly but serves as documentation for developers

export default function UploadPageWithTooltips() {
  const [_, setLocation] = useLocation();
  
  // Reset tooltips for demo purposes
  useEffect(() => {
    const demoMode = localStorage.getItem('demoMode');
    if (demoMode === 'true') {
      // In demo mode, clear dismissed tooltips to show them again
      localStorage.removeItem('dismissedTooltips');
    }
  }, []);
  
  return (
    <div className="container mx-auto py-6 px-4 max-w-5xl">
      <h1 className="text-3xl font-bold mb-6">Resume Upload</h1>
      
      <div className="mb-8">
        <p className="text-gray-600 mb-4">
          Upload candidate resumes to analyze skills, experience, and qualifications. 
          Supported formats: PDF, DOCX, TXT.
        </p>
        
        {/* Example of tooltip integration with upload area */}
        <FeatureTooltip id="upload" position="bottom">
          <Card className="border-dashed border-2 p-6 text-center cursor-pointer hover:bg-gray-50 transition-colors">
            <CardContent className="pt-6 flex flex-col items-center">
              <div className="rounded-full bg-blue-100 p-3 mb-4">
                <Upload className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Upload Resumes</h3>
              <p className="text-gray-500 mb-4">Drag and drop files here or click to browse</p>
              <Button className="mb-2">Select Files</Button>
              <p className="text-xs text-gray-400">Maximum 100 files, 5MB each</p>
            </CardContent>
          </Card>
        </FeatureTooltip>
      </div>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Current Upload Session</h2>
        <p className="text-sm text-gray-500 mb-4">
          Resumes are grouped into sessions. Each new upload creates a new session.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* This would normally be a map over actual resume data */}
          {[1, 2, 3].map((i) => (
            <Card key={i} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex items-center">
                    <FileText className="h-5 w-5 text-blue-600 mr-2" />
                    <CardTitle className="text-lg">Resume_{i}.pdf</CardTitle>
                  </div>
                  <div className="rounded-full bg-green-100 p-1">
                    <Check className="h-4 w-4 text-green-600" />
                  </div>
                </div>
                <CardDescription>John Doe · Software Engineer</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  <div className="flex justify-between text-gray-500 mb-1">
                    <span>Skills:</span>
                    <span className="font-medium text-gray-700">15 identified</span>
                  </div>
                  <div className="flex justify-between text-gray-500 mb-1">
                    <span>Experience:</span>
                    <span className="font-medium text-gray-700">4 positions</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Education:</span>
                    <span className="font-medium text-gray-700">Bachelor's Degree</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      
      <div className="flex justify-end">
        <Button variant="outline" className="mr-2" onClick={() => setLocation('/')}>
          Back to Home
        </Button>
        <FeatureTooltip id="jobDescription" position="left">
          <Button onClick={() => setLocation('/job-description')}>
            Continue to Job Description
          </Button>
        </FeatureTooltip>
      </div>
    </div>
  );
}