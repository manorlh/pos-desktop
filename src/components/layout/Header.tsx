import { Clock, Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDate } from '@/lib/utils';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useI18n } from '@/i18n';
import { useTradingDayStore } from '@/stores/useTradingDayStore';

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const { t, locale } = useI18n();
  const { isDayOpen, currentTradingDay } = useTradingDayStore();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-16 border-b border-border bg-card px-4 lg:px-6 flex items-center justify-between">
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
        <h2 className="text-lg font-semibold">{t('pos.title')}</h2>
      </div>
      
      <div className="flex items-center gap-4">
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
    </header>
  );
}
