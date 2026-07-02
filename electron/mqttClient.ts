/**
 * Cloud MQTT client for POS Desktop.
 * Subscribes to catalog/notify only; catalog data is fetched via HTTP GET.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MqttLib = require('mqtt');

export type MqttMessageHandler = (topic: string, payload: Record<string, unknown>) => void;

export interface CloudMqttConfig {
  host: string;
  port: number;
  merchantId: string;
  machineId: string;
  /** Full API base e.g. http://localhost:8001/api/v1 */
  apiBaseUrl: string;
  accessToken: string;
  clientId?: string;
  username?: string;
  password?: string;
  /** Called after MQTT connect (subscribe catalog/notify). Pull catalog over HTTP here. */
  onMqttConnected?: () => void;
}

export class CloudMqttClient {
  private client: any = null;
  private config: CloudMqttConfig | null = null;
  private messageHandlers: MqttMessageHandler[] = [];
  private _connected = false;

  get connected(): boolean {
    return this._connected;
  }

  connect(config: CloudMqttConfig): void {
    if (this.client) {
      this.disconnect();
    }

    this.config = config;
    const brokerUrl = `mqtt://${config.host}:${config.port}`;

    this.client = MqttLib.connect(brokerUrl, {
      clientId: config.clientId || `pos-machine-${config.machineId}`,
      username: config.username,
      password: config.password,
      reconnectPeriod: 30000,
      connectTimeout: 10000,
      keepalive: 60,
      clean: true,
    });

    this.client.on('connect', () => {
      this._connected = true;
      console.log('[MQTT] Connected to cloud broker');
      this._subscribeAll();
      if (config.onMqttConnected) {
        config.onMqttConnected();
      }
    });

    this.client.on('reconnect', () => {
      console.log('[MQTT] Reconnecting to cloud broker...');
    });

    this.client.on('disconnect', () => {
      this._connected = false;
      console.log('[MQTT] Disconnected from cloud broker');
    });

    this.client.on('error', (err: Error) => {
      console.error('[MQTT] Error:', err.message);
    });

    this.client.on('message', (topic: string, buffer: Buffer) => {
      try {
        const payload = JSON.parse(buffer.toString('utf8'));
        for (const handler of this.messageHandlers) {
          handler(topic, payload);
        }
      } catch (e) {
        console.error('[MQTT] Failed to parse message on', topic, e);
      }
    });
  }

  disconnect(): void {
    if (this.client) {
      this.client.end(true);
      this.client = null;
      this._connected = false;
    }
    this.messageHandlers = [];
  }

  onMessage(handler: MqttMessageHandler): void {
    this.messageHandlers.push(handler);
  }

  publish(topic: string, payload: Record<string, unknown>): void {
    if (!this.client || !this._connected) {
      console.warn('[MQTT] Not connected, cannot publish to', topic);
      return;
    }
    this.client.publish(topic, JSON.stringify(payload), { qos: 1 });
  }

  /** Ask server to emit catalog/notify (POS then pulls via HTTP). */
  requestCatalogSync(lastSyncedAt: string | null): void {
    if (!this.config) return;
    const { merchantId, machineId } = this.config;
    this.publish(`pos/${merchantId}/${machineId}/sync/request`, {
      lastSyncedAt: lastSyncedAt,
    });
  }

  publishHeartbeat(): void {
    if (!this.config) return;
    const { merchantId, machineId } = this.config;
    this.publish(`pos/${merchantId}/${machineId}/heartbeat`, {
      machineId,
      time: new Date().toISOString(),
    });
  }

  private _subscribeAll(): void {
    if (!this.config || !this.client) return;
    const { merchantId, machineId } = this.config;

    const topics = [
      `pos/${merchantId}/${machineId}/catalog/notify`,
      `pos/${merchantId}/${machineId}/pos-users/notify`,
      `pos/${merchantId}/${machineId}/settings/notify`,
      `pos/${merchantId}/${machineId}/close-day/notify`,
    ];
    for (const topic of topics) {
      this.client.subscribe(topic, { qos: 1 }, (err: Error | null) => {
        if (err) console.error('[MQTT] Subscribe error on', topic, err.message);
        else console.log('[MQTT] Subscribed:', topic);
      });
    }
  }
}

export const cloudMqttClient = new CloudMqttClient();
