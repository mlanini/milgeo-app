/**
 * Ambient type declaration for the `mgrs` package (no bundled types).
 * https://github.com/proj4js/mgrs
 */
declare module "mgrs" {
  /** Convert [lon, lat] (WGS-84) to an MGRS string. accuracy = digits (0-5). */
  export function forward(lonlat: [number, number], accuracy?: number): string;
  /** Convert an MGRS string to a bbox [west, south, east, north]. */
  export function inverse(mgrs: string): [number, number, number, number];
  /** Convert an MGRS string to a centre point [lon, lat] (WGS-84). */
  export function toPoint(mgrs: string): [number, number];

  const _default: {
    forward: typeof forward;
    inverse: typeof inverse;
    toPoint: typeof toPoint;
  };
  export default _default;
}
