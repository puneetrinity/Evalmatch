import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Home, Search, Upload, FileText } from "lucide-react";

export default function NotFound() {
  const [_, setLocation] = useLocation();

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      
      <main className="flex-grow flex items-center justify-center bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="mb-8">
            <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
            <h2 className="text-2xl font-semibold text-gray-700 mb-2">Page Not Found</h2>
            <p className="text-gray-600 text-lg mb-8">
              Sorry, we couldn't find the page you're looking for. Let's get you back on track with our AI recruitment platform.
            </p>
          </div>

          <Card className="mb-8">
            <CardContent className="p-6">
              <h3 className="text-xl font-semibold mb-4">Popular Pages</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button 
                  variant="outline" 
                  className="flex items-center gap-2 p-4 h-auto"
                  onClick={() => setLocation("/")}
                >
                  <Home className="h-5 w-5" />
                  <div className="text-left">
                    <div className="font-medium">Home</div>
                    <div className="text-sm text-gray-500">AI recruitment platform overview</div>
                  </div>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="flex items-center gap-2 p-4 h-auto"
                  onClick={() => setLocation("/upload")}
                >
                  <Upload className="h-5 w-5" />
                  <div className="text-left">
                    <div className="font-medium">Upload Resumes</div>
                    <div className="text-sm text-gray-500">Start analyzing candidates</div>
                  </div>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="flex items-center gap-2 p-4 h-auto"
                  onClick={() => setLocation("/analysis")}
                >
                  <Search className="h-5 w-5" />
                  <div className="text-left">
                    <div className="font-medium">Analysis</div>
                    <div className="text-sm text-gray-500">View candidate matches</div>
                  </div>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="flex items-center gap-2 p-4 h-auto"
                  onClick={() => setLocation("/bias-detection")}
                >
                  <FileText className="h-5 w-5" />
                  <div className="text-left">
                    <div className="font-medium">Bias Detection</div>
                    <div className="text-sm text-gray-500">Eliminate hiring bias</div>
                  </div>
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Button 
              size="lg" 
              onClick={() => setLocation("/")}
              className="px-8"
            >
              Go to Homepage
            </Button>
            <div>
              <Button 
                variant="link"
                onClick={() => window.history.back()}
              >
                Go Back
              </Button>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
