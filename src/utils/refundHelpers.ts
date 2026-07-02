import type { Transaction } from '@/types';

export const REFUND_SOURCE_ITEM_PREFIX = 'refund-src:';

export function encodeRefundSourceItemNote(originalItemId: string): string {
  return `${REFUND_SOURCE_ITEM_PREFIX}${originalItemId}`;
}

export function decodeRefundSourceItemId(notes?: string): string | null {
  if (!notes?.startsWith(REFUND_SOURCE_ITEM_PREFIX)) return null;
  return notes.slice(REFUND_SOURCE_ITEM_PREFIX.length) || null;
}

/** Sum refunded quantities keyed by original line item id (falls back to productId). */
export function getRefundedQtyByOriginalItem(priorRefunds: Transaction[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const refund of priorRefunds) {
    for (const item of refund.cart.items) {
      const srcId = decodeRefundSourceItemId(item.notes);
      const key = srcId ?? item.productId;
      map[key] = (map[key] ?? 0) + item.quantity;
    }
  }
  return map;
}

export function getRemainingQtyByOriginalItem(
  original: Transaction,
  priorRefunds: Transaction[],
): Record<string, number> {
  const refunded = getRefundedQtyByOriginalItem(priorRefunds);
  const remaining: Record<string, number> = {};
  for (const item of original.cart.items) {
    const already = refunded[item.id] ?? refunded[item.productId] ?? 0;
    remaining[item.id] = Math.max(0, item.quantity - already);
  }
  return remaining;
}

export function hasRemainingRefundable(
  original: Transaction,
  priorRefunds: Transaction[],
): boolean {
  const remaining = getRemainingQtyByOriginalItem(original, priorRefunds);
  return original.cart.items.some((item) => (remaining[item.id] ?? 0) > 0);
}

export function computeRemainingRefundTotal(
  original: Transaction,
  remaining: Record<string, number>,
): number {
  return original.cart.items.reduce((sum, item) => {
    const qty = remaining[item.id] ?? 0;
    if (qty <= 0) return sum;
    const ratio = item.quantity > 0 ? qty / item.quantity : 0;
    return sum + item.unitPrice * qty - (item.lineDiscount || 0) * ratio;
  }, 0);
}

export function extractNayaxOriginalTransactionId(nayaxMeta?: string): string | null {
  if (!nayaxMeta) return null;
  try {
    const meta = JSON.parse(nayaxMeta) as { result?: Record<string, unknown> };
    const tid = meta.result?.transactionId;
    if (tid != null && String(tid).trim()) return String(tid);
  } catch {
    /* ignore */
  }
  return null;
}

/** Parse IPC/DB transaction rows into Transaction with Date fields. */
export function hydrateTransactionFromDb(raw: any): Transaction {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    documentProductionDate: new Date(raw.documentProductionDate || raw.createdAt),
    cart: {
      ...raw.cart,
      createdAt: new Date(raw.cart.createdAt),
      updatedAt: new Date(raw.cart.updatedAt),
      items: raw.cart.items.map((item: any) => ({
        ...item,
        product: {
          ...item.product,
          createdAt: new Date(item.product.createdAt),
          updatedAt: new Date(item.product.updatedAt),
        },
      })),
    },
    customer: raw.customer
      ? {
          ...raw.customer,
          createdAt: new Date(raw.customer.createdAt),
          updatedAt: new Date(raw.customer.updatedAt),
        }
      : undefined,
    cashier: {
      ...raw.cashier,
      createdAt: new Date(raw.cashier.createdAt),
      updatedAt: new Date(raw.cashier.updatedAt),
    },
  };
}
