/**
 * traccar-client.ts
 *
 * Browser-native Traccar v6 REST + WebSocket client.
 * Translated from the Python TraccarClient / TrackerManager in
 * kadas-sillages-plugin, keeping the same public API surface.
 *
 * Authentication strategy
 * -----------------------
 * 1. POST /api/session with form-encoded credentials → server sets JSESSIONID
 *    cookie (fetch is called with credentials:'include' so the browser retains it).
 * 2. WebSocket /api/socket → browser sends the session cookie automatically for
 *    same-origin requests; for cross-origin the WS handshake still works as long
 *    as Traccar has AllowedOrigins configured.  If the WS handshake fails or
 *    times out, TrackerManager falls back to HTTP polling.
 */

// ─── Models ────────────────────────────────────────────────────────────────────

/** Traccar v6 device (GET /api/devices). */
export interface TraccarDevice {
  id: number;
  name: string;
  uniqueId: string;
  status: string;            // "online" | "offline" | "unknown"
  disabled: boolean;
  lastUpdate?: string;       // ISO-8601
  positionId?: number;
  groupId?: number;
  category?: string;
  attributes?: Record<string, unknown>;
}

/** Traccar v6 position (GET /api/positions, WS, GET /api/reports/route). */
export interface TraccarPosition {
  id: number;
  deviceId: number;
  deviceTime?: string;   // ISO-8601
  fixTime?: string;
  serverTime?: string;
  valid: boolean;
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;         // knots
  course: number;        // 0-360 degrees
  address?: string;
  accuracy?: number;
  attributes?: Record<string, unknown>;
}

/** Client-side visual state merged on top of TraccarDevice. */
export interface TraccarDeviceState extends TraccarDevice {
  visible: boolean;
  trackColor: string;    // CSS hex colour, e.g. "#0000FF"
  trackWidth: number;    // pixels
  trackMaxPoints: number;
  showLabel: boolean;
}

/** WebSocket push message from Traccar. */
export interface TraccarWsMessage {
  devices?: TraccarDevice[];
  positions?: TraccarPosition[];
  events?: Array<{ deviceId: number; type: string; [k: string]: unknown }>;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class TraccarAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TraccarAuthError";
  }
}

export class TraccarNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TraccarNetworkError";
  }
}

// ─── HTTP Client ──────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 15_000;

export class TraccarClient {
  readonly serverUrl: string;
  readonly username: string;
  private readonly _password: string;
  private _loggedIn = false;

  constructor(serverUrl: string, username: string, password: string) {
    this.serverUrl = serverUrl.replace(/\/+$/, "");
    this.username = username;
    this._password = password;
  }

  get isLoggedIn(): boolean {
    return this._loggedIn;
  }

