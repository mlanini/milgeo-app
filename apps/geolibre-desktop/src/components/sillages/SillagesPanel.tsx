/**
 * SillagesPanel.tsx
 *
 * Floating side panel for the Sillages Traccar live-tracking plugin.
 * Translated from kadas-sillages-plugin/gui/main_dock.py.
 *
 * UI structure (mirrors the KADAS DockWidget):
 *  ┌── header (title + close) ─────────────────────────────────┐
 *  │ [Connect] [↻] [▶ Live] [⬇ History] [⚙] [ℹ]              │
 *  │ 👤 user | server (when connected)                         │
 *  ├── content ─────────────────────────────────────────────────│
 *  │  view="main"     → device list                            │
 *  │  view="settings" → settings form                          │
 *  │  view="export"   → history export form                    │
 *  ├── status bar ──────────────────────────────────────────────│
 *  └── log box (dark) ─────────────────────────────────────────┘
 */
import { useAppStore } from "@geolibre/core";
import { Button, Input, Label, ScrollArea, cn } from "@geolibre/ui";
import type { MapController } from "@geolibre/map";
import {
  CheckSquare,
  History,
  Play,
  RefreshCw,
  Settings,
  Square,
  StopCircle,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  TraccarClient,
  TrackerManager,
  exportPositionsAsGeoJson,
  exportPositionsAsGpx,
  exportPositionsAsCsv,
  type TraccarDeviceState,
  type TraccarPosition,
  type TransportMode,
} from "../../lib/traccar-client";
import {
  createSillagesLayers,
  removeSillagesLayers,
  updateSillagesLayers,
} from "../../lib/traccar-layer";
import {
  useSillagesSettingsStore,
  isSillagesConfigured,
  DEFAULT_SILLAGES_SETTINGS,
  type SillagesSettings,
} from "../../hooks/useSillagesSettings";

// ─── Types ────────────────────────────────────────────────────────────────────

type PanelView = "main" | "settings" | "export";

interface LogEntry {
  ts: string;
  level: "info" | "ok" | "warning" | "error";
  message: string;
}

const LOG_COLORS: Record<LogEntry["level"], string> = {
  info:    "text-slate-300",
  ok:      "text-teal-400",
  warning: "text-orange-300",
  error:   "text-red-400",
};

const STATUS_DOT: Record<string, string> = {
  online:  "bg-green-500",
  offline: "bg-gray-400",
  unknown: "bg-gray-400",
};

// ─── Component ────────────────────────────────────────────────────────────────

interface SillagesPanelProps {
  mapControllerRef: RefObject<MapController | null>;
}

