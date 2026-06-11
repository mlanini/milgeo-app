# MilGeo.app Roadmap

## v0.1: Map viewer and GeoJSON

- [x] Tauri + React + MapLibre shell
- [x] GeoJSON load, layer panel, style panel
- [x] Attribute table (basic)
- [x] Processing UI with local algorithms
- [x] Plugin interface + sample plugins

## v0.2: Project persistence

- [x] `.geolibre.json` save/open
- [x] In-session recent project tracking
- [x] Feature highlight from attribute table
- [x] Optional zoom to selected feature
- [x] Recent projects UI and persistence

## v0.3: Cloud-native formats

- [x] GeoParquet import through DuckDB-WASM
- [x] FlatGeobuf import through DuckDB-WASM and URL-based Components plugin panel
- [x] PMTiles through Components plugin
- [x] COG and GeoTIFF raster rendering
- [x] Zoom to layer for GeoJSON and source-bounds-aware layer types

## v0.4: DuckDB Spatial

- [x] DuckDB-WASM integration
- [x] `INSTALL spatial` / `LOAD spatial`
- [x] Shapefile, KMZ/KML, GeoPackage, GeoParquet, FlatGeobuf, GML, and related vector import paths

## v0.5: Advanced Add Data and plugin-backed layers

- [x] Add Data dialogs for XYZ, WMS, vector files, GeoJSON URLs, vector tiles, raster tile templates, COG and GeoTIFF rasters, MBTiles, and ArcGIS layers
- [x] MapLibre Components plugin with FlatGeobuf, PMTiles, Zarr, LiDAR, and Gaussian splat panels
- [x] Desktop MBTiles metadata and tile reads through Tauri commands
- [x] Plugin control position controls in the Plugins menu
- [x] Layer control integration for MilGeo.app-managed layers

## v0.6: Project access, web embeds, and expanded integrations

- [x] Persistent recent projects with desktop file recents and URL-backed web recents
- [x] Separate Open Project from File and Open Project from URL flows
- [x] Browser demo query options for compact layout, icon-only toolbar, and hidden panels
- [x] PostgreSQL layer workflow through desktop Martin server integration
- [x] STAC search workflow for adding catalog-backed raster layers
- [x] Esri Wayback, GeoAgent, GeoEditor, Street View, and Swipe plugin integrations

## v0.7: Add Data expansion, identify, settings, and processing

- [x] GPX loading from URL or local file, with selectable waypoint, track, and route layers
- [x] Delimited text loading from URL or local file using longitude and latitude fields
- [x] WFS GetFeature loading through the Add Data dialog
- [x] WMS GetFeatureInfo identify support with hardened popup handling
- [x] Whitebox toolbox backed by a managed Python sidecar
- [x] Inline attribute editing, horizontal table scrolling, and scrollable identify popups
- [x] Settings dialog for map preferences and runtime environment variables
- [x] Plugin state persistence in project files
- [x] Default GeoJSON sample URL and larger identify popup
- [x] Local raster file loading fix
- [x] Large-file pre-commit guard

## v0.8: Viewer, desktop packaging, plugins, and dynamic layers

- [x] Cloudflare Worker viewer served from `viewer.geolibre.app`
- [x] Browser demo links updated to the production viewer
- [x] GPX drag-and-drop split into named waypoint, track, and route layers
- [x] Vector layers reprojected to EPSG:4326 on load
- [x] Desktop About dialog update check
- [x] Dynamic external plugin zip loading from the app data plugins directory
- [x] Safe fallback for `crypto.randomUUID` in non-secure contexts
- [x] External plugin manifest support with `plugin.json`
- [x] 3D Tiles layer support through `maplibre-gl-3d-tiles`
- [x] 3D Tiles restoration when reopening projects
- [x] GeoParquet panel DuckDB startup fix
- [x] MSIX desktop packaging and cleaner build output
- [x] External native GeoJSON layers registered from local directories
- [x] Raster basemaps registered as external native layers
- [x] Text marker labels rendered on GeoJSON layers
- [x] Manual and automatic refresh for WFS and GeoJSON URL layers
- [x] Multiple DuckDB SQL query-result layers
- [x] Desktop diagnostics panel and improved diagnostics/status bar contrast
- [x] Toolbar toggles for Colorbar, Legend, and HTML panels
- [x] **Vector processing tools**: buffer, centroids, convex hull, dissolve, bounding box, simplify, clip, intersection, difference, union (Turf.js + GeoPandas)
- [x] **Raster processing tools**: hillshade, slope, aspect, reproject, resample, clip by extent, clip by mask, polygonize, contour (rasterio sidecar)
- [x] **SQL Workspace**: DuckDB Spatial SQL with query history and CSV/GeoParquet export
- [x] **Data conversion**: GeoParquet, FlatGeobuf, PMTiles, COG format conversion tools
- [x] **APP-6D Military Symbols**: Tactical symbol placement from searchable catalog with affiliation support
- [x] **Tactical Graphics**: FLOT, boundaries, fire support areas, objectives with interactive drawing
- [x] **SIDC Import/Export**: GeoJSON and KML with SIDC field support for interoperability

