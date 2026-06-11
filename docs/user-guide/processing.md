# Processing Tools

MilGeo.app provides comprehensive geospatial processing capabilities for vector and raster analysis, data conversion, and specialized geoprocessing workflows.

## Vector Tools

Access vector processing tools from **Processing > Vector**. These tools run in-browser using Turf.js with optional GeoPandas sidecar for heavy operations.

### Geometry Operations

#### Buffer
Create distance-based zones around features.

**Use cases**:
- Threat range visualization
- Security perimeters
- Impact area analysis

**Parameters**:
- **Distance**: Buffer radius (meters, kilometers, miles)
- **Units**: Distance unit selection
- **Steps**: Smoothness of curved segments (default: 8)
- **Dissolve**: Merge overlapping buffers

**Example**: 5km buffer around friendly positions for security planning.

#### Centroids
Calculate geometric center points of polygon features.

**Use cases**:
- Unit position labeling
- Spatial aggregation
- Distance calculations

**Output**: Point layer with centroid of each input polygon.

#### Convex Hull
Generate smallest convex polygon containing all features.

**Use cases**:
- Area of operations boundary
- Unit dispersal analysis
- Concentration assessment

**Output**: Single polygon or per-feature hulls.

#### Dissolve
Merge adjacent or overlapping features with common attributes.

**Use cases**:
- Combine unit sectors into AO boundary
- Merge administrative areas
- Simplify tactical graphics

**Parameters**:
- **Attribute**: Field to dissolve by (optional)
- **Aggregate stats**: Sum, count, mean for numeric fields

#### Bounding Box
Create rectangular envelope around features.

**Use cases**:
- Quick AO definition
- Map extent calculation
- Data subset extraction

**Types**:
- Per-feature bounding boxes
- Single box for entire layer

#### Simplify
Reduce vertex count while preserving shape.

**Use cases**:
- Reduce file size
- Improve rendering performance
- Generalize for small-scale maps

**Parameters**:
- **Tolerance**: Simplification threshold (lower = more detail)
- **High quality**: Uses Visvalingam algorithm (slower)

### Overlay Operations

#### Clip
Extract features within a boundary polygon.

**Use cases**:
- Extract data for specific AO
- Trim layers to study area
- Create data subsets

**Inputs**:
- **Input layer**: Layer to clip
- **Clip layer**: Boundary polygon
- **Output**: Clipped features

#### Intersection
Find overlapping areas between two layers.

**Use cases**:
- Identify shared terrain
- Find units within sectors
- Terrain suitability analysis

**Output**: New layer with only overlap areas.

#### Difference
Subtract one layer from another.

**Use cases**:
- Remove excluded areas from analysis
- Find areas outside no-go zones
- Exclusion analysis

**Output**: Input layer minus clip layer areas.

#### Union
Combine multiple layers into one.

**Use cases**:
- Merge adjacent unit sectors
- Combine planning layers
- Create composite datasets

**Options**:
- **Preserve attributes**: Keep all fields
- **Dissolve overlaps**: Merge overlapping areas

### Attribute Operations

#### Join Attributes
Combine attributes from two layers based on common field.

**Join types**:
- **Inner**: Only matching records
- **Left**: All from left, matching from right
- **Right**: All from right, matching from left

**Use cases**:
- Add unit data to positions
- Enrich features with intelligence
- Combine operational data

#### Select by Attribute
Filter features based on attribute criteria.

**Operators**: =, ≠, <, >, ≤, ≥, contains, starts with, ends with

**Example**: Select all units where `echelon = 'Battalion'`

#### Calculate Field
Compute new attribute values.

**Functions**: Arithmetic, string, geometry (area, length)

**Example**: Calculate density as `population / area`

## Raster Tools

Raster processing requires the Python sidecar with rasterio. Access from **Processing > Raster**.

### Terrain Analysis

#### Hillshade
Generate shaded relief visualization.

**Use cases**:
- Terrain visualization
- Map backgrounds
- Topographic analysis

**Parameters**:
- **Azimuth**: Sun direction (default: 315°)
- **Altitude**: Sun angle (default: 45°)
- **Z factor**: Vertical exaggeration

#### Slope
Calculate terrain slope.

**Use cases**:
- Trafficability analysis
- Line-of-sight planning
- Engineering assessment

**Output units**:
- Degrees (0-90)
- Percent (0-100+)

#### Aspect
Determine slope direction.

**Use cases**:
- Exposure analysis
- Solar radiation modeling
- Drainage patterns

**Output**: Direction in degrees (0-360, 0 = North)

### Raster Processing

#### Reproject
Transform raster to different coordinate system.

**Use cases**:
- Match coordinate systems across datasets
- Change to regional projection
- Prepare for analysis

**Parameters**:
- **Target CRS**: Output coordinate system
- **Resampling**: Nearest, bilinear, cubic

#### Resample
Change raster resolution.

**Use cases**:
- Match resolution across layers
- Reduce file size
- Increase detail (with interpolation)

**Methods**:
- **Nearest**: Discrete data (land cover)
- **Bilinear**: Continuous data (elevation)
- **Cubic**: High-quality continuous data

#### Clip by Extent
Crop raster to rectangular bounds.

**Inputs**:
- **Min X, Min Y**: Southwest corner
- **Max X, Max Y**: Northeast corner

**Use cases**:
- Extract AO subset
- Reduce processing area
- Create map tiles

#### Clip by Mask
Clip raster to polygon boundary.

