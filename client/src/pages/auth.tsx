/**
 * Authentication Page
 */

import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { LoginForm } from '@/components/auth/LoginForm';
import { RegisterForm } from '@/components/auth/RegisterForm';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { useAuth } from '@/hooks/use-auth';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // Get redirect parameter from URL
  const getRedirectPath = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const redirect = urlParams.get('redirect');
    return redirect ? decodeURIComponent(redirect) : '/upload';
  };

  // Redirect if already authenticated
  React.useEffect(() => {
    if (user) {
      const redirectPath = getRedirectPath();
      setLocation(redirectPath);
    }
  }, [user, setLocation]);

  const toggleMode = () => {
    setMode(prev => prev === 'login' ? 'register' : 'login');
  };

  const handleSuccess = () => {
    const redirectPath = getRedirectPath();
    setLocation(redirectPath);
  };

  if (user) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="container mx-auto px-4 py-16">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Welcome to EvalMatch
            </h1>
            <p className="text-gray-600">
              {mode === 'login' 
                ? 'Sign in to your account to continue' 
                : 'Create an account to get started'
              }
            </p>
          </div>
          
          {mode === 'login' ? (
            <LoginForm onToggleMode={toggleMode} onSuccess={handleSuccess} />
          ) : (
            <RegisterForm onToggleMode={toggleMode} onSuccess={handleSuccess} />
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}