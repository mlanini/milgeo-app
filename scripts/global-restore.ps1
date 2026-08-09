Set-Location c:/Temp/milgeo-app

$milgeoProtected = [System.Collections.Generic.HashSet[string]]@(
  "apps/geolibre-desktop/src/components/layout/AboutDialog.tsx",
  "apps/geolibre-desktop/src/components/layout/PrivacyNoticeDialog.tsx",
  "apps/geolibre-desktop/src/components/layout/TopToolbar.tsx",
  "apps/geolibre-desktop/src/components/map/MilSymbolRenderer.tsx",
  "apps/geolibre-desktop/src/components/panels/MilGeoWorkspacePanel.tsx",
  "apps/geolibre-desktop/src/components/panels/MilLayerPanel.tsx",
  "apps/geolibre-desktop/src/components/panels/MilSymbolEditor.tsx",
  "apps/geolibre-desktop/src/components/panels/MilSymbolPanel.tsx",
  "apps/geolibre-desktop/src/components/panels/MilTacticalGraphicsTab.tsx",
  "apps/geolibre-desktop/src/components/panels/OrbatPanel.tsx",
  "apps/geolibre-desktop/src/components/sillages/SillagesPanel.tsx",
  "apps/geolibre-desktop/src/hooks/useMilLayerStore.ts",
  "apps/geolibre-desktop/src/hooks/useMilSymbol.ts",
  "apps/geolibre-desktop/src/hooks/usePlugins.ts",
  "apps/geolibre-desktop/src/hooks/useSillagesSettings.ts",
  "apps/geolibre-desktop/src/lib/assistant/agent.ts",
  "apps/geolibre-desktop/src/lib/field-collection.ts",
  "apps/geolibre-desktop/src/lib/mil-export-json.ts",
  "apps/geolibre-desktop/src/lib/mil-export-kmz.ts",
  "apps/geolibre-desktop/src/lib/mil-export-milx.ts",
  "apps/geolibre-desktop/src/lib/mil-sidc.ts",
  "apps/geolibre-desktop/src/lib/milgraphic-layer-source.ts",
  "apps/geolibre-desktop/src/lib/milsymbol-catalog.ts",
  "apps/geolibre-desktop/src/lib/milsymbol-export-formats.ts",
  "apps/geolibre-desktop/src/lib/milsymbol-export.ts",
  "apps/geolibre-desktop/src/lib/milsymbol-import-milsymb.ts",
  "apps/geolibre-desktop/src/lib/milsymbol-import-milx.ts",
  "apps/geolibre-desktop/src/lib/milsymbol-import-to-store.ts",
  "apps/geolibre-desktop/src/lib/milsymbol-import.ts",
  "apps/geolibre-desktop/src/lib/milsymbol-layer-source.ts",
  "apps/geolibre-desktop/src/lib/milsymbol-modifier-labels.json",
  "apps/geolibre-desktop/src/lib/qgis-milx-layer-mapping.ts",
  "apps/geolibre-desktop/src/lib/qgis-project-import.ts",
  "apps/geolibre-desktop/src/lib/time-slider-state.ts",
  "apps/geolibre-desktop/src/lib/traccar-client.ts",
  "apps/geolibre-desktop/src/lib/traccar-layer.ts"
)

$allChanged = git diff --name-only upstream/main -- `
  apps/geolibre-desktop/src/lib/ `
  apps/geolibre-desktop/src/hooks/ `
  apps/geolibre-desktop/src/components/

$toCheck = $allChanged | Where-Object { $_ -ne '' -and -not $milgeoProtected.Contains($_) }

Write-Output "=== Checking $($toCheck.Count) candidates against upstream ==="

$toRestore = [System.Collections.Generic.List[string]]::new()
foreach ($f in $toCheck) {
    $type = (git cat-file -t "upstream/main:$f" 2>&1)
    if ($type -eq "blob") {
        $toRestore.Add($f)
    }
}

Write-Output "=== Restoring $($toRestore.Count) files from upstream ==="
$toRestore | ForEach-Object { Write-Output "  $_" }

if ($toRestore.Count -gt 0) {
    # Pass file list to git checkout via temp file (avoids argument length limits)
    $tmpFile = [System.IO.Path]::GetTempFileName()
    $toRestore | Set-Content $tmpFile
    git checkout upstream/main -- $(Get-Content $tmpFile)
    Remove-Item $tmpFile
    Write-Output "=== RESTORE DONE ==="
}