export function SillagesPanel({ mapControllerRef }: SillagesPanelProps) {
  const open = useAppStore((s) => s.ui.sillagesOpen);
  const setSillagesOpen = useAppStore((s) => s.setSillagesOpen);

  const { settings } = useSillagesSettingsStore();
  const setSettings = useSillagesSettingsStore((s) => s.setSettings);

  // ─── Refs: mutable singletons that survive React re-renders ─────────────────
  const clientRef = useRef<TraccarClient | null>(null);
  const trackerRef = useRef<TrackerManager | null>(null);
  /** Always reflects the current devices state — avoids stale closures in callbacks. */
  const devicesRef = useRef<TraccarDeviceState[]>([]);

  // ─── State ───────────────────────────────────────────────────────────────────
  const [view, setView] = useState<PanelView>("main");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [transportMode, setTransportMode] = useState<TransportMode>("websocket");
  const [userInfo, setUserInfo] = useState<string>("");
  const [devices, setDevices] = useState<TraccarDeviceState[]>([]);
  const [statusText, setStatusText] = useState("Not connected");
  const [statusColor, setStatusColor] = useState("text-slate-400");
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Settings draft (only written on save)
  const [draftSettings, setDraftSettings] = useState<SillagesSettings>(settings);

  // Export form state
  const [exportDeviceId, setExportDeviceId] = useState<number | null>(null);
  const [exportFrom, setExportFrom] = useState<string>(
    () =>
      new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 16),
  );
  const [exportTo, setExportTo] = useState<string>(
    () => new Date().toISOString().slice(0, 16),
  );
  const [exportFormat, setExportFormat] = useState<"geojson" | "gpx" | "csv">("geojson");
  const [exportLoading, setExportLoading] = useState(false);

  const logBoxRef = useRef<HTMLDivElement>(null);

  // Keep devicesRef in sync with state so stable callbacks always see current devices.
  useEffect(() => { devicesRef.current = devices; }, [devices]);

  // ─── Log helper ──────────────────────────────────────────────────────────────
  const addLog = useCallback((message: string, level: LogEntry["level"] = "info") => {
    const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLogs((prev) => {
      const next = [...prev, { ts, level, message }];
      return next.length > 200 ? next.slice(-200) : next;
    });
  }, []);

  // Auto-scroll log box
  useEffect(() => {
    if (logBoxRef.current) {
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }
  }, [logs]);

  const setStatus = useCallback((text: string, color: string) => {
    setStatusText(text);
    setStatusColor(color);
  }, []);

  // ─── Tracker callbacks (stable — read from devicesRef, not state closure) ────
  const onPositionUpdated = useCallback(
    (_deviceId: number, _lat: number, _lon: number) => {
      const map = mapControllerRef.current?.getMap?.();
      if (map && trackerRef.current) {
        updateSillagesLayers(map, devicesRef.current, (id) =>
          trackerRef.current?.getTrack(id) ?? [],
        );
      }
    },
    [mapControllerRef], // mapControllerRef is a stable ref — no stale closure risk
  );

  const onDeviceStatusChanged = useCallback(
    (deviceId: number, status: string) => {
      setDevices((prev) => {
        const updated = prev.map((d) => (d.id === deviceId ? { ...d, status } : d));
        devicesRef.current = updated;
        return updated;
      });
    },
    [],
  );

  const onTrackingStarted = useCallback(() => {
    setTracking(true);
    setStatus("Tracking started (connecting…)", "text-blue-400");
    addLog("▶ Tracking started — attempting WebSocket…", "info");
  }, [setStatus, addLog]);

  const onTrackingStopped = useCallback(() => {
    setTracking(false);
    const map = mapControllerRef.current?.getMap?.();
    if (map) removeSillagesLayers(map);
    if (connected) {
      setStatus("Connected", "text-green-400");
    } else {
      setStatus("Not connected", "text-slate-400");
    }
    addLog("⏹ Live tracking stopped.", "warning");
  }, [connected, mapControllerRef, setStatus, addLog]);

  const onTransportModeChanged = useCallback(
    (mode: TransportMode) => {
      setTransportMode(mode);
      if (mode === "polling") {
        setStatus(
          "⏱ HTTP polling active (WebSocket unavailable)",
          "text-orange-400",
        );
        addLog(
          "⏱ HTTP polling mode active — WebSocket unavailable. Refresh every 5s.",
          "warning",
        );
      } else {
        setStatus("Live tracking active (WebSocket)", "text-blue-400");
        addLog("✔ WebSocket connected — real-time updates active.", "ok");
      }
    },
    [setStatus, addLog],
  );

  const onWsError = useCallback(
    (message: string) => {
      setStatus(`⚠ ${message}`, "text-orange-400");
      addLog(`⚠ ${message}`, "error");
    },
    [setStatus, addLog],
  );

  // ─── Auto-connect on open ─────────────────────────────────────────────────
  useEffect(() => {
    if (open && settings.autoConnect && isSillagesConfigured(settings) && !connected) {
      void doConnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ─── Cleanup on panel close ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      if (trackerRef.current?.isTracking) trackerRef.current.stop();
      clientRef.current?.logout().catch(() => undefined);
    }
  }, [open]);

  // ─── Sync draft settings when view switches to settings ─────────────────────
  useEffect(() => {
    if (view === "settings") setDraftSettings(settings);
    if (view === "export" && devices.length > 0 && exportDeviceId === null) {
      setExportDeviceId(devices[0].id);
    }
  }, [view, settings, devices, exportDeviceId]);

  // ─── Connection helpers ──────────────────────────────────────────────────────

  const doConnect = useCallback(async () => {
    if (!isSillagesConfigured(settings)) {
      setView("settings");
      return;
    }
    setConnecting(true);
    setStatus("Connecting…", "text-orange-400");
    addLog(`→ Connecting to ${settings.serverUrl} …`, "info");

    try {
      const client = new TraccarClient(
        settings.serverUrl,
        settings.username,
        settings.password,
      );
      const userObj = await client.login();
      clientRef.current = client;

      const name =
        (userObj.name as string | undefined) ??
        (userObj.email as string | undefined) ??
        settings.username;
      setUserInfo(`${name}  |  ${settings.serverUrl}`);
      setConnected(true);
      setStatus("Connected", "text-green-400");
      addLog(`✔ Connected as ${name} → ${settings.serverUrl}`, "ok");

      // Load devices
      const rawDevices = await client.getDevices();
      const devStates: TraccarDeviceState[] = rawDevices.map((d) => ({
        ...d,
        visible: true,
        trackColor: settings.defaultTrackColor,
        trackWidth: settings.defaultTrackWidth,
        trackMaxPoints: settings.defaultTrackMaxPoints,
        showLabel: true,
      }));
      devicesRef.current = devStates;
      setDevices(devStates);
      addLog(`↻ ${devStates.length} device(s) loaded.`, "info");

      // Build TrackerManager
      const tracker = new TrackerManager(client, {
        onPositionUpdated,
        onDeviceStatusChanged,
        onTrackingStarted,
        onTrackingStopped,
        onTransportModeChanged,
        onWsError,
      });
      trackerRef.current = tracker;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : String(err);
      setStatus(`⚠ ${msg}`, "text-red-400");
      addLog(`⚠ Error: ${msg}`, "error");
      clientRef.current = null;
      trackerRef.current = null;
    } finally {
      setConnecting(false);
    }
  }, [
    settings,
    setStatus,
    addLog,
    onPositionUpdated,
    onDeviceStatusChanged,
    onTrackingStarted,
    onTrackingStopped,
    onTransportModeChanged,
    onWsError,
  ]);

  const doDisconnect = useCallback(() => {
    if (trackerRef.current?.isTracking) trackerRef.current.stop();
    clientRef.current?.logout().catch(() => undefined);
    clientRef.current = null;
    trackerRef.current = null;
    setConnected(false);
    setTracking(false);
    setDevices([]);
    setUserInfo("");
    setStatus("Not connected", "text-slate-400");
    addLog("Disconnected from server.", "warning");
  }, [setStatus, addLog]);

  const doRefresh = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      const rawDevices = await client.getDevices();
      const devStates: TraccarDeviceState[] = rawDevices.map((d) => {
        const existing = devicesRef.current.find((e) => e.id === d.id);
        return existing
          ? { ...existing, ...d }
          : {
              ...d,
              visible: true,
              trackColor: settings.defaultTrackColor,
              trackWidth: settings.defaultTrackWidth,
              trackMaxPoints: settings.defaultTrackMaxPoints,
              showLabel: true,
            };
      });
      devicesRef.current = devStates;
      setDevices(devStates);
      trackerRef.current?.updateDevices(devStates);
      addLog(`↻ Device list refreshed: ${devStates.length} found.`, "info");
    } catch (err) {
      addLog(`⚠ Refresh error: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  }, [settings, addLog]);

  const doStartTracking = useCallback(() => {
    const map = mapControllerRef.current?.getMap?.();
    if (!map || !trackerRef.current) return;
    createSillagesLayers(map);
    trackerRef.current.start(devicesRef.current);
  }, [mapControllerRef]);

  const doStopTracking = useCallback(() => {
    trackerRef.current?.stop();
  }, []);

  // ─── Device visibility toggle ────────────────────────────────────────────────
  const toggleDeviceVisible = useCallback(
    (deviceId: number, visible: boolean) => {
      setDevices((prev) => {
        const updated = prev.map((d) => (d.id === deviceId ? { ...d, visible } : d));
        devicesRef.current = updated;
        trackerRef.current?.updateDevices(updated);
        const map = mapControllerRef.current?.getMap?.();
        if (map && trackerRef.current) {
          updateSillagesLayers(map, updated, (id) =>
            trackerRef.current?.getTrack(id) ?? [],
          );
        }
        return updated;
      });
    },
    [mapControllerRef],
  );

  // ─── Per-device colour change ─────────────────────────────────────────────────
  const changeDeviceColor = useCallback(
    (deviceId: number, color: string) => {
      setDevices((prev) => {
        const updated = prev.map((d) => (d.id === deviceId ? { ...d, trackColor: color } : d));
        devicesRef.current = updated;
        trackerRef.current?.updateDevices(updated);
        const map = mapControllerRef.current?.getMap?.();
        if (map && trackerRef.current) {
          updateSillagesLayers(map, updated, (id) =>
            trackerRef.current?.getTrack(id) ?? [],
          );
        }
        return updated;
      });
    },
    [mapControllerRef],
  );

  // ─── Clear device track ──────────────────────────────────────────────────────
  const clearTrack = useCallback(
    (deviceId: number) => {
      // Clear the internal ring-buffer in TrackerManager
      trackerRef.current?.clearTrack(deviceId);
      // Refresh the map sources (empty track = no line drawn)
      const map = mapControllerRef.current?.getMap?.();
      if (map) {
        updateSillagesLayers(
          map,
          devicesRef.current,
          (id) => (id === deviceId ? [] : (trackerRef.current?.getTrack(id) ?? [])),
        );
      }
      addLog(
        `⌫ Track cleared for device ${
          devicesRef.current.find((d) => d.id === deviceId)?.name ?? deviceId
        }.`,
        "info",
      );
    },
    [mapControllerRef, addLog],
  );

  // ─── Centre map on device ─────────────────────────────────────────────────────
  const centreOnDevice = useCallback(
    (deviceId: number) => {
      const map = mapControllerRef.current?.getMap?.();
      if (!map) return;
      const track = trackerRef.current?.getTrack(deviceId);
      if (!track || track.length === 0) return;
      const latest = track[track.length - 1];
      map.easeTo({ center: [latest.longitude, latest.latitude], zoom: 13 });
    },
    [mapControllerRef],
  );

  // ─── Show all / hide all ─────────────────────────────────────────────────────
  const setAllVisible = useCallback(
    (visible: boolean) => {
      setDevices((prev) => {
        const updated = prev.map((d) => ({ ...d, visible }));
        devicesRef.current = updated;
        trackerRef.current?.updateDevices(updated);
        const map = mapControllerRef.current?.getMap?.();
        if (map && trackerRef.current) {
          updateSillagesLayers(map, updated, (id) =>
            trackerRef.current?.getTrack(id) ?? [],
          );
        }
        return updated;
      });
    },
    [mapControllerRef],
  );

  // ─── Settings save ───────────────────────────────────────────────────────────
  const saveSettings = useCallback(() => {
    setSettings(draftSettings);
    setView("main");
    addLog("⚙ Settings saved.", "ok");
  }, [draftSettings, setSettings, addLog]);

  // ─── History export ───────────────────────────────────────────────────────────
  const doExport = useCallback(async () => {
    const client = clientRef.current;
    const deviceId = exportDeviceId;
    if (!client || deviceId === null) return;
    const dev = devices.find((d) => d.id === deviceId);
    if (!dev) return;

    const from = new Date(exportFrom + ":00Z");
    const to = new Date(exportTo + ":00Z");
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to) {
      addLog("⚠ Invalid date range for export.", "error");
      return;
    }

    setExportLoading(true);
    addLog(`→ Downloading track for ${dev.name}…`, "info");
    try {
      let positions: TraccarPosition[] = await client.getRoute(deviceId, from, to).catch(() => []);
      if (positions.length === 0) {
        positions = await client.getPositions({ deviceId, from, to });
      }
      if (positions.length === 0) {
        addLog("⚠ No positions found in the selected range.", "warning");
        return;
      }
      if (exportFormat === "geojson") exportPositionsAsGeoJson(dev, positions);
      else if (exportFormat === "gpx") exportPositionsAsGpx(dev, positions);
      else exportPositionsAsCsv(dev, positions);
      addLog(`✔ Exported ${positions.length} points as ${exportFormat.toUpperCase()}.`, "ok");
      setView("main");
    } catch (err) {
      addLog(`⚠ Export failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setExportLoading(false);
    }
  }, [
    exportDeviceId,
    exportFrom,
    exportTo,
    exportFormat,
    devices,
    addLog,
  ]);

  // ─── Quick range shortcuts ────────────────────────────────────────────────────
  const setQuickRange = useCallback((hours: number) => {
    const now = new Date();
    const from = new Date(now.getTime() - hours * 3600_000);
    setExportFrom(from.toISOString().slice(0, 16));
    setExportTo(now.toISOString().slice(0, 16));
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────────

  const sortedDevices = [...devices].sort((a, b) => {
    if (a.status === "online" && b.status !== "online") return -1;
    if (a.status !== "online" && b.status === "online") return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div
      className="flex flex-col h-full"
      role="complementary"
      aria-label="Sillages panel"
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-1.5 border-b px-2.5 py-1.5">
        <Wifi className="size-4 text-primary" />
        <span className="flex-1 truncate text-sm font-semibold">
          Sillages – Live Tracking
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          onClick={() => setSillagesOpen(false)}
          aria-label="Close Sillages panel"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1.5">
        {/* Connect / Disconnect */}
        <Button
          size="sm"
          variant={connected ? "secondary" : "default"}
          className="h-7 gap-1 px-2 text-xs"
          disabled={connecting}
          onClick={connected ? doDisconnect : () => void doConnect()}
        >
          {connected ? (
            <WifiOff className="size-3.5" />
          ) : (
            <Wifi className="size-3.5" />
          )}
          {connecting ? "Connecting…" : connected ? "Disconnect" : "Connect"}
        </Button>

        {/* Refresh */}
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          disabled={!connected}
          title="Refresh device list"
          onClick={() => void doRefresh()}
        >
          <RefreshCw className="size-3.5" />
        </Button>

        {/* Live tracking */}
        <Button
          size="sm"
          variant={tracking ? "secondary" : "outline"}
          className="h-7 gap-1 px-2 text-xs"
          disabled={!connected}
          onClick={tracking ? doStopTracking : doStartTracking}
        >
          {tracking ? (
            <StopCircle className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
          {tracking ? "⏹ Stop" : "▶ Live"}
        </Button>

        {/* History export */}
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-xs"
          disabled={!connected}
          onClick={() => setView(view === "export" ? "main" : "export")}
        >
          <History className="size-3.5" />
          History
        </Button>

        <div className="flex-1" />

        {/* Settings */}
        <Button
          size="icon"
          variant={view === "settings" ? "secondary" : "ghost"}
          className="size-7"
          title="Settings"
          onClick={() => setView(view === "settings" ? "main" : "settings")}
        >
          <Settings className="size-3.5" />
        </Button>

        {/* Transport mode indicator */}
        {tracking && (
          <span
            className={cn(
              "rounded px-1 py-0.5 text-[9px] font-medium",
              transportMode === "websocket"
                ? "bg-blue-500/20 text-blue-400"
                : "bg-orange-500/20 text-orange-400",
            )}
            title={
              transportMode === "websocket"
                ? "WebSocket (real-time)"
                : "HTTP polling (5s)"
            }
          >
            {transportMode === "websocket" ? "WS" : "POLL"}
          </span>
        )}
      </div>

      {/* ── User info ──────────────────────────────────────────────────────── */}
      {connected && userInfo && (
        <div className="shrink-0 border-b px-3 py-1 text-[11px] text-muted-foreground">
          👤 {userInfo}
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {view === "settings" ? (
          <SettingsView
            draft={draftSettings}
            onChange={setDraftSettings}
            onSave={saveSettings}
            onCancel={() => setView("main")}
          />
        ) : view === "export" ? (
          <ExportView
            devices={sortedDevices}
            deviceId={exportDeviceId}
            onDeviceChange={setExportDeviceId}
            from={exportFrom}
            to={exportTo}
            format={exportFormat}
            loading={exportLoading}
            onFromChange={setExportFrom}
            onToChange={setExportTo}
            onFormatChange={setExportFormat}
            onQuickRange={setQuickRange}
            onExport={() => void doExport()}
            onCancel={() => setView("main")}
          />
        ) : (
          <DeviceListView
            devices={sortedDevices}
            connected={connected}
            onToggleVisible={toggleDeviceVisible}
            onShowAll={() => setAllVisible(true)}
            onHideAll={() => setAllVisible(false)}
            onClearTrack={clearTrack}
            onCentre={centreOnDevice}
            onColorChange={changeDeviceColor}
          />
        )}
      </div>

      {/* ── Status bar ─────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "shrink-0 border-t px-3 py-1 text-[11px]",
          statusColor,
        )}
      >
        {statusText}
      </div>

      {/* ── Log box ────────────────────────────────────────────────────────── */}
      <div
        ref={logBoxRef}
        className="h-[80px] shrink-0 overflow-y-auto rounded-b-lg bg-[#1e1e1e] px-2 py-1 font-mono text-[10px]"
        aria-label="Event log"
      >
        {logs.map((entry, i) => (
          <div key={i} className="leading-4">
            <span className="text-slate-500">[{entry.ts}]</span>{" "}
            <span className={LOG_COLORS[entry.level]}>{entry.message}</span>
          </div>
        ))}
        {logs.length === 0 && (
          <span className="text-slate-600">No events.</span>
        )}
      </div>
    </div>
  );
}

// ─── Device List View ─────────────────────────────────────────────────────────

interface DeviceListViewProps {
  devices: TraccarDeviceState[];
  connected: boolean;
  onToggleVisible: (id: number, visible: boolean) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  onClearTrack: (id: number) => void;
  onCentre: (id: number) => void;
  onColorChange: (id: number, color: string) => void;
}

function DeviceListView({
  devices,
  connected,
  onToggleVisible,
  onShowAll,
  onHideAll,
  onClearTrack,
  onCentre,
  onColorChange,
}: DeviceListViewProps) {
  if (!connected || devices.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-center text-sm italic text-muted-foreground">
          {!connected
            ? "No devices.\nConfigure the connection and press Connect."
            : "No devices found on server."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header row */}
      <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1">
        <span className="text-xs font-bold">Devices</span>
        <span className="text-[10px] text-muted-foreground">
          ({devices.length})
        </span>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          className="h-5 px-1.5 text-[10px]"
          onClick={onShowAll}
        >
          All ✓
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-5 px-1.5 text-[10px]"
          onClick={onHideAll}
        >
          None
        </Button>
      </div>

      {/* Device rows */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-px py-0.5">
          {devices.map((dev) => (
            <DeviceRow
              key={dev.id}
              device={dev}
              onToggleVisible={onToggleVisible}
              onClearTrack={onClearTrack}
              onCentre={onCentre}
              onColorChange={onColorChange}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Device Row ───────────────────────────────────────────────────────────────

interface DeviceRowProps {
  device: TraccarDeviceState;
  onToggleVisible: (id: number, visible: boolean) => void;
  onClearTrack: (id: number) => void;
  onCentre: (id: number) => void;
  onColorChange: (id: number, color: string) => void;
}

function DeviceRow({
  device,
  onToggleVisible,
  onClearTrack,
  onCentre,
  onColorChange,
}: DeviceRowProps) {
  const dotColor = STATUS_DOT[device.status] ?? STATUS_DOT.unknown;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-accent/50",
        !device.visible && "opacity-50",
      )}
    >
      {/* Status LED */}
      <span
        className={cn("size-2.5 shrink-0 rounded-full", dotColor)}
        title={device.status}
      />

      {/* Visibility toggle */}
      <button
        type="button"
        className="shrink-0 text-muted-foreground hover:text-foreground"
        title={device.visible ? "Hide" : "Show"}
        onClick={() => onToggleVisible(device.id, !device.visible)}
      >
        {device.visible ? (
          <CheckSquare className="size-3.5" />
        ) : (
          <Square className="size-3.5" />
        )}
      </button>

      {/* Track colour swatch — click to open native color picker */}
      <label
        className="shrink-0 cursor-pointer"
        title="Change track colour"
      >
        <span
          className="block size-3 rounded-sm border border-white/30"
          style={{ backgroundColor: device.trackColor }}
        />
        <input
          type="color"
          className="sr-only"
          value={device.trackColor}
          onChange={(e) => onColorChange(device.id, e.target.value)}
        />
      </label>

      {/* Name */}
      <span
        className={cn("flex-1 truncate", device.status === "online" && "font-medium")}
        title={device.name}
      >
        {device.name}
      </span>

      {/* Status text */}
      <span className="text-[10px] text-muted-foreground">{device.status}</span>

      {/* Centre button */}
      <button
        type="button"
        className="shrink-0 text-muted-foreground hover:text-foreground"
        title="Centre map on device"
        onClick={() => onCentre(device.id)}
      >
        📍
      </button>

      {/* Clear track */}
      <button
        type="button"
        className="shrink-0 text-muted-foreground hover:text-destructive"
        title="Clear track"
        onClick={() => onClearTrack(device.id)}
      >
        ⌫
      </button>
    </div>
  );
}

// ─── Settings View ────────────────────────────────────────────────────────────

interface SettingsViewProps {
  draft: SillagesSettings;
  onChange: (s: SillagesSettings) => void;
  onSave: () => void;
  onCancel: () => void;
}

function SettingsView({ draft, onChange, onSave, onCancel }: SettingsViewProps) {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-3">
        <p className="text-xs font-semibold">Traccar Server</p>

        <div className="space-y-1">
          <Label htmlFor="sill-url" className="text-[11px]">
            Server URL
          </Label>
          <Input
            id="sill-url"
            value={draft.serverUrl}
            placeholder="https://traccar.example.com"
            onChange={(e) => onChange({ ...draft, serverUrl: e.target.value })}
            className="h-7 text-xs"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="sill-user" className="text-[11px]">
            Username (e-mail)
          </Label>
          <Input
            id="sill-user"
            value={draft.username}
            placeholder="admin@example.com"
            autoComplete="username"
            onChange={(e) => onChange({ ...draft, username: e.target.value })}
            className="h-7 text-xs"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="sill-pass" className="text-[11px]">
            Password
          </Label>
          <Input
            id="sill-pass"
            type="password"
            value={draft.password}
            autoComplete="current-password"
            onChange={(e) => onChange({ ...draft, password: e.target.value })}
            className="h-7 text-xs"
          />
        </div>

        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={draft.autoConnect}
            onChange={(e) => onChange({ ...draft, autoConnect: e.target.checked })}
          />
          Auto-connect on startup
        </label>

        <hr className="border-border" />

        <p className="text-xs font-semibold">Default Track Settings</p>

        <div className="flex items-center gap-2">
          <Label htmlFor="sill-color" className="text-[11px] whitespace-nowrap">
            Colour (hex)
          </Label>
          <Input
            id="sill-color"
            value={draft.defaultTrackColor}
            placeholder="#0000FF"
            onChange={(e) =>
              onChange({ ...draft, defaultTrackColor: e.target.value })
            }
            className="h-7 flex-1 text-xs"
          />
          <span
            className="size-5 shrink-0 rounded border border-white/30"
            style={{ backgroundColor: draft.defaultTrackColor }}
          />
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="sill-width" className="text-[11px] whitespace-nowrap">
            Track width (px)
          </Label>
          <Input
            id="sill-width"
            type="number"
            min={1}
            max={20}
            value={draft.defaultTrackWidth}
            onChange={(e) =>
              onChange({ ...draft, defaultTrackWidth: Number(e.target.value) })
            }
            className="h-7 w-16 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="sill-maxpts" className="text-[11px] whitespace-nowrap">
            Max track length
          </Label>
          <Input
            id="sill-maxpts"
            type="number"
            min={10}
            max={10000}
            step={50}
            value={draft.defaultTrackMaxPoints}
            onChange={(e) =>
              onChange({
                ...draft,
                defaultTrackMaxPoints: Number(e.target.value),
              })
            }
            className="h-7 w-20 text-xs"
          />
          <span className="text-[10px] text-muted-foreground">pts</span>
        </div>

        <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] text-amber-300">
          <strong>CORS note:</strong> The Traccar server must allow requests from
          this origin. If the connection fails with a network error, configure{" "}
          <code>allowedOrigins</code> in your Traccar{" "}
          <code>conf/traccar.xml</code>, or run Traccar on the same host as this
          app.
        </div>

        <div className="flex gap-2">
          <Button size="sm" className="h-7 flex-1 text-xs" onClick={onSave}>
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
}

// ─── Export View ──────────────────────────────────────────────────────────────

interface ExportViewProps {
  devices: TraccarDeviceState[];
  deviceId: number | null;
  from: string;
  to: string;
  format: "geojson" | "gpx" | "csv";
  loading: boolean;
  onDeviceChange: (id: number | null) => void;
  onFromChange: (s: string) => void;
  onToChange: (s: string) => void;
  onFormatChange: (f: "geojson" | "gpx" | "csv") => void;
  onQuickRange: (hours: number) => void;
  onExport: () => void;
  onCancel: () => void;
}

function ExportView({
  devices,
  deviceId,
  from,
  to,
  format,
  loading,
  onDeviceChange,
  onFromChange,
  onToChange,
  onFormatChange,
  onQuickRange,
  onExport,
  onCancel,
}: ExportViewProps) {
  const sortedByName = [...devices].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-3">
        <p className="text-xs font-semibold">Export Historic Track</p>

        {/* Device */}
        <div className="space-y-1">
          <Label className="text-[11px]">Device</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
            value={deviceId ?? ""}
            onChange={(e) =>
              onDeviceChange(e.target.value ? Number(e.target.value) : null)
            }
          >
            {sortedByName.map((d) => (
              <option key={d.id} value={d.id}>
                [{d.status}] {d.name}
              </option>
            ))}
          </select>
        </div>

        {/* Time range */}
        <div className="space-y-1">
          <Label className="text-[11px]">Time Range (UTC)</Label>
          <div className="flex gap-1.5">
            <Input
              type="datetime-local"
              value={from}
              onChange={(e) => onFromChange(e.target.value)}
              className="h-7 flex-1 text-xs"
            />
          </div>
          <div className="flex gap-1.5">
            <Input
              type="datetime-local"
              value={to}
              onChange={(e) => onToChange(e.target.value)}
              className="h-7 flex-1 text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {[
              ["1h", 1],
              ["6h", 6],
              ["24h", 24],
              ["7d", 168],
            ].map(([label, hours]) => (
              <Button
                key={label}
                size="sm"
                variant="outline"
                className="h-5 px-1.5 text-[10px]"
                onClick={() => onQuickRange(hours as number)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {/* Format */}
        <div className="space-y-1">
          <Label className="text-[11px]">Format</Label>
          <div className="flex gap-3 text-xs">
            {(["geojson", "gpx", "csv"] as const).map((f) => (
              <label key={f} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  checked={format === f}
                  onChange={() => onFormatChange(f)}
                />
                {f.toUpperCase()}
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-7 flex-1 text-xs"
            disabled={loading || deviceId === null}
            onClick={onExport}
          >
            {loading ? "Downloading…" : "⬇ Export"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
}
