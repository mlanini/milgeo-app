import ms from "milsymbol";

// GeoLibre stores and renders 20-character number-based APP-6D SIDCs.
// Initializing milsymbol here makes every portrayal/import/export path use the
// same standard instead of depending on import order from a specific hook.
ms.setStandard("APP6");

export default ms;
