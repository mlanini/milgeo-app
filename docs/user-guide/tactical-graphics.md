# Tactical Graphics

Tactical graphics provide visual representation of control measures, boundaries, fire support coordination, and other operational planning elements essential for military operations.

## Graphics Categories

MilGeo.app supports these tactical graphic types:

### Command & Control
- **Boundaries**: Area of operations, zone, sector limits
- **Phase Lines**: Control lines for maneuver phases
- **Checkpoints**: Named control points along routes
- **Assembly Areas**: Unit staging locations
- **Forward Line of Own Troops (FLOT)**: Current friendly positions

### Fire Support
- **Fire Support Areas (FSA)**: Designated fire zones
- **Free Fire Area (FFA)**: Unrestricted engagement zones
- **No-Fire Area (NFA)**: Protected areas
- **Restricted Fire Area (RFA)**: Approval-required zones
- **Fire Support Coordination Line (FSCL)**

### Maneuver
- **Axis of Advance**: Primary movement corridors
- **Direction of Attack**: Attack orientation
- **Limit of Advance**: Forward boundary
- **Objectives**: Target areas for seizure
- **Routes**: Primary, alternate, and contingency routes

### Obstacles & Survivability
- **Obstacles**: Minefields, wire, barriers
- **Fortifications**: Fighting positions, bunkers
- **Protective Obstacles**: Friendly barriers

### Combat Service Support
- **Supply Routes**: MSR, ASR
- **Supply Points**: Class I-IX supply
- **Medical Facilities**: Aid stations, hospitals

## Creating Tactical Graphics

### Basic Drawing

1. **Open Draw Tool**: Menu > Tactical > Draw Graphic
2. **Select Type**: Choose from graphics catalog
3. **Click Points**: Define graphic geometry on map
   - **First click**: Start point
   - **Subsequent clicks**: Define shape/route
   - **Double-click**: Complete graphic
   - **Escape**: Cancel drawing
4. **Label**: Enter graphic name/designation

### Drawing Modes

**Point Graphics** (single click):
- Checkpoints
- Unit positions
- Installations

**Line Graphics** (multiple points):
- FLOT
- Phase lines
- Routes
- Boundaries between points

**Area Graphics** (polygon):
- Objectives
- Fire support areas
- Assembly areas
- Zones

**Free-form** (smooth curves):
- Realistic terrain-following boundaries
- Natural feature representation

## Graphic Properties

### Standard Properties

All graphics support:

- **Name/Designation**: Identifier (e.g., "PL BLUE", "OBJ ALPHA")
- **Type**: Graphic category and subtype
- **Affiliation**: Friend, Hostile, Neutral (affects color)
- **Status**: Planned, Pending, Approved
- **Time**: Effective DTG, expiration

### Advanced Properties

- **Width**: For linear graphics (default: 100m)
- **Altitude**: Minimum/maximum altitude (3D planning)
- **Echelon**: Unit size for which graphic applies
- **Additional Text**: Free-form notes

### Styling

Configure graphic appearance:

- **Line Style**: Solid, dashed, dotted
- **Line Width**: 1-10 pixels
- **Line Color**: Override default affiliation color
- **Fill Color**: For area graphics
- **Fill Opacity**: 0-100%
- **Label Size**: Small, Medium, Large
- **Label Position**: Auto, Top, Bottom, Left, Right

## Editing Graphics

### Select Mode

1. **Click** graphic to select (highlights in yellow)
2. **Edit handles** appear at vertices
3. **Drag handles** to reshape
4. **Drag graphic body** to move entire graphic

### Modify Geometry

- **Add vertex**: Click on line segment
- **Remove vertex**: Right-click vertex > Delete
- **Move vertex**: Drag vertex handle
- **Close polygon**: Connect last point to first

### Split and Merge

- **Split line**: Right-click > Split at point
- **Merge lines**: Select multiple > Right-click > Merge
- **Extend line**: Select endpoint > Continue drawing

### Copy and Offset

- **Duplicate**: Ctrl+C / Ctrl+V or Right-click > Duplicate
- **Offset parallel**: Right-click > Offset > Enter distance
- **Mirror**: Right-click > Mirror > Select axis

## Graphic Layers

### Organizing Graphics

Create graphic layers for:
- **Time phases**: H-Hour, H+2, D+1, etc.
- **Functional areas**: Maneuver, Fires, CSS
- **Unit responsibility**: Battalion, Brigade, Division
- **Planning variants**: COA 1, COA 2, COA 3

### Layer Operations

- **Create layer**: Layers panel > Add Tactical Layer
- **Assign graphics**: Drag graphics to layer
- **Toggle visibility**: Eye icon to show/hide
- **Lock layer**: Prevent edits
- **Export layer**: Save as GeoJSON/KML

## Templates and Libraries

### Saving Templates

