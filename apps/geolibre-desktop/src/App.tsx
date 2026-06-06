import { DesktopShell } from "./components/layout/DesktopShell";
import { useDesktopSettingsPersistence } from "./hooks/useDesktopSettings";
import { useSillagesSettingsPersistence } from "./hooks/useSillagesSettings";
import { useLayoutOptions } from "./hooks/useLayoutOptions";
import { useProjectUrlLoader } from "./hooks/useProjectUrlLoader";
import { useRecentProjectsPersistence } from "./hooks/useRecentProjectsPersistence";
import { useRuntimeEnvironmentVariables } from "./hooks/useRuntimeEnvironmentVariables";
import { useThemeMode } from "./hooks/useThemeMode";

export default function App() {
  const layoutOptions = useLayoutOptions();
  const { themeMode, toggleThemeMode } = useThemeMode();
  const projectUrlLoadState = useProjectUrlLoader();

  useDesktopSettingsPersistence();
  useSillagesSettingsPersistence();
  useRecentProjectsPersistence();
  useRuntimeEnvironmentVariables();
  return (
    <DesktopShell
      layoutOptions={layoutOptions}
      projectUrlLoadState={projectUrlLoadState}
      themeMode={themeMode}
      onToggleThemeMode={toggleThemeMode}
    />
  );
}