## v0.9: Advanced tactical workflows and processing expansion

- [ ] **Enhanced SQL Workspace**: Visual query builder, saved queries, and query templates
- [ ] **Advanced tactical symbology**: Expanded symbol sets from milsymbol runtime catalog
- [ ] **Symbol editing**: Drag-and-drop symbol repositioning and attribute editing
- [ ] **Tactical graphics styling**: Dashed/solid style per SIDC specification
- [ ] **Dismounted unit symbology**: Support for individuals and activities
- [ ] **ORBAT management**: Hierarchical unit organization and visualization
- [ ] **Expanded processing**: GDAL pipelines, advanced GeoPandas operations
- [ ] **WhiteboxTools expansion**: Additional hydrology, terrain, and LiDAR algorithms
- [ ] **Export enhancements**: Buffer, reproject, and multi-format export tools
- [ ] **GeoEditor integration**: Mixed sketch and mil-symbol workflows

## v1.0: Enterprise features and ecosystem

- [ ] **Plugin marketplace**: Install, update, and remove plugins from registry
- [ ] **External plugin distribution**: Package and publish workflow for developers
- [ ] **Sandboxed plugins**: Worker-based plugin isolation for security
- [ ] **Advanced ORBAT**: Multi-level hierarchies, unit relations, and time-based states
- [ ] **Mission planning**: Route planning, viewshed analysis, and temporal planning
- [ ] **Collaboration features**: Real-time project sharing and multi-user editing
- [ ] **Performance optimization**: Large dataset handling, streaming, and caching
- [ ] **Test coverage**: Automated testing suite for core functionality
- [ ] **Documentation**: Comprehensive user guide, tutorials, and API reference
- [ ] **Accessibility**: WCAG compliance and keyboard navigation

## Future Considerations

- **Mobile applications**: Native iOS and Android apps with offline capabilities
- **Cloud deployment**: Hosted service with authentication and storage
- **AI/ML integration**: Selective integration with GeoAI, SamGeo, and Leafmap capabilities
- **Real-time data**: Live sensor feeds, tracking, and telemetry integration
- **Advanced 3D**: Enhanced 3D Tiles, terrain analysis, and viewshed calculations
- **Network analysis**: Routing, connectivity, and supply chain optimization
- **Time series**: Temporal data visualization and animation
- **Custom projections**: Extended CRS support and datum transformations
- **Localization**: Multi-language interface and documentation

---

## Release Highlights

### v0.8.0 (Current) - Military GIS Foundation

Major milestone establishing MilGeo as a comprehensive military GIS platform with:
- Complete APP-6D tactical symbol support with searchable catalog
- Tactical graphics for operational planning (FLOT, boundaries, objectives)
- Vector and raster processing tools for geospatial analysis
- SQL workspace with DuckDB Spatial for advanced queries
- Data conversion to cloud-native formats (GeoParquet, FlatGeobuf, PMTiles, COG)
- External plugin architecture with marketplace foundation
- Cross-platform desktop installers and web viewer deployment

### v0.7.0 - Processing and Integration

Added Whitebox geoprocessing, WFS/delimited text support, WMS identify, inline attribute editing, and comprehensive plugin integrations.

### v0.6.0 - Web Embeds and PostgreSQL

Introduced browser embed parameters, URL-based project loading, PostgreSQL layers, STAC search, and expanded plugin ecosystem.

### v0.5.0 - Advanced Data Formats

Implemented comprehensive Add Data dialogs, MBTiles support, ArcGIS layer integration, and MapLibre Components plugin.

### Earlier Releases

- **v0.4.0**: DuckDB Spatial integration for diverse vector formats
- **v0.3.0**: Cloud-native formats (GeoParquet, FlatGeobuf, PMTiles, COG)
- **v0.2.0**: Project persistence and recent projects tracking
- **v0.1.0**: Initial Tauri + React + MapLibre foundation

---

## Contributing

See planned features you want to help with? Check the [Contributing Guide](https://github.com/opengeos/GeoLibre/blob/main/CONTRIBUTING.md) and open an issue to discuss your approach before starting work.