**Use cases**:
- Extract raster data for AO
- Remove areas outside sector
- Irregular extent cropping

**Options**:
- **Crop to extent**: Trim to mask bounds
- **No data value**: Value for areas outside mask

### Raster Conversion

#### Polygonize
Convert raster to vector polygons.

**Use cases**:
- Extract features from imagery
- Create zone boundaries from classified data
- Convert elevation contours

**Options**:
- **Field name**: Attribute for raster values
- **8-connectivity**: Adjacent pixel grouping

#### Contours
Generate elevation contour lines.

**Use cases**:
- Topographic map creation
- Terrain visualization
- Elevation reference

**Parameters**:
- **Interval**: Vertical spacing (meters)
- **Base**: Starting elevation
- **Index contours**: Every Nth contour emphasized

## Data Conversion

Convert datasets to cloud-native formats from **Processing > Conversion**.

### GeoParquet
Column-oriented format for efficient query and storage.

**Benefits**:
- Fast attribute queries
- Efficient compression
- Cloud-optimized

**Use cases**:
- Large vector datasets
- Cloud data lakes
- Analytics workflows

### FlatGeobuf
Streaming-friendly format with spatial index.

**Benefits**:
- HTTP range request support
- Spatial filtering without full download
- Small file size

**Use cases**:
- Web services
- Mobile applications
- Bandwidth-limited environments

### PMTiles
Single-file vector tile archive.

**Benefits**:
- No tile server required
- Efficient browser rendering
- Version control friendly

**Use cases**:
- Basemaps
- Reference layers
- Static hosting

### COG (Cloud Optimized GeoTIFF)
Tiled, overviewed raster format.

**Benefits**:
- Partial read support
- Multi-resolution
- Standard GeoTIFF compatible

**Use cases**:
- Imagery
- Elevation data
- Web map services

## Whitebox Tools

500+ specialized geoprocessing algorithms via Python sidecar. Access from **Processing > Whitebox**.

### Hydrology
- **Flow Direction**: D8, D-infinity algorithms
- **Flow Accumulation**: Catchment analysis
- **Stream Network**: Extract drainage networks
- **Watershed Delineation**: Define catchment boundaries
- **Strahler Order**: Stream hierarchy

**Military applications**: Water source identification, crossing site analysis, flood risk

### LiDAR Processing
- **Classify**: Ground, vegetation, buildings
- **DEM Generation**: Create elevation models
- **Canopy Height**: Vegetation analysis
- **Point Cloud Filtering**: Noise removal

**Military applications**: Cover analysis, obstacle detection, landing zone assessment

### Terrain Analysis
- **Ruggedness**: Terrain roughness
- **Wetness Index**: Soil moisture estimation
- **Relative Elevation**: Height above drainage
- **Viewshed**: Line-of-sight analysis

**Military applications**: Trafficability, defensive positions, observation posts

### Image Processing
- **Filters**: Smoothing, edge detection, enhancement
- **Classification**: Supervised, unsupervised learning
- **Segmentation**: Object extraction
- **Change Detection**: Multi-temporal analysis

**Military applications**: Intelligence analysis, target detection, damage assessment

## Batch Processing

Automate repetitive tasks with batch processing.

### Creating Batch Workflows

1. **Processing > Batch Mode**
2. **Add operations** in sequence
3. **Configure parameters** for each step
4. **Set input/output** paths
5. **Run batch**

### Example Workflow

Prepare imagery for tactical overlay:

1. Clip raster by AO boundary
2. Resample to 10m resolution
3. Generate hillshade
4. Convert to COG format
5. Export hillshade as basemap layer

### Saving Workflows

- **Save as template**: Reuse with different inputs
- **Export as script**: Python script for command-line use
- **Share workflows**: JSON format for team distribution

## Performance Optimization

### Browser-based Processing

**Advantages**:
- No setup required
- Works offline (desktop app)
- Immediate results

**Limitations**:
- Memory constraints (large datasets)
- CPU-bound operations slower
- Some algorithms unavailable

**Best for**: Vector operations, small rasters, quick analysis

### Python Sidecar Processing

**Advantages**:
- Full GDAL/GeoPandas capabilities
- Large dataset handling
- Multiprocessing support

**Limitations**:
- Requires Python setup
- Network communication overhead
- Desktop-only

**Best for**: Raster processing, heavy vector ops, batch workflows

### Optimization Tips

- **Simplify inputs**: Pre-filter or clip to study area
- **Reduce resolution**: Downsample rasters when appropriate
- **Use appropriate tools**: Match tool complexity to need
- **Process incrementally**: Break large jobs into chunks
- **Monitor memory**: Watch browser/sidecar memory usage

## Troubleshooting

### Processing Failures

**Out of memory**:
- Reduce input dataset size
- Close unused browser tabs
- Use Python sidecar for large operations
- Increase system memory allocation

**Invalid geometry**:
- Run "Fix Geometries" tool first
- Check for self-intersections
- Validate coordinate system
- Remove duplicate vertices

**Sidecar connection errors**:
- Verify sidecar is running (http://127.0.0.1:8765/docs)
- Check firewall settings
- Restart sidecar service
- Review sidecar logs

**Unexpected results**:
- Verify input layer selection
- Check parameter units
- Validate coordinate systems match
- Test on small sample first

### Getting Help

- **Console log**: Check browser console for errors
- **Tool documentation**: Hover tooltips explain parameters
- **Example data**: Use sample datasets for testing
- **Community forum**: Ask questions on GitHub Discussions
