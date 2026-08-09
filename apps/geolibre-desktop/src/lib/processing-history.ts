export interface BeginProcessingRunInput {
  kind: string;
  toolId: string;
  toolName: string;
  engine: string;
  parameters: Record<string, unknown>;
}

export interface ProcessingRunTracker {
  addOutputLayer: (name: string) => void;
  finish: (status: "success" | "error", message?: string) => void;
}

/**
 * Processing-history shim for web-only builds.
 */
export function beginProcessingRun(_input: BeginProcessingRunInput): ProcessingRunTracker {
  return {
    addOutputLayer: () => {},
    finish: () => {},
  };
}
