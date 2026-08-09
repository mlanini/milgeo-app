import * as duckdb from "@duckdb/duckdb-wasm";

/**
 * Select a DuckDB WASM bundle compatible with the current environment.
 */
export async function selectDuckDbBundle(): Promise<duckdb.DuckDBBundles[duckdb.DuckDBBundleName]> {
  const bundles = duckdb.getJsDelivrBundles();
  return duckdb.selectBundle(bundles);
}
