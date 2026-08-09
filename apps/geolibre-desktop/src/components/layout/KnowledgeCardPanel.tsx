export interface KnowledgePlace {
  lat: number;
  lng: number;
}

interface KnowledgeCardPanelProps {
  place: KnowledgePlace | null;
  lang: string;
  onClose: () => void;
  onFlyTo: (lat: number, lon: number) => void;
}

/**
 * Optional knowledge-card panel shim for web-only builds.
 */
export function KnowledgeCardPanel(_props: KnowledgeCardPanelProps) {
  return null;
}
