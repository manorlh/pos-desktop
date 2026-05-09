import { create } from 'zustand';
import type { User } from '../types/index';
import { useTransactionStore } from './useTransactionStore';

/**
 * Logged-in POS user (cashier / shop manager).
 *
 * Auth flow:
 *   - PIN verification happens in the Electron main process (electron/auth.ts).
 *   - On success the renderer holds a sanitised PosUserPublic object here.
 *   - Persisted in memory only — restarting Electron forces a fresh PIN entry.
 *
 * `currentUser` (a `User`) is exposed as a thin selector for legacy call sites
 * (useTransactionStore, OpenDayDialog, CloseDayDialog) so they keep getting the
 * `id`/`name` shape they already expect.
 */

export type PosUserPublic = {
  id: string;
  shopId: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  workerNumber: string | null;
  role: string;
  isActive: boolean;
};

export type LoginResult =
  | { ok: true; user: PosUserPublic }
  | { ok: false; reason: 'invalid_pin' | 'no_users' | 'invalid_format' };

interface AuthStore {
  posUser: PosUserPublic | null;
  /** Legacy `User` shape derived from `posUser` for code that expects name/email. */
  currentUser: User | null;

  /** Verify PIN against local hashes via main-process IPC. */
  login: (pin: string) => Promise<LoginResult>;
  logout: () => void;
  /** Used by tests / hot-reload. */
  setUser: (u: PosUserPublic | null) => void;
}

function toLegacyUser(p: PosUserPublic | null): User | null {
  if (!p) return null;
  const display =
    [p.firstName ?? '', p.lastName ?? ''].filter((s) => s && s.trim()).join(' ').trim() ||
    p.username;
  return {
    id: p.id,
    name: display,
    email: '',
    // Legacy User.role only knows 'admin' | 'manager' | 'cashier'.
    // Map shop_manager → manager so existing role checks still work.
    role: (p.role === 'shop_manager' ? 'manager' : 'cashier') as User['role'],
    isActive: p.isActive,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export const useAuthStore = create<AuthStore>((set) => ({
  posUser: null,
  currentUser: null,

  async login(pin: string) {
    if (!window.electronAPI?.posUserLogin) {
      return { ok: false, reason: 'invalid_pin' };
    }
    const r = (await window.electronAPI.posUserLogin(pin)) as LoginResult;
    if (r.ok) {
      set({ posUser: r.user, currentUser: toLegacyUser(r.user) });
    }
    return r;
  },

  logout() {
    set({ posUser: null, currentUser: null });
  },

  setUser(u) {
    set({ posUser: u, currentUser: toLegacyUser(u) });
  },
}));

/**
 * Bridge: keep `useTransactionStore.currentUser` in sync with the auth store so
 * legacy call sites (`addTransaction`, `createRefundTransaction`, OpenDayDialog,
 * CloseDayDialog) keep working without source changes.
 */
useAuthStore.subscribe((state, prev) => {
  if (state.currentUser !== prev.currentUser) {
    useTransactionStore.setState({ currentUser: state.currentUser });
  }
});
