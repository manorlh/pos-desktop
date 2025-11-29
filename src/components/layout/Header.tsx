import { Clock, Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDate } from '@/lib/utils';
import { Button } from '../ui/button';
import { useI18n } from '@/i18n';

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const { t, locale } = useI18n();

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
            className="lg:hidden"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <h2 className="text-lg font-semibold">{t('pos.title')}</h2>
      </div>
      
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="h-4 w-4" />
        <span className="hidden sm:inline">{formatDate(currentTime, locale)}</span>
      </div>
    </header>
  );
}
