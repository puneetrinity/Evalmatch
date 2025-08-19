/**
 * Usage Metrics Component
 * 
 * Displays detailed analytics and usage metrics
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  AlertCircle,
  Activity,
  Globe,
  Zap
} from 'lucide-react';
import type { ApiUsageMetrics } from '../../../../shared/schema';

interface UsageMetricsProps {
  usageMetrics: ApiUsageMetrics;
}

export function UsageMetrics({ usageMetrics }: UsageMetricsProps) {
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getErrorRateColor = (errorRate: number) => {
    if (errorRate <= 1) return 'text-green-600';
    if (errorRate <= 5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getResponseTimeColor = (avgTime: number) => {
    if (avgTime <= 500) return 'text-green-600';
    if (avgTime <= 2000) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-muted-foreground">Total Calls</span>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold">{formatNumber(usageMetrics.totalCalls)}</div>
              <div className="text-sm text-muted-foreground">All time</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <Activity className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-muted-foreground">Today</span>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-green-600">
                {formatNumber(usageMetrics.callsToday)}
              </div>
              <div className="text-sm text-muted-foreground">API calls</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <Clock className={`h-5 w-5 ${getResponseTimeColor(usageMetrics.avgResponseTime)}`} />
              <span className="text-sm font-medium text-muted-foreground">Avg Response</span>
            </div>
            <div className="mt-2">
              <div className={`text-2xl font-bold ${getResponseTimeColor(usageMetrics.avgResponseTime)}`}>
                {formatDuration(usageMetrics.avgResponseTime)}
              </div>
              <div className="text-sm text-muted-foreground">Response time</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <AlertCircle className={`h-5 w-5 ${getErrorRateColor(usageMetrics.errorRate)}`} />
              <span className="text-sm font-medium text-muted-foreground">Error Rate</span>
            </div>
            <div className="mt-2">
              <div className={`text-2xl font-bold ${getErrorRateColor(usageMetrics.errorRate)}`}>
                {usageMetrics.errorRate.toFixed(1)}%
              </div>
              <div className="text-sm text-muted-foreground">
                {usageMetrics.errorRate <= 1 ? 'Excellent' : 
                 usageMetrics.errorRate <= 5 ? 'Good' : 'Needs attention'}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Time Period Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Usage Trends
          </CardTitle>
          <CardDescription>
            API call patterns over different time periods
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <div>
                  <p className="font-medium">Today</p>
                  <p className="text-sm text-muted-foreground">Last 24 hours</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{formatNumber(usageMetrics.callsToday)}</p>
                <p className="text-sm text-muted-foreground">calls</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <div>
                  <p className="font-medium">This Week</p>
                  <p className="text-sm text-muted-foreground">Last 7 days</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{formatNumber(usageMetrics.callsThisWeek)}</p>
                <p className="text-sm text-muted-foreground">calls</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                <div>
                  <p className="font-medium">This Month</p>
                  <p className="text-sm text-muted-foreground">Last 30 days</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{formatNumber(usageMetrics.callsThisMonth)}</p>
                <p className="text-sm text-muted-foreground">calls</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top Endpoints */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Most Used Endpoints
          </CardTitle>
          <CardDescription>
            Your most frequently accessed API endpoints
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usageMetrics.topEndpoints.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No API calls recorded yet</p>
              <p className="text-sm">Start using the API to see endpoint statistics</p>
            </div>
          ) : (
            <div className="space-y-4">
              {usageMetrics.topEndpoints.map((endpoint, index) => {
                const percentage = (endpoint.count / usageMetrics.totalCalls) * 100;
                return (
                  <div key={endpoint.endpoint} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="w-6 h-6 p-0 flex items-center justify-center text-xs">
                          {index + 1}
                        </Badge>
                        <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                          {endpoint.endpoint}
                        </code>
                      </div>
                      <div className="text-right text-sm">
                        <div className="font-medium">{formatNumber(endpoint.count)} calls</div>
                        <div className="text-muted-foreground">
                          {formatDuration(endpoint.avgResponseTime)} avg
                        </div>
                      </div>
                    </div>
                    <Progress value={percentage} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{percentage.toFixed(1)}% of total traffic</span>
                      <span>{formatDuration(endpoint.avgResponseTime)} average response</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Performance Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Performance Insights
          </CardTitle>
          <CardDescription>
            API performance analysis and recommendations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Error Rate Analysis */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">Error Rate Analysis</h4>
                <Badge 
                  variant={usageMetrics.errorRate <= 1 ? 'default' : 
                          usageMetrics.errorRate <= 5 ? 'secondary' : 'destructive'}
                >
                  {usageMetrics.errorRate.toFixed(1)}%
                </Badge>
              </div>
              <Progress value={Math.min(usageMetrics.errorRate, 100)} className="mb-2" />
              <p className="text-sm text-muted-foreground">
                {usageMetrics.errorRate <= 1 
                  ? 'Excellent error rate. Your API usage is very stable.'
                  : usageMetrics.errorRate <= 5
                  ? 'Good error rate. Some errors are normal, but monitor for patterns.'
                  : 'High error rate. Review your API calls for potential issues.'
                }
              </p>
            </div>

            {/* Response Time Analysis */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">Response Time Analysis</h4>
                <Badge 
                  variant={usageMetrics.avgResponseTime <= 500 ? 'default' : 
                          usageMetrics.avgResponseTime <= 2000 ? 'secondary' : 'destructive'}
                >
                  {formatDuration(usageMetrics.avgResponseTime)}
                </Badge>
              </div>
              <Progress 
                value={Math.min((usageMetrics.avgResponseTime / 5000) * 100, 100)} 
                className="mb-2" 
              />
              <p className="text-sm text-muted-foreground">
                {usageMetrics.avgResponseTime <= 500
                  ? 'Excellent response times. Your API calls are performing well.'
                  : usageMetrics.avgResponseTime <= 2000
                  ? 'Good response times. Consider optimizing for better performance.'
                  : 'Slow response times. Check your network connection and payload sizes.'
                }
              </p>
            </div>

            {/* Usage Pattern */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">Usage Pattern</h4>
              <div className="grid grid-cols-3 gap-4 text-center text-sm">
                <div>
                  <p className="text-muted-foreground">Daily Average</p>
                  <p className="font-medium">{Math.round(usageMetrics.callsThisMonth / 30)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Weekly Growth</p>
                  <p className="font-medium">
                    {usageMetrics.callsThisWeek > 0 
                      ? `${Math.round((usageMetrics.callsThisWeek / (usageMetrics.callsThisMonth / 4)) * 100)}%`
                      : 'N/A'
                    }
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Peak Usage</p>
                  <p className="font-medium">Today</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}