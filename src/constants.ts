// Type definitions for constants
export interface DrawClasses {
  CONTROL_BASE: string;
  CONTROL_PREFIX: string;
  CONTROL_BUTTON: string;
  CONTROL_BUTTON_LINE: string;
  CONTROL_BUTTON_POLYGON: string;
  CONTROL_BUTTON_POINT: string;
  CONTROL_BUTTON_TRASH: string;
  CONTROL_BUTTON_COMBINE_FEATURES: string;
  CONTROL_BUTTON_UNCOMBINE_FEATURES: string;
  CONTROL_GROUP: string;
  ATTRIBUTION: string;
  ACTIVE_BUTTON: string;
  BOX_SELECT: string;
}

export interface DrawSources {
  HOT: string;
  COLD: string;
}

export interface DrawCursors {
  ADD: string;
  MOVE: string;
  DRAG: string;
  POINTER: string;
  GRAB: string;
  GRABBING: string;
  NONE: string;
}

export interface DrawTypes {
  POLYGON: string;
  LINE: string;
  POINT: string;
}

export interface GeoJSONTypes {
  FEATURE: string;
  POLYGON: string;
  LINE_STRING: string;
  POINT: string;
  FEATURE_COLLECTION: string;
  MULTI_PREFIX: string;
  MULTI_POINT: string;
  MULTI_LINE_STRING: string;
  MULTI_POLYGON: string;
}

export interface DrawModes {
  COINCIDENT_SELECT: string;
  DRAW_LINE_STRING: string;
  DRAW_POLYGON: string;
  DRAW_FREEHAND_POLYGON: string;
  DRAW_POINT: string;
  SIMPLE_SELECT: string;
  DIRECT_SELECT: string;
  STATIC: string;
  FREEHAND: string;
  MARQUEE: string;
  SPLIT: string;
}

export interface DrawEvents {
  CREATE: string;
  CREATING: string;
  DELETE: string;
  UPDATE: string;
  VERTEX_PLACED: string;
  SELECTION_CHANGE: string;
  MODE_CHANGE: string;
  ACTIONABLE: string;
  RENDER: string;
  COMBINE_FEATURES: string;
  UNCOMBINE_FEATURES: string;
  EXTEND_LINE: string;
}

export interface UpdateActions {
  MOVE: string;
  CHANGE_COORDINATES: string;
}

export interface MetaTypes {
  FEATURE: string;
  MIDPOINT: string;
  VERTEX: string;
}

export interface ActiveStates {
  ACTIVE: string;
  INACTIVE: string;
}

export interface LayerIds {
  LINE: {
    INACTIVE: string;
    ACTIVE: string;
  };
}

export interface PaintProperties {
  LINE: {
    WIDTH: number;
    COLOR: string;
    OPACITY: number;
  };
}

export interface Constants {
  classes: DrawClasses;
  sources: DrawSources;
  cursors: DrawCursors;
  types: DrawTypes;
  geojsonTypes: GeoJSONTypes;
  modes: DrawModes;
  groupSelectModes: string[];
  events: DrawEvents;
  updateActions: UpdateActions;
  meta: MetaTypes;
  activeStates: ActiveStates;
  interactions: string[];
  LAT_MIN: number;
  LAT_RENDERED_MIN: number;
  LAT_MAX: number;
  LAT_RENDERED_MAX: number;
  LNG_MIN: number;
  LNG_MAX: number;
  layerIds: LayerIds;
  paintProperties: PaintProperties;
}

const constants: Constants = {
  classes: {
    CONTROL_BASE: "mapboxgl-ctrl",
    CONTROL_PREFIX: "mapboxgl-ctrl-",
    CONTROL_BUTTON: "mapbox-gl-draw_ctrl-draw-btn",
    CONTROL_BUTTON_LINE: "mapbox-gl-draw_line",
    CONTROL_BUTTON_POLYGON: "mapbox-gl-draw_polygon",
    CONTROL_BUTTON_POINT: "mapbox-gl-draw_point",
    CONTROL_BUTTON_TRASH: "mapbox-gl-draw_trash",
    CONTROL_BUTTON_COMBINE_FEATURES: "mapbox-gl-draw_combine",
    CONTROL_BUTTON_UNCOMBINE_FEATURES: "mapbox-gl-draw_uncombine",
    CONTROL_GROUP: "mapboxgl-ctrl-group",
    ATTRIBUTION: "mapboxgl-ctrl-attrib",
    ACTIVE_BUTTON: "active",
    BOX_SELECT: "mapbox-gl-draw_boxselect",
  },
  sources: {
    HOT: "mapbox-gl-draw-hot",
    COLD: "mapbox-gl-draw-cold",
  },
  cursors: {
    ADD: "add",
    MOVE: "move",
    DRAG: "drag",
    POINTER: "pointer",
    GRAB: "grab",
    GRABBING: "grabbing",
    NONE: "none",
  },
  types: {
    POLYGON: "polygon",
    LINE: "line_string",
    POINT: "point",
  },
  geojsonTypes: {
    FEATURE: "Feature",
    POLYGON: "Polygon",
    LINE_STRING: "LineString",
    POINT: "Point",
    FEATURE_COLLECTION: "FeatureCollection",
    MULTI_PREFIX: "Multi",
    MULTI_POINT: "MultiPoint",
    MULTI_LINE_STRING: "MultiLineString",
    MULTI_POLYGON: "MultiPolygon",
  },
  modes: {
    COINCIDENT_SELECT: "coincident_select",
    DRAW_LINE_STRING: "draw_line_string",
    DRAW_POLYGON: "draw_polygon",
    DRAW_FREEHAND_POLYGON: "draw_freehand_polygon",
    DRAW_POINT: "draw_point",
    SIMPLE_SELECT: "simple_select",
    DIRECT_SELECT: "direct_select",
    STATIC: "static",
    FREEHAND: "freehand",
    MARQUEE: "marquee",
    SPLIT: "split",
  },
  groupSelectModes: ["freehand", "marquee"],
  events: {
    CREATE: "draw.create",
    CREATING: "draw.creating",
    DELETE: "draw.delete",
    UPDATE: "draw.update",
    VERTEX_PLACED: "draw.vertexplaced",
    SELECTION_CHANGE: "draw.selectionchange",
    MODE_CHANGE: "draw.modechange",
    ACTIONABLE: "draw.actionable",
    RENDER: "draw.render",
    COMBINE_FEATURES: "draw.combine",
    UNCOMBINE_FEATURES: "draw.uncombine",
    EXTEND_LINE: 'draw.extendline',
  },
  updateActions: {
    MOVE: "move",
    CHANGE_COORDINATES: "change_coordinates",
  },
  meta: {
    FEATURE: "feature",
    MIDPOINT: "midpoint",
    VERTEX: "vertex",
  },
  activeStates: {
    ACTIVE: "true",
    INACTIVE: "false",
  },
  interactions: [
    "scrollZoom",
    "boxZoom",
    "dragRotate",
    "dragPan",
    "keyboard",
    "doubleClickZoom",
    "touchZoomRotate",
  ],
  LAT_MIN: -90,
  LAT_RENDERED_MIN: -85,
  LAT_MAX: 90,
  LAT_RENDERED_MAX: 85,
  LNG_MIN: -270,
  LNG_MAX: 270,
  layerIds: {
    LINE: {
      INACTIVE: "gl-draw-line-inactive",
      ACTIVE: "gl-draw-line-active",
    },
  },
  paintProperties: {
    LINE: {
      WIDTH: 5,
      COLOR: "#FFD300",
      OPACITY: 0.7,
    },
  },
};

export default constants;
