import { useState, useEffect } from 'react';
import { Calendar, Receipt, Search, Filter, ChevronLeft, ChevronRight, DollarSign } from 'lucide-react';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Transaction } from '@/types/index';

export function TransactionHistory() {
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30); // Default: last 30 days
    return date;
  });
  const [endDate, setEndDate] = useState(new Date());
  const [currentPage, setCurrentPage] = useState(1);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showDateFilter, setShowDateFilter] = useState(false);
  
  const { getTransactionsByDateRange, getTodaysTransactions } = useTransactionStore();
  const pageSize = 50;

  // Load transactions when date range changes
  useEffect(() => {
    loadTransactions();
  }, [startDate, endDate, currentPage]);

  const loadTransactions = async () => {
    setIsLoading(true);
    try {
      // Use paginated query for better performance
      const { loadTransactionsPage } = useTransactionStore.getState();
      const result = await loadTransactionsPage(currentPage, pageSize, {
        startDate,
        endDate,
      });
      setTransactions(result.transactions);
      setTotalTransactions(result.total);
    } catch (error) {
      console.error('Failed to load transactions:', error);
      setTransactions([]);
      setTotalTransactions(0);
    } finally {
      setIsLoading(false);
    }
  };

  // Get today's summary
  const todaysTransactions = getTodaysTransactions();
  const todaysTotalSales = todaysTransactions.reduce((sum, t) => sum + t.cart.totalAmount, 0);
  const todaysTransactionCount = todaysTransactions.length;
  const averageTicket = todaysTransactionCount > 0 ? todaysTotalSales / todaysTransactionCount : 0;

  const filteredTransactions = transactions.filter(transaction =>
    transaction.transactionNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    transaction.customer?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    transaction.cashier.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(totalTransactions / pageSize);

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handleTodayClick = () => {
    const today = new Date();
    setStartDate(today);
    setEndDate(today);
    setCurrentPage(1);
    setShowDateFilter(false);
  };

  const getStatusColor = (status: Transaction['status']) => {
    switch (status) {
      case 'completed': return 'default';
      case 'pending': return 'secondary';
      case 'cancelled': return 'destructive';
      case 'refunded': return 'destructive';
      default: return 'default';
    }
  };


  return (
    <div className="p-6 h-full overflow-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Transaction History</h1>
        <p className="text-muted-foreground">View and manage sales transactions</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Today's Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(todaysTotalSales)}</div>
            <p className="text-xs text-muted-foreground">
              {todaysTransactionCount} transactions
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Ticket</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(averageTicket)}</div>
            <p className="text-xs text-muted-foreground">
              Per transaction
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Transaction Count</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todaysTransactionCount}</div>
            <p className="text-xs text-muted-foreground">
              Today
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search transactions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={handleTodayClick}>
          <Calendar className="mr-2 h-4 w-4" />
          Today
        </Button>
        <Button 
          variant="outline" 
          onClick={() => setShowDateFilter(!showDateFilter)}
        >
          <Filter className="mr-2 h-4 w-4" />
          Date Range
        </Button>
      </div>

      {/* Date Range Filter */}
      {showDateFilter && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="text-sm font-medium mb-1 block">Start Date</label>
                <Input
                  type="date"
                  value={startDate.toISOString().split('T')[0]}
                  onChange={(e) => {
                    setStartDate(new Date(e.target.value));
                    setCurrentPage(1);
                  }}
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium mb-1 block">End Date</label>
                <Input
                  type="date"
                  value={endDate.toISOString().split('T')[0]}
                  onChange={(e) => {
                    setEndDate(new Date(e.target.value));
                    setCurrentPage(1);
                  }}
                />
              </div>
              <Button onClick={() => setShowDateFilter(false)} variant="outline">
                Close
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transactions List */}
      {isLoading ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading transactions...</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredTransactions.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No transactions found</h3>
                <p className="text-muted-foreground">
                  {searchQuery ? 'Try adjusting your search criteria' : `No transactions found for the selected date range`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {filteredTransactions.map((transaction) => (
            <Card key={transaction.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">#{transaction.transactionNumber}</h3>
                      <Badge variant={getStatusColor(transaction.status)}>
                        {transaction.status}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Date & Time</p>
                        <p className="font-medium">{formatDate(transaction.createdAt)}</p>
                      </div>
                      
                      <div>
                        <p className="text-muted-foreground">Cashier</p>
                        <p className="font-medium">{transaction.cashier.name}</p>
                      </div>
                      
                      <div>
                        <p className="text-muted-foreground">Payment</p>
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-4 w-4" />
                          <span className="font-medium">Cash</span>
                        </div>
                      </div>
                      
                      <div>
                        <p className="text-muted-foreground">Items</p>
                        <p className="font-medium">{transaction.cart.items.length} items</p>
                      </div>
                    </div>

                    {/* Items Summary */}
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="flex flex-wrap gap-2 mb-2">
                        {transaction.cart.items.slice(0, 3).map((item) => (
                          <Badge key={item.id} variant="outline" className="text-xs">
                            {item.product.name} × {item.quantity}
                          </Badge>
                        ))}
                        {transaction.cart.items.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{transaction.cart.items.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right ml-4">
                    <div className="text-2xl font-bold">
                      {formatCurrency(transaction.cart.totalAmount)}
                    </div>
                    {transaction.changeAmount && transaction.changeAmount > 0 && (
                      <p className="text-sm text-muted-foreground">
                        Change: {formatCurrency(transaction.changeAmount)}
                      </p>
                    )}
                    {transaction.amountTendered && (
                      <p className="text-xs text-muted-foreground">
                        Tendered: {formatCurrency(transaction.amountTendered)}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
              ))}
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <div className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalTransactions)} of {totalTransactions} transactions
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePreviousPage}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">
                        Page {currentPage} of {totalPages}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNextPage}
                      disabled={currentPage >= totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
