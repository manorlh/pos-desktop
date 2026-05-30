import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { DEFAULT_CLOUD_SERVER_URL } from '../../config/cloudDefaults';

/**
 * First-run wizard. Two gates:
 *   1. Pair the machine to the cloud (mirrors SettingsPage cloud pairing).
 *   2. Pull the initial pos_users roster so the LoginScreen has tiles.
 *
 * Renders nothing once both gates are passed; App.tsx then proceeds to the
 * LoginScreen.
 *
 * UX notes:
 *  - When the register is already paired, step 1 collapses to a compact
 *    "paired" summary with the cloud-issued machine code and a `Re-pair`
 *    button (instead of leaving disabled inputs that confuse operators).
 *  - When step 2 is the active step we auto-trigger one sync attempt on mount
 *    so the first run "just works" if a roster already exists in the cloud.
 *  - When the cloud returns an empty roster we show an explicit "create POS
 *    users in the dashboard" hint, since otherwise the wizard would silently
 *    stay stuck with hasUsers=false.
 */

interface Props {
  /** True when SQLite already has cloud_machine_id (paired). */
  paired: boolean;
  /** Called after pairing succeeds so App.tsx can re-check `paired`. */
  onPaired: () => void;
  /** True when at least one active pos_user exists locally. */
  hasUsers: boolean;
  /** Refresh local hasUsers/paired state after onboarding actions. */
  onRefresh: () => Promise<void>;
}

export function OnboardingScreen({ paired, onPaired, hasUsers, onRefresh }: Props) {
  const { t } = useI18n();
  const [apiBase, setApiBase] = useState(DEFAULT_CLOUD_SERVER_URL+'/api/v1');
  const [code, setCode] = useState('');
  const [machineName, setMachineName] = useState('');
  const [busy, setBusy] = useState(false);
  const [machineCode, setMachineCode] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(
    null,
  );

  // Prefill API base + show paired machine code (when applicable). Re-runs when
  // `paired` flips so the saved code shows up immediately after pairing succeeds.
  useEffect(() => {
    if (!window.electronAPI?.dbGetSetting) return;
    void window.electronAPI.dbGetSetting('cloud_api_base').then((v) => {
      if (v) setApiBase(v);
    });
    void window.electronAPI.dbGetSetting('cloud_machine_code').then((v) => {
      setMachineCode(v && String(v).trim() ? String(v) : null);
    });
  }, [paired]);

  // When step 1 is done but step 2 isn't, kick off a sync once on mount so the
  // operator doesn't have to hunt for the button on a happy-path first launch.
  // The MQTT pull also runs in the background, but doing it here gives instant
  // feedback ("0 users" hint) without waiting for the broker round-trip.
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (autoSyncedRef.current) return;
    if (!paired || hasUsers) return;
    if (!window.electronAPI?.posUsersSyncNow) return;
    autoSyncedRef.current = true;
    void runSyncUsers({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paired, hasUsers]);

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
      // Persist + connect using the same path SettingsPage uses. Includes
      // `machineCode` so it's visible in the post-pairing summary.
      const conn = await window.electronAPI.syncConnect({
        apiBaseUrl: res.apiBaseUrl,
        accessToken: res.accessToken,
        machineId: res.machineId,
        merchantId: res.merchantId,
        machineCode: res.machineCode,
        host: res.mqttHost,
        port: res.mqttPort,
        clientId: res.mqttClientId,
        username: res.mqttUsername,
        password: res.mqttPassword,
      });
      if (!conn.success) {
        setMessage({ type: 'err', text: conn.error || t('onboarding.pairingFailed') });
        return;
      }
      setMachineCode(res.machineCode || null);
      setMessage({ type: 'ok', text: t('onboarding.pairingOk') });
      onPaired();
      // Trigger an initial pos_users pull so we get the login tiles right away.
      // We swallow errors because the auto-sync useEffect will retry as soon as
      // `paired` flips, and the user can also click "Sync now" manually.
      try {
        await runSyncUsers({ silent: true });
      } catch (e) {
        console.warn('[Onboarding] pos-users sync after pairing failed:', e);
      }
      await onRefresh();
    } catch (e: unknown) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Run a pos_users pull and surface the right message based on the count.
   * `silent: true` skips the success toast for auto-runs but still surfaces
   * the "0 users on cloud" hint, which is the only stuck-state case.
   */
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
        // Stuck state: pairing worked but the shop has no active POS users.
        // The wizard cannot advance until the dashboard admin creates at least
        // one user, so show a persistent info message.
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

  /**
   * Reset cloud pairing entirely so the operator can re-bind this register to
   * a different shop. Confirmed via `window.confirm` because it deletes the
   * local pos_users table.
   */
  const handleRepair = async () => {
    if (!window.electronAPI?.cloudUnpair) return;
    if (!window.confirm(t('onboarding.repairConfirm'))) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await window.electronAPI.cloudUnpair();
      if (!r.success) {
        setMessage({ type: 'err', text: r.error || t('onboarding.pairingFailed') });
        return;
      }
      setMachineCode(null);
      setCode('');
      setMachineName('');
      autoSyncedRef.current = false;
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-muted flex items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">{t('onboarding.title')}</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">{t('onboarding.subtitle')}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step 1: pair (or paired summary) */}
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRepair}
                  disabled={busy}
                >
                  {busy ? t('onboarding.repairing') : t('onboarding.repairBtn')}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <Label>{t('onboarding.apiBase')}</Label>
                  <Input
                    value={apiBase}
                    onChange={(e) => setApiBase(e.target.value)}
                    placeholder={DEFAULT_CLOUD_SERVER_URL}
                    disabled={busy}
                  />
                </div>
                <div>
                  <Label>{t('onboarding.pairingCode')}</Label>
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="ABC123"
                    disabled={busy}
                  />
                </div>
                <div>
                  <Label>{t('onboarding.machineName')}</Label>
                  <Input
                    value={machineName}
                    onChange={(e) => setMachineName(e.target.value)}
                    placeholder={t('onboarding.machineNamePlaceholder')}
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

          {/* Step 2: sync users */}
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
