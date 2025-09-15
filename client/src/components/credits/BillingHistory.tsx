/**
 * Billing History Component
 * 
 * Displays paginated transaction history with filtering and export options
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreditHistory, type CreditTransaction } from '@/hooks/use-credits';
import { useAuth } from '@/hooks/use-auth';
import { 
  History, 
  ChevronLeft, 
  ChevronRight,
  Download,
  Filter,
  Search,
  TrendingUp,
  TrendingDown,
  Gift,
  RefreshCw,
  Loader2,
  AlertCircle
} from 'lucide-react';

interface BillingHistoryProps {
  pageSize?: number;
  showFilters?: boolean;
  compact?: boolean;
  className?: string;
}

export function BillingHistory({ 
  pageSize = 10, 
  showFilters = true, 
  compact = false,
  className = '' 
}: BillingHistoryProps) {
  const { user } = useAuth();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  
  const { data: history, isLoading, error, refetch } = useCreditHistory(currentPage, pageSize);

  if (!user) return null;

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center space-x-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm text-muted-foreground">Loading transactions...</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <AlertCircle className="h-12 w-12 text-red-500" />
            <p className="text-sm text-muted-foreground">Failed to load transaction history</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const transactions = history?.data?.transactions || [];
  const pagination = history?.data?.pagination;
  const currentBalance = history?.data?.currentBalance || 0;
  const totalPages = pagination ? Math.ceil(pagination.total / pagination.limit) : 1;

  // Filter transactions based on search and type
  const filteredTransactions = transactions.filter((transaction: CreditTransaction) => {
    const matchesSearch = searchTerm === '' || 
      transaction.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || transaction.type === filterType;
    
    return matchesSearch && matchesType;
  });

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'credit':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'debit':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      case 'grant':
        return <Gift className="h-4 w-4 text-blue-600" />;
      case 'refund':
        return <RefreshCw className="h-4 w-4 text-yellow-600" />;
      default:
        return <History className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTransactionBadge = (type: string) => {
    const configs = {
      credit: { variant: 'default' as const, label: 'Purchase' },
      debit: { variant: 'secondary' as const, label: 'Usage' },
      grant: { variant: 'outline' as const, label: 'Grant' },
      refund: { variant: 'destructive' as const, label: 'Refund' }
    };
    
    const config = configs[type as keyof typeof configs] || { variant: 'secondary' as const, label: type };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatAmount = (amount: number) => {
    const prefix = amount > 0 ? '+' : '';
    return `${prefix}${amount}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleExport = () => {
    // Future implementation for CSV export
    console.log('Export functionality coming soon');
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Transaction History
          </div>
          {!compact && (
            <Button variant="outline" size="sm" onClick={handleExport} disabled>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          )}
        </CardTitle>
        <CardDescription>
          Your credit transaction history and current balance: {currentBalance} credits
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        {showFilters && !compact && (
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search transactions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="credit">Purchases</SelectItem>
                  <SelectItem value="debit">Usage</SelectItem>
                  <SelectItem value="grant">Grants</SelectItem>
                  <SelectItem value="refund">Refunds</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Transaction Table */}
        {filteredTransactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No transactions found</p>
            {searchTerm && (
              <p className="text-sm">Try adjusting your search or filter</p>
            )}
          </div>
        ) : (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  {!compact && <TableHead className="text-right">Date</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((transaction: CreditTransaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center space-x-2">
                        {getTransactionIcon(transaction.type)}
                        <div>
                          <div className="text-sm">{transaction.description}</div>
                          {!compact && transaction.referenceId && (
                            <div className="text-xs text-muted-foreground">
                              Ref: {transaction.referenceId.slice(-8)}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getTransactionBadge(transaction.type)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`font-medium ${
                        transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatAmount(transaction.amount)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {transaction.balanceAfter}
                    </TableCell>
                    {!compact && (
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {formatDate(transaction.createdAt)}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages} 
              {pagination && (
                <span className="ml-2">
                  ({pagination.total} total transactions)
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}