# Render Continuity Plan

Date: 2026-08-05
Goal: keep deployment stable on Render during full refactor.

## Current deployment contract

- Static service via render.yaml.
- Build command uses npm ci, render-specific build script, and output verification.
- Static publish path is apps/geolibre-desktop/dist.
- SPA rewrite to index.html is required.

## Risks during refactor

- Output folder drift between dist and build.
- Node version mismatch across local, CI, and Render.
- Worker/chunk paths broken under static serving.
- Memory pressure during production builds.

## Required safeguards

1. Keep Node 22 pinning in deployment manifests.
2. Keep explicit GEOLIBRE_APP_BASE handling.
3. Add pre-deploy script that validates output directory exists.
4. Add smoke test for SPA deep links under static host assumptions.
5. Preserve rollback artifact for last good deployment.

## Refactor-time checks per PR

- npm run lint
- npm run build
- npm run test
- npm run build:render
- Verify generated output path aligns with render.yaml staticPublishPath.

## Deployment gates

- Gate A: compile + unit tests
- Gate B: render build output check
- Gate C: manual smoke on preview URL (routing, map load, plugins)
- Gate D: production promote

## Rollback model

- Keep previous working render release ID tracked in release notes.
- If smoke fails after deploy, revert to prior release immediately and open blocker issue.
