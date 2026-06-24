# Upstream Sync Checklist (GeoLibre → MilGeo)

Checklist eseguibile per riallineare il fork a `opengeos/GeoLibre` preservando:
- brand MilGeo.app
- differenze funzionali (MilSymb, Sillage, Analysis)
- tracciabilità dei commit MilGeo

> Target: ricostruire `main` MilGeo sopra `upstream/main` con cherry-pick selettivo.

---

## 0) Prerequisiti

- [ ] Working tree pulita (`git status` senza modifiche locali)
- [ ] Accesso push su `origin` (MilGeo)
- [ ] Remote `upstream` configurato su `https://github.com/opengeos/GeoLibre.git`
- [ ] Node/npm installati (Node 22+ consigliato da repo)

Comandi:

```powershell
git status
```

---

## 1) Safety first (backup)

- [ ] Crea tag di backup dell’attuale `main`
- [ ] Crea branch di lavoro per sync

```powershell
git checkout main
git pull --ff-only origin main
$today = Get-Date -Format "yyyyMMdd"
$syncBranch = "sync/upstream-align-$today"
$backupTag = "backup/pre-sync-main-$today"

git tag $backupTag
git push origin $backupTag

git checkout -b $syncBranch
```

---

## 2) Verifica remoti + fetch completo

- [ ] `origin` punta a `mlanini/milgeo-app`
- [ ] `upstream` punta a `opengeos/GeoLibre`
- [ ] Fetch completo con prune

```powershell
git remote -v

git remote add upstream https://github.com/opengeos/GeoLibre.git 2>$null
# Se upstream esiste già, il comando sopra può fallire: è OK.

git remote set-url upstream https://github.com/opengeos/GeoLibre.git
git fetch --all --prune
```

---

## 3) Fotografare la divergenza

- [ ] Genera log divergenza sintetico
- [ ] Genera range-diff per trovare commit equivalenti/rinominati
- [ ] Salva report locale (audit)

```powershell
New-Item -ItemType Directory -Force .\tmp | Out-Null

git log --left-right --cherry-pick --oneline upstream/main...origin/main |
  Out-File -Encoding utf8 .\tmp\sync-left-right.log

git range-diff upstream/main...origin/main |
  Out-File -Encoding utf8 .\tmp\sync-range-diff.log
```

---

## 4) Classificazione commit MilGeo (obbligatoria)

- [ ] Crea 4 gruppi commit:
  - `BRAND`
  - `MILSYMB`
  - `SILLAGE`
  - `ANALYSIS`
- [ ] Elenca SHA in ordine cronologico (dal più vecchio al più nuovo)
- [ ] Escludi commit già equivalenti in upstream

Template file da compilare:

```powershell
@"
# Commit da cherry-pick (ordine cronologico)
[BRAND]

[MILSYMB]

[SILLAGE]

[ANALYSIS]

[DROP_OR_ALREADY_UPSTREAM]
"@ | Out-File -Encoding utf8 .\tmp\sync-commit-groups.txt
```

---

## 5) (Opzionale ma consigliato) pulizia patch stack su branch intermedio

Usa questo step se hai commit “misti” (feature + refactor + brand nello stesso commit).

- [ ] Crea branch di preparazione
- [ ] Rebase interattivo per split/squash/fixup
- [ ] Rigenera lista SHA per i 4 gruppi

```powershell
git checkout -b prep/milgeo-patchstack origin/main
# scegli un base appropriato rispetto alla divergenza:
git rebase -i --rebase-merges upstream/main
```

---

## 6) Ricostruzione: nuovo branch basato su upstream/main

- [ ] Crea branch clean da upstream/main

```powershell
git checkout -B $syncBranch upstream/main
```

---

## 7) Cherry-pick selettivo per gruppi (con tracciabilità)

Ordine consigliato:
1. BRAND
2. MILSYMB
3. SILLAGE
4. ANALYSIS

