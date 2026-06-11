# SQL Workspace

The SQL Workspace provides powerful spatial query capabilities using DuckDB Spatial SQL, running directly in your browser or desktop application.

## Opening SQL Workspace

Access from **Data > SQL Workspace** or press `Ctrl+Q`.

The workspace panel provides:
- **Query editor**: Write and execute SQL
- **Query history**: Access previous queries
- **Results panel**: View query results
- **Export options**: Save results as CSV or GeoParquet

## Quick Start

### Your First Query

```sql
-- View all features from a layer
SELECT * FROM layer_name LIMIT 10;
```

Layers in your project are automatically available as tables.

### Layer Names

Layer names in SQL:
- Replace spaces with underscores: `"Unit Positions"` → `unit_positions`
- Remove special characters
- Use quotes for names with reserved words: `SELECT * FROM "order"`

View available tables:
```sql
SHOW TABLES;
```

## Spatial Queries

### Point Queries

**Find features near a location**:
```sql
SELECT name, 
       ST_Distance(geom, ST_Point(-122.4194, 37.7749)) AS distance_m
FROM units
WHERE ST_Distance(geom, ST_Point(-122.4194, 37.7749)) < 5000
ORDER BY distance_m;
```

**Count features within radius**:
```sql
SELECT COUNT(*) AS units_within_10km
FROM units
WHERE ST_Distance(geom, ST_Point(10.0, 50.0)) < 10000;
```

### Area Queries

**Features within a polygon** (AO boundary):
```sql
SELECT u.*
FROM units u
JOIN operational_area oa ON ST_Within(u.geom, oa.geom)
WHERE oa.name = 'AO EAGLE';
```

**Features intersecting an area**:
```sql
SELECT route_name, 
       ST_Length(ST_Intersection(r.geom, s.geom)) AS length_in_sector
FROM routes r, sectors s
WHERE ST_Intersects(r.geom, s.geom)
  AND s.sector_name = 'Sector North';
```

### Buffer Analysis

**Create 5km buffer around features**:
```sql
SELECT name, 
       ST_Buffer(geom, 5000) AS buffer_geom
FROM installations;
```

**Units within threat range**:
```sql
SELECT u.unit_id, u.designation
FROM units u
JOIN threats t ON ST_Within(u.geom, ST_Buffer(t.geom, t.range_m))
WHERE t.threat_type = 'Artillery';
```

### Distance Analysis

**Nearest feature**:
```sql
SELECT target_id, 
       ST_Distance(geom, (SELECT geom FROM units WHERE unit_id = 'A/1-7')) AS distance
FROM targets
ORDER BY distance
LIMIT 1;
```

**Distance matrix** (all units to all targets):
```sql
SELECT u.unit_id, 
       t.target_id,
       ST_Distance(u.geom, t.geom) AS distance_m
FROM units u
CROSS JOIN targets t
ORDER BY u.unit_id, distance_m;
```

## Attribute Queries

### Filtering

**Simple filter**:
```sql
SELECT * FROM units
WHERE echelon = 'Battalion'
  AND affiliation = 'Friend';
```

**Multiple conditions**:
```sql
SELECT * FROM units
WHERE (echelon IN ('Company', 'Battalion'))
  AND status = 'Present'
  AND strength >= 50
ORDER BY designation;
```

**Text search**:
```sql
SELECT * FROM units
WHERE designation LIKE '%CAV%'
   OR designation LIKE '%Cavalry%';
```

**Date/time filtering**:
```sql
SELECT * FROM reports
WHERE report_date >= '2024-01-01'
  AND report_date < '2024-02-01'
ORDER BY report_date DESC;
```

### Aggregation

**Count by category**:
```sql
SELECT affiliation, 
       COUNT(*) AS count
FROM units
GROUP BY affiliation
ORDER BY count DESC;
```

**Statistical summary**:
```sql
SELECT echelon,
       COUNT(*) AS units,
       AVG(strength) AS avg_strength,
       SUM(strength) AS total_strength,
       MIN(strength) AS min_strength,
       MAX(strength) AS max_strength
FROM units
GROUP BY echelon;
```

**Spatial aggregation**:
```sql
SELECT s.sector_name,
       COUNT(u.unit_id) AS num_units,
       SUM(u.strength) AS total_personnel
FROM sectors s
LEFT JOIN units u ON ST_Within(u.geom, s.geom)
GROUP BY s.sector_name;
```

