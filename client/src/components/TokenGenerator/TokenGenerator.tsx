/**
 * Token Generator Component
 * 
 * Main component for API token generation and management with Firebase authentication
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { TokenGenerationForm } from './TokenGenerationForm';
import { TokenDisplay } from './TokenDisplay';
import { UsageOverview } from './UsageOverview';
import { UsageMetrics } from './UsageMetrics';
import { UpgradePrompt } from './UpgradePrompt';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Alert, AlertDescription } from '../ui/alert';
import { Loader2, Shield, Key, BarChart3, Settings } from 'lucide-react';
import { tokenApi } from '../../lib/tokenApi';
import type { 
  TokenGenerationResponse, 
  UsageOverview as UsageOverviewType,
  ApiUsageMetrics 
} from '../../../../shared/schema';

interface TokenGeneratorState {
  loading: boolean;
  error: string | null;
  generatedToken: TokenGenerationResponse | null;
  usageOverview: UsageOverviewType | null;
  usageMetrics: ApiUsageMetrics | null;
}

export function TokenGenerator() {
  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuth();
  const [state, setState] = useState<TokenGeneratorState>({
    loading: false,
    error: null,
    generatedToken: null,
    usageOverview: null,
    usageMetrics: null,
  });

  // Load user data when authenticated
  useEffect(() => {
    if (user) {
      loadUserData();
    }
  }, [user]);

  const loadUserData = async () => {
    if (!user) return;

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const [usageOverview, usageMetrics] = await Promise.all([
        tokenApi.getUsageOverview(),
        tokenApi.getUsageMetrics(),
      ]);

      setState(prev => ({
        ...prev,
        usageOverview,
        usageMetrics,
        loading: false,
      }));
    } catch (error) {
      console.error('Failed to load user data:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to load user data. Please try again.',
        loading: false,
      }));
    }
  };

  const handleTokenGenerated = (token: TokenGenerationResponse) => {
    setState(prev => ({ ...prev, generatedToken: token }));
    // Refresh usage data
    loadUserData();
  };

  const handleTokenDeactivated = async (tokenId: string) => {
    try {
      setState(prev => ({ ...prev, loading: true }));
      await tokenApi.deactivateToken(tokenId);
      // Refresh usage data
      await loadUserData();
    } catch (error) {
      console.error('Failed to deactivate token:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to deactivate token. Please try again.',
        loading: false,
      }));
    }
  };

  const handleClearGeneratedToken = () => {
    setState(prev => ({ ...prev, generatedToken: null }));
  };

  // Show loading spinner while authenticating
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading authentication...</p>
        </div>
      </div>
    );
  }

  // Show authentication prompt if not signed in
  if (!user) {
    return (
      <div className="max-w-md mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>
              Sign in with your Firebase account to generate API tokens and access the EvalMatch SDK
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              onClick={signInWithGoogle}
              className="w-full bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-3"
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
              Sign in with Google
            </button>
            <p className="text-xs text-center text-muted-foreground mt-4">
              By signing in, you agree to our terms of service and privacy policy
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">API Token Management</h1>
            <p className="text-muted-foreground mt-1">
              Generate and manage your EvalMatch API tokens
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right text-sm">
              <p className="font-medium">{user.displayName || user.email}</p>
              <p className="text-muted-foreground">
                {state.usageOverview?.tier.charAt(0).toUpperCase() + state.usageOverview?.tier.slice(1)} Plan
              </p>
            </div>
            <button
              onClick={signOut}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {state.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        {/* Main Content */}
        <Tabs defaultValue="generate" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="generate" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              Generate
            </TabsTrigger>
            <TabsTrigger value="usage" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Usage
            </TabsTrigger>
            <TabsTrigger value="metrics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Token Generation Tab */}
          <TabsContent value="generate" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <TokenGenerationForm 
                  onTokenGenerated={handleTokenGenerated}
                  disabled={state.loading}
                  usageOverview={state.usageOverview}
                />
              </div>
              <div>
                {state.generatedToken ? (
                  <TokenDisplay
                    token={state.generatedToken}
                    onClear={handleClearGeneratedToken}
                  />
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle>Generated Token</CardTitle>
                      <CardDescription>
                        Your API token will appear here after generation
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-32 flex items-center justify-center text-muted-foreground border-2 border-dashed border-muted rounded-lg">
                        No token generated yet
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* Show upgrade prompt if near limit */}
            {state.usageOverview && (
              <UpgradePrompt usageOverview={state.usageOverview} />
            )}
          </TabsContent>

          {/* Usage Overview Tab */}
          <TabsContent value="usage" className="space-y-6">
            {state.usageOverview ? (
              <UsageOverview 
                usageOverview={state.usageOverview}
                onTokenDeactivated={handleTokenDeactivated}
                loading={state.loading}
              />
            ) : (
              <div className="flex items-center justify-center min-h-[300px]">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
          </TabsContent>

          {/* Usage Metrics Tab */}
          <TabsContent value="metrics" className="space-y-6">
            {state.usageMetrics ? (
              <UsageMetrics usageMetrics={state.usageMetrics} />
            ) : (
              <div className="flex items-center justify-center min-h-[300px]">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Account Settings</CardTitle>
                <CardDescription>
                  Manage your account and API preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h4 className="font-medium">Current Tier</h4>
                    <p className="text-sm text-muted-foreground">
                      {state.usageOverview?.tier.charAt(0).toUpperCase() + state.usageOverview?.tier.slice(1)} Plan
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      {state.usageOverview?.remainingCalls || 0} calls remaining
                    </p>
                    <p className="text-sm text-muted-foreground">
                      of {state.usageOverview?.limit || 0} total
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h4 className="font-medium">Active Tokens</h4>
                    <p className="text-sm text-muted-foreground">
                      Number of active API tokens
                    </p>
                  </div>
                  <div className="font-medium">
                    {state.usageOverview?.tokens.filter(t => t.isActive).length || 0}
                  </div>
                </div>

                {process.env.NODE_ENV === 'development' && (
                  <div className="p-4 border rounded-lg bg-yellow-50 border-yellow-200">
                    <h4 className="font-medium text-yellow-800 mb-2">Development Tools</h4>
                    <button
                      onClick={async () => {
                        try {
                          await tokenApi.resetUsage();
                          await loadUserData();
                        } catch (error) {
                          console.error('Failed to reset usage:', error);
                        }
                      }}
                      className="text-sm text-yellow-700 hover:text-yellow-800 underline"
                    >
                      Reset Usage Counter
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}