interface ComputeRowSelectionArgs {
  featureId: string;
  sortedIds: string[];
  selectedIds: string[];
  anchorId: string | null;
  additive: boolean;
  range: boolean;
}

interface ComputeRowSelectionResult {
  ids: string[];
  anchor: string | null;
}

/**
 * Basic row selection helper (plain/cmd-ctrl/shift).
 */
export function computeRowSelection(args: ComputeRowSelectionArgs): ComputeRowSelectionResult {
  const { featureId, sortedIds, selectedIds, anchorId, additive, range } = args;

  if (range && sortedIds.length > 0) {
    const startId = anchorId ?? featureId;
    const a = sortedIds.indexOf(startId);
    const b = sortedIds.indexOf(featureId);
    if (a >= 0 && b >= 0) {
      const [start, end] = a <= b ? [a, b] : [b, a];
      const rangeIds = sortedIds.slice(start, end + 1);
      if (additive) {
        const merged = new Set<string>([...selectedIds, ...rangeIds]);
        return { ids: Array.from(merged), anchor: startId };
      }
      return { ids: rangeIds, anchor: startId };
    }
  }

  if (additive) {
    const set = new Set<string>(selectedIds);
    if (set.has(featureId)) set.delete(featureId);
    else set.add(featureId);
    return { ids: Array.from(set), anchor: featureId };
  }

  return { ids: [featureId], anchor: featureId };
}
