import { useState } from 'react';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/useAuthStore';
import { useBusinessStore } from '../../stores/useBusinessStore';
import { useProductStore } from '../../stores/useProductStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useTradingDayStore } from '../../stores/useTradingDayStore';
import { useTransactionStore } from '../../stores/useTransactionStore';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface Props {
  onBack: () => void;
  onResetComplete: () => Promise<void>;
}

async function reloadStoresAfterReset(): Promise<void> {
  const { loadProducts, loadCategories } = useProductStore.getState();
  await loadProducts();
  await loadCategories();

  const { loadSettings } = useSettingsStore.getState();
  await loadSettings();

  const { loadTodaysTransactions } = useTransactionStore.getState();
  await loadTodaysTransactions();

  const { loadCurrentTradingDay } = useTradingDayStore.getState();
  await loadCurrentTradingDay();
}

export function TechnicianScreen({ onBack, onResetComplete }: Props) {
  const { t } = useI18n();
  const logout = useAuthStore((s) => s.logout);
  const { businessInfo, softwareInfo } = useBusinessStore();

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handleReset = async () => {
    if (!window.electronAPI?.resetDatabase || !window.electronAPI?.showMessageBox) {
      return;
    }

    const confirm = await window.electronAPI.showMessageBox({
      type: 'warning',
      title: t('technician.resetTitle'),
      message: t('technician.resetMessage'),
      buttons: [t('common.cancel'), t('technician.resetConfirm')],
      defaultId: 0,
      cancelId: 0,
    });
    if (confirm.response !== 1) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const dbPath = await window.electronAPI.getDatabasePath();
      const result = await window.electronAPI.resetDatabase(dbPath);
      if (!result.success) {
        setMessage({ type: 'err', text: result.error || t('technician.resetFailed') });
        return;
      }

      logout();

      await window.electronAPI.dbSaveBusinessInfo(businessInfo);
      await window.electronAPI.dbSaveSoftwareInfo(softwareInfo);

      await onResetComplete();

      try {
        await reloadStoresAfterReset();
      } catch (e) {
        console.warn('[TechnicianScreen] store reload after reset failed:', e);
      }
    } catch (e: unknown) {
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : t('technician.resetFailed'),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-muted flex items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">{t('technician.title')}</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">{t('technician.subtitle')}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground rounded-md border border-border bg-card p-3">
            {t('technician.warning')}
          </p>

          {message && (
            <p
              className={
                'text-sm ' + (message.type === 'ok' ? 'text-green-600' : 'text-destructive')
              }
            >
              {message.text}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={onBack} disabled={busy}>
              {t('technician.back')}
            </Button>
            <Button variant="destructive" onClick={handleReset} disabled={busy}>
              {busy ? t('technician.resetWorking') : t('technician.resetBtn')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
