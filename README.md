# MilGeo.app

MilGeo.app is a web GIS focused on geospatial visualization and analysis with APP-6D military symbology support.

## Repository scope

This variant is **web-only**:

- Vite/React frontend in `apps/geolibre-desktop`
- shared packages in `packages/*`
- workers in `workers/*`

Native desktop components, Python backend services, legacy GeoLibre documentation, and non-essential ancillary files have been removed for the web runtime.

## Requirements

- Node.js 22+
- npm 10+

## Setup

```bash
git clone https://github.com/mlanini/milgeo-app.git
cd milgeo-app
npm ci
```

## Local development

```bash
npm run dev
```

Open `http://localhost:5173`.

## Production build

```bash
npm run build
```

Static output is generated in `build`.

## Main commands

- `npm run dev` start web development
- `npm run build` build the web app
- `npm run lint` run workspace linting
- `npm run test` run frontend tests
- `npm run ci` run the local web-only pipeline

## Structure

- `apps/geolibre-desktop` MilGeo.app web application
- `packages/core` shared types, store, and project format
- `packages/map` MapLibre integration
- `packages/plugins` plugin API and built-in plugins
- `packages/processing` client-side processing
- `packages/ui` shared UI components
- `workers` project workers
- `tests` frontend/unit tests

## Refactor roadmap (GeoLibre latest + KADAS parity)

A full clean-room refactor is in progress to:

- align the codebase with the latest GeoLibre architecture
- reach functional parity with KADAS Albireo workflows (without code reuse)
- preserve stable deployment on Render

Migration tracking documents:

- `docs/migration/01-refactor-blueprint.md`
- `docs/migration/02-kadas-parity-matrix.md`
- `docs/migration/03-render-continuity-plan.md`
- `docs/migration/04-implementation-backlog.md`

## Branding

Official brand: **MilGeo.app**

## License

MIT