## Geometry Operations

### Creating Geometry

**Point from coordinates**:
```sql
SELECT ST_Point(longitude, latitude) AS geom,
       name
FROM coordinates_table;
```

**Line from points**:
```sql
SELECT ST_MakeLine(geom ORDER BY sequence) AS route_geom
FROM waypoints
WHERE route_id = 'Route_Blue'
GROUP BY route_id;
```

**Polygon from text** (WKT):
```sql
SELECT ST_GeomFromText('POLYGON((0 0, 10 0, 10 10, 0 10, 0 0))') AS geom;
```

### Geometry Measurements

**Length and area**:
```sql
SELECT name,
       ST_Length(geom) AS length_m,
       ST_Area(geom) AS area_sqm
FROM features;
```

**Perimeter**:
```sql
SELECT sector_name,
       ST_Perimeter(geom) / 1000 AS perimeter_km
FROM sectors;
```

**Bounding box**:
```sql
SELECT name,
       ST_Envelope(geom) AS bbox
FROM layers;
```

### Geometry Transformations

**Centroids**:
```sql
SELECT name,
       ST_Centroid(geom) AS center_point
FROM polygons;
```

**Simplify geometry**:
```sql
SELECT name,
       ST_Simplify(geom, 100) AS simplified_geom
FROM complex_boundaries;
```

**Convex hull**:
```sql
SELECT unit_id,
       ST_ConvexHull(ST_Union(geom)) AS unit_extent
FROM positions
GROUP BY unit_id;
```

## Advanced Queries

### Spatial Joins

**Find all features in each sector**:
```sql
SELECT s.sector_name,
       u.unit_id,
       u.designation
FROM sectors s
LEFT JOIN units u ON ST_Within(u.geom, s.geom)
ORDER BY s.sector_name, u.designation;
```

**Intersecting features with overlap area**:
```sql
SELECT r1.route_name AS route1,
       r2.route_name AS route2,
       ST_Area(ST_Intersection(r1.geom, r2.geom)) AS overlap_area
FROM routes r1
JOIN routes r2 ON ST_Intersects(r1.geom, r2.geom)
WHERE r1.route_name < r2.route_name  -- Avoid duplicates
  AND ST_Area(ST_Intersection(r1.geom, r2.geom)) > 0;
```

### Window Functions

**Rank by distance**:
```sql
SELECT unit_id,
       designation,
       distance_to_target,
       ROW_NUMBER() OVER (ORDER BY distance_to_target) AS rank
FROM (
  SELECT u.unit_id, 
         u.designation,
         ST_Distance(u.geom, t.geom) AS distance_to_target
  FROM units u, targets t
  WHERE t.target_id = 'TGT-001'
) ranked;
```

**Running totals**:
```sql
SELECT date,
       new_units,
       SUM(new_units) OVER (ORDER BY date) AS cumulative_units
FROM daily_reports
ORDER BY date;
```

### Subqueries

**Features within user-defined buffer**:
```sql
SELECT u.*
FROM units u
WHERE ST_Within(
  u.geom,
  (SELECT ST_Buffer(geom, 10000) FROM locations WHERE name = 'HQ')
);
```

**Density analysis**:
```sql
SELECT name,
       (SELECT COUNT(*) 
        FROM units u 
        WHERE ST_Within(u.geom, s.geom)) / (ST_Area(s.geom) / 1000000) AS density_per_sqkm
FROM sectors s;
```

## Loading Remote Data

DuckDB can query remote files directly:

### Remote GeoJSON
```sql
SELECT * FROM 'https://example.com/data.geojson';
```

### Remote GeoParquet
```sql
SELECT * FROM 'https://example.com/data.parquet';
```

### S3/Cloud Storage
```sql
SELECT * FROM 's3://bucket/prefix/data.parquet';
```

Auto-detection wraps URLs with appropriate reader. For explicit control:

```sql
SELECT * FROM read_parquet('https://example.com/data.parquet');
```

## Query History

### Accessing History

1. **History panel**: Shows recent queries
2. **Star queries**: Mark favorites for quick access
3. **Search history**: Filter by keywords
4. **Re-run**: Click to execute again

### Managing History

- **Clear history**: Remove all queries
- **Export history**: Save as JSON
- **Import history**: Load saved queries

## Exporting Results

### To New Layer

