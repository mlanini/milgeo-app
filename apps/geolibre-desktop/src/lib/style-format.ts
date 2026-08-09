/**
 * Heuristic check for QML style XML content.
 */
export function isQmlStyleXml(xml: string): boolean {
  return /<qgis\b/i.test(xml) || /<renderer-v2\b/i.test(xml);
}
