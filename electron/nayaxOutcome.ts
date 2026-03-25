import type { NayaxJsonRpcResult } from './nayaxClient';

export const INTEGRATION_LOG_TYPE_NAYAX = 'nayax_card_integration';

/** TweezerComm / Ashrait result.statusCode — see Nayax Response Codes doc */
const STATUS_APPROVED = 0;
const STATUS_PARTIAL = 10;
const STATUS_INFORMATIVE = 162;
const STATUS_CANCELLED_A = 126;
const STATUS_CANCELLED_B = 998;

export type NayaxSaleOutcome =
  | 'approved'
  | 'partial'
  | 'declined'
  | 'cancelled'
  | 'rpc_error'
  | 'network_error'
  | 'unknown';

export type ParsedDoTransaction = {
  approved: boolean;
  outcome: NayaxSaleOutcome;
  statusCode?: number;
  statusMessage?: string;
  message: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Interpret JSON-RPC result for Ashrait `doTransaction`.
 * Approved: statusCode 0 (full) or 10 (partial). Declined/cancelled per TweezerComm codes.
 */
function classifyTransportError(message: string): 'network_error' | 'rpc_error' {
  const m = message.toLowerCase();
  if (
    m.includes('timeout') ||
    m.includes('econnrefused') ||
    m.includes('enotfound') ||
    m.includes('etimedout') ||
    m.includes('ehostunreach') ||
    m.includes('network error') ||
    m.includes('empty response')
  ) {
    return 'network_error';
  }
  return 'rpc_error';
}

export function parseAshraitDoTransactionResult(rpcResult: NayaxJsonRpcResult): ParsedDoTransaction {
  if (!rpcResult.ok) {
    const outcome = classifyTransportError(rpcResult.error);
    return {
      approved: false,
      outcome,
      message: rpcResult.error,
    };
  }

  const raw = rpcResult.result;
  if (!isRecord(raw)) {
    return {
      approved: false,
      outcome: 'unknown',
      message: 'Unexpected response shape from device',
    };
  }

  const statusCode = raw.statusCode;
  const statusMessage =
    typeof raw.statusMessage === 'string' ? raw.statusMessage : undefined;

  if (typeof statusCode !== 'number') {
    return {
      approved: false,
      outcome: 'unknown',
      message: statusMessage || 'Missing statusCode in device response',
    };
  }

  if (statusCode === STATUS_APPROVED) {
    return {
      approved: true,
      outcome: 'approved',
      statusCode,
      statusMessage,
      message: statusMessage || 'TRANSACTION APPROVED',
    };
  }

  if (statusCode === STATUS_PARTIAL) {
    return {
      approved: true,
      outcome: 'partial',
      statusCode,
      statusMessage,
      message: statusMessage || 'PARTIAL APPROVAL',
    };
  }

  if (statusCode === STATUS_INFORMATIVE) {
    return {
      approved: false,
      outcome: 'unknown',
      statusCode,
      statusMessage,
      message: statusMessage || 'Informative transaction',
    };
  }

  if (statusCode === STATUS_CANCELLED_A || statusCode === STATUS_CANCELLED_B) {
    return {
      approved: false,
      outcome: 'cancelled',
      statusCode,
      statusMessage,
      message: statusMessage || 'Transaction cancelled',
    };
  }

  return {
    approved: false,
    outcome: 'declined',
    statusCode,
    statusMessage,
    message: statusMessage || `Declined (code ${statusCode})`,
  };
}

export type ParsedAbortTransaction =
  | { ok: true; statusCode?: number; statusMessage?: string }
  | { ok: false; message: string; statusCode?: number };

/**
 * Nayax `abortTransaction` — TweezerComm returns result.statusCode 0 on success.
 * Params use service `"engine"` and `{ vuid }` per Nayax docs.
 */
export function parseAbortTransactionResult(rpcResult: NayaxJsonRpcResult): ParsedAbortTransaction {
  if (!rpcResult.ok) {
    return { ok: false, message: rpcResult.error };
  }

  const raw = rpcResult.result;
  if (!isRecord(raw)) {
    return { ok: false, message: 'Unexpected response shape from device' };
  }

  const statusCode = raw.statusCode;
  const statusMessage =
    typeof raw.statusMessage === 'string' ? raw.statusMessage : undefined;

  if (typeof statusCode !== 'number') {
    return {
      ok: false,
      message: statusMessage || 'Missing statusCode in device response',
    };
  }

  if (statusCode === 0) {
    return { ok: true, statusCode, statusMessage };
  }

  return {
    ok: false,
    statusCode,
    message: statusMessage || `Abort failed (code ${statusCode})`,
  };
}
