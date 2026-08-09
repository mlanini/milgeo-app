/**
 * Quote a CSV cell according to RFC4180 escaping rules.
 */
export function csvCell(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}
