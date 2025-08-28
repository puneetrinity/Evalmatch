import { useState, useEffect, lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/contexts/AuthContext";
import { RequireAuth } from "@/hooks/use-auth-simple";
import NotFound from "@/pages/not-found";

// Core pages - loaded immediately for faster initial render
import HomePage from "./pages/home";
import AuthPage from "./pages/auth";

// Lazy load heavy pages to reduce initial bundle size
const UploadPage = lazy(() => import("./pages/upload"));
const JobDescriptionPage = lazy(() => import("./pages/job-description"));
const BiasDetectionPage = lazy(() => import("./pages/bias-detection"));
const AnalysisPage = lazy(() => import("./pages/analysis"));
const InterviewPage = lazy(() => import("./pages/interview"));
const SdkTokensPage = lazy(() => import("./pages/sdk-tokens"));
const MyResumesPage = lazy(() => import("./pages/my-resumes"));
const MyAnalysesPage = lazy(() => import("./pages/my-analyses"));
const PrivacyPolicy = lazy(() => import("./pages/privacy-policy"));
const TermsOfService = lazy(() => import("./pages/terms-of-service"));
const Feedback = lazy(() => import("./pages/feedback"));

// Lazy load onboarding components
const Welcome = lazy(() => import("@/components/onboarding").then(m => ({ default: m.Welcome })));
const HelpCenter = lazy(() => import("@/components/onboarding").then(m => ({ default: m.HelpCenter })));

// Loading component for better UX during lazy loading
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      {/* Core pages - no lazy loading needed */}
      <Route path="/" component={HomePage} />
      <Route path="/auth" component={AuthPage} />
      
      {/* Lazy loaded pages wrapped in Suspense */}
      <Route path="/privacy-policy">
        <Suspense fallback={<PageLoader />}>
          <PrivacyPolicy />
        </Suspense>
      </Route>
      <Route path="/terms-of-service">
        <Suspense fallback={<PageLoader />}>
          <TermsOfService />
        </Suspense>
      </Route>
      <Route path="/feedback">
        <Suspense fallback={<PageLoader />}>
          <Feedback />
        </Suspense>
      </Route>
      
      {/* Protected Routes with lazy loading */}
      <Route path="/sdk-tokens">
        <RequireAuth>
          <Suspense fallback={<PageLoader />}>
            <SdkTokensPage />
          </Suspense>
        </RequireAuth>
      </Route>
      <Route path="/my-resumes">
        <RequireAuth>
          <Suspense fallback={<PageLoader />}>
            <MyResumesPage />
          </Suspense>
        </RequireAuth>
      </Route>
      <Route path="/my-analyses">
        <RequireAuth>
          <Suspense fallback={<PageLoader />}>
            <MyAnalysesPage />
          </Suspense>
        </RequireAuth>
      </Route>
      <Route path="/upload">
        <RequireAuth>
          <Suspense fallback={<PageLoader />}>
            <UploadPage />
          </Suspense>
        </RequireAuth>
      </Route>
      <Route path="/job-description">
        <RequireAuth>
          <Suspense fallback={<PageLoader />}>
            <JobDescriptionPage />
          </Suspense>
        </RequireAuth>
      </Route>
      <Route path="/bias-detection/:jobId">
        <RequireAuth>
          <Suspense fallback={<PageLoader />}>
            <BiasDetectionPage />
          </Suspense>
        </RequireAuth>
      </Route>
      <Route path="/analysis/:jobId">
        <RequireAuth>
          <Suspense fallback={<PageLoader />}>
            <AnalysisPage />
          </Suspense>
        </RequireAuth>
      </Route>
      <Route path="/interview/:resumeId/:jobId">
        <RequireAuth>
          <Suspense fallback={<PageLoader />}>
            <InterviewPage />
          </Suspense>
        </RequireAuth>
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [showWelcome, setShowWelcome] = useState(false);
  
  // Check if this is the user's first visit
  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem('hasSeenWelcome');
    if (hasSeenWelcome !== 'true') {
      // Show welcome screen for new users
      setShowWelcome(true);
    }
  }, []);
  
  const handleWelcomeComplete = () => {
    setShowWelcome(false);
  };
  
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          {/* Main application */}
          <Router />
          
          {/* Onboarding components */}
          {showWelcome && <Welcome onComplete={handleWelcomeComplete} />}
          <HelpCenter />
          
          {/* Toast notifications */}
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
