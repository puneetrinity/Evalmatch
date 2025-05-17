import { useEffect } from "react";
import { useLocation } from "wouter";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function HomePage() {
  const [_, setLocation] = useLocation();

  // Redirect to upload page after a brief delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setLocation("/upload");
    }, 3000);

    return () => clearTimeout(timer);
  }, [setLocation]);

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      
      <main className="flex-grow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Welcome to <span className="text-primary">EvalMatchAI</span>
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-12">
              The Semantic Matching Suite that analyzes resumes, matches them to job descriptions, and prepares customized interview questions.
            </p>

            <Card className="max-w-4xl mx-auto">
              <CardContent className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                  <div>
                    <div className="bg-primary/10 p-4 rounded-lg inline-block mb-4">
                      <i className="fas fa-file-upload text-3xl text-primary"></i>
                    </div>
                    <h3 className="text-xl font-semibold mb-2">Upload Resumes</h3>
                    <p className="text-gray-600">Upload up to 100 resumes for AI-powered analysis</p>
                  </div>
                  
                  <div>
                    <div className="bg-primary/10 p-4 rounded-lg inline-block mb-4">
                      <i className="fas fa-search text-3xl text-primary"></i>
                    </div>
                    <h3 className="text-xl font-semibold mb-2">Match to Jobs</h3>
                    <p className="text-gray-600">Compare resumes to job descriptions</p>
                  </div>
                  
                  <div>
                    <div className="bg-primary/10 p-4 rounded-lg inline-block mb-4">
                      <i className="fas fa-comments text-3xl text-primary"></i>
                    </div>
                    <h3 className="text-xl font-semibold mb-2">Interview Prep</h3>
                    <p className="text-gray-600">Generate customized interview questions</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button 
              className="mt-12 px-10 py-6 text-lg"
              onClick={() => setLocation("/upload")}
            >
              Get Started <i className="fas fa-arrow-right ml-2"></i>
            </Button>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
