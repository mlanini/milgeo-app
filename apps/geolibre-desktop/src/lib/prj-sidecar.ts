import type { DuckDbVectorFile } from "./duckdb-vector-loader";

/**
 * PRJ sidecar CRS extraction shim.
 */
export function prjSidecarCrs(_file: DuckDbVectorFile): string | null {
  return null;
}
