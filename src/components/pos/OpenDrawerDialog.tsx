import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { AlertCircle } from 'lucide-react';

const KEYS: Array<string | { kind: 'clear' } | { kind: 'back' }> = [
  '1', '2', '3',
  '4', '5', '6',
  '7', '8', '9',
  { kind: 'clear' },
  '0',
  { kind: 'back' },
];

const PIN_MIN = 4;
const PIN_MAX = 6;

interface OpenDrawerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OpenDrawerDialog({ open, onOpenChange }: OpenDrawerDialogProps) {
  const { t, language } = useI18n();
  const getEffectivePrinters = useSettingsStore((s) => s.getEffectivePrinters);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setPin('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const onKey = (k: typeof KEYS[number]) => {
    setError(null);
    if (typeof k === 'string') {
      setPin((prev) => (prev.length >= PIN_MAX ? prev : prev + k));
      return;
    }
    if (k.kind === 'back') {
      setPin((prev) => prev.slice(0, -1));
      return;
    }
    if (k.kind === 'clear') {
      setPin('');
    }
  };

  const submit = async () => {
    if (busy || pin.length < PIN_MIN) return;
    if (!window.electronAPI?.posUserLogin || !window.electronAPI?.openCashDrawer) {
      setError(t('printer.openDrawerFailed'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const auth = await window.electronAPI.posUserLogin(pin);
      if (!auth.ok) {
        setError(
          auth.reason === 'no_users'
            ? t('login.noUsers')
            : auth.reason === 'invalid_format'
              ? t('login.invalidFormat')
              : t('login.invalidPin'),
        );
        setPin('');
        return;
      }

      const cashierName =
        [auth.user.firstName, auth.user.lastName].filter(Boolean).join(' ').trim() ||
        auth.user.username;
      const { drawerPrinterName } = getEffectivePrinters();

      const result = await window.electronAPI.openCashDrawer({
        printerName: drawerPrinterName,
        cashierName,
        language,
      });

      if (!result.success) {
        setError(result.error || t('printer.openDrawerFailed'));
        setPin('');
        return;
      }

      setPin('');
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (pin.length >= PIN_MAX && open) {
      void submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('printer.openDrawerTitle')}</DialogTitle>
          <DialogDescription>{t('printer.openDrawerDesc')}</DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex justify-center gap-2 py-2">
          {Array.from({ length: PIN_MAX }).map((_, i) => (
            <span
              key={i}
              className={`h-3 w-3 rounded-full border ${
                i < pin.length ? 'bg-primary border-primary' : 'border-muted-foreground'
              }`}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
          {KEYS.map((k, idx) => {
            if (typeof k === 'string') {
              return (
                <Button
                  key={idx}
                  type="button"
                  variant="outline"
                  className="h-12 text-lg"
                  disabled={busy}
                  onClick={() => onKey(k)}
                >
                  {k}
                </Button>
              );
            }
            if (k.kind === 'clear') {
              return (
                <Button
                  key={idx}
                  type="button"
                  variant="outline"
                  className="h-12"
                  disabled={busy}
                  onClick={() => onKey(k)}
                >
                  {t('common.clear')}
                </Button>
              );
            }
            return (
              <Button
                key={idx}
                type="button"
                variant="outline"
                className="h-12"
                disabled={busy}
                onClick={() => onKey(k)}
              >
                ←
              </Button>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={busy || pin.length < PIN_MIN}>
            {t('printer.openDrawerConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
