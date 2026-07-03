import { useState, useEffect, useRef } from 'react';
import { Calendar, Receipt, Search, Filter, ChevronLeft, ChevronRight, DollarSign, RotateCcw, Printer, Ticket } from 'lucide-react';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useProductStore } from '@/stores/useProductStore';
import { useBusinessStore } from '@/stores/useBusinessStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useI18n } from '@/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { buildReceiptPrintPayload } from '@/utils/receiptPrint';
import { printReceiptForTransaction } from '@/utils/printReceipt';
import { reprintVoucher } from '@/utils/voucherIssue';
import { formatShortSerial } from '@/utils/voucherTemplate';
import { RefundDialog } from './RefundDialog';
import type { IssuedVoucher, Transaction, Voucher } from '@/types/index';

export function TransactionHistory() {
  const { t } = useI18n();
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
  const { categories } = useProductStore();
  const { businessInfo } = useBusinessStore();
  const { globalTaxRate, language } = useSettingsStore();
  const pageSize = 50;
  const prevSearchQueryRef = useRef(searchQuery);
  const [refundDialogTransaction, setRefundDialogTransaction] = useState<Transaction | null>(null);
  const [printMessage, setPrintMessage] = useState<string | null>(null);

  // Reset to page 1 when search query changes
  useEffect(() => {
    if (prevSearchQueryRef.current !== searchQuery) {
      prevSearchQueryRef.current = searchQuery;
      setCurrentPage(1);
    }
  }, [searchQuery]);

  // Load transactions when date range, search, or page changes
  useEffect(() => {
    loadTransactions();
  }, [startDate, endDate, currentPage, searchQuery]);

  const loadTransactions = async () => {
    setIsLoading(true);
    try {
      // Use paginated query for better performance
      const { loadTransactionsPage } = useTransactionStore.getState();
      const result = await loadTransactionsPage(currentPage, pageSize, {
        startDate,
        endDate,
        searchQuery: searchQuery.trim() || undefined,
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
      case 'partial_refund': return 'destructive';
      default: return 'default';
    }
  };

  const getStatusLabel = (status: Transaction['status']) => {
    switch (status) {
      case 'completed': return t('transactions.completed');
      case 'pending': return t('transactions.pending');
      case 'cancelled': return t('transactions.cancelled');
      case 'refunded': return t('transactions.refunded');
      case 'partial_refund': return t('transactions.partialRefund');
      default: return status;
    }
  };

  const handleReprintReceipt = async (
    transaction: Transaction,
    options?: { originalDocNumber?: string },
  ) => {
    if (!window.electronAPI?.printReceipt || !businessInfo) return;
    try {
      const payload = buildReceiptPrintPayload(
        transaction,
        businessInfo,
        globalTaxRate,
        language,
        categories,
        {
          isCopy: !transaction.refundOfTransactionId,
          originalDocNumber: options?.originalDocNumber,
        },
      );
      const { receiptError, drawerWarning } = await printReceiptForTransaction(
        payload,
        transaction,
        t,
        undefined,
        { forceReceiptPrinter: true },
      );
      if (receiptError) {
        setPrintMessage(receiptError);
      } else if (drawerWarning) {
        setPrintMessage(drawerWarning);
      } else {
        setPrintMessage(null);
      }
    } catch (e: unknown) {
      setPrintMessage(e instanceof Error ? e.message : t('receipt.printFailed'));
    }
  };

  const canShowRefundButton = (transaction: Transaction) => {
    if (transaction.refundOfTransactionId) return false;
    return transaction.status === 'completed' || transaction.status === 'partial_refund';
  };

  const handleReprintRefundReceipt = async (refundTx: Transaction) => {
    if (!refundTx.refundOfTransactionId) return;
    const originalTx = transactions.find((t) => t.id === refundTx.refundOfTransactionId);
    await handleReprintReceipt(refundTx, {
      originalDocNumber: originalTx?.transactionNumber,
    });
  };

  const handleReprintVoucher = async (transaction: Transaction, issued: IssuedVoucher) => {
    if (!businessInfo || !issued.voucherId || !window.electronAPI?.dbGetVoucher) return;
    try {
      const voucher = (await window.electronAPI.dbGetVoucher(issued.voucherId)) as Voucher | null;
      if (!voucher) {
        setPrintMessage(t('voucher.reprintFailed'));
        return;
      }
      const err = await reprintVoucher(issued, voucher, businessInfo, transaction.transactionNumber);
      setPrintMessage(err);
    } catch (e: unknown) {
      setPrintMessage(e instanceof Error ? e.message : t('voucher.reprintFailed'));
    }
  };


  return (
    <div className="p-6 h-full overflow-auto">
      <div className="mb-6">
        {printMessage ? (
          <p className="text-sm text-destructive mb-2">{printMessage}</p>
        ) : null}
        <h1 className="text-2xl font-bold mb-2">{t('transactions.history')}</h1>
        <p className="text-muted-foreground">{t('transactions.description')}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('transactions.todaySales')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(todaysTotalSales)}</div>
            <p className="text-xs text-muted-foreground">
              {todaysTransactionCount} {t('transactions.itemsPlural')}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('transactions.averageTicket')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(averageTicket)}</div>
            <p className="text-xs text-muted-foreground">
              {t('transactions.perTransaction')}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('transactions.transactionCount')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todaysTransactionCount}</div>
            <p className="text-xs text-muted-foreground">
              {t('transactions.today')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('transactions.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={handleTodayClick}>
          <Calendar className="mr-2 h-4 w-4" />
          {t('transactions.today')}
        </Button>
        <Button 
          variant="outline" 
          onClick={() => setShowDateFilter(!showDateFilter)}
        >
          <Filter className="mr-2 h-4 w-4" />
          {t('transactions.dateRange')}
        </Button>
      </div>

      {/* Date Range Filter */}
      {showDateFilter && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="text-sm font-medium mb-1 block">{t('transactions.startDate')}</label>
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
                <label className="text-sm font-medium mb-1 block">{t('transactions.endDate')}</label>
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
                {t('common.close')}
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
            <p className="text-muted-foreground">{t('transactions.loading')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {transactions.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">{t('transactions.noTransactions')}</h3>
                <p className="text-muted-foreground">
                  {searchQuery ? t('transactions.noResultsSearch') : t('transactions.noResultsDateRange')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {transactions.map((transaction) => (
            <Card key={transaction.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">#{transaction.transactionNumber}</h3>
                      <Badge variant={getStatusColor(transaction.status)}>
                        {getStatusLabel(transaction.status)}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">{t('transactions.dateTime')}</p>
                        <p className="font-medium">{formatDate(transaction.createdAt)}</p>
                      </div>
                      
                      <div>
                        <p className="text-muted-foreground">{t('transactions.cashier')}</p>
                        <p className="font-medium">{transaction.cashier.name}</p>
                      </div>
                      
                      <div>
                        <p className="text-muted-foreground">{t('transactions.payment')}</p>
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-4 w-4" />
                          <span className="font-medium">{t('transactions.cash')}</span>
                        </div>
                      </div>
                      
                      <div>
                        <p className="text-muted-foreground">{t('transactions.items')}</p>
                        <p className="font-medium">{transaction.cart.items.length} {t('transactions.itemsPlural')}</p>
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
                            +{transaction.cart.items.length - 3} {t('transactions.more')}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2 ml-4">
                    <div className="text-2xl font-bold">
                      {formatCurrency(transaction.cart.totalAmount)}
                    </div>
                    {transaction.changeAmount && transaction.changeAmount > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {t('transactions.change')}: {formatCurrency(transaction.changeAmount)}
                      </p>
                    )}
                    {transaction.amountTendered && (
                      <p className="text-xs text-muted-foreground">
                        {t('transactions.tendered')}: {formatCurrency(transaction.amountTendered)}
                      </p>
                    )}
                    {transaction.refundOfTransactionId ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => void handleReprintRefundReceipt(transaction)}
                      >
                        <Printer className="h-4 w-4" />
                        {t('transactions.reprintRefundReceipt')}
                      </Button>
                    ) : null}
                    {canShowRefundButton(transaction) ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => void handleReprintReceipt(transaction)}
                        >
                          <Printer className="h-4 w-4" />
                          {t('transactions.reprintReceipt')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => setRefundDialogTransaction(transaction)}
                        >
                          <RotateCcw className="h-4 w-4" />
                          {t('transactions.refund')}
                        </Button>
                      </>
                    ) : null}
                    {transaction.issuedVouchers && transaction.issuedVouchers.length > 0 ? (
                      <div className="w-full mt-2 space-y-1">
                        <p className="text-xs text-muted-foreground">{t('transactions.vouchersIssued')}</p>
                        {transaction.issuedVouchers.map((iv) => (
                          <Button
                            key={iv.id}
                            variant="ghost"
                            size="sm"
                            className="gap-2 h-8 text-xs w-full justify-start"
                            onClick={() => void handleReprintVoucher(transaction, iv)}
                          >
                            <Ticket className="h-3.5 w-3.5" />
                            {iv.productName} × {iv.quantity} — {formatShortSerial(iv.id)}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
              ))}
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <div className="text-sm text-muted-foreground">
                    {t('transactions.showing')} {(currentPage - 1) * pageSize + 1} {t('transactions.to')} {Math.min(currentPage * pageSize, totalTransactions)} {t('transactions.of')} {totalTransactions} {t('transactions.itemsPlural')}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePreviousPage}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      {t('transactions.previous')}
                    </Button>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">
                        {t('transactions.page')} {currentPage} {t('transactions.of')} {totalPages}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNextPage}
                      disabled={currentPage >= totalPages}
                    >
                      {t('transactions.next')}
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <RefundDialog
        open={refundDialogTransaction != null}
        onOpenChange={(open) => !open && setRefundDialogTransaction(null)}
        transaction={refundDialogTransaction}
        onSuccess={() => loadTransactions()}
      />
    </div>
  );
}
