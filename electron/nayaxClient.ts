import http from 'http';

export const DEFAULT_NAYAX_PORT = 8080;
export const DEFAULT_NAYAX_PATH = '/SPICy';

/** Card presentment / SHVA round-trip can exceed normal HTTP timeouts. */
export const DEFAULT_NAYAX_TRANSACTION_TIMEOUT_MS = 180_000;
export const DEFAULT_NAYAX_TEST_TIMEOUT_MS = 15_000;
/**
 * Per-attempt timeout for abort JSON-RPC when run in the background (optimistic cancel).
 * Short so a dead host does not tie up the worker for long.
 */
export const DEFAULT_NAYAX_ABORT_RPC_TIMEOUT_MS = 2500;

/**
 * Reject values that look like URLs or paths. Allow hostnames and IPv4-style labels.
 */
export function validateNayaxHost(host: string): boolean {
  const t = host.trim();
  if (!t || t.length > 253) return false;
  if (/[\s/\\]/.test(t)) return false;
  if (t.includes('://')) return false;
  if (!/^[a-zA-Z0-9.-]+$/.test(t)) return false;
  return true;
}

export function parseNayaxPort(portStr: string | null | undefined): number {
  if (portStr == null || portStr === '') return DEFAULT_NAYAX_PORT;
  const n = parseInt(portStr, 10);
  if (Number.isNaN(n) || n < 1 || n > 65535) return DEFAULT_NAYAX_PORT;
  return n;
}

export function normalizeNayaxPath(pathStr: string | null | undefined): string {
  const p = (pathStr ?? '').trim() || DEFAULT_NAYAX_PATH;
  return p.startsWith('/') ? p : `/${p}`;
}

export type NayaxJsonRpcResult =
  | { ok: true; result: unknown; id?: string | number | null }
  | { ok: false; error: string; code?: number; data?: unknown };

export async function callNayaxJsonRpc(options: {
  host: string;
  port: number;
  path: string;
  method: string;
  params: unknown[];
  id?: string | number;
  timeoutMs?: number;
}): Promise<NayaxJsonRpcResult> {
  const {
    host,
    port,
    path: pathStr,
    method,
    params,
    id = Date.now().toString(),
    timeoutMs = DEFAULT_NAYAX_TEST_TIMEOUT_MS,
  } = options;

  const body = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params,
    id,
  });

  const pathNorm = normalizeNayaxPath(pathStr);

  return new Promise((resolve) => {
    const req = http.request(
      {
        host,
        port,
        path: pathNorm,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body, 'utf8'),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (!raw.trim()) {
            resolve({ ok: false, error: 'Empty response from device' });
            return;
          }
          try {
            const parsed = JSON.parse(raw) as {
              jsonrpc?: string;
              result?: unknown;
              error?: { code?: number; message?: string; data?: unknown };
              id?: string | number | null;
            };
            if (parsed.error) {
              resolve({
                ok: false,
                error: parsed.error.message ?? 'JSON-RPC error',
                code: parsed.error.code,
                data: parsed.error.data,
              });
            } else {
              resolve({ ok: true, result: parsed.result, id: parsed.id });
            }
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            resolve({ ok: false, error: `Invalid JSON response: ${msg}` });
          }
        });
      }
    );

    req.on('error', (e) => {
      resolve({ ok: false, error: e.message || 'Network error' });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Request timeout' });
    });
    req.write(body);
    req.end();
  });
}
