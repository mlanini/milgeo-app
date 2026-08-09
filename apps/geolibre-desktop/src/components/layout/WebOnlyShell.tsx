import { MapCanvas } from "@geolibre/map";
import type { ThemeMode } from "../../hooks/useThemeMode";

interface WebOnlyShellProps {
  themeMode: ThemeMode;
  onToggleThemeMode: () => void;
}

/**
 * Minimal map-first shell for the web-only repository variant.
 *
 * This intentionally avoids the DesktopShell dependency graph, which references
 * desktop-only and not-yet-migrated UI modules in this trimmed repo.
 */
export function WebOnlyShell({ themeMode, onToggleThemeMode }: WebOnlyShellProps) {
  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 flex-col bg-background">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-sm font-semibold">MilGeo.app</div>
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs hover:bg-accent"
          onClick={onToggleThemeMode}
          aria-label="Toggle theme"
        >
          {themeMode === "dark" ? "Light" : "Dark"}
        </button>
      </header>
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <MapCanvas />
      </main>
    </div>
  );
}
