/**
 * Ably realtime client for POS Desktop.
 * Subscribes to per-machine channel; catalog data is fetched via HTTP GET.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Ably = require('ably');

export type RealtimeMessageHandler = (
  event: string,
  payload: Record<string, unknown>,
) => void;

export interface CloudRealtimeConfig {
  tenantId: string;
  machineId: string;
  /** Full API base e.g. http://localhost:8001/api/v1 */
  apiBaseUrl: string;
  accessToken: string;
  realtimeChannel?: string;
  /** Must match server token clientId (machine mqtt_client_id). */
  clientId?: string;
  /** Called after Ably connects — pull catalog/users/settings over HTTP. */
  onConnected?: () => void;
}

export class CloudAblyClient {
  private realtime: any = null;
  private channel: any = null;
  private messageHandlers: RealtimeMessageHandler[] = [];
  private _connected = false;

  get connected(): boolean {
    return this._connected;
  }

  connect(config: CloudRealtimeConfig): void {
    this.disconnect();

    const apiBase = config.apiBaseUrl.replace(/\/$/, '');
    const channelName =
      config.realtimeChannel || `pos:${config.tenantId}:${config.machineId}`;
    const authUrl = `${apiBase}/machines/me/ably-auth`;

    console.log('[Ably] Connecting channel', channelName);

    const clientId = config.clientId?.trim();
    if (!clientId) {
      console.warn('[Ably] No clientId — token auth may fail; re-pair or set mqtt_cloud_client_id');
    }

    this.realtime = new Ably.Realtime({
      authUrl,
      authMethod: 'GET',
      authHeaders: { Authorization: `Bearer ${config.accessToken}` },
      ...(clientId ? { clientId } : {}),
      echoMessages: false,
      disconnectedRetryTimeout: 30000,
    });

    this.realtime.connection.on('connected', () => {
      this._connected = true;
      console.log('[Ably] Connected');
      if (config.onConnected) config.onConnected();
    });

    this.realtime.connection.on('disconnected', () => {
      this._connected = false;
      console.log('[Ably] Disconnected');
    });

    this.realtime.connection.on('failed', (stateChange: { reason?: { message?: string } }) => {
      this._connected = false;
      console.error('[Ably] Connection failed:', stateChange?.reason?.message || 'unknown');
    });

    this.channel = this.realtime.channels.get(channelName, {
      params: { rewind: '1' },
    });

    this.channel.subscribe((message: { name?: string; data?: unknown }) => {
      const event = message.name || 'message';
      let data: Record<string, unknown> = {};
      if (message.data && typeof message.data === 'object' && !Array.isArray(message.data)) {
        data = message.data as Record<string, unknown>;
      }
      for (const handler of this.messageHandlers) {
        handler(event, data);
      }
    });
  }

  disconnect(): void {
    if (this.channel) {
      try {
        this.channel.unsubscribe();
      } catch {
        /* ignore */
      }
      this.channel = null;
    }
    if (this.realtime) {
      try {
        this.realtime.close();
      } catch {
        /* ignore */
      }
      this.realtime = null;
    }
    this._connected = false;
    // Keep handlers across reconnects — callers register before connect().
  }

  onMessage(handler: RealtimeMessageHandler): void {
    this.messageHandlers.push(handler);
  }
}

export const cloudAblyClient = new CloudAblyClient();
