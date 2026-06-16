import { DesktopShell } from "./components/layout/DesktopShell";
import { useDesktopSettingsPersistence } from "./hooks/useDesktopSettings";
import { useSillagesSettingsPersistence } from "./hooks/useSillagesSettings";
import { useLayoutOptions } from "./hooks/useLayoutOptions";
import { useProjectUrlLoader } from "./hooks/useProjectUrlLoader";
import { useRecentProjectsPersistence } from "./hooks/useRecentProjectsPersistence";
import { useRuntimeEnvironmentVariables } from "./hooks/useRuntimeEnvironmentVariables";
import { useThemeMode } from "./hooks/useThemeMode";
import { useUndoRedoShortcuts } from "./hooks/useUndoRedoShortcuts";

export default function App() {
  const layoutOptions = useLayoutOptions();
  const { themeMode, toggleThemeMode } = useThemeMode();
  const projectUrlLoadState = useProjectUrlLoader();

  useDesktopSettingsPersistence();
  useSillagesSettingsPersistence();
  useRecentProjectsPersistence();
  useRuntimeEnvironmentVariables();
  useUndoRedoShortcuts();
  return (
    <DesktopShell
      layoutOptions={layoutOptions}
      projectUrlLoadState={projectUrlLoadState}
      themeMode={themeMode}
      onToggleThemeMode={toggleThemeMode}
    />
  );
}
