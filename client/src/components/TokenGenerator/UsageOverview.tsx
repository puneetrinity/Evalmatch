/**
 * Usage Overview Component
 * 
 * Displays current usage, limits, and token management
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { 
  BarChart3, 
  Key, 
  Calendar, 
  Trash2, 
  AlertTriangle,
  TrendingUp,
  Clock
} from 'lucide-react';
import type { UsageOverview as UsageOverviewType } from '../../../../shared/schema';

interface UsageOverviewProps {
  usageOverview: UsageOverviewType;
  onTokenDeactivated: (tokenId: string) => void;
  loading?: boolean;
}

export function UsageOverview({ 
  usageOverview, 
  onTokenDeactivated, 
  loading = false 
}: UsageOverviewProps) {
  const usagePercentage = (usageOverview.currentUsage / usageOverview.limit) * 100;
  const isNearLimit = usagePercentage > 80;
  const isAtLimit = usageOverview.remainingCalls <= 0;

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'testing':
        return 'bg-blue-100 text-blue-800';
      case 'basic':
        return 'bg-green-100 text-green-800';
      case 'premium':
        return 'bg-purple-100 text-purple-800';
      case 'enterprise':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Usage Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-muted-foreground">Current Usage</span>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold">
                {usageOverview.currentUsage}
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  / {usageOverview.limit}
                </span>
              </div>
              <Progress value={usagePercentage} className="mt-2" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-muted-foreground">Remaining Calls</span>
            </div>
            <div className="mt-2">
              <div className={`text-2xl font-bold ${isAtLimit ? 'text-destructive' : 'text-green-600'}`}>
                {usageOverview.remainingCalls}
              </div>
              <div className="text-sm text-muted-foreground">
                {isAtLimit 
                  ? 'Limit reached' 
                  : isNearLimit 
                  ? 'Near limit'
                  : 'Available'
                }
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <Key className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-muted-foreground">Active Tokens</span>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold">
                {usageOverview.tokens.filter(t => t.isActive).length}
              </div>
              <div className="text-sm text-muted-foreground">
                of {usageOverview.tokens.length} total
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plan Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Plan Information</span>
            <Badge className={getTierColor(usageOverview.tier)}>
              {usageOverview.tier.charAt(0).toUpperCase() + usageOverview.tier.slice(1)}
            </Badge>
          </CardTitle>
          <CardDescription>
            Your current plan limits and reset schedule
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Usage Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>API Calls Used</span>
                <span className="font-medium">
                  {usageOverview.currentUsage} / {usageOverview.limit}
                </span>
              </div>
              <Progress value={usagePercentage} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{Math.round(usagePercentage)}% used</span>
                <span>{usageOverview.remainingCalls} remaining</span>
              </div>
            </div>

            {/* Reset Information */}
            {usageOverview.resetDate && (
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  Usage resets on {formatDate(usageOverview.resetDate)}
                </span>
              </div>
            )}

            {/* Warning for high usage */}
            {isNearLimit && !isAtLimit && (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-yellow-800">
                  You're approaching your API limit. Consider upgrading for higher limits.
                </span>
              </div>
            )}

            {isAtLimit && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <span className="text-sm text-red-800">
                  You've reached your API limit. Upgrade to continue using the API.
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Token Management */}
      <Card>
        <CardHeader>
          <CardTitle>API Tokens</CardTitle>
          <CardDescription>
            Manage your active API tokens
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usageOverview.tokens.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No API tokens generated yet</p>
              <p className="text-sm">Generate your first token in the Generate tab</p>
            </div>
          ) : (
            <div className="space-y-3">
              {usageOverview.tokens.map((token) => (
                <div
                  key={token.id}
                  className={`flex items-center justify-between p-4 border rounded-lg ${
                    token.isActive ? 'bg-background' : 'bg-muted/50'
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">
                        {token.name || 'Unnamed Token'}
                      </h4>
                      <Badge variant={token.isActive ? 'default' : 'secondary'}>
                        {token.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1 space-y-1">
                      <div className="flex items-center gap-4">
                        <span>ID: {token.id}</span>
                        <span>Requests: {token.totalRequests}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span>Created: {formatDate(token.createdAt)}</span>
                        {token.lastUsedAt && (
                          <span>Last used: {formatDate(token.lastUsedAt)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {token.isActive && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => onTokenDeactivated(token.id)}
                      disabled={loading}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Deactivate
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}