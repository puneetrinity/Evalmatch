/**
 * Token Generation Form Component
 * 
 * Form for generating new API tokens with customization options
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Alert, AlertDescription } from '../ui/alert';
import { Loader2, Key, Clock, AlertTriangle } from 'lucide-react';
import { tokenApi } from '../../lib/tokenApi';
import type { 
  TokenGenerationRequest, 
  TokenGenerationResponse,
  UsageOverview 
} from '../../../../shared/schema';

interface TokenGenerationFormProps {
  onTokenGenerated: (token: TokenGenerationResponse) => void;
  disabled?: boolean;
  usageOverview: UsageOverview | null;
}

export function TokenGenerationForm({ 
  onTokenGenerated, 
  disabled = false,
  usageOverview 
}: TokenGenerationFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<TokenGenerationRequest>({
    tokenName: '',
    expiresIn: '30d',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const token = await tokenApi.generateToken(formData);
      onTokenGenerated(token);
      
      // Reset form
      setFormData({
        tokenName: '',
        expiresIn: '30d',
      });
    } catch (error: any) {
      console.error('Token generation failed:', error);
      setError(
        error.response?.data?.message || 
        error.message || 
        'Failed to generate token. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const canGenerateToken = usageOverview && usageOverview.remainingCalls > 0;
  const isNearLimit = usageOverview && usageOverview.remainingCalls <= 10;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Generate API Token
        </CardTitle>
        <CardDescription>
          Create a new API token for accessing the EvalMatch SDK
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Usage Warning */}
        {!canGenerateToken && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You have reached your API call limit ({usageOverview?.limit} calls). 
              Please upgrade your plan to continue using the API.
            </AlertDescription>
          </Alert>
        )}

        {isNearLimit && canGenerateToken && (
          <Alert className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You have {usageOverview?.remainingCalls} API calls remaining. 
              Consider upgrading your plan for higher limits.
            </AlertDescription>
          </Alert>
        )}

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Token Name */}
          <div className="space-y-2">
            <Label htmlFor="tokenName">
              Token Name
              <span className="text-muted-foreground text-sm ml-1">(optional)</span>
            </Label>
            <Input
              id="tokenName"
              type="text"
              placeholder="e.g., Production API, Testing Token"
              value={formData.tokenName}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                tokenName: e.target.value 
              }))}
              disabled={loading || disabled}
              maxLength={50}
            />
            <p className="text-xs text-muted-foreground">
              A descriptive name to help you identify this token
            </p>
          </div>

          {/* Expiration */}
          <div className="space-y-2">
            <Label htmlFor="expiresIn" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Expiration
            </Label>
            <Select
              value={formData.expiresIn}
              onValueChange={(value: '1h' | '24h' | '7d' | '30d' | 'never') => 
                setFormData(prev => ({ ...prev, expiresIn: value }))
              }
              disabled={loading || disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">1 Hour</SelectItem>
                <SelectItem value="24h">24 Hours</SelectItem>
                <SelectItem value="7d">7 Days</SelectItem>
                <SelectItem value="30d">30 Days</SelectItem>
                <SelectItem value="never">Never Expires</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Set when this token should automatically expire for security
            </p>
          </div>

          {/* Usage Information */}
          {usageOverview && (
            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span>Current Usage:</span>
                <span className="font-medium">
                  {usageOverview.currentUsage} / {usageOverview.limit} calls
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    usageOverview.currentUsage / usageOverview.limit > 0.8
                      ? 'bg-destructive'
                      : usageOverview.currentUsage / usageOverview.limit > 0.6
                      ? 'bg-yellow-500'
                      : 'bg-primary'
                  }`}
                  style={{
                    width: `${Math.min((usageOverview.currentUsage / usageOverview.limit) * 100, 100)}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{usageOverview.tier.charAt(0).toUpperCase() + usageOverview.tier.slice(1)} Plan</span>
                <span>{usageOverview.remainingCalls} remaining</span>
              </div>
            </div>
          )}

          {/* Generate Button */}
          <Button
            type="submit"
            className="w-full"
            disabled={loading || disabled || !canGenerateToken}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Token...
              </>
            ) : (
              <>
                <Key className="mr-2 h-4 w-4" />
                Generate API Token
              </>
            )}
          </Button>

          {/* Security Notice */}
          <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-lg">
            <p className="font-medium mb-1">Security Notice:</p>
            <ul className="space-y-1 text-xs">
              <li>• Your token will be displayed only once after generation</li>
              <li>• Store your token securely and never share it publicly</li>
              <li>• You can deactivate tokens anytime from the Usage tab</li>
              <li>• Tokens are automatically deactivated when they expire</li>
            </ul>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}