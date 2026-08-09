interface KnowledgeCardConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/**
 * Optional consent dialog shim for web-only builds.
 */
export function KnowledgeCardConsentDialog(_props: KnowledgeCardConsentDialogProps) {
  return null;
}
