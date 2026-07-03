import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/useAuthStore';
import { useBusinessStore } from '../../stores/useBusinessStore';
import { useProductStore } from '../../stores/useProductStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useTradingDayStore } from '../../stores/useTradingDayStore';
import { useTransactionStore } from '../../stores/useTransactionStore';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

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

  const [serverUrl, setServerUrl] = useState('');
  const [serverBusy, setServerBusy] = useState(false);
  const [serverMessage, setServerMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );

  useEffect(() => {
    void (async () => {
      const base = await window.electronAPI?.dbGetSetting?.('cloud_api_base');
      if (base) setServerUrl(String(base));
    })();
  }, []);

  const handleSaveServerUrl = async () => {
    setServerMessage(null);
    if (!window.electronAPI?.technicianSetServerUrl) {
      setServerMessage({ type: 'err', text: t('technician.serverUrlFailed') });
      return;
    }
    if (!serverUrl.trim()) {
      setServerMessage({ type: 'err', text: t('technician.serverUrlRequired') });
      return;
    }
    setServerBusy(true);
    try {
      const res = await window.electronAPI.technicianSetServerUrl(serverUrl.trim());
      if (!res.success) {
        setServerMessage({ type: 'err', text: res.error || t('technician.serverUrlFailed') });
        return;
      }
      if (res.apiBaseUrl) setServerUrl(res.apiBaseUrl);
      setServerMessage({ type: 'ok', text: t('technician.serverUrlSaved') });
    } catch (e: unknown) {
      setServerMessage({
        type: 'err',
        text: e instanceof Error ? e.message : t('technician.serverUrlFailed'),
      });
    } finally {
      setServerBusy(false);
    }
  };

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
          <div className="space-y-2 rounded-md border border-border bg-card p-3">
            <h3 className="text-sm font-semibold">{t('technician.settingsTitle')}</h3>
            <div className="space-y-2">
              <Label htmlFor="technician-server-url">{t('technician.serverUrlLabel')}</Label>
              <Input
                id="technician-server-url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder={t('technician.serverUrlPlaceholder')}
                autoComplete="off"
                disabled={serverBusy}
              />
              <p className="text-xs text-muted-foreground">{t('technician.serverUrlHint')}</p>
            </div>
            {serverMessage && (
              <p
                className={
                  'text-sm ' +
                  (serverMessage.type === 'ok' ? 'text-green-600' : 'text-destructive')
                }
              >
                {serverMessage.text}
              </p>
            )}
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveServerUrl}
                disabled={serverBusy || !serverUrl.trim()}
              >
                {serverBusy ? t('technician.serverUrlSaving') : t('technician.serverUrlSave')}
              </Button>
            </div>
          </div>

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
