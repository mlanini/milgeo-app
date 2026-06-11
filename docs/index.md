---
hide:
  - toc
---

<section class="hero">
  <div class="hero__content">
    <p class="eyebrow">Professional Military GIS Platform</p>
    <h1>Advanced geospatial intelligence platform with APP-6D tactical symbology and operational planning tools.</h1>
    <p class="hero__lead">
      MilGeo.app is a powerful military GIS platform built with React,
      TypeScript, MapLibre GL JS, DuckDB-WASM Spatial, milsymbol, and deck.gl. Purpose-built
      for defense and security operations with APP-6D tactical symbols, tactical graphics, ORBAT management,
      fast vector/raster processing, cloud-native data workflows, and extensible plugin architecture.
    </p>
    <div class="hero__actions">
      <a class="md-button md-button--primary" href="https://viewer.geolibre.app/">Open live demo</a>
      <a class="md-button" href="getting-started/">Get started</a>
      <a class="md-button" href="downloads/">Download app</a>
    </div>
  </div>
  <figure class="hero__media">
    <img src="https://files.opengeos.org/GeoLibre-demo.webp" alt="MilGeo.app map interface showing military tactical workspace">
  </figure>
</section>

## What MilGeo.app does today

<div class="feature-grid" markdown>

<div class="feature-card" markdown>
### APP-6D Tactical Symbology

Place and manage NATO APP-6D / MIL-STD-2525D military symbols from a searchable catalog with full affiliation support. Import and export GeoJSON and KML with SIDC codes, manage ORBAT data, visualize unit positioning, and maintain tactical overlays.
</div>

<div class="feature-card" markdown>
### Tactical Graphics

Create interactive tactical graphics including FLOT (Forward Line of Own Troops), boundaries, fire support areas, objectives, control measures, and other operational graphics. Draw, edit, and style tactical overlays with military standard symbology.
</div>

<div class="feature-card" markdown>
### MapLibre Workspace

Professional map workspace with OpenFreeMap basemaps or blank backgrounds, smooth pan/zoom/rotate, globe and terrain view, measure tools, bookmarks, minimap, geolocation, and comprehensive control customization.
</div>

<div class="feature-card" markdown>
### Vector Analysis Tools

Perform common geometry operations in-browser: buffer, centroids, convex hull, dissolve, bounding box, simplify, clip, intersection, difference, and union. Powered by Turf.js with optional GeoPandas sidecar for heavy operations.
</div>

<div class="feature-card" markdown>
### Raster Processing

Execute raster analysis with hillshade, slope, aspect, reproject, resample, clip by extent, clip by mask, polygonize, and contour generation. Runs on Python/rasterio sidecar with COG and GeoTIFF support.
</div>

<div class="feature-card" markdown>
### Cloud-Native Data

Load local and remote vector/raster data. Add XYZ, WMS, WFS, WMTS, vector tiles, COG/GeoTIFF rasters, MBTiles, ArcGIS services, GeoParquet, FlatGeobuf, PMTiles, Zarr, LiDAR, 3D Tiles, Gaussian splats, and database layers (DuckDB, PostgreSQL).
</div>

<div class="feature-card" markdown>
### SQL Workspace

Run DuckDB Spatial SQL directly in the browser against loaded layers, local files, and remote URLs. Execute spatial queries with auto-wrapping of URLs, streaming over HTTP range requests, query history, and export results as CSV or GeoParquet.
</div>

<div class="feature-card" markdown>
### Data Conversion

Convert datasets to optimized cloud-native formats: GeoParquet, FlatGeobuf, PMTiles, and COG. Batch process multiple files through the Conversion menu for efficient data distribution and web serving.
</div>

<div class="feature-card" markdown>
### Whitebox Geoprocessing

Access 500+ geospatial processing tools from the Whitebox toolbox. Run batch geoprocessing workflows on the optional Python sidecar for hydrology, terrain analysis, LiDAR processing, and more.
</div>

<div class="feature-card" markdown>
### Project Management

Save, open, and share `.geolibre.json` projects with full state preservation including layers, styles, symbols, tactical graphics, plugin configurations, and map view. Load projects by URL for instant sharing.
</div>

<div class="feature-card" markdown>
### Plugin Architecture

