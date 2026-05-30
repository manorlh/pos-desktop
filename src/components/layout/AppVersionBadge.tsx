import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type AppVersionBadgeProps = {
  className?: string;
};

export function AppVersionBadge({ className }: AppVersionBadgeProps) {
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    void window.electronAPI?.getAppVersion().then(setAppVersion);
  }, []);

  if (!appVersion) return null;

  return (
    <span className={cn('text-xs text-muted-foreground font-mono', className)}>
      v{appVersion}
    </span>
  );
}
