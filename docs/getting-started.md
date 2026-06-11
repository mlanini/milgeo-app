# Getting Started

MilGeo.app is a professional military GIS platform built as an npm workspaces monorepo. The main application resides in `apps/geolibre-desktop` and is built with React, TypeScript, MapLibre GL JS, and DuckDB-WASM Spatial.

## Prerequisites

- **Node.js** 22 or newer
- **Rust** toolchain for desktop builds ([rustup](https://rustup.rs/))
- **Linux**: Additional dependencies from [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) including `webkit2gtk` and `libayatana-appindicator`

## Quick Start

### Clone and Install

```bash
git clone https://github.com/opengeos/GeoLibre.git
cd GeoLibre
npm install
```

Bun users can run `bun install`. The root `trustedDependencies` list allows the known install scripts for `core-js`, `@google/genai`, and `protobufjs`.

### Run Browser Development Server

```bash
npm run dev
```

Open `http://localhost:5173`. The browser UI provides:

- Map workspace with pan, zoom, rotate, and 3D globe/terrain
- DuckDB-WASM Spatial vector import (GeoJSON, GeoParquet, GeoPackage, Shapefile, FlatGeobuf, KML/KMZ, GML, delimited text, GPX)
- Direct drag-and-drop handling for GeoJSON, zipped Shapefiles, and KMZ archives
- Add Data dialogs for URL-based services: XYZ, WMS, WFS, GeoJSON URLs, vector tiles, COG rasters
- Advanced formats: ArcGIS services, PMTiles, Zarr, LiDAR, 3D Tiles, Gaussian splats
- Layer styling, attribute inspection, and plugin testing
- APP-6D tactical symbol placement and tactical graphics drawing

**Browser Limitations**: Desktop-only features (filesystem dialogs, local MBTiles, local raster reads, project save/open to filesystem) require the Tauri desktop application.

### Run Desktop Application

```bash
npm run tauri:dev
```

The desktop app provides all browser capabilities plus:

- Native filesystem dialogs for save/open/export
- Local MBTiles database support
- Local raster file reads (COG, GeoTIFF)
- Desktop-native performance and window management
- Update checking and diagnostics panel
- External plugin zip loading from app data directory

## Build for Production

### Browser Build

```bash
npm run build
```

Creates an optimized production build in `apps/geolibre-desktop/dist/`.

### Desktop Build

```bash
npm run tauri:build
```

Generates platform-specific installers:

- **Windows**: MSIX package
- **macOS**: DMG installer
- **Linux**: AppImage, DEB, RPM

Build artifacts are created in `apps/geolibre-desktop/src-tauri/target/release/bundle/`.

## First Steps with MilGeo

### Loading Your First Map

1. **Open the application** (browser or desktop)
2. **Choose a basemap**: Menu > Basemaps > Select OpenStreetMap, Satellite, or Terrain
3. **Navigate**: Click and drag to pan, scroll to zoom, Ctrl+drag to rotate
4. **Toggle 3D**: Menu > Controls > Globe or Terrain for 3D visualization

### Adding Vector Data

**From Local File** (Desktop or browser with DuckDB-WASM):
- Menu > Data > Add Vector Layer
- Select files: GeoJSON, GeoParquet, GeoPackage, Shapefile zip, KML/KMZ, FlatGeobuf
- Or drag and drop files directly onto the map

**From URL**:
- Menu > Data > Add Data > GeoJSON URL
- Enter a public GeoJSON or GeoParquet URL
- Click Add to load the layer

**From Services**:
- Menu > Data > Add Data > WFS Layer
- Enter the WFS service URL and layer name
- Configure refresh interval if needed

### Adding Tactical Symbols (APP-6D)

1. **Open Symbol Catalog**: Menu > Tactical > Place Symbol
2. **Search or browse**: Filter by affiliation (Friend, Hostile, Neutral, Unknown)
3. **Select symbol**: Choose from land units, sea surface, subsurface, air, space, activities
4. **Place on map**: Click desired location on the map
5. **Edit attributes**: Right-click symbol to edit SIDC, affiliation, or position

### Creating Tactical Graphics

1. **Open Graphics Tool**: Menu > Tactical > Draw Graphic
2. **Choose graphic type**:
   - FLOT (Forward Line of Own Troops)
   - Boundaries (Phase line, Limit of advance)
   - Fire Support Areas
   - Objectives
   - Control Measures
3. **Draw on map**: Click points to define the graphic geometry
4. **Finish**: Double-click or press Enter to complete
5. **Style**: Use the Style panel to customize colors, line width, and fill

### Running Analysis

**Vector Analysis** (Menu > Processing > Vector):
- **Buffer**: Create distance-based zones around features
- **Dissolve**: Merge features with common attributes
- **Clip**: Extract features within a boundary
- **Intersection**: Find overlapping areas
- **Union**: Combine multiple layers

**Raster Analysis** (Menu > Processing > Raster) - requires Python sidecar:
- **Hillshade**: Generate terrain shading for visualization
- **Slope**: Calculate terrain slope in degrees or percent
- **Aspect**: Determine terrain aspect (direction of slope)
- **Contours**: Generate elevation contour lines

**SQL Workspace** (Menu > Data > SQL Workspace):
```sql
-- Example: Find features within 5km of a point
SELECT * FROM layer_name 
WHERE ST_Distance(geom, ST_Point(-122.4194, 37.7749)) < 5000;
```

### Saving and Sharing Projects

1. **Save Project**: Menu > File > Save Project
   - Desktop: Saves `.geolibre.json` to filesystem
   - Browser: Downloads project file
2. **Open Project**: Menu > File > Open Project > From File or From URL
3. **Share Project**: Upload `.geolibre.json` to a public URL, then share:
   ```
   https://viewer.geolibre.app/?url=YOUR_PROJECT_URL
   ```

## Configuration

## Configuration

### Street View Imagery Providers

The Street View plugin can use Google Street View and Mapillary imagery. Create `apps/geolibre-desktop/.env.local` and set one or both provider credentials:

```env
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
VITE_MAPILLARY_ACCESS_TOKEN=your_mapillary_access_token
```

For Google Street View, enable the Maps Embed API for the key in Google Cloud. For Mapillary, create an app in the Mapillary developer dashboard and use its client access token.

Restart `npm run dev` or `npm run tauri:dev` after changing environment variables.

### Python Processing Sidecar

The optional Python FastAPI sidecar enables raster processing tools, Whitebox geoprocessing, and heavy vector operations. It is not required for basic desktop UI functionality or browser-based vector analysis.

**Setup**:

```bash
cd backend/geolibre_server
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -e .
uvicorn geolibre_server.app.main:app --host 127.0.0.1 --port 8765
```

**Enabled Features**:
- Raster processing: hillshade, slope, aspect, reproject, resample, clip, polygonize, contour
- Whitebox toolbox: 500+ geoprocessing algorithms
- GeoPandas engine for heavy vector operations
- Custom processing pipelines and batch workflows

The sidecar runs independently and communicates with MilGeo via REST API at `http://127.0.0.1:8765`.

## Next Steps

- **[Architecture](architecture.md)**: Understand the technical stack and design decisions
- **[Project Format](project-format.md)**: Learn about the `.geolibre.json` specification
- **[Plugin API](plugin-api.md)**: Develop custom plugins and integrations
- **[Roadmap](roadmap.md)**: See planned features and release history

## Troubleshooting

### DuckDB-WASM fails to load

- Ensure you're using Node.js 22+ 
- Check browser console for SharedArrayBuffer errors (requires secure context)
- Try Chromium-based browser (Chrome, Edge) for best compatibility

### Tauri build fails

- Verify Rust toolchain is installed: `rustc --version`
- On Linux, install required dependencies: `webkit2gtk`, `libayatana-appindicator`
- Check [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for platform-specific requirements

### Python sidecar connection issues

- Verify sidecar is running: check `http://127.0.0.1:8765/docs`
- Ensure no firewall blocking port 8765
- Check sidecar logs for errors

### APP-6D symbols not displaying

- Clear browser cache and reload
- Check console for milsymbol initialization errors
- Verify SIDC codes are valid APP-6D format

## Support

- **Issues**: [GitHub Issues](https://github.com/opengeos/GeoLibre/issues)
- **Discussions**: [GitHub Discussions](https://github.com/opengeos/GeoLibre/discussions)
- **Documentation**: [https://geolibre.app/](https://geolibre.app/)
