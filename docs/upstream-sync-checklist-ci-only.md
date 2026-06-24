# Upstream Sync Checklist (CI-only)

Versione operativa per ambienti dove `node`/`npm` non sono eseguibili localmente (GPO).

Obiettivo: riallineare MilGeo a `opengeos/GeoLibre` usando **solo Git in locale** e validazione tecnica via **GitHub Actions / CI**.

---

## 0) Prerequisiti

- [ ] Working tree pulita (`git status`)
- [ ] Accesso push a `origin`
- [ ] `upstream` configurato su `https://github.com/opengeos/GeoLibre.git`
- [ ] Pipeline CI attiva su PR (build/test/check rust)
- [ ] Branch protection attiva: merge solo con check verdi

```powershell
git status
git remote -v
```

---

## 1) Backup e branch di lavoro

- [ ] Allinea `main` locale
- [ ] Crea tag di backup
- [ ] Crea branch di sync

```powershell
git checkout main
git pull --ff-only origin main
$today = Get-Date -Format "yyyyMMdd"
$syncBranch = "sync/upstream-align-ci-$today"
$backupTag = "backup/pre-sync-main-ci-$today"

git tag $backupTag
git push origin $backupTag

git checkout -b $syncBranch
```

---

## 2) Fetch completo e snapshot divergenza

- [ ] Fetch di tutti i remoti
- [ ] Report divergenza salvato in `tmp/`

```powershell
git remote add upstream https://github.com/opengeos/GeoLibre.git 2>$null
git remote set-url upstream https://github.com/opengeos/GeoLibre.git
git fetch --all --prune

New-Item -ItemType Directory -Force .\tmp | Out-Null

git log --left-right --cherry-pick --oneline upstream/main...origin/main |
  Out-File -Encoding utf8 .\tmp\sync-left-right-ci.log

git range-diff upstream/main...origin/main |
  Out-File -Encoding utf8 .\tmp\sync-range-diff-ci.log
```

---

## 3) Classificazione commit MilGeo

- [ ] Raggruppa SHA in ordine cronologico:
  - `BRAND`
  - `MILSYMB`
  - `SILLAGE`
  - `ANALYSIS`
- [ ] Marca SHA già upstream in `DROP_OR_ALREADY_UPSTREAM`

```powershell
@"
# Commit da cherry-pick (ordine cronologico)
[BRAND]

[MILSYMB]

[SILLAGE]

[ANALYSIS]

[DROP_OR_ALREADY_UPSTREAM]
"@ | Out-File -Encoding utf8 .\tmp\sync-commit-groups-ci.txt
```

---

## 4) Rebuild da upstream/main

- [ ] Riparti da base pulita upstream
- [ ] Abilita `rerere` per conflitti ripetuti

```powershell
git checkout -B $syncBranch upstream/main
git config rerere.enabled true
```

---

## 5) Cherry-pick selettivo (con tracciabilità)

Ordine raccomandato:
1. `BRAND`
2. `MILSYMB`
3. `SILLAGE`
4. `ANALYSIS`

- [ ] Applica commit con `-x`
- [ ] Risolvi conflitti e continua

```powershell
# Esempio
git cherry-pick -x <sha_brand_1> <sha_brand_2>
git cherry-pick -x <sha_milsymb_1> <sha_milsymb_2>
git cherry-pick -x <sha_sillage_1>
git cherry-pick -x <sha_analysis_1> <sha_analysis_2>

# In caso di conflitto
git status
git add -A
git cherry-pick --continue

# Se commit non più applicabile
git cherry-pick --skip
```

Policy conflitti:
- Brand/UI copy: tieni MilGeo
- Core logic condivisa: preferisci upstream + reintegra solo delta necessario
- Evita refactor extra durante la sync

---

## 6) Push e PR tecnica (gate CI)

- [ ] Push branch
- [ ] Apri PR verso `main`
- [ ] Aspetta check CI

```powershell
git push -u origin $syncBranch
```

Template descrizione PR:

- Strategia: `upstream/main` + cherry-pick selettivo
- Scope: BRAND, MILSYMB, SILLAGE, ANALYSIS
- Esclusioni: commit già upstream / drop
- Rischi noti: aree conflitto principali
- Rollback: tag backup

---

## 7) Validazione esclusiva via CI (nessun npm locale)

- [ ] CI passa su build/test/check
- [ ] Nessun merge con check rossi
- [ ] Se fallisce, correggi con nuovi commit sullo stesso branch

Loop operativo:
1. Leggi log CI
2. Applica fix mirato
3. `git push`
4. Riesegui CI

---

## 8) Verifica finale delta intenzionale

- [ ] Confronta branch finale con upstream
- [ ] Assicurati che resti solo differenza voluta

```powershell
git log --oneline upstream/main..HEAD

git diff --name-status upstream/main..HEAD |
  Out-File -Encoding utf8 .\tmp\sync-final-diff-files-ci.txt
```

---

## 9) Merge, tag e routine futura

- [ ] Merge PR solo dopo check verdi
- [ ] Tag post-sync
- [ ] Definisci sync periodica (mensile/quindicinale)

```powershell
$releaseTag = "sync/aligned-$(Get-Date -Format 'yyyyMMdd')"
git checkout main
git pull --ff-only origin main
git tag $releaseTag
git push origin $releaseTag
```

---

## 10) Rollback emergenza

```powershell
git checkout main
git reset --hard $backupTag
git push --force-with-lease origin main
```

Usare solo con team allineato e comunicazione esplicita.

---

## Note pratiche (CI-only)

- Se non puoi usare `gh` CLI, apri la PR via interfaccia GitHub web.
- Se anche strumenti locali aggiuntivi sono bloccati, limita il flusso a `git` + web UI.
- Mantieni i report `tmp/*.log` e `tmp/*groups*.txt` allegabili alla PR come audit trail.
