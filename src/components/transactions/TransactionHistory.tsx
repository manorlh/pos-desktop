import { useState } from 'react';
import { Calendar, Receipt, Search, Filter } from 'lucide-react';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Transaction } from '@/types/index';

export function TransactionHistory() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  const { transactions, getTodaysTransactions } = useTransactionStore();
  
  const todaysTransactions = getTodaysTransactions();
  const filteredTransactions = todaysTransactions.filter(transaction =>
    transaction.transactionNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    transaction.customer?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    transaction.cashier.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const todaysTotalSales = todaysTransactions.reduce((sum, t) => sum + t.cart.totalAmount, 0);
  const todaysTransactionCount = todaysTransactions.length;
  const averageTicket = todaysTransactionCount > 0 ? todaysTotalSales / todaysTransactionCount : 0;

  const getStatusColor = (status: Transaction['status']) => {
    switch (status) {
      case 'completed': return 'default';
      case 'pending': return 'secondary';
      case 'cancelled': return 'destructive';
      case 'refunded': return 'destructive';
      default: return 'default';
    }
  };

  const getPaymentMethodIcon = (type: string) => {
    switch (type) {
      case 'cash': return '💵';
      case 'card': return '💳';
      case 'digital': return '📱';
      case 'check': return '🏦';
      case 'gift_card': return '🎁';
      default: return '💳';
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
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search transactions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline">
          <Calendar className="mr-2 h-4 w-4" />
          Today
        </Button>
        <Button variant="outline">
          <Filter className="mr-2 h-4 w-4" />
          Filter
        </Button>
      </div>

      {/* Transactions List */}
      <div className="space-y-4">
        {filteredTransactions.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No transactions found</h3>
              <p className="text-muted-foreground">
                {searchQuery ? 'Try adjusting your search criteria' : 'No transactions for today yet'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredTransactions.map((transaction) => (
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
                        <p className="text-muted-foreground">Payment Method</p>
                        <div className="flex items-center gap-1">
                          <span>{getPaymentMethodIcon(transaction.paymentMethod.type)}</span>
                          <span className="font-medium">{transaction.paymentMethod.name}</span>
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
                    {transaction.paymentDetails.changeAmount && transaction.paymentDetails.changeAmount > 0 && (
                      <p className="text-sm text-muted-foreground">
                        Change: {formatCurrency(transaction.paymentDetails.changeAmount)}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