  /**
   * POST /api/session — returns the logged-in user object.
   * Stores the session cookie in the browser's cookie jar (credentials:'include').
   *
   * We bypass _fetch here intentionally:
   * - URLSearchParams body → browser auto-sets Content-Type: application/x-www-form-urlencoded;charset=UTF-8
   * - No custom headers added → the POST stays a "simple" CORS request (no preflight)
   *   which works even when Traccar's Access-Control-Allow-Headers is minimal.
   */
  async login(): Promise<Record<string, unknown>> {
    const body = new URLSearchParams();
    body.set("email", this.username);
    body.set("password", this._password);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(`${this.serverUrl}/api/session`, {
        method: "POST",
        body,
        credentials: "include",
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const msg =
        err instanceof Error
          ? err.name === "AbortError"
            ? "Request timeout"
            : err.message
          : String(err);
      throw new TraccarNetworkError(`Network error: ${msg}`);
    }
    clearTimeout(timer);

    if (resp.status === 401 || resp.status === 403) {
      throw new TraccarAuthError(
        `Authentication failed (HTTP ${resp.status}). Check credentials.`,
      );
    }
    if (!resp.ok) {
      throw new TraccarNetworkError(`Login failed: HTTP ${resp.status}`);
    }

    const data = (await resp.json()) as Record<string, unknown>;
    this._loggedIn = true;
    return data;
  }

  /** DELETE /api/session */
  async logout(): Promise<void> {
    if (!this._loggedIn) return;
    try {
      await this._fetch("/api/session", { method: "DELETE" });
    } finally {
      this._loggedIn = false;
    }
  }

  /** GET /api/session — check if the session is still valid. */
  async verifySession(): Promise<Record<string, unknown>> {
    return this._getJson("/api/session");
  }

  /** GET /api/devices?all=true */
  async getDevices(): Promise<TraccarDevice[]> {
    const data = await this._getJson("/api/devices?all=true");
    return Array.isArray(data) ? (data as TraccarDevice[]) : [];
  }

  /**
   * GET /api/positions
   * Without parameters: last known positions for all devices.
   * With deviceId + from + to: historic positions.
   */
  async getPositions(params: {
    deviceId?: number;
    from?: Date;
    to?: Date;
  } = {}): Promise<TraccarPosition[]> {
    const q = new URLSearchParams();
    if (params.deviceId !== undefined)
      q.set("deviceId", String(params.deviceId));
    if (params.from) q.set("from", params.from.toISOString());
    if (params.to) q.set("to", params.to.toISOString());
    const qs = q.size > 0 ? `?${q.toString()}` : "";
    const data = await this._getJson(`/api/positions${qs}`);
    return Array.isArray(data) ? (data as TraccarPosition[]) : [];
  }

  /** GET /api/reports/route — full track including interpolated points. */
  async getRoute(
    deviceId: number,
    from: Date,
    to: Date,
  ): Promise<TraccarPosition[]> {
    const q = new URLSearchParams({
      deviceId: String(deviceId),
      from: from.toISOString(),
      to: to.toISOString(),
    });
    const data = await this._getJson(`/api/reports/route?${q.toString()}`);
    return Array.isArray(data) ? (data as TraccarPosition[]) : [];
  }

  /** GET /api/server */
  async getServerInfo(): Promise<Record<string, unknown>> {
    return this._getJson("/api/server");
  }

  /**
   * Measure clock offset between client and server (server − client, seconds).
   * Uses the HTTP Date header (simplified NTP mid-point correction).
   */
  async getServerTimeOffset(): Promise<number> {
    const t0 = Date.now();
    const resp = await this._fetch("/api/server");
    const t1 = Date.now();
    const dateHdr = resp.headers.get("date");
    if (!dateHdr) return 0;
    const tServer = new Date(dateHdr).getTime();
    if (Number.isNaN(tServer)) return 0;
    const tClientMid = (t0 + t1) / 2;
    return (tServer - tClientMid) / 1000;
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  private async _getJson(path: string): Promise<unknown> {
    const resp = await this._fetch(path);
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      if (resp.status === 401 || resp.status === 403) {
        throw new TraccarAuthError(`HTTP ${resp.status}`);
      }
      throw new TraccarNetworkError(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }
    return resp.json();
  }

  private async _fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const url = this.serverUrl + path;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    // Destructure to merge headers without the spread overwriting the defaults.
    const { headers: extraHeaders, ...restInit } = init;
    try {
      return await fetch(url, {
        credentials: "include",
        ...restInit,
        headers: {
          Accept: "application/json",
          ...(extraHeaders as Record<string, string> | undefined),
        },
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof TraccarAuthError || err instanceof TraccarNetworkError)
        throw err;
      const msg =
        err instanceof Error
          ? err.name === "AbortError"
            ? "Request timeout"
            : err.message
          : String(err);
      throw new TraccarNetworkError(`Network error: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

// ─── Tracker Manager ─────────────────────────────────────────────────────────

const WS_CONNECT_TIMEOUT_MS = 8_000;
const RECONNECT_DELAY_MS = 10_000;
const PING_INTERVAL_MS = 25_000;
const POLL_INTERVAL_MS = 5_000;

export type TransportMode = "websocket" | "polling";

export interface TrackerManagerCallbacks {
  onPositionUpdated: (deviceId: number, lat: number, lon: number) => void;
  onDeviceStatusChanged: (deviceId: number, status: string) => void;
  onTrackingStarted: () => void;
  onTrackingStopped: () => void;
  onTransportModeChanged: (mode: TransportMode) => void;
  onWsError: (message: string) => void;
}

/**
 * Manages live tracking to a Traccar server.
 *
 * Strategy (mirrors TrackerManager.py):
 * 1. Try WebSocket first (server-push, real-time).
 * 2. If WS does not connect within WS_CONNECT_TIMEOUT_MS, fall back to HTTP
 *    polling every POLL_INTERVAL_MS ms.
 */
export class TrackerManager {
  private _client: TraccarClient;
  private _callbacks: TrackerManagerCallbacks;
  private _devices: TraccarDeviceState[] = [];
  private _running = false;
  private _transport: TransportMode = "websocket";
  private _lastPosId: Map<number, number> = new Map();

  // Tracks: per-device ring buffer of positions (max trackMaxPoints)
  private _tracks: Map<number, TraccarPosition[]> = new Map();

  private _ws: WebSocket | null = null;
  private _wsTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private _reconnectId: ReturnType<typeof setTimeout> | null = null;
  private _pingId: ReturnType<typeof setInterval> | null = null;
  private _pollId: ReturnType<typeof setInterval> | null = null;

  constructor(client: TraccarClient, callbacks: TrackerManagerCallbacks) {
    this._client = client;
    this._callbacks = callbacks;
  }

  get isTracking(): boolean {
    return this._running;
  }

  get transportMode(): TransportMode {
    return this._transport;
  }

  /** Start tracking. The caller must ensure devices are loaded first. */
  start(devices: TraccarDeviceState[]): void {
    if (this._running) return;
    this._running = true;
    this._transport = "websocket";
    this._lastPosId.clear();
    this._tracks.clear();
    this._devices = devices;
    this._openWebSocket();
    this._callbacks.onTrackingStarted();
  }

  /** Stop tracking, clean up WS/polling timers. */
  stop(): void {
    if (!this._running) return;
    this._running = false;
    this._clearAllTimers();
    this._closeWebSocket();
    this._devices = [];
    this._callbacks.onTrackingStopped();
  }

  /** Update the device list (called after a device refresh). */
  updateDevices(devices: TraccarDeviceState[]): void {
    this._devices = devices;
  }

  /** Return the track ring buffer for a device (for map rendering). */
  getTrack(deviceId: number): TraccarPosition[] {
    return this._tracks.get(deviceId) ?? [];
  }

  /** Clear the track ring buffer for a specific device. */
  clearTrack(deviceId: number): void {
    this._tracks.delete(deviceId);
  }

  // ─── WebSocket ──────────────────────────────────────────────────────────────

  private _openWebSocket(): void {
    if (!this._running) return;
    this._closeWebSocket();

    const wsUrl = this._client.serverUrl
      .replace(/^https:\/\//, "wss://")
      .replace(/^http:\/\//, "ws://")
      + "/api/socket";

    try {
      this._ws = new WebSocket(wsUrl);
    } catch (err) {
      this._switchToPolling(`WebSocket constructor failed: ${String(err)}`);
      return;
    }

    // Start timeout → switch to polling if WS doesn't connect in time
    this._wsTimeoutId = setTimeout(() => {
      this._switchToPolling("WebSocket connection timeout");
    }, WS_CONNECT_TIMEOUT_MS);

    this._ws.onopen = () => {
      if (this._wsTimeoutId) {
        clearTimeout(this._wsTimeoutId);
        this._wsTimeoutId = null;
      }
      this._transport = "websocket";
      this._callbacks.onTransportModeChanged("websocket");
      this._startPing();
    };

    this._ws.onclose = () => {
      this._stopPing();
      if (this._running && this._transport === "websocket") {
        this._scheduleReconnect();
      }
    };

    this._ws.onerror = () => {
      this._stopPing();
      if (this._wsTimeoutId) {
        clearTimeout(this._wsTimeoutId);
        this._wsTimeoutId = null;
      }
      // Likely CORS/proxy blocking WS — fall back to polling immediately
      this._switchToPolling("WebSocket connection error (possible CORS/proxy issue)");
    };

    this._ws.onmessage = (event: MessageEvent<string>) => {
      this._onWsMessage(event.data);
    };
  }

  private _closeWebSocket(): void {
    if (this._ws) {
      this._ws.onopen = null;
      this._ws.onclose = null;
      this._ws.onerror = null;
      this._ws.onmessage = null;
      try { this._ws.close(); } catch { /* ignore */ }
      this._ws = null;
    }
  }

  private _scheduleReconnect(): void {
    if (!this._running || this._reconnectId !== null) return;
    this._reconnectId = setTimeout(() => {
      this._reconnectId = null;
      if (this._running && this._transport === "websocket") {
        this._openWebSocket();
      }
    }, RECONNECT_DELAY_MS);
  }

  private _startPing(): void {
    this._pingId = setInterval(() => {
      if (this._ws?.readyState === WebSocket.OPEN) {
        this._ws.send(""); // keep-alive ping
      }
    }, PING_INTERVAL_MS);
  }

  private _stopPing(): void {
    if (this._pingId !== null) {
      clearInterval(this._pingId);
      this._pingId = null;
    }
  }

  // ─── HTTP polling fallback ──────────────────────────────────────────────────

  private _switchToPolling(reason: string): void {
    if (!this._running) return;
    this._closeWebSocket();
    if (this._reconnectId) {
      clearTimeout(this._reconnectId);
      this._reconnectId = null;
    }
    if (this._wsTimeoutId) {
      clearTimeout(this._wsTimeoutId);
      this._wsTimeoutId = null;
    }
    this._transport = "polling";
    const msg = `HTTP polling fallback (${reason}). Refresh every ${POLL_INTERVAL_MS / 1000}s.`;
    this._callbacks.onWsError(msg);
    this._callbacks.onTransportModeChanged("polling");
    void this._pollPositions();
    this._pollId = setInterval(() => void this._pollPositions(), POLL_INTERVAL_MS);
  }

  private async _pollPositions(): Promise<void> {
    if (!this._running) return;
    try {
      const positions = await this._client.getPositions();
      for (const pos of positions) {
        if (this._lastPosId.get(pos.deviceId) === pos.id) continue;
        this._lastPosId.set(pos.deviceId, pos.id);
        const dev = this._devices.find((d) => d.id === pos.deviceId);
        if (!dev || !dev.visible) continue;
        this._appendToTrack(dev, pos);
        this._callbacks.onPositionUpdated(pos.deviceId, pos.latitude, pos.longitude);
      }
    } catch { /* silently ignore polling errors */ }
  }

  // ─── WS message handler ─────────────────────────────────────────────────────

  private _onWsMessage(raw: string): void {
    let data: TraccarWsMessage;
    try {
      data = JSON.parse(raw) as TraccarWsMessage;
    } catch {
      return;
    }

    for (const devData of data.devices ?? []) {
      this._handleDeviceUpdate(devData);
    }
    for (const posData of data.positions ?? []) {
      this._handlePositionUpdate(posData);
    }
  }

  private _handleDeviceUpdate(devData: TraccarDevice): void {
    const dev = this._devices.find((d) => d.id === devData.id);
    if (!dev) return;
    const oldStatus = dev.status;
    dev.status = devData.status ?? dev.status;
    if (dev.status !== oldStatus) {
      this._callbacks.onDeviceStatusChanged(dev.id, dev.status);
    }
  }

  private _handlePositionUpdate(posData: TraccarPosition): void {
    const dev = this._devices.find((d) => d.id === posData.deviceId);
    if (!dev || !dev.visible) return;
    this._appendToTrack(dev, posData);
    this._callbacks.onPositionUpdated(posData.deviceId, posData.latitude, posData.longitude);
  }

  // ─── Track ring buffer ───────────────────────────────────────────────────────

  private _appendToTrack(dev: TraccarDeviceState, pos: TraccarPosition): void {
    const track = this._tracks.get(dev.id) ?? [];
    track.push(pos);
    // Trim to max length
    while (track.length > dev.trackMaxPoints) {
      track.shift();
    }
    this._tracks.set(dev.id, track);
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────────

  private _clearAllTimers(): void {
    if (this._wsTimeoutId) { clearTimeout(this._wsTimeoutId); this._wsTimeoutId = null; }
    if (this._reconnectId) { clearTimeout(this._reconnectId); this._reconnectId = null; }
    if (this._pollId) { clearInterval(this._pollId); this._pollId = null; }
    this._stopPing();
  }
}

// ─── History export helpers (browser-side download) ──────────────────────────

/** Download an array of positions as GeoJSON to the user's machine. */
export function exportPositionsAsGeoJson(
  device: TraccarDeviceState,
  positions: TraccarPosition[],
): void {
  const fc = {
    type: "FeatureCollection",
    name: device.name,
    features: positions.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.longitude, p.latitude, p.altitude] },
      properties: {
        device_id: p.deviceId,
        device_name: device.name,
        fix_time: p.fixTime ?? null,
        speed_kn: p.speed,
        speed_kmh: +(p.speed * 1.852).toFixed(2),
        course: p.course,
        altitude: p.altitude,
        address: p.address ?? null,
        valid: p.valid,
      },
    })),
  };
  _downloadBlob(
    JSON.stringify(fc, null, 2),
    "application/geo+json",
    `${device.name}-${_dateStamp()}.geojson`,
  );
}

/** Download as GPX. */
export function exportPositionsAsGpx(
  device: TraccarDeviceState,
  positions: TraccarPosition[],
): void {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="MilGeo Sillages" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <trk><name>${esc(device.name)}</name><trkseg>`,
  ];
  for (const p of positions) {
    const ts = p.fixTime ?? "";
    lines.push(
      `    <trkpt lat="${p.latitude}" lon="${p.longitude}">` +
        `<ele>${p.altitude}</ele>` +
        `<time>${ts}</time>` +
        `<speed>${+(p.speed * 0.514444).toFixed(2)}</speed>` +
        `</trkpt>`,
    );
  }
  lines.push("  </trkseg></trk>", "</gpx>");
  _downloadBlob(lines.join("\n"), "application/gpx+xml", `${device.name}-${_dateStamp()}.gpx`);
}

/** Download as CSV. */
export function exportPositionsAsCsv(
  device: TraccarDeviceState,
  positions: TraccarPosition[],
): void {
  const header =
    "device_id,device_name,fix_time,latitude,longitude,altitude,speed_kn,speed_kmh,course,address,valid";
  const rows = positions.map((p) =>
    [
      p.deviceId,
      `"${device.name.replace(/"/g, '""')}"`,
      p.fixTime ?? "",
      p.latitude,
      p.longitude,
      p.altitude,
      p.speed,
      +(p.speed * 1.852).toFixed(2),
      p.course,
      `"${(p.address ?? "").replace(/"/g, '""')}"`,
      p.valid ? 1 : 0,
    ].join(","),
  );
  _downloadBlob(
    [header, ...rows].join("\n"),
    "text/csv",
    `${device.name}-${_dateStamp()}.csv`,
  );
}

function _downloadBlob(content: string, mime: string, filename: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function _dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
