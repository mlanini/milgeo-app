import { invoke } from "@tauri-apps/api/core";
import i18next from "i18next";
import { IS_MAS_BUILD } from "./build-flags";
import { isTauri } from "./is-tauri";

/**
 * Connection details for the desktop JupyterLab server, returned by the Tauri
 * `start_jupyter_server` command. The server is uv-managed (like the FastAPI
 * sidecar) and bound to loopback; `token` authenticates the embedded iframe.
 */
export interface JupyterServerInfo {
  /** Base URL, e.g. `http://127.0.0.1:8766`. */
  url: string;
  port: number;
  /** Auth token to append as `?token=…` to the embedded URL. */
  token: string;
}

let liveServer: JupyterServerInfo | null = null;
const serverListeners = new Set<(info: JupyterServerInfo | null) => void>();

export function getJupyterServer(): JupyterServerInfo | null {
  return liveServer;
}

export function subscribeJupyterServer(
  listener: (info: JupyterServerInfo | null) => void,
): () => void {
  serverListeners.add(listener);
  listener(liveServer);
  return () => {
    serverListeners.delete(listener);
  };
}

function setJupyterServer(info: JupyterServerInfo | null): void {
  liveServer = info;
  for (const listener of serverListeners) listener(info);
}

/**
 * Start (or reuse) the desktop JupyterLab server. Desktop-only — the web build
 * embeds the self-hosted JupyterLite site instead.
 */
export async function startJupyterServer(): Promise<JupyterServerInfo> {
  assertJupyterAllowed();
  const info = await invoke<JupyterServerInfo>("start_jupyter_server");
  setJupyterServer(info);
  return info;
}

/** Stop the desktop JupyterLab server if it is running. */
export async function stopJupyterServer(): Promise<void> {
  if (IS_MAS_BUILD) return;
  assertJupyterAllowed();
  await invoke("stop_jupyter_server");
  setJupyterServer(null);
}

function assertJupyterAllowed(): void {
  if (IS_MAS_BUILD) {
    throw new Error(i18next.t("masBuild.unavailable"));
  }
  if (!isTauri()) {
    throw new Error("Running a Jupyter server requires GeoLibre Desktop.");
  }
}
