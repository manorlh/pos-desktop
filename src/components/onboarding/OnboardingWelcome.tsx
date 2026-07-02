import { Monitor } from 'lucide-react';
import { useI18n } from '../../i18n';
import { Button } from '../ui/button';

interface Props {
  onStart: () => void;
  busy?: boolean;
}

export function OnboardingWelcome({ onStart, busy }: Props) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col items-center text-center space-y-8 py-6">
      <div
        className="h-32 w-32 rounded-2xl bg-primary text-primary-foreground flex flex-col items-center justify-center shadow-md ring-1 ring-primary/20"
        aria-hidden
      >
        <Monitor className="h-12 w-12 mb-2 opacity-95" strokeWidth={1.75} />
        <span className="text-[10px] font-semibold tracking-[0.2em] uppercase opacity-90">POS</span>
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight leading-tight">
          <span className="text-primary">POS</span>{' '}
          <span className="text-foreground">DESKTOP</span>
        </h1>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto leading-relaxed">
          {t('onboarding.welcomeSubtitle')}
        </p>
      </div>

      <Button
        size="lg"
        className="w-full max-w-xs h-12 text-base font-semibold"
        onClick={onStart}
        disabled={busy}
      >
        {busy ? t('common.loading') : t('onboarding.startInstallBtn')}
      </Button>
    </div>
  );
}