Built-in plugins for basemaps, layer control, MapLibre components, swipe comparison, street view, time slider, Overture Maps, LiDAR visualization, GeoAgent, GeoEditor, and marketplace support for external plugin installation.
</div>

<div class="feature-card" markdown>
### Layer Styling & Inspection

Data-driven symbology with live style panel for fill, stroke, opacity, and radius. Attribute table with filtering, sorting, feature highlighting, and zoom to selection. WMS GetFeatureInfo identify support with popup handling.
</div>

</div>

## Try it in the browser

The live demo is the browser-capable version of the MilGeo.app interface. It supports exploring the map, loading browser-selected vector data via DuckDB-WASM Spatial, adding URL-based layers, styling layers, placing tactical symbols, and testing plugins. Desktop-only features like filesystem dialogs, local MBTiles, local raster reads, and filesystem save/open operations require the Tauri desktop app.

**Hosted on GitHub Pages, private by design**

The live demo is a static site deployed on GitHub Pages and runs entirely in your browser. It has no analytics and no server account. Data you load is processed client-side in your browser session. Data leaves your browser only when you explicitly add a remote URL or share a project.

Open a project by passing a public `.geolibre.json` URL with the `url` query parameter:

```text
https://viewer.geolibre.app/?url=https://share.geolibre.app/giswqs/3d-tiles.geolibre.json
```

For narrow embeds, add `?layout=compact` to use icon-only toolbar buttons and hide project metadata:

```text
https://viewer.geolibre.app/?url=https://share.geolibre.app/giswqs/3d-tiles.geolibre.json&layout=compact
```

For map-focused embeds, add `&panels=none` to hide the Layers, Style, and Attribute table panels:

```text
https://viewer.geolibre.app/?url=https://share.geolibre.app/giswqs/3d-tiles.geolibre.json&layout=compact&panels=none
```

For a fully chrome-free, map-only embed, add `&maponly` to hide the toolbar menu, all panels, and the status bar:

```text
https://viewer.geolibre.app/?url=https://share.geolibre.app/giswqs/3d-tiles.geolibre.json&maponly
```

Use `toolbar=icons` when you only want icon-only toolbar buttons. `panels=hidden`, `panels=hide`, `panels=off`, and `hidePanels=true` are accepted aliases for hiding panels.

| Parameter | Example | Description |
| --- | --- | --- |
| `url` | `url=https://share.geolibre.app/giswqs/3d-tiles.geolibre.json` | Loads a `.geolibre.json` project from a public URL. |
| `layout` | `layout=compact` | Uses the compact embed layout with icon-only toolbar buttons and hidden project metadata. `embed` and `iframe` are aliases. |
| `toolbar` | `toolbar=icons` | Shows icon-only toolbar buttons without enabling the full compact layout. |
| `panels` | `panels=none` | Hides the Layers, Style, and Attribute table panels. `hidden`, `hide`, and `off` are aliases. |
| `hidePanels` | `hidePanels=true` | Alternative way to hide the Layers, Style, and Attribute table panels. |
| `maponly` | `maponly=true` | Hides toolbar menu, all panels, and status bar for a pure map view. |

[Open the live demo](https://viewer.geolibre.app/){ .md-button .md-button--primary }
[Read the architecture](architecture.md){ .md-button }

## Project status

MilGeo.app 0.8.0 is an advanced military GIS platform suitable for tactical planning, operational intelligence, and geospatial analysis. The platform includes the MapLibre workspace with full control customization, APP-6D tactical symbology with searchable catalog and ORBAT support, tactical graphics for operational planning, comprehensive data support (vector, raster, 3D, databases), cloud-native format handling (GeoParquet, FlatGeobuf, PMTiles, COG), vector processing tools (buffer, dissolve, clip, union via Turf.js and GeoPandas), raster analysis (hillshade, slope, aspect, clip, contour via rasterio), DuckDB Spatial SQL workspace with query history and export, Whitebox toolbox with 500+ geoprocessing tools, data conversion workflows, plugin architecture with marketplace support, project save/open/share, layer styling with data-driven symbology, attribute table with filtering and editing, WMS/WFS service support, 3D Tiles and LiDAR visualization, desktop installers (MSIX, DMG, AppImage), and comprehensive embed/share parameters including maponly mode. See the [roadmap](roadmap.md) for upcoming tactical workflow enhancements, expanded ORBAT features, and advanced processing pipelines.
