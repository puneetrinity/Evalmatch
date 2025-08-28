/**
 * Token Display Component
 * 
 * Displays generated API token with copy functionality and security guidance
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import { Copy, Check, Eye, EyeOff, Download, X, Shield } from 'lucide-react';
import type { TokenGenerationResponse } from '../../../../shared/schema';

interface TokenDisplayProps {
  token: TokenGenerationResponse;
  onClear: () => void;
}

export function TokenDisplay({ token, onClear }: TokenDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(token.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy token:', error);
    }
  };

  const handleDownload = () => {
    const content = `EvalMatch API Token
Generated: ${new Date().toISOString()}
Token ID: ${token.tokenId}
Expires: ${token.expiresAt ? new Date(token.expiresAt).toISOString() : 'Never'}
Remaining Calls: ${token.usage.remaining}

API Token:
${token.token}

IMPORTANT SECURITY NOTES:
- Keep this token secure and never share it publicly
- Store it in a secure location like environment variables
- This token grants access to your EvalMatch API quota
- You can deactivate this token anytime from the dashboard

For documentation on using this token, visit:
https://docs.evalmatch.com/api/authentication
`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evalmatch-api-token-${token.tokenId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatTokenForDisplay = (token: string) => {
    if (!showToken) {
      return 'em_' + '*'.repeat(token.length - 3);
    }
    return token;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-600" />
              Token Generated Successfully
            </CardTitle>
            <CardDescription>
              Your API token is ready to use
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Success Alert */}
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            <strong>Important:</strong> This token will only be displayed once. 
            Make sure to copy and store it securely before closing this window.
          </AlertDescription>
        </Alert>

        {/* Token Information */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Token ID</p>
            <p className="font-mono font-medium">{token.tokenId}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Expires</p>
            <p className="font-medium">
              {token.expiresAt 
                ? new Date(token.expiresAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                : 'Never'
              }
            </p>
          </div>
        </div>

        {/* Token Display */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">API Token</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowToken(!showToken)}
              className="text-xs"
            >
              {showToken ? (
                <>
                  <EyeOff className="h-3 w-3 mr-1" />
                  Hide
                </>
              ) : (
                <>
                  <Eye className="h-3 w-3 mr-1" />
                  Show
                </>
              )}
            </Button>
          </div>
          <div className="p-3 bg-muted rounded-lg border">
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono break-all select-all">
                {formatTokenForDisplay(token.token)}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 mr-1" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Usage Information */}
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm font-medium text-blue-900 mb-2">API Usage Allowance</p>
          <div className="flex justify-between text-sm text-blue-800">
            <span>Remaining Calls:</span>
            <span className="font-medium">{token.usage.remaining}</span>
          </div>
          <div className="flex justify-between text-sm text-blue-800">
            <span>Total Allowance:</span>
            <span className="font-medium">{token.usage.total}</span>
          </div>
          {token.usage.resetDate && (
            <div className="flex justify-between text-sm text-blue-800">
              <span>Resets:</span>
              <span className="font-medium">
                {new Date(token.usage.resetDate).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button onClick={handleCopy} className="flex-1">
            <Copy className="h-4 w-4 mr-2" />
            {copied ? 'Copied!' : 'Copy Token'}
          </Button>
          <Button variant="outline" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>

        {/* Usage Instructions */}
        <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-lg">
          <p className="font-medium mb-2">How to use your token:</p>
          <div className="space-y-2">
            <div>
              <p className="font-medium">HTTP Header:</p>
              <code className="block bg-background p-2 rounded text-xs mt-1 border">
                Authorization: Bearer {showToken ? token.token : 'YOUR_TOKEN_HERE'}
              </code>
            </div>
            <div>
              <p className="font-medium">SDK Example:</p>
              <code className="block bg-background p-2 rounded text-xs mt-1 border">
                {`const client = new EvalMatchClient('${showToken ? token.token : 'YOUR_TOKEN_HERE'}');`}
              </code>
            </div>
          </div>
          <p className="mt-2">
            View the full documentation at{' '}
            <a 
              href="https://docs.evalmatch.com/api" 
              className="text-primary underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              docs.evalmatch.com/api
            </a>
          </p>
        </div>

        {/* Security Reminders */}
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Security Best Practices:</strong>
            <ul className="mt-1 space-y-1">
              <li>• Store tokens in environment variables, not in code</li>
              <li>• Never commit tokens to version control</li>
              <li>• Rotate tokens regularly for enhanced security</li>
              <li>• Monitor token usage in the Analytics tab</li>
            </ul>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}