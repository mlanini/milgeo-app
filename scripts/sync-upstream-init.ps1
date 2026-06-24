#Requires -Version 5.0
<#
.SYNOPSIS
    Upstream Sync Initialization Script (CI-only mode)
    Automatizza fasi 1-2 della checklist CI-only:
    - Backup main
    - Crea branch di sync
    - Configura/verifica upstream remote
    - Fetch completo
    - Genera snapshot divergenza

.DESCRIPTION
    Prepara l'ambiente per cherry-pick selettivo senza richiedere npm/node.
    Output: reports in tmp/ pronti per analisi manuale e PR description.

.EXAMPLE
    .\scripts\sync-upstream-init.ps1
#>

param(
    [string]$UpstreamUrl = "https://github.com/opengeos/GeoLibre.git",
    [string]$OutputDir = "tmp"
)

$ErrorActionPreference = "Stop"
$WarningPreference = "Continue"

function Write-Header {
    param([string]$Text)
    Write-Host "`n=====================================" -ForegroundColor Cyan
    Write-Host $Text -ForegroundColor Cyan
    Write-Host "=====================================" -ForegroundColor Cyan
}

function Write-Step {
    param([string]$Text)
    Write-Host "→ $Text" -ForegroundColor Green
}

function Write-Error {
    param([string]$Text)
    Write-Host "✗ $Text" -ForegroundColor Red
    throw $Text
}

# 0) Verifica prerequisiti
Write-Header "PREREQUISITI"

Write-Step "Controllo git status..."
$status = git status --porcelain
if ($status) {
    Write-Error "Working tree non pulita. Commit o stash le modifiche:`n$status"
}
Write-Step "Working tree OK"

Write-Step "Verifica remoti..."
git remote -v | Out-Host

# 1) BACKUP e BRANCH
Write-Header "BACKUP E BRANCH DI SYNC"

$today = Get-Date -Format "yyyyMMdd"
$syncBranch = "sync/upstream-align-ci-$today"
$backupTag = "backup/pre-sync-main-ci-$today"

Write-Step "Allineamento main locale..."
git checkout main
git pull --ff-only origin main

Write-Step "Creazione tag backup: $backupTag"
git tag $backupTag
git push origin $backupTag

Write-Step "Creazione branch: $syncBranch"
git checkout -b $syncBranch

Write-Host "Branch info:" -ForegroundColor Yellow
git branch -v | grep -E "^\*|sync|main" | Out-Host

# 2) CONFIGURAZIONE UPSTREAM
Write-Header "CONFIGURAZIONE UPSTREAM"

Write-Step "Aggiunta/verifica remote upstream..."
git remote add upstream $UpstreamUrl 2>$null
git remote set-url upstream $UpstreamUrl

Write-Host "Remoti attuali:" -ForegroundColor Yellow
git remote -v | Out-Host

# 3) FETCH COMPLETO
Write-Header "FETCH COMPLETO"

Write-Step "git fetch --all --prune..."
git fetch --all --prune

Write-Host "Verif ultimi commit:" -ForegroundColor Yellow
git log -1 --oneline upstream/main
git log -1 --oneline origin/main

# 4) SNAPSHOT DIVERGENZA
Write-Header "SNAPSHOT DIVERGENZA"

Write-Step "Creazione directory output: $OutputDir"
New-Item -ItemType Directory -Force $OutputDir | Out-Null

$logLeftRight = Join-Path $OutputDir "sync-left-right-ci-$today.log"
$rangediff = Join-Path $OutputDir "sync-range-diff-ci-$today.log"
$commitGroups = Join-Path $OutputDir "sync-commit-groups-ci-$today.txt"
$sessionLog = Join-Path $OutputDir "sync-init-session-$today.log"

Write-Step "Generazione log divergenza..."
Write-Host "→ $logLeftRight"
git log --left-right --cherry-pick --oneline upstream/main...origin/main |
    Out-File -Encoding utf8 $logLeftRight

Write-Step "Generazione range-diff..."
Write-Host "→ $rangediff"
git range-diff upstream/main...origin/main |
    Out-File -Encoding utf8 $rangediff

Write-Step "Template commit groups..."
Write-Host "→ $commitGroups"
@"
# Commit da cherry-pick (ordine cronologico)
# Compila manualmente basandoti su sync-left-right-ci-$today.log

[BRAND]
# SHA brand-only commits here


[MILSYMB]
# SHA milsymb commits here


[SILLAGE]
# SHA sillage commits here


[ANALYSIS]
# SHA analysis commits here


[DROP_OR_ALREADY_UPSTREAM]
# SHA da escludere o già presenti in upstream


"@ | Out-File -Encoding utf8 $commitGroups

# 5) RIEPILOGO OPERATIVO
Write-Header "RIEPILOGO"

Write-Host @"
✓ Backup tag:       $backupTag
✓ Branch sync:      $syncBranch
✓ Upstream URL:     $UpstreamUrl

Output generati (tmp/):
  • sync-left-right-ci-$today.log       ← divergenza (cherry-pick marker)
  • sync-range-diff-ci-$today.log       ← confronto commit equivalenti
  • sync-commit-groups-ci-$today.txt    ← template classification

Prossimi passi:
  1. Apri: $commitGroups
  2. Compila manualmente i 4 gruppi [BRAND], [MILSYMB], [SILLAGE], [ANALYSIS]
  3. Esegui passaggio 5 della checklist: cherry-pick per gruppi

Rollback (se necessario):
  git checkout main
  git reset --hard $backupTag

"@ -ForegroundColor Green

Write-Host "Verif stato attuale:" -ForegroundColor Yellow
git status

Write-Step "INIT COMPLETATO. Branch pronto per cherry-pick."
