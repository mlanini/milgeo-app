export interface RasterInfo {
  width?: number;
  height?: number;
  bands?: number;
  crs?: string | null;
  pixelSizeX?: number | null;
  pixelSizeY?: number | null;
}

/**
 * Lightweight metadata shim; returns unknown raster info in web-only variant.
 */
export async function readRasterInfo(_url: string): Promise<RasterInfo> {
  return {};
}
