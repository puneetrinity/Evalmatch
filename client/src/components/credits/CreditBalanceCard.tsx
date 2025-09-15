/**
 * Credit Balance Card Component
 * 
 * Displays user's credit balance with status indicators and quick actions
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCredits } from '@/hooks/use-credits';
import { useAuth } from '@/hooks/use-auth';
import { 
  CreditCard, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2,
  ArrowRight,
  Loader2
} from 'lucide-react';

interface CreditBalanceCardProps {
  showActions?: boolean;
  compact?: boolean;
  className?: string;
}

export function CreditBalanceCard({ 
  showActions = true, 
  compact = false, 
  className = '' 
}: CreditBalanceCardProps) {
  const { user } = useAuth();
  const { data: credits, isLoading, error } = useCredits();

  if (!user) return null;

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-x-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm text-muted-foreground">Loading credits...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center space-x-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm">Failed to load credit balance</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const balance = credits?.credits || 0;
  const totalUsed = credits?.totalUsed || 0;
  const totalPurchased = credits?.totalPurchased || 0;

  const getStatusInfo = (balance: number) => {
    if (balance === 0) {
      return {
        color: 'text-red-600 bg-red-50 border-red-200',
        icon: AlertTriangle,
        message: 'No credits remaining',
        actionText: 'Buy Credits',
        variant: 'destructive' as const
      };
    }
    if (balance < 10) {
      return {
        color: 'text-yellow-600 bg-yellow-50 border-yellow-200',
        icon: AlertTriangle,
        message: 'Low balance',
        actionText: 'Top Up',
        variant: 'secondary' as const
      };
    }
    return {
      color: 'text-green-600 bg-green-50 border-green-200',
      icon: CheckCircle2,
      message: 'Available for analysis',
      actionText: 'Analyze Resume',
      variant: 'default' as const
    };
  };

  const status = getStatusInfo(balance);
  const StatusIcon = status.icon;

  if (compact) {
    return (
      <Card className={`${status.color} border ${className}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CreditCard className="h-5 w-5" />
              <div>
                <div className="text-2xl font-bold">{balance}</div>
                <div className="text-sm">{status.message}</div>
              </div>
            </div>
            <StatusIcon className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <CreditCard className="h-5 w-5" />
          <span>Credit Balance</span>
          <Badge variant={status.variant === 'destructive' ? 'destructive' : 'secondary'}>
            {credits?.tier || 'testing'}
          </Badge>
        </CardTitle>
        <CardDescription>
          Available credits for resume analysis
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Balance Display */}
        <div className={`rounded-lg p-4 border ${status.color}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Current Balance</span>
            <StatusIcon className="h-5 w-5" />
          </div>
          <div className="text-3xl font-bold">{balance}</div>
          <p className="text-sm mt-1">{status.message}</p>
        </div>

        {/* Usage Statistics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 bg-muted/30 rounded">
            <div className="text-xl font-bold text-foreground">{totalUsed}</div>
            <div className="text-sm text-muted-foreground">Analyses</div>
          </div>
          <div className="text-center p-3 bg-muted/30 rounded">
            <div className="text-xl font-bold text-foreground">{totalPurchased}</div>
            <div className="text-sm text-muted-foreground">Purchased</div>
          </div>
        </div>

        {/* Credit Usage Efficiency */}
        {totalPurchased > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Usage Efficiency</span>
              <span className="font-medium">
                {Math.round((totalUsed / totalPurchased) * 100)}%
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-300" 
                style={{ width: `${Math.min((totalUsed / totalPurchased) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Quick Actions */}
        {showActions && (
          <div className="space-y-2">
            {balance === 0 ? (
              <Button className="w-full" variant="default" disabled>
                <CreditCard className="h-4 w-4 mr-2" />
                Purchase Credits - Coming Soon
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => window.location.href = '/upload'}
                >
                  <TrendingUp className="h-4 w-4 mr-1" />
                  Analyze
                </Button>
                <Button 
                  variant="secondary" 
                  size="sm"
                  disabled
                >
                  <ArrowRight className="h-4 w-4 mr-1" />
                  Buy More
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}