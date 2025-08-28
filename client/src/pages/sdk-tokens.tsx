import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Copy, Eye, EyeOff, Key, Loader2 } from 'lucide-react';
import { tokenApi } from '../lib/tokenApi';
import type { TokenGenerationResponse } from '../../../shared/schema';

// Helper function to safely parse dates
const parseDate = (dateValue: string | Date | undefined): string => {
  if (!dateValue) return 'Unknown';
  try {
    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
    return date.toLocaleString();
  } catch (error) {
    return 'Invalid Date';
  }
};

export default function SdkTokensPage() {
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const [tokenName, setTokenName] = useState('');
  const [expiresIn, setExpiresIn] = useState<'1h' | '24h' | '7d' | '30d' | 'never'>('30d');
  const [generatedToken, setGeneratedToken] = useState<TokenGenerationResponse | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerateToken = async () => {
    if (!tokenName.trim()) {
      setError('Please enter a token name');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await tokenApi.generateToken({
        name: tokenName.trim(),
        expiresIn: expiresIn,
        permissions: ['read', 'write']
      });
      
      setGeneratedToken(response);
      setTokenName('');
    } catch (err: any) {
      setError(err.message || 'Failed to generate token');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToken = async () => {
    if (generatedToken?.token) {
      try {
        await navigator.clipboard.writeText(generatedToken.token);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy token:', err);
      }
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Key className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Sign in Required</CardTitle>
              <CardDescription>
                Please sign in to generate SDK tokens
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={signInWithGoogle} className="w-full">
                Sign in with Google
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">SDK Token Generator</h1>
          <p className="text-muted-foreground mt-2">
            Generate API tokens for the EvalMatch SDK
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Generate New Token</CardTitle>
            <CardDescription>
              Create a new API token for SDK access
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tokenName">Token Name</Label>
              <Input
                id="tokenName"
                placeholder="e.g., My App Token"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                disabled={loading}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="expiresIn">Expiration</Label>
              <Select value={expiresIn} onValueChange={(value: '1h' | '24h' | '7d' | '30d' | 'never') => setExpiresIn(value)} disabled={loading}>
                <SelectTrigger>
                  <SelectValue placeholder="Select expiration time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">1 hour</SelectItem>
                  <SelectItem value="24h">24 hours</SelectItem>
                  <SelectItem value="7d">7 days</SelectItem>
                  <SelectItem value="30d">30 days</SelectItem>
                  <SelectItem value="never">Never expires</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={handleGenerateToken} 
              disabled={loading || !tokenName.trim()}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Key className="h-4 w-4 mr-2" />
                  Generate Token
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {generatedToken && (
          <Card>
            <CardHeader>
              <CardTitle>Your Generated Token</CardTitle>
              <CardDescription>
                Copy this token and store it securely. You won't be able to see it again.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Token ID</Label>
                <div className="font-mono text-sm p-2 bg-muted rounded">
                  {generatedToken.id}
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>API Token</Label>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowToken(!showToken)}
                    >
                      {showToken ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyToken}
                    >
                      <Copy className="h-4 w-4" />
                      {copied ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                </div>
                <div className="font-mono text-sm p-2 bg-muted rounded break-all">
                  {showToken ? generatedToken.token : '••••••••••••••••••••••••••••••••'}
                </div>
              </div>

              <div className="text-sm text-muted-foreground space-y-1">
                <p><strong>Token Name:</strong> {generatedToken.name}</p>
                <p><strong>Created:</strong> {parseDate(generatedToken.createdAt)}</p>
                <p><strong>Expires:</strong> {generatedToken.expiresAt ? parseDate(generatedToken.expiresAt) : 'Never'}</p>
              </div>

              <Alert>
                <AlertDescription>
                  <strong>Important:</strong> Store this token securely. You won't be able to view it again after leaving this page.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Quick Start</CardTitle>
            <CardDescription>
              Use your token with the EvalMatch SDK
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label>Installation</Label>
                <div className="font-mono text-sm p-2 bg-muted rounded mt-1">
                  npm install @evalmatch/sdk
                </div>
              </div>
              
              <div>
                <Label>Usage Example</Label>
                <pre className="text-sm p-3 bg-muted rounded mt-1 overflow-x-auto">
{`import { EvalMatchClient } from '@evalmatch/sdk';

const client = new EvalMatchClient({
  apiToken: 'your-token-here',
  baseURL: 'https://api.evalmatch.com'
});

// Analyze a resume
const result = await client.analyzeResume({
  resume: resumeFile,
  jobDescription: jobDescText
});`}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}