1. Create and style a common graphic
2. Right-click > Save as Template
3. Name template (e.g., "Standard Route")
4. Template appears in Draw Tool library

### Using Templates

1. Open Draw Tool
2. Templates tab shows saved templates
3. Click template to begin drawing with predefined styling

### Sharing Libraries

- Export template library: Settings > Templates > Export
- Import shared library: Settings > Templates > Import
- Libraries saved as JSON for version control

## Measurement and Analysis

### Measuring Graphics

Select graphic to view:
- **Length**: Linear graphics (in meters, kilometers, miles)
- **Area**: Polygons (in sq meters, sq kilometers, sq miles, acres)
- **Perimeter**: Polygon boundary length
- **Vertices**: Number of defining points

### Buffer Analysis

1. Select graphic
2. Right-click > Analysis > Buffer
3. Enter distance (meters)
4. Creates new buffer polygon layer

### Line of Sight

1. Draw line graphic between points
2. Right-click > Analysis > Line of Sight
3. Requires terrain data (Python sidecar)
4. Shows visible/obscured segments

## Fire Support Planning

### Creating FSCMs (Fire Support Coordination Measures)

**Fire Support Area (FSA)**:
1. Tactical > Draw Graphic > Fire Support > FSA
2. Define polygon boundary
3. Set name, effective times
4. Assign to unit for coordination

**Coordinated Fire Line (CFL)**:
1. Draw line graphic
2. Properties > Type > CFL
3. Side designation (friendly/enemy)

**Target Reference Points (TRP)**:
1. Place point graphic
2. Designate with TRP number
3. Link to fire planning system

### Target Areas

- **Target Area of Interest (TAI)**: Collection focus
- **Target Priority Area (TPA)**: Fire priority
- **Named Area of Interest (NAI)**: Intelligence focus

## Interoperability

### Supported Standards

- **APP-6D**: NATO standard tactical graphics
- **MIL-STD-2525D**: US military symbology
- **ADRP 1-02**: US Army graphic standards

### Export Formats

**For C4I Systems**:
- GeoJSON with APP-6D codes
- KML with structured ExtendedData
- Military Grid Reference System (MGRS) coordinates

**For GIS**:
- Shapefile with attribute schema
- GeoPackage layers
- GeoParquet for cloud storage

**For Planning Tools**:
- MilXLY exchange format - *planned v0.9*
- OVL overlay files - *planned v0.9*

## Advanced Techniques

### Multi-Phase Operations

1. Create layer for each time phase
2. Duplicate graphics across phases
3. Modify end state for each phase
4. Animate through phases: View > Time Slider

### 3D Tactical Graphics

1. Enable terrain: View > Controls > Terrain
2. Draw graphics on 3D terrain
3. Vertices snap to elevation
4. View from multiple angles with tilt

### Graphic Automation

**Route Planning**:
1. Place waypoints on map
2. Tactical > Auto-Route
3. Generates route following roads/terrain
4. Editable after generation

**Boundary Snap**:
1. Draw approximate boundary
2. Right-click > Snap to > Roads/Rivers/Terrain
3. Boundary adjusts to natural features

### Coordination with Symbols

Link graphics to symbols:
1. Select unit symbol
2. Assign to graphic (right-click > Assign Unit)
3. Graphic shows responsible unit
4. Filter view by assigned units

## Best Practices

### Clear Labeling
- Use standard military nomenclature
- Include phase designation (e.g., "PL BLUE (H+2)")
- Number sequential graphics (OBJ 1, OBJ 2)

### Color Coding
- **Blue**: Friendly forces/measures
- **Red**: Enemy forces/measures
- **Green**: Neutral/administrative
- **Yellow**: Hazards/warnings
- **Purple**: Civil-military operations

### Precision
- Zoom in for accurate vertex placement
- Use coordinate entry for critical points
- Verify measurements before finalizing
- Cross-reference with map features

### Documentation
- Add descriptive text to complex graphics
- Link to orders or planning documents
- Include effective times and expiration
- Export versions as planning evolves

### Performance
- Limit vertices in large polygons
- Simplify graphics when appropriate
- Use straight segments where possible
- Avoid overlapping transparent fills

## Troubleshooting

### Graphics Not Saving
- Ensure graphic has valid geometry
- Check for self-intersecting polygons
- Verify label is not empty
- Save project to persist graphics

### Drawing Issues
- Clear draw mode: Press Escape
- Restart draw tool if unresponsive
- Check console for geometry errors
- Update to latest version

### Export Problems
- Validate graphic properties before export
- Ensure all graphics have names
- Check coordinate system compatibility
- Use GeoJSON for maximum compatibility

### Display Issues
- Adjust zoom level for visibility
- Check layer visibility settings
- Verify graphics layer is not locked
- Clear graphics cache: Settings > Advanced
