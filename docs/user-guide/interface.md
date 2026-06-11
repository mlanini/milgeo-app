# Interface Overview

MilGeo.app provides a comprehensive military GIS workspace with an intuitive interface designed for tactical planning and geospatial intelligence operations.

## Main Components

### Map Workspace

The central map workspace provides:

- **Pan**: Click and drag to move the map
- **Zoom**: Scroll wheel or pinch gesture to zoom in/out
- **Rotate**: Ctrl + drag or two-finger rotate on touchpad
- **Tilt**: Right-click + drag to tilt the 3D view
- **Reset**: Double-click to reset north orientation

### Toolbar

Located at the top of the interface, the toolbar provides access to:

- **File**: Save, Open, Export projects
- **Data**: Add layers from various sources
- **Tactical**: Military symbols and graphics tools
- **Processing**: Vector and raster analysis tools
- **View**: Toggle panels, controls, and map settings
- **Plugins**: Activate and configure plugins
- **Help**: Documentation, about, and diagnostics

### Side Panels

**Layers Panel** (Left):
- View all loaded layers
- Toggle visibility (eye icon)
- Adjust opacity (slider)
- Reorder layers (drag and drop)
- Zoom to layer extent
- Open attribute table
- Remove layers
- Configure labels

**Style Panel** (Left):
- Live style editing for selected layer
- Fill color and opacity
- Stroke color, width, and opacity
- Circle radius for point features
- Data-driven symbology options

**Attribute Table Panel** (Bottom):
- View and edit feature attributes
- Filter features by attribute values
- Sort columns ascending/descending
- Highlight features on map
- Zoom to selected features
- Export table data

### Status Bar

Located at the bottom, displays:

- Current map center coordinates (longitude, latitude)
- Current zoom level
- Map scale
- Active CRS/projection
- Connection status (Python sidecar)
- Processing progress indicators

## Map Controls

Map controls can be toggled from the **View > Controls** menu:

### Navigation Control
- **Zoom in/out**: +/- buttons
- **Reset north**: Compass button
- **Pitch/bearing**: Rotate and tilt indicators

### Fullscreen Control
- Expand map to fullscreen mode
- Press Esc to exit

### Geolocate Control
- Center map on your current location
- Requires browser location permission
- Shows accuracy circle

### Globe Control
- Toggle 3D globe view
- Ideal for global-scale visualization
- Smooth transition to flat map

### Terrain Control
- Toggle 3D terrain visualization
- Uses elevation data for realistic terrain
- Adjustable exaggeration factor

### Scale Control
- Shows map scale in metric and imperial units
- Updates dynamically with zoom level

### Attribution Control
- Credits for basemap and data sources
- Click to expand full attribution

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save project |
| `Ctrl+O` | Open project |
| `Ctrl+N` | New project |
| `Ctrl+Z` | Undo (in editing mode) |
| `Ctrl+Y` | Redo (in editing mode) |
| `Escape` | Cancel current operation |
| `Delete` | Remove selected features |
| `Tab` | Cycle through panels |
| `F11` | Toggle fullscreen |
| `Ctrl+F` | Focus search/filter |

## Workspace Layouts

MilGeo supports multiple workspace layouts:

### Default Layout
Full interface with toolbar, all panels, and status bar.

### Compact Layout (`?layout=compact`)
Icon-only toolbar buttons, hidden project metadata. Ideal for narrow screens or embedded views.

### Map-Only Layout (`?maponly`)
Pure map view with no toolbar, panels, or status bar. Perfect for presentations and focused analysis.

## Customization

### Panel Arrangement
- Drag panel edges to resize
- Minimize panels to gain more map space
- Panel states persist in project files

### Theme
- Automatic light/dark mode based on system preferences
- Manual theme toggle in Settings

### Map Settings
- Configure default basemap
- Set initial map center and zoom
- Enable/disable specific controls
- Adjust animation settings

## Context Menus

Right-click on:

- **Map**: Add layer, place symbol, measure distance
- **Layer in panel**: Rename, duplicate, export, properties
- **Feature**: Edit attributes, delete, zoom to
- **Symbol**: Edit SIDC, change affiliation, reposition

## Tooltips and Help

- Hover over buttons for descriptive tooltips
- Question mark icons provide contextual help
- Status bar shows hints for current tool
- Help menu links to full documentation
