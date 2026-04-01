/**
 * Cloud MQTT client for POS Desktop.
 *
 * Connects to the cloud MQTT broker and handles catalog sync messaging.
 *
 * Node 14 / Electron 13 compatible:
 *  - Uses mqtt v4.x (CommonJS)
 *  - No top-level await
 *  - No native fetch
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MqttLib = require('mqtt');

export type MqttMessageHandler = (topic: string, payload: Record<string, unknown>) => void;

export interface CloudMqttConfig {
  host: string;
  port: number;
  merchantId: string;
  machineId: string;
  clientId?: string;
  username?: string;
  password?: string;
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
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      keepalive: 60,
      clean: true,
    });

    this.client.on('connect', () => {
      this._connected = true;
      console.log('[MQTT] Connected to cloud broker');
      this._subscribeAll();
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

  /** Request full or delta catalog sync from the server. */
  requestCatalogSync(lastSyncedAt: string | null): void {
    if (!this.config) return;
    const { merchantId, machineId } = this.config;
    this.publish(`pos/${merchantId}/${machineId}/sync/request`, {
      lastSyncedAt: lastSyncedAt,
    });
  }

  /** Publish a single catalog change (product or category) to the server. */
  publishCatalogUpdate(change: {
    action: 'create' | 'update' | 'delete';
    entity: 'product' | 'category';
    localId: string;
    cloudId: string | null;
    updatedAt: string;
    data: Record<string, unknown> | null;
  }): void {
    if (!this.config) return;
    const { merchantId, machineId } = this.config;
    this.publish(`pos/${merchantId}/${machineId}/catalog/update`, change as Record<string, unknown>);
  }

  /** Send a heartbeat to let the server know this machine is online. */
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
      `pos/${merchantId}/${machineId}/sync/products`,
      `pos/${merchantId}/${machineId}/sync/categories`,
      `pos/${merchantId}/${machineId}/sync/ack`,
    ];

    for (const topic of topics) {
      this.client.subscribe(topic, { qos: 1 }, (err: Error | null) => {
        if (err) console.error('[MQTT] Subscribe error on', topic, err.message);
        else console.log('[MQTT] Subscribed:', topic);
      });
    }

    // Ask for initial sync
    this.requestCatalogSync(null);
  }
}

// Singleton instance used by syncService
export const cloudMqttClient = new CloudMqttClient();