- [ ] Applica ogni gruppo in blocco
- [ ] Usa `-x` per mantenere riferimento SHA originale
- [ ] Risolvi conflitti a ogni commit

Esempio (sostituisci SHA):

```powershell
# BRAND
git cherry-pick -x <sha1> <sha2> <sha3>

# MILSYMB
git cherry-pick -x <sha4> <sha5>

# SILLAGE
git cherry-pick -x <sha6> <sha7>

# ANALYSIS
git cherry-pick -x <sha8> <sha9>
```

Per migliorare la risoluzione conflitti ripetuti:

```powershell
git config rerere.enabled true
```

Se un commit non è più applicabile perché superseded da upstream:

```powershell
git cherry-pick --skip
```

Se vuoi annullare il commit corrente in conflitto:

```powershell
git cherry-pick --abort
```

---

## 8) Policy conflitti (da applicare sempre)

- [ ] File di brand/UI copy: preferisci variante MilGeo
- [ ] Core logic condivisa: preferisci upstream, poi reintroduci solo delta MilGeo
- [ ] Evita refactor extra non necessari durante il sync
- [ ] Dopo ogni conflitto risolto: commit del cherry-pick e avanti

Comandi utili:

```powershell
git status
git add -A
git cherry-pick --continue
```

---

## 9) Validazione tecnica a checkpoint

Esegui almeno dopo ogni gruppo; idealmente anche a fine ogni conflitto “grosso”.

- [ ] Install dipendenze
- [ ] Build frontend/workspace
- [ ] Test frontend
- [ ] Test backend
- [ ] Rust check (desktop)

```powershell
npm install
npm run build
npm run test:frontend
npm run test:backend
npm run check:rust
```

Gate completo (quando vuoi validazione end-to-end):

```powershell
npm run ci
```

---

## 10) Verifica finale del delta (solo differenze intenzionali)

- [ ] Controlla che il delta vs upstream sia solo BRAND + MILSYMB + SILLAGE + ANALYSIS
- [ ] Genera report file modificati
- [ ] Smoke test funzionale delle 3 estensioni

```powershell
git log --oneline upstream/main..HEAD

git diff --name-status upstream/main..HEAD |
  Out-File -Encoding utf8 .\tmp\sync-final-diff-files.txt
```

---

## 11) Pubblicazione e PR

- [ ] Push branch di sync
- [ ] Apri PR verso `main` MilGeo
- [ ] In descrizione PR includi: strategia, gruppi commit, rischi, rollback

```powershell
git push -u origin $syncBranch
```

PR checklist raccomandata:
- [ ] Link a compare pre-sync e post-sync
- [ ] Elenco SHA cherry-pickati per gruppo
- [ ] Evidenza test (`npm run ci` o subset con motivazione)
- [ ] Piano rollback (`git reset --hard <backupTag>` su branch emergenza)

---

## 12) Rollback rapido (se necessario)

```powershell
git checkout main
git reset --hard $backupTag
git push --force-with-lease origin main
```

> Usare solo in emergenza e con team allineato.

---

## 13) Routine anti-divergenza (post-sync)

- [ ] Cadenza mensile (o quindicinale) sync da upstream
- [ ] Branch dedicato (`sync/upstream-YYYY-MM`)
- [ ] PR piccole e frequenti

Comandi base routine:

```powershell
git checkout -b sync/upstream-$(Get-Date -Format "yyyy-MM") main
git fetch upstream
git merge --no-ff upstream/main
# oppure strategia cherry-pick selettivo se preferisci mantenere patch stack separato
```

---

## Note operative specifiche MilGeo

- Mantieni in un file di controllo dedicato (es. `.\tmp\sync-commit-groups.txt`) la mappa SHA → gruppo.
- Se una feature (MilSymb/Sillage/Analysis) tocca API cambiate upstream, preferisci adattare il layer di integrazione e non forkare ulteriormente il core.
- Evita merge diretto di `origin/main` dentro branch da upstream: aumenta rumore storico e conflitti futuri.
