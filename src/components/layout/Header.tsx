import { Clock, Menu, Power, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDate } from '@/lib/utils';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useI18n } from '@/i18n';
import { useTradingDayStore } from '@/stores/useTradingDayStore';
import { AppVersionBadge } from './AppVersionBadge';
import { OpenDrawerDialog } from '../pos/OpenDrawerDialog';

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { t, locale } = useI18n();
  const { isDayOpen, currentTradingDay } = useTradingDayStore();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleQuit = async () => {
    const api = window.electronAPI;
    if (!api?.quitApp) return;
    if (api.showMessageBox) {
      const confirm = await api.showMessageBox({
        type: 'question',
        title: t('printer.quitAppTitle'),
        message: t('printer.quitAppMessage'),
        buttons: [t('common.cancel'), t('printer.quitAppConfirm')],
        defaultId: 0,
        cancelId: 0,
      });
      if (confirm.response !== 1) return;
    }
    await api.quitApp();
  };

  return (
    <header className="h-14 till:h-14 xl:h-16 border-b border-border bg-card px-3 till:px-3 xl:px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        {onMenuClick && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <h2 className="text-base till:text-base xl:text-lg font-semibold">{t('pos.title')}</h2>
      </div>
      
      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="hidden sm:flex gap-2"
          onClick={() => setDrawerOpen(true)}
        >
          <Wallet className="h-4 w-4" />
          {t('printer.openDrawer')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="sm:hidden"
          aria-label={t('printer.openDrawer')}
          onClick={() => setDrawerOpen(true)}
        >
          <Wallet className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="hidden sm:flex gap-2"
          onClick={handleQuit}
        >
          <Power className="h-4 w-4" />
          {t('printer.quitApp')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="sm:hidden"
          aria-label={t('printer.quitApp')}
          onClick={handleQuit}
        >
          <Power className="h-4 w-4" />
        </Button>
        <AppVersionBadge />
        <div className="flex items-center gap-2">
          <Badge variant={isDayOpen ? 'default' : 'secondary'}>
            {isDayOpen ? t('tradingDay.dayOpen') : t('tradingDay.dayClosed')}
          </Badge>
          {isDayOpen && currentTradingDay && (
            <span className="text-xs text-muted-foreground hidden md:inline">
              {t('tradingDay.openingCash')}: {new Intl.NumberFormat(locale, { style: 'currency', currency: 'ILS' }).format(currentTradingDay.openingCash)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span className="hidden sm:inline">{formatDate(currentTime, locale)}</span>
        </div>
      </div>
      <OpenDrawerDialog open={drawerOpen} onOpenChange={setDrawerOpen} />
    </header>
  );
}
