import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/contexts/AuthContext";
import { RequireAuth } from "@/hooks/use-auth-simple";
import NotFound from "@/pages/not-found";

import HomePage from "./pages/home";
import AuthPage from "./pages/auth";
import UploadPage from "./pages/upload";
import JobDescriptionPage from "./pages/job-description";
import BiasDetectionPage from "./pages/bias-detection";
import AnalysisPage from "./pages/analysis";
import InterviewPage from "./pages/interview";
import PrivacyPolicy from "./pages/privacy-policy";
import TermsOfService from "./pages/terms-of-service";
import Feedback from "./pages/feedback";

// Import onboarding components
import { Welcome, HelpCenter } from "@/components/onboarding";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/terms-of-service" component={TermsOfService} />
      <Route path="/feedback" component={Feedback} />
      
      {/* Protected Routes */}
      <Route path="/upload">
        <RequireAuth>
          <UploadPage />
        </RequireAuth>
      </Route>
      <Route path="/job-description">
        <RequireAuth>
          <JobDescriptionPage />
        </RequireAuth>
      </Route>
      <Route path="/bias-detection/:jobId">
        <RequireAuth>
          <BiasDetectionPage />
        </RequireAuth>
      </Route>
      <Route path="/analysis/:jobId">
        <RequireAuth>
          <AnalysisPage />
        </RequireAuth>
      </Route>
      <Route path="/interview/:resumeId/:jobId">
        <RequireAuth>
          <InterviewPage />
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
