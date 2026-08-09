import { WebOnlyShell } from "./components/layout/WebOnlyShell";
import { OnboardingDialog } from "./components/layout/OnboardingDialog";
import { UpdateNotificationModal } from "./components/layout/UpdateNotificationModal";
import { useDesktopSettingsPersistence } from "./hooks/useDesktopSettings";
import { useBeforeUnloadGuard } from "./hooks/useBeforeUnloadGuard";
import { useRecentProjectsPersistence } from "./hooks/useRecentProjectsPersistence";
import { useRuntimeEnvironmentVariables } from "./hooks/useRuntimeEnvironmentVariables";
import { useStartupUpdateCheck } from "./hooks/useStartupUpdateCheck";
import { useThemeMode } from "./hooks/useThemeMode";
import { useThemeScheme } from "./hooks/useThemeScheme";
import { useUiProfileBootstrap } from "./hooks/useUiProfileBootstrap";
import { useUndoRedoShortcuts } from "./hooks/useUndoRedoShortcuts";

export default function App() {
  const { themeMode, toggleThemeMode } = useThemeMode();
  const { showOnboarding, dismissOnboarding } = useUiProfileBootstrap();
  const {
    pending: pendingUpdate,
    remindLater,
    skipVersion,
  } = useStartupUpdateCheck();

  useDesktopSettingsPersistence();
  useThemeScheme();
  useRecentProjectsPersistence();
  useRuntimeEnvironmentVariables();
  useUndoRedoShortcuts();
  useBeforeUnloadGuard();
  return (
    <>
      <WebOnlyShell themeMode={themeMode} onToggleThemeMode={toggleThemeMode} />
      <OnboardingDialog open={showOnboarding} onClose={dismissOnboarding} />
      <UpdateNotificationModal
        pending={pendingUpdate}
        onRemindLater={remindLater}
        onSkipVersion={skipVersion}
      />
    </>
  );
}
