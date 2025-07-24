import { Link } from "wouter";
import { HelpCenter } from "@/components/onboarding";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/auth";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { AuthModal } from "@/components/auth/AuthModal";

export default function Header() {
  const { user, isAuthenticated } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <>
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <Link href="/" className="text-primary text-2xl font-bold">
                EvalMatchAI
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <HelpCenter 
                triggerButton={
                  <Button variant="ghost" className="text-gray-600 hover:text-gray-800">
                    Help Center
                  </Button>
                } 
              />
              
              {isAuthenticated ? (
                <UserMenu />
              ) : (
                <div className="flex items-center space-x-2">
                  <Button 
                    variant="ghost" 
                    onClick={() => setShowAuthModal(true)}
                  >
                    Sign In
                  </Button>
                  <Button 
                    onClick={() => setShowAuthModal(true)}
                    className="bg-primary text-white hover:bg-primary/80"
                  >
                    Get Started
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)}
        defaultMode="login"
      />
    </>
  );
}
}
