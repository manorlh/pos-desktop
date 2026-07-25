import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useI18n } from '../../i18n';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { DEFAULT_CLOUD_SERVER_URL } from '../../config/cloudDefaults';
import { AppVersionBadge } from '../layout/AppVersionBadge';
import { OnboardingWelcome } from './OnboardingWelcome';

interface Props {
  paired: boolean;
  onPaired: () => void;
  hasUsers: boolean;
  onRefresh: () => Promise<void>;
}

type PairMode = 'qr' | 'code';

type ConnectPayload = {
  apiBaseUrl: string;
  accessToken: string;
  machineId: string;
  tenantId: string;
  merchantId: string;
  shopId?: string;
  machineCode: string;
  realtimeChannel?: string;
};

type OnboardingPhase = 'welcome' | 'install';

export function OnboardingScreen({ paired, onPaired, hasUsers, onRefresh }: Props) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<OnboardingPhase>(() => (paired ? 'install' : 'welcome'));
  const [apiBase, setApiBase] = useState(DEFAULT_CLOUD_SERVER_URL + '/api/v1');
  const [pairMode, setPairMode] = useState<PairMode>('qr');
  const [code, setCode] = useState('');
  const [machineName, setMachineName] = useState('');
  const [busy, setBusy] = useState(false);
  const [machineCode, setMachineCode] = useState<string | null>(null);
  const [deviceNonce, setDeviceNonce] = useState<string | null>(null);
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  // Local-clock (Date.now) ms timestamp when the QR should expire. Anchoring to
  // the local clock — instead of comparing the server's absolute expiry to
  // Date.now() — keeps the countdown correct even if the POS device clock is
  // wrong, which previously made the QR read "expired" the instant it appeared.
  const [qrLocalExpiresAt, setQrLocalExpiresAt] = useState<number | null>(null);
  const [waitingPhone, setWaitingPhone] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, setQrExpiryTick] = useState(0);
  const [message, setMessage] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(
    null,
  );
  const [settingsReady, setSettingsReady] = useState(false);

  useEffect(() => {
    if (paired) setPhase('install');
  }, [paired]);

  useEffect(() => {
    if (!window.electronAPI?.dbGetSetting) {
      setSettingsReady(true);
      return;
    }
    void Promise.all([
      window.electronAPI.dbGetSetting('cloud_api_base'),
      window.electronAPI.dbGetSetting('cloud_machine_code'),
    ]).then(([base, code]) => {
      if (base) setApiBase(base);
      setMachineCode(code && String(code).trim() ? String(code) : null);
    }).finally(() => setSettingsReady(true));
  }, [paired]);

  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (!window.electronAPI?.dbGetSetting) return;
    if (!paired || hasUsers) return;
    if (!window.electronAPI?.posUsersSyncNow) return;
    autoSyncedRef.current = true;
    void runSyncUsers({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paired, hasUsers]);

  const finishConnect = async (res: ConnectPayload) => {
    if (!window.electronAPI?.syncConnect) return false;
    const conn = await window.electronAPI.syncConnect({
      apiBaseUrl: res.apiBaseUrl,
      accessToken: res.accessToken,
      machineId: res.machineId,
      tenantId: res.tenantId || res.merchantId,
      merchantId: res.merchantId || res.tenantId,
      shopId: res.shopId,
      machineCode: res.machineCode,
      realtimeChannel: res.realtimeChannel,
    });
    if (!conn.success) {
      setMessage({ type: 'err', text: conn.error || t('onboarding.pairingFailed') });
      return false;
    }
    setMachineCode(res.machineCode || null);
    setMessage({ type: 'ok', text: t('onboarding.pairingOk') });
    onPaired();
    try {
      await runSyncUsers({ silent: true });
    } catch (e) {
      console.warn('[Onboarding] pos-users sync after pairing failed:', e);
    }
    await onRefresh();
    return true;
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setWaitingPhone(false);
  };

  const startQrPairing = useCallback(async () => {
    if (!window.electronAPI?.cloudDeviceRegister || !apiBase.trim()) return;
    stopPolling();
    setDeviceNonce(null);
    setQrPayload(null);
    setQrLocalExpiresAt(null);
    setMessage(null);
    const reg = await window.electronAPI.cloudDeviceRegister({
      apiBaseUrl: apiBase.trim(),
    });
    if (!reg.success) {
      setMessage({ type: 'err', text: reg.error || t('onboarding.qrRegisterFailed') });
      return;
    }
    // Prefer the server-derived TTL (clock-independent). Fall back to the known
    // 15-minute nonce lifetime if the header wasn't available.
    const ttlMs = reg.ttlMs && reg.ttlMs > 0 ? reg.ttlMs : 15 * 60 * 1000;
    const expSeconds = reg.expiresAt
      ? Math.floor(new Date(reg.expiresAt).getTime() / 1000)
      : Math.floor((Date.now() + ttlMs) / 1000);
    const payload = JSON.stringify({
      v: 1,
      api: reg.apiBaseUrl || apiBase.trim(),
      nonce: reg.deviceNonce,
      exp: expSeconds,
    });
    setDeviceNonce(reg.deviceNonce);
    setQrPayload(payload);
    setQrLocalExpiresAt(Date.now() + ttlMs);
    setWaitingPhone(true);
  }, [apiBase, t]);

  useEffect(() => {
    if (phase !== 'install' || paired || pairMode !== 'qr' || !apiBase.trim() || !settingsReady) {
      stopPolling();
      return;
    }
    void startQrPairing();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, paired, pairMode, apiBase, settingsReady]);

  useEffect(() => {
    if (!qrLocalExpiresAt || paired) return;
    const tmr = window.setInterval(() => setQrExpiryTick((n) => n + 1), 30000);
    return () => window.clearInterval(tmr);
  }, [qrLocalExpiresAt, paired]);

  useEffect(() => {
    if (!waitingPhone || !deviceNonce || paired) return;
    if (!window.electronAPI?.cloudDevicePollStatus) return;

    const tick = async () => {
      const poll = await window.electronAPI!.cloudDevicePollStatus!({
        apiBaseUrl: apiBase.trim(),
        deviceNonce,
      });
      if (!poll.success) return;
      if (poll.status === 'waiting') return;
      if (poll.status === 'gone') {
        stopPolling();
        void startQrPairing();
        return;
      }
      if (poll.status === 'credentials' && poll.accessToken && poll.machineId) {
        stopPolling();
        setBusy(true);
        try {
          await finishConnect({
            apiBaseUrl: poll.apiBaseUrl || apiBase.trim(),
            accessToken: poll.accessToken,
            machineId: poll.machineId,
            tenantId: poll.tenantId || poll.merchantId || '',
            merchantId: poll.merchantId || poll.tenantId || '',
            shopId: poll.shopId,
            machineCode: poll.machineCode || '',
            realtimeChannel: poll.realtimeChannel || '',
          });
        } finally {
          setBusy(false);
        }
      }
    };

    pollRef.current = setInterval(() => void tick(), 2000);
    void tick();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingPhone, deviceNonce, paired, apiBase]);

  const handlePair = async () => {
    if (!window.electronAPI?.cloudPairingValidate) {
      setMessage({ type: 'err', text: t('settings.cloudNotElectron') });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await window.electronAPI.cloudPairingValidate({
        apiBaseUrl: apiBase.trim(),
        code: code.trim(),
        machineName: machineName.trim() || undefined,
      });
      if (!res.success) {
        setMessage({ type: 'err', text: res.error || t('onboarding.pairingFailed') });
        return;
      }
      await finishConnect(res);
    } catch (e: unknown) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const runSyncUsers = async (opts: { silent?: boolean } = {}) => {
    if (!window.electronAPI?.posUsersSyncNow) return;
    setBusy(true);
    if (!opts.silent) setMessage(null);
    try {
      const r = await window.electronAPI.posUsersSyncNow();
      if (!r.ok) {
        setMessage({ type: 'err', text: r.error || t('onboarding.syncUsersFailed') });
        return;
      }
      const count = r.users ?? 0;
      if (count === 0) {
        setMessage({ type: 'info', text: t('onboarding.syncReturnedZero') });
      } else if (!opts.silent) {
        setMessage({
          type: 'ok',
          text: t('onboarding.syncUsersOk', { count: String(count) }),
        });
      }
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const handleRepair = async () => {
    if (!window.electronAPI?.cloudUnpair) return;
    if (!window.confirm(t('onboarding.repairConfirm'))) return;
    setBusy(true);
    setMessage(null);
    stopPolling();
    try {
      const r = await window.electronAPI.cloudUnpair();
      if (!r.success) {
        setMessage({ type: 'err', text: r.error || t('onboarding.pairingFailed') });
        return;
      }
      setMachineCode(null);
      setCode('');
      setMachineName('');
      setDeviceNonce(null);
      setQrPayload(null);
      setQrLocalExpiresAt(null);
      setPhase('welcome');
      autoSyncedRef.current = false;
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const handleStartInstall = () => {
    setMessage(null);
    setPhase('install');
  };

  const qrExpiryLabel = (() => {
    if (!qrLocalExpiresAt) return null;
    const remainingMs = qrLocalExpiresAt - Date.now();
    if (remainingMs <= 0) return t('onboarding.qrExpired');
    const minutes = Math.max(1, Math.ceil(remainingMs / 60000));
    return t('onboarding.qrExpiresIn', { minutes: String(minutes) });
  })();

  if (!paired && phase === 'welcome') {
    return (
      <div className="h-screen w-screen bg-muted flex items-center justify-center p-4 till:p-4 xl:p-6 relative">
        <AppVersionBadge className="absolute top-3 end-4 till:top-3 till:end-4" />
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8">
            <OnboardingWelcome
              onStart={handleStartInstall}
              busy={busy || !settingsReady}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-muted flex items-center justify-center p-4 till:p-4 xl:p-6 relative">
      <AppVersionBadge className="absolute top-3 end-4 till:top-3 till:end-4" />
      <Card className="w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto">
        <CardHeader>
          <CardTitle className="text-2xl">{t('onboarding.title')}</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">{t('onboarding.subtitle')}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h2 className="font-semibold mb-2">
              1. {t('onboarding.step1Title')}{' '}
              {paired && <span className="text-green-600">✓</span>}
            </h2>
            {paired ? (
              <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                <p className="text-sm font-medium">{t('onboarding.pairedSummary')}</p>
                <div className="text-xs text-muted-foreground space-y-1">
                  {machineCode && (
                    <div>
                      <span className="font-medium">{t('onboarding.machineCodeLabel')}: </span>
                      <span className="font-mono">{machineCode}</span>
                    </div>
                  )}
                  {apiBase && (
                    <div>
                      <span className="font-medium">{t('onboarding.apiBase')}: </span>
                      <span className="font-mono break-all">{apiBase}</span>
                    </div>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={handleRepair} disabled={busy}>
                  {busy ? t('onboarding.repairing') : t('onboarding.repairBtn')}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={pairMode === 'qr' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setPairMode('qr')}
                  >
                    {t('onboarding.pairModeQr')}
                  </Button>
                  <Button
                    type="button"
                    variant={pairMode === 'code' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      stopPolling();
                      setPairMode('code');
                    }}
                  >
                    {t('onboarding.pairModeCode')}
                  </Button>
                </div>
                <div>
                  <Label>{t('onboarding.apiBase')}</Label>
                  <Input
                    value={apiBase}
                    onChange={(e) => setApiBase(e.target.value)}
                    placeholder={DEFAULT_CLOUD_SERVER_URL}
                    disabled={busy}
                  />
                </div>
                {pairMode === 'code' ? (
                  <div>
                    <Label>{t('onboarding.machineName')}</Label>
                    <Input
                      value={machineName}
                      onChange={(e) => setMachineName(e.target.value)}
                      placeholder={t('onboarding.machineNamePlaceholder')}
                      disabled={busy}
                    />
                  </div>
                ) : null}
                {pairMode === 'qr' ? (
                  <div className="space-y-3 text-center">
                    <p className="text-sm text-muted-foreground">{t('onboarding.qrHint')}</p>
                    {qrPayload ? (
                      <div className="flex justify-center">
                        <QRCodeSVG value={qrPayload} size={200} level="M" />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
                    )}
                    {waitingPhone ? (
                      <p className="text-sm text-primary animate-pulse">{t('onboarding.qrWaiting')}</p>
                    ) : null}
                    {qrExpiryLabel ? (
                      <p
                        className={
                          'text-sm ' +
                          (qrExpiryLabel === t('onboarding.qrExpired')
                            ? 'text-destructive font-medium'
                            : 'text-muted-foreground')
                        }
                      >
                        {qrExpiryLabel}
                      </p>
                    ) : null}
                    <Button variant="outline" size="sm" onClick={() => void startQrPairing()} disabled={busy}>
                      {t('onboarding.qrRefresh')}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div>
                      <Label>{t('onboarding.pairingCode')}</Label>
                      <Input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="ABC123"
                        disabled={busy}
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={handlePair}
                      disabled={busy || !apiBase.trim() || !code.trim()}
                    >
                      {busy ? t('common.loading') : t('onboarding.pairBtn')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <h2 className="font-semibold mb-2">
              2. {t('onboarding.step2Title')}{' '}
              {hasUsers && <span className="text-green-600">✓</span>}
            </h2>
            {!paired ? (
              <p className="text-sm text-muted-foreground">{t('onboarding.step2Locked')}</p>
            ) : hasUsers ? (
              <p className="text-sm text-muted-foreground">{t('onboarding.step2Done')}</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{t('onboarding.step2Hint')}</p>
                <Button className="w-full" onClick={() => runSyncUsers()} disabled={busy}>
                  {busy ? t('common.loading') : t('onboarding.syncUsersBtn')}
                </Button>
              </div>
            )}
          </div>

          {message && (
            <div
              className={
                'text-sm p-2 rounded-md ' +
                (message.type === 'ok'
                  ? 'bg-green-100 text-green-900'
                  : message.type === 'info'
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-destructive/15 text-destructive')
              }
            >
              {message.text}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
