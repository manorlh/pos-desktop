import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n';
import { useAuthStore, type PosUserPublic } from '../../stores/useAuthStore';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { TechnicianScreen } from './TechnicianScreen';

interface Props {
  refreshOnboarding: () => Promise<void>;
}

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

function initials(u: PosUserPublic): string {
  const a = (u.firstName ?? '').trim();
  const b = (u.lastName ?? '').trim();
  if (a && b) return (a[0] + b[0]).toUpperCase();
  if (a) return a.slice(0, 2).toUpperCase();
  if (u.username) return u.username.slice(0, 2).toUpperCase();
  return '??';
}

function displayName(u: PosUserPublic): string {
  const parts = [u.firstName, u.lastName].filter((s): s is string => !!s && s.trim().length > 0);
  return parts.length > 0 ? parts.join(' ') : u.username;
}

export function LoginScreen({ refreshOnboarding }: Props) {
  const { t } = useI18n();
  const login = useAuthStore((s) => s.login);

  const [view, setView] = useState<'login' | 'technician'>('login');
  const [users, setUsers] = useState<PosUserPublic[]>([]);
  const [selected, setSelected] = useState<PosUserPublic | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reloadUsers = async () => {
    if (!window.electronAPI?.posUserListForShop) return;
    try {
      const r = await window.electronAPI.posUserListForShop();
      setUsers(r.users || []);
    } catch (e) {
      console.error('[LoginScreen] failed to load users', e);
    }
  };

  useEffect(() => {
    void reloadUsers();
    if (!window.electronAPI?.onPosUsersUpdated) return;
    const unsub = window.electronAPI.onPosUsersUpdated(() => {
      void reloadUsers();
    });
    return unsub;
  }, []);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [users]);

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
      return;
    }
  };

  const submit = async () => {
    if (busy) return;
    if (pin.length < PIN_MIN) return;
    setBusy(true);
    try {
      const r = await login(pin);
      if (!r.ok) {
        setError(
          r.reason === 'no_users'
            ? t('login.noUsers')
            : r.reason === 'invalid_format'
              ? t('login.invalidFormat')
              : t('login.invalidPin'),
        );
        setPin('');
      }
    } finally {
      setBusy(false);
    }
  };

  // Auto-submit when PIN reaches max length (Nayax-like).
  useEffect(() => {
    if (pin.length >= PIN_MAX) {
      void submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  if (view === 'technician') {
    return (
      <TechnicianScreen
        onBack={() => setView('login')}
        onResetComplete={refreshOnboarding}
      />
    );
  }

  return (
    <div className="h-screen w-screen bg-muted flex flex-col items-center justify-center p-6">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold">{t('login.title')}</h1>
        <p className="text-muted-foreground mt-1">
          {selected ? displayName(selected) : t('login.subtitle')}
        </p>
      </div>

      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tile grid */}
        <Card>
          <CardContent className="p-4">
            <h2 className="font-semibold mb-3">{t('login.cashiers')}</h2>
            {sortedUsers.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                {t('login.noUsers')}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto pe-1">
                {sortedUsers.map((u) => {
                  const isSelected = selected?.id === u.id;
                  return (
                    <button
                      key={u.id}
                      onClick={() => {
                        setSelected(u);
                        setPin('');
                        setError(null);
                      }}
                      className={
                        'flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors ' +
                        (isSelected
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-card hover:bg-muted')
                      }
                    >
                      <div className="h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold">
                        {initials(u)}
                      </div>
                      <div className="text-sm font-medium truncate w-full">
                        {displayName(u)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t(`login.role.${u.role}`)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Keypad */}
        <Card>
          <CardContent className="p-4 flex flex-col items-center">
            <div className="text-sm text-muted-foreground mb-2">{t('login.enterPin')}</div>
            {/* Force LTR for the dots + grid so the PIN fills left→right and
                the keys keep phone-style layout (1-2-3 across the top) even
                when the surrounding UI is RTL Hebrew. */}
            <div className="flex gap-2 mb-4 h-12 items-center" dir="ltr" aria-live="polite">
              {Array.from({ length: PIN_MAX }).map((_, i) => (
                <div
                  key={i}
                  className={
                    'h-4 w-4 rounded-full border ' +
                    (i < pin.length ? 'bg-primary border-primary' : 'border-border')
                  }
                />
              ))}
            </div>

            {error && (
              <div className="text-sm text-destructive mb-2 min-h-5">{error}</div>
            )}

            <div className="grid grid-cols-3 gap-3 w-full max-w-xs" dir="ltr">
              {KEYS.map((k, idx) => {
                if (typeof k === 'string') {
                  return (
                    <Button
                      key={idx}
                      variant="outline"
                      className="h-14 text-xl"
                      onClick={() => onKey(k)}
                      disabled={busy}
                    >
                      {k}
                    </Button>
                  );
                }
                if (k.kind === 'clear') {
                  return (
                    <Button
                      key={idx}
                      variant="ghost"
                      className="h-14"
                      onClick={() => onKey(k)}
                      disabled={busy}
                    >
                      {t('login.clear')}
                    </Button>
                  );
                }
                return (
                  <Button
                    key={idx}
                    variant="ghost"
                    className="h-14"
                    onClick={() => onKey(k)}
                    disabled={busy}
                  >
                    ⌫
                  </Button>
                );
              })}
            </div>

            <Button
              className="w-full max-w-xs mt-4 h-12 text-lg"
              onClick={submit}
              disabled={busy || pin.length < PIN_MIN}
            >
              {busy ? t('common.loading') : t('login.submit')}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Button
        variant="ghost"
        className="mt-6 text-muted-foreground"
        onClick={() => setView('technician')}
        disabled={busy}
      >
        {t('login.technicianBtn')}
      </Button>
    </div>
  );
}
