/**
 * HTTP helpers for cloud pairing from the main process (avoids renderer CORS).
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { URL } = require('url');

export function normalizeApiBaseUrl(input: string): string {
  let s = input.trim().replace(/\/$/, '');
  if (!s) return s;
  if (!/\/api\/v\d+(\/|$)/i.test(s)) {
    s = `${s}/api/v1`;
  }
  return s;
}

/** Parse broker string like "localhost:1883" or "host:8883". */
export function parseMqttBrokerUrl(broker: string): { host: string; port: number } {
  const s = broker.trim();
  const idx = s.lastIndexOf(':');
  if (idx <= 0 || idx === s.length - 1) {
    return { host: s || 'localhost', port: 1883 };
  }
  const host = s.slice(0, idx);
  const p = parseInt(s.slice(idx + 1), 10);
  return { host: host || 'localhost', port: Number.isFinite(p) && p > 0 ? p : 1883 };
}

export type PairingHttpResult =
  | { ok: true; data: Record<string, unknown>; statusCode: number; serverDateMs?: number }
  | { ok: false; error: string; statusCode?: number };

function pairingHttpRequest(
  method: 'GET' | 'POST',
  urlStr: string,
  body?: string,
): Promise<PairingHttpResult> {
  return new Promise((resolve) => {
    let u: typeof URL.prototype;
    try {
      u = new URL(urlStr);
    } catch {
      return resolve({ ok: false, error: 'Invalid API URL' });
    }
    const isHttps = u.protocol === 'https:';
    const lib = isHttps ? require('https') : require('http');
    const port = u.port ? parseInt(u.port, 10) : isHttps ? 443 : 80;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(body));
    }
    const opts = {
      hostname: u.hostname,
      port,
      path: `${u.pathname}${u.search || ''}`,
      method,
      headers,
    };
    const req = lib.request(
      opts,
      (res: {
        statusCode?: number;
        headers?: Record<string, string | string[] | undefined>;
        on: (ev: string, fn: (...args: unknown[]) => void) => void;
      }) => {
        let raw = '';
        res.on('data', (c: Buffer) => {
          raw += c.toString();
        });
        res.on('end', () => {
          const code = res.statusCode || 0;
          // Server clock from the HTTP Date header — lets callers derive a TTL
          // that is independent of the local (possibly wrong) device clock.
          const dateHeader = res.headers?.date;
          const dateStr = Array.isArray(dateHeader) ? dateHeader[0] : dateHeader;
          const parsed = dateStr ? Date.parse(dateStr) : NaN;
          const serverDateMs = Number.isFinite(parsed) ? parsed : undefined;
          try {
            const data = raw ? JSON.parse(raw) : {};
            if (code >= 400) {
              const d = (data as { detail?: unknown }).detail;
              const detail =
                Array.isArray(d) || (typeof d === 'object' && d !== null)
                  ? JSON.stringify(d)
                  : d != null
                    ? String(d)
                    : raw.slice(0, 200);
              return resolve({ ok: false, error: detail, statusCode: code });
            }
            resolve({ ok: true, data: data as Record<string, unknown>, statusCode: code, serverDateMs });
          } catch {
            resolve({ ok: false, error: raw.slice(0, 200) || 'Invalid JSON', statusCode: code });
          }
        });
      },
    );
    req.on('error', (e: Error) => resolve({ ok: false, error: e.message }));
    if (body) req.write(body);
    req.end();
  });
}

export type PairingValidateResult = PairingHttpResult;

export function postPairingValidate(
  apiBaseUrl: string,
  body: { code: string; machine_name?: string; device_info?: Record<string, unknown> },
): Promise<PairingValidateResult> {
  const base = normalizeApiBaseUrl(apiBaseUrl);
  const payload = JSON.stringify({
    code: body.code,
    machine_name: body.machine_name,
    device_info: body.device_info ?? { app: 'pos-desktop' },
  });
  return pairingHttpRequest('POST', `${base}/pairing/validate`, payload);
}

export function postDeviceRegister(
  apiBaseUrl: string,
  body: { machine_name?: string; device_info?: Record<string, unknown> },
): Promise<PairingHttpResult> {
  const base = normalizeApiBaseUrl(apiBaseUrl);
  const payload = JSON.stringify({
    machineName: body.machine_name,
    deviceInfo: body.device_info ?? { app: 'pos-desktop' },
  });
  return pairingHttpRequest('POST', `${base}/pairing/device/register`, payload);
}

export function getDevicePollStatus(
  apiBaseUrl: string,
  deviceNonce: string,
): Promise<PairingHttpResult> {
  const base = normalizeApiBaseUrl(apiBaseUrl);
  const encoded = encodeURIComponent(deviceNonce);
  return pairingHttpRequest('GET', `${base}/pairing/device/${encoded}/status`);
}

export function pairingCredentialsFromValidateData(d: Record<string, unknown>, apiBaseUrl: string) {
  const broker = String(d.mqttBrokerUrl || '');
  const { host, port } = parseMqttBrokerUrl(broker);
  const tenantId =
    d.tenantId != null && d.tenantId !== ''
      ? String(d.tenantId)
      : d.merchantId != null && d.merchantId !== ''
        ? String(d.merchantId)
        : '';
  return {
    apiBaseUrl: normalizeApiBaseUrl(apiBaseUrl),
    machineId: String(d.machineId ?? ''),
    tenantId,
    merchantId: tenantId,
    shopId: d.shopId != null && d.shopId !== '' ? String(d.shopId) : '',
    accessToken: String(d.accessToken ?? ''),
    mqttClientId: String(d.mqttClientId ?? ''),
    mqttUsername: String(d.mqttUsername ?? ''),
    mqttPassword: String(d.mqttPassword ?? ''),
    machineCode: String(d.machineCode ?? ''),
    mqttHost: host,
    mqttPort: port,
    // Whether the broker requires TLS (EMQX Serverless on 8883). Must be
    // propagated to the MQTT client, otherwise it connects with plaintext
    // mqtt:// and the connection silently fails (no heartbeat, no catalog).
    mqttTls: d.mqttTls === true || d.mqttTls === 'true',
  };
}
