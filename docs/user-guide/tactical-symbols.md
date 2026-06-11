# Tactical Symbols (APP-6D)

MilGeo.app provides comprehensive support for NATO APP-6D (MIL-STD-2525D) military tactical symbols, enabling accurate representation of units, installations, equipment, and activities on the tactical map.

## Symbol Catalog

Access the symbol catalog from **Tactical > Place Symbol** or press `Ctrl+M`.

### Symbol Organization

Symbols are organized by:

- **Affiliation**: Friend, Hostile, Neutral, Unknown
- **Dimension**: Land, Sea Surface, Sea Subsurface, Air, Space
- **Category**: Units, Equipment, Installations, Activities
- **Subcategory**: Specific types within each category

### Searching Symbols

The search bar supports:
- **Text search**: Type unit name or type (e.g., "infantry", "tank", "aircraft")
- **SIDC search**: Enter partial SIDC codes to filter
- **Recent symbols**: Access recently used symbols for quick placement

## Placing Symbols

### Basic Placement

1. Open symbol catalog (**Tactical > Place Symbol**)
2. Select affiliation filter (Friend/Hostile/Neutral/Unknown)
3. Browse or search for desired symbol
4. Click symbol in catalog
5. Click map location to place

### Batch Placement

Hold `Shift` after selecting a symbol to place multiple instances without returning to the catalog.

### Import from File

Import existing tactical overlays:

1. **Menu > File > Import > Military Symbols**
2. Select GeoJSON or KML file with SIDC codes
3. Symbols are automatically rendered based on SIDC field
4. Supported field names: `sidc`, `SIDC`, `symbolCode`

## Symbol Attributes

### SIDC (Symbol Identification Code)

Each symbol has a SIDC code that defines:
- **Standard Identity** (position 3): Friend, Hostile, Neutral, Unknown
- **Symbol Set** (positions 5-6): Land Unit, Air, Sea Surface, etc.
- **Status** (position 4): Present, Anticipated, Assumed, etc.
- **Entity/Type** (positions 11-16): Specific unit or equipment type
- **Modifiers** (positions 17-20): Echelon, mobility, etc.

Example SIDC: `10031000161211000000`
- APP-6D standard
- Hostile (3)
- Land Unit (01)
- Armor (11)
- Battalion level (12)

### Editable Properties

Right-click a symbol to edit:

- **Affiliation**: Change between Friend, Hostile, Neutral, Unknown
- **Position**: Drag symbol to new location or enter coordinates
- **Unique Designation**: Unit identifier (e.g., "1-7 CAV")
- **Higher Formation**: Parent unit designation
- **Reinforced/Reduced**: Unit strength modifier
- **Echelon**: Team, Squad, Platoon, Company, Battalion, Brigade, Division, Corps
- **Status**: Present, Anticipated, Assumed, Suspected
- **Additional Text**: Bottom text, top text, left/right modifiers

## Symbol Styling

### Size
- **Small**: Tactical zoom levels
- **Medium**: Operational planning (default)
- **Large**: Strategic overview

Set default size in **Settings > Tactical Symbols**

### Colors
Symbol colors automatically follow APP-6D standards:
- **Blue**: Friend
- **Red**: Hostile
- **Green**: Neutral
- **Yellow**: Unknown

### Frames
- **Filled**: Standard (default)
- **Outline**: Reduced visibility
- **Civilian**: Alternate frame for civilian entities

## ORBAT (Order of Battle)

### Viewing Unit Hierarchy

1. Select a symbol on the map
2. Open **Tactical > ORBAT Panel**
3. View parent and subordinate units
4. Navigate hierarchy tree

### Importing ORBAT

Import complete unit hierarchies:

1. **File > Import > ORBAT**
2. Select JSON file with unit structure
3. Format: `{"unitId": "1-BDE", "parent": "1-DIV", "sidc": "10031000161211000000", "position": [lon, lat]}`
4. Units are automatically organized and positioned

### Exporting ORBAT

Export tactical overlay with unit relationships:

1. **File > Export > ORBAT**
2. Choose format: JSON, GeoJSON, KML
3. Includes unit hierarchy, positions, and SIDC codes

## Tactical Layers

Organize symbols in tactical layers:

### Creating Tactical Layers
1. **Layers panel > Add Group**
2. Name layer (e.g., "Blue Forces", "Red Forces", "Civilian")
3. Drag symbols into layer groups

### Layer Operations
- **Toggle visibility**: Show/hide all symbols in layer
- **Lock layer**: Prevent accidental edits
- **Export layer**: Save specific layer as GeoJSON/KML
- **Style layer**: Apply common styling to all symbols

## Symbol Operations

### Moving Symbols
- **Click and drag**: Reposition on map
- **Coordinate entry**: Right-click > Properties > Enter coordinates
- **Snap to grid**: Enable in Settings for aligned placement

### Copying Symbols
- **Right-click > Duplicate**: Create copy at same location
- **Ctrl+C / Ctrl+V**: Copy and paste
- **Alt+drag**: Duplicate while dragging

### Deleting Symbols
- **Select and press Delete**
- **Right-click > Delete**
- **Select multiple**: Shift+click or drag box, then Delete

### Rotating Symbols
- **Select symbol**
- **Rotate handle** appears
- **Drag** to rotate (shows angle indicator)
- **Snap angles**: 15° increments with Shift held

## Interoperability

### Supported Formats

**Import**:
- GeoJSON with SIDC field
- KML with SIDC in ExtendedData
- MilSymb (native JSON format)
- OVL (MGRS overlay files) - *planned v0.9*

**Export**:
- GeoJSON with SIDC codes
- KML with ExtendedData
- MilSymb JSON
- MilXLY (MilX exchange format) - *planned v0.9*

### Integration with C4I Systems

MilGeo symbol data is compatible with:
- Common Operational Picture (COP) systems
- Command and Control (C2) applications
- Battle Management Systems (BMS)

Use the standardized GeoJSON export for maximum compatibility.

## Best Practices

### Tactical Overlay Organization
- Use separate layers for different forces (Blue, Red, Green)
- Group by time phase or operational area
- Name layers descriptively (e.g., "H-Hour", "D+2", "AO North")

### Symbol Placement Precision
- Zoom to appropriate level before placing symbols
- Use coordinate entry for precise positioning
- Enable grid lines for alignment

### Performance Optimization
- Keep symbol count under 1000 for smooth performance
- Use simplified symbols for large-scale views
- Group static symbols into raster basemaps when possible

### Collaborative Work
- Use SIDC codes for unambiguous symbol identification
- Include Unique Designation for all units
- Document Higher Formation for context
- Export regularly to preserve work

## Troubleshooting

### Symbols Not Displaying
- Verify SIDC code format (20-character string)
- Check layer visibility in Layers panel
- Ensure zoom level is appropriate
- Clear symbol cache: Settings > Advanced > Clear Symbol Cache

### Import Failures
- Validate GeoJSON/KML structure
- Ensure SIDC field exists and contains valid codes
- Check coordinate system (must be WGS84/EPSG:4326)
- Review console for error messages

### Performance Issues
- Reduce number of visible symbols
- Disable higher detail levels
- Use symbol clustering for dense areas
- Increase hardware acceleration in Settings