```sql
-- Execute query, then click "Add to Map"
SELECT name, geom FROM units WHERE echelon = 'Battalion';
```

Prompts for layer name, adds result to map.

### To CSV

Results panel > Export > CSV

Exports attribute table (no geometry).

### To GeoParquet

Results panel > Export > GeoParquet

Exports full spatial dataset with geometry.

## Sample Queries

### Operational Planning

**Units by echelon and sector**:
```sql
SELECT s.sector_name,
       u.echelon,
       COUNT(*) AS count,
       SUM(u.strength) AS total_strength
FROM sectors s
JOIN units u ON ST_Within(u.geom, s.geom)
GROUP BY s.sector_name, u.echelon
ORDER BY s.sector_name, u.echelon;
```

**Route overlap analysis**:
```sql
SELECT r1.name AS route1,
       r2.name AS route2,
       ST_Length(ST_Intersection(r1.geom, r2.geom)) AS shared_length_m
FROM routes r1
JOIN routes r2 ON ST_Intersects(r1.geom, r2.geom)
WHERE r1.name < r2.name
  AND ST_Length(ST_Intersection(r1.geom, r2.geom)) > 100
ORDER BY shared_length_m DESC;
```

### Intelligence Analysis

**Threat density by grid**:
```sql
WITH grid AS (
  SELECT ST_MakeBox2D(ST_Point(x, y), ST_Point(x+0.1, y+0.1)) AS cell_geom
  FROM generate_series(10.0, 11.0, 0.1) AS x,
       generate_series(50.0, 51.0, 0.1) AS y
)
SELECT cell_geom,
       COUNT(t.threat_id) AS threat_count
FROM grid g
LEFT JOIN threats t ON ST_Within(t.geom, g.cell_geom)
GROUP BY cell_geom
HAVING COUNT(t.threat_id) > 0;
```

**Change detection**:
```sql
SELECT current.feature_id,
       'Modified' AS status,
       ST_Distance(current.geom, previous.geom) AS position_change_m
FROM current_positions current
JOIN previous_positions previous ON current.feature_id = previous.feature_id
WHERE ST_Distance(current.geom, previous.geom) > 100;
```

### Terrain Analysis

**Elevation statistics by sector**:
```sql
SELECT s.sector_name,
       AVG(e.elevation) AS avg_elevation,
       MIN(e.elevation) AS min_elevation,
       MAX(e.elevation) AS max_elevation,
       STDDEV(e.elevation) AS elevation_stddev
FROM sectors s
JOIN elevation_points e ON ST_Within(e.geom, s.geom)
GROUP BY s.sector_name;
```

## Performance Tips

### Spatial Index

DuckDB automatically creates spatial indexes. For optimal performance:

- **Filter first**: Use WHERE before spatial operations
- **Limit extents**: Process subsets when possible
- **Simplify geometries**: Reduce vertices for faster operations

### Query Optimization

**Use EXPLAIN**:
```sql
EXPLAIN SELECT * FROM units WHERE ST_Distance(geom, ST_Point(0,0)) < 1000;
```

Shows query execution plan.

**Indexed columns**:
```sql
-- Filter on indexed columns before spatial ops
SELECT * FROM units
WHERE echelon = 'Battalion'  -- Fast filter
  AND ST_Within(geom, sector_geom);  -- Then spatial
```

**Minimize data transfer**:
```sql
-- Select only needed columns
SELECT unit_id, designation, geom FROM units;

-- Not: SELECT * FROM units;
```

## Troubleshooting

### Common Errors

**Table not found**:
- Verify layer is loaded in project
- Check layer name spelling/casing
- Use `SHOW TABLES;` to list available tables

**Invalid geometry**:
- Some operations require valid geometries
- Try `ST_MakeValid(geom)` to fix
- Check coordinate system (should be EPSG:4326)

**Out of memory**:
- Reduce query extent
- Filter data before spatial operations
- Process in smaller batches
- Use LIMIT for testing

**Slow queries**:
- Add WHERE clauses to filter early
- Reduce geometry complexity with ST_Simplify
- Process smaller area subsets
- Check EXPLAIN output for optimization

### Getting Help

- **Syntax reference**: Click ? icon in SQL Workspace
- **DuckDB docs**: [duckdb.org/docs/extensions/spatial](https://duckdb.org/docs/extensions/spatial)
- **Sample queries**: File > Load Example Query
- **Community**: GitHub Discussions for questions
