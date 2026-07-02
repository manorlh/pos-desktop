import { useState, useEffect } from 'react';
import { 
  ShoppingCart, 
  Receipt, 
  Package, 
  FolderTree,
  Settings, 
  Store,
  TestTube,
  FileText,
  FileBarChart,
  Sun,
  Moon,
  X,
  LogOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { useI18n } from '@/i18n';
import { useTradingDayStore } from '@/stores/useTradingDayStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { OpenDayDialog } from '../trading-day/OpenDayDialog';
import { CloseDayDialog } from '../trading-day/CloseDayDialog';
import { ZReportDialog } from '../trading-day/ZReportDialog';
import { XReportDialog } from '../trading-day/XReportDialog';
import type { ViewType } from '@/types/layout';
import type { TradingDay } from '@/types/index';

interface SidebarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ currentView, onViewChange, isOpen = true, onClose }: SidebarProps) {
  const { t } = useI18n();
  const { isDayOpen } = useTradingDayStore();
  const posUser = useAuthStore((s) => s.posUser);
  const logout = useAuthStore((s) => s.logout);
  const [openDayDialogOpen, setOpenDayDialogOpen] = useState(false);
  const [closeDayDialogOpen, setCloseDayDialogOpen] = useState(false);
  const [zReportDialogOpen, setZReportDialogOpen] = useState(false);
  const [xReportDialogOpen, setXReportDialogOpen] = useState(false);
  const [closedTradingDay, setClosedTradingDay] = useState<TradingDay | null>(null);
  const [remoteCloseRequest, setRemoteCloseRequest] = useState<{
    requestId: string;
    initiatedBy?: string;
    message?: string;
  } | null>(null);

  useEffect(() => {
    if (!window.electronAPI?.onCloseDayRequested) return;
    return window.electronAPI.onCloseDayRequested((payload) => {
      if (!payload.requestId) return;
      if (!useTradingDayStore.getState().isDayOpen) {
        void window.electronAPI?.cloudCloseDayAck?.({
          requestId: payload.requestId,
          phase: 'failed',
          errorCode: 'no_day_open',
          errorMessage: 'No open trading day on POS',
        });
        return;
      }
      setRemoteCloseRequest({
        requestId: payload.requestId,
        initiatedBy: payload.initiatedBy,
        message: payload.message,
      });
      setCloseDayDialogOpen(true);
    });
  }, []);

  const cashierName = posUser
    ? [posUser.firstName, posUser.lastName].filter(Boolean).join(' ').trim() || posUser.username
    : '—';
  
  const navigation = [
    { id: 'pos' as ViewType, name: t('nav.pos'), icon: ShoppingCart },
    { id: 'transactions' as ViewType, name: t('nav.transactions'), icon: Receipt },
    { id: 'products' as ViewType, name: t('nav.products'), icon: Package },
    { id: 'categories' as ViewType, name: t('nav.categories'), icon: FolderTree },
    { id: 'reports' as ViewType, name: t('nav.reports'), icon: FileText },
    { id: 'test' as ViewType, name: t('nav.test'), icon: TestTube },
    { id: 'settings' as ViewType, name: t('nav.settings'), icon: Settings },
  ];

  const handleTradingDayClick = () => {
    setRemoteCloseRequest(null);
    if (isDayOpen) {
      setCloseDayDialogOpen(true);
    } else {
      setOpenDayDialogOpen(true);
    }
  };

  const handleCloseDayDialogChange = (open: boolean) => {
    setCloseDayDialogOpen(open);
    if (!open) setRemoteCloseRequest(null);
  };

  const handleCloseDay = (closedDay: TradingDay) => {
    setClosedTradingDay(closedDay);
    setZReportDialogOpen(true);
  };
  return (
    <aside
      className={cn(
        "fixed inset-y-0 right-0 z-40 bg-card border-l border-border flex flex-col transform transition-transform duration-300 ease-in-out",
        "w-56 till:w-56 xl:w-64",
        // Slide in from right when open, slide out to right when closed
        isOpen ? "translate-x-0" : "translate-x-full"
      )}
    >
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-xl font-bold">POS Desktop</h1>
              <p className="text-sm text-muted-foreground">{t('pos.title')}</p>
            </div>
          </div>
          {/* Close button - always visible */}
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
      
      <nav className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-2">
          {/* Open/Close Day button */}
          <Button
            variant={isDayOpen ? "default" : "ghost"}
            className={cn(
              "w-full justify-start gap-2",
              isDayOpen && "bg-primary text-primary-foreground"
            )}
            onClick={handleTradingDayClick}
          >
            {isDayOpen ? (
              <>
                <Moon className="h-4 w-4 shrink-0" />
                <span>{t('tradingDay.closeDay')}</span>
              </>
            ) : (
              <>
                <Sun className="h-4 w-4 shrink-0" />
                <span>{t('tradingDay.openDay')}</span>
              </>
            )}
          </Button>

          {/* X-Report — mid-shift snapshot, only while a day is open */}
          {isDayOpen && (
            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={() => setXReportDialogOpen(true)}
            >
              <FileBarChart className="h-4 w-4 shrink-0" />
              <span>{t('tradingDay.xReport')}</span>
            </Button>
          )}

          {navigation.map((item) => (
            <Button
              key={item.id}
              variant={currentView === item.id ? "default" : "ghost"}
              className={cn(
                "w-full justify-start gap-2",
                currentView === item.id && "bg-primary text-primary-foreground"
              )}
              onClick={() => onViewChange(item.id)}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.name}</span>
            </Button>
          ))}
        </div>
      </nav>
      
      <OpenDayDialog 
        open={openDayDialogOpen} 
        onOpenChange={setOpenDayDialogOpen} 
      />
      <CloseDayDialog 
        open={closeDayDialogOpen} 
        onOpenChange={handleCloseDayDialogChange}
        onClose={handleCloseDay}
        remoteRequest={remoteCloseRequest ?? undefined}
      />
      <ZReportDialog 
        open={zReportDialogOpen} 
        onOpenChange={setZReportDialogOpen}
        tradingDay={closedTradingDay}
      />
      <XReportDialog
        open={xReportDialogOpen}
        onOpenChange={setXReportDialogOpen}
      />
      
      <div className="p-4 border-t border-border space-y-2">
        <div className="text-sm text-muted-foreground">
          <p>{t('header.cashier')}: {cashierName}</p>
          <p>{t('header.store')} #001</p>
        </div>
        {posUser && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-destructive hover:text-destructive"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            <span>{t('login.logout')}</span>
          </Button>
        )}
      </div>
    </aside>
  );
}
