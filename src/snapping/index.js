const { throttle, cloneDeep, last } = require("lodash");
const getNearestPointOnLine = require("@turf/nearest-point-on-line").default;
const turfDistance = require("@turf/distance").default;
const {
  point: turfPoint,
  lineString: turfLineString,
  multiLineString: turfMultiLineString,
  featureCollection: turfFeatureCollection,
} = require("@turf/helpers");
const turfCircle = require("@turf/circle").default;
const { getCoord, getCoords, getType } = require("@turf/invariant");

const {
  findVertexInCircleMulti,
  deepFlatten,
  isMultiGeometry,
} = require("./util");
const { isSnapPointLayerId } = require("./is_snap_point_layer_id");
const {
  STATIC,
  FREEHAND,
  MARQUEE,
  DIRECT_SELECT,
  SIMPLE_SELECT,
  DRAW_LINE_STRING,
  DRAW_POLYGON,
  COINCIDENT_SELECT,
  DRAW_POINT,
  SPLIT,
} = require("../constants").modes;

const LINE_MODES = [DIRECT_SELECT, DRAW_LINE_STRING, DRAW_POLYGON];
const POINT_MODES = [SIMPLE_SELECT, DRAW_POINT, COINCIDENT_SELECT];

const MOUSE_UP_MODES = [
  DIRECT_SELECT,
  SIMPLE_SELECT,
  DRAW_POINT,
  COINCIDENT_SELECT,
  FREEHAND,
  MARQUEE,
];

const MOUSE_DOWN_MODES = [DRAW_LINE_STRING, DRAW_POLYGON];

const MOUSEMOVE_THROTTLE_MS = 100;

class Snapping {
  constructor(ctx) {
    this.map = ctx.map;
    this.snappedFeature = null;
    this.snappedGeometry = null;
    this.snapLayerFilter = ctx.options.snapLayerFilter;
    this.fetchSnapGeometry = ctx.options.fetchSnapGeometry;
    this.fetchSnapGeometries = ctx.options.fetchSnapGeometries;
    this._updateSourceGeomCache = ctx.options._updateSourceGeomCache;
    this._setGeomCacheIfNotExists = ctx.options._setGeomCacheIfNotExists;
    this.fetchSourceGeometry = ctx.options.fetchSourceGeometry;
    this.fetchSourceGeometries = ctx.options.fetchSourceGeometries;
    this.getClosestPoint = ctx.options.getClosestPoint;
    this.resetSnappingGeomCache = ctx.options.resetSnappingGeomCache;
    this.fetchMapExtentGeometry = ctx.options.fetchMapExtentGeometry;
    this.snapDistance = ctx.options.snapDistance;
    this.store = ctx.store;
    this.snapToSelected = false;
    this.snappingEnabled = false;
    this.snapLayers = [];
    // this is the amount the endpoints are preferenced as snap points. and is related to the angle between the hover point, the nearest point and the endpoint
    this.vertexPullFactor = Math.sqrt(2);

    this._mouseMoveHandler = this._mouseMoveHandler.bind(this);
    this._mouseoutHandler = this._mouseoutHandler.bind(this);
    this.refreshSnapLayers = this.refreshSnapLayers.bind(this);
    this.clearSnapCoord = this.clearSnapCoord.bind(this);
    this.setSnapToSelected = this.setSnapToSelected.bind(this);
    this.cursorIsSnapped = this.cursorIsSnapped.bind(this);
    this.disableSnapping = this.disableSnapping.bind(this);
    this.enableSnapping = this.enableSnapping.bind(this);
    this.resetSnappingGeomCache = this.resetSnappingGeomCache.bind(this);
    this.fetchMapExtentGeometry = this.fetchMapExtentGeometry.bind(this);
    this.fetchSourceGeometry = this.fetchSourceGeometry.bind(this);
    this.fetchSourceGeometries = this.fetchSourceGeometries.bind(this);
    this.getClosestPoint = this.getClosestPoint.bind(this);

    this.initialize();
    this._throttledMouseMoveHandler = throttle(
      this._mouseMoveHandler,
      MOUSEMOVE_THROTTLE_MS
    );
    this.attachApi(ctx);
  }

  initialize() {
    this.map.on("styledata", () => {
      this._updateSnapLayers();
    });
    this.map.on("draw.update", () => {
      this.clearSnapCoord();
    });
    this.map.on("draw.modechange", () => {
      this.clearSnapCoord();
    });
    this.map.on("draw.refreshsnapping", () => {
      this._addSnapSourceAndLayer();
    });
  }

  /** OUTWARD FACING METHODS */

  attachApi(ctx) {
    // To whom so ever has beef with this, I'm with you, but without re-designing things on a greater scale... this is how it is.
    ctx.api.refreshSnapLayers = this.refreshSnapLayers;
    ctx.api.clearSnapCoord = this.clearSnapCoord;
    ctx.api.cursorIsSnapped = this.cursorIsSnapped;
    ctx.api.disableSnapping = this.disableSnapping;
    ctx.api.enableSnapping = this.enableSnapping;
    ctx.api.resetSnappingGeomCache = this.resetSnappingGeomCache;
    ctx.api.fetchMapExtentGeometry = this.fetchMapExtentGeometry;
    ctx.api.fetchSourceGeometry = this.fetchSourceGeometry;
    ctx.api.fetchSourceGeometries = this.fetchSourceGeometries;
    ctx.api.getClosestPoint = this.getClosestPoint;
    ctx.api.snapToSelectedLineForSplitEvent =
      this.snapToSelectedLineForSplitEvent.bind(this);
  }

  /** Horizontal/vertical turf distance for `snapDistance` px (no *10; used for point→line perpendicular proximity). */
  _splitScreenSnapRadiusBaseKm(mousePoint) {
    const { x, y } = mousePoint;
    const d = this.snapDistance;
    const c = this.map.unproject([x, y]).toArray();
    const p0 = turfPoint(c);
    const hKm = turfDistance(
      p0,
      turfPoint(this.map.unproject([x + d, y]).toArray()),
      { units: "kilometers" }
    );
    const vKm = turfDistance(
      p0,
      turfPoint(this.map.unproject([x, y + d]).toArray()),
      { units: "kilometers" }
    );
    return Math.max(hKm, vKm, 1e-9);
  }

  /** Mouse→line snap cap derived from `snapDistance` px, with *10 buffer for line-offset paint. */
  _splitScreenSnapRadiusKm(mousePoint) {
    return this._splitScreenSnapRadiusBaseKm(mousePoint) * 10;
  }

  /**
   * Split tool only: snap ring / click uses the selected line geometry from the draw store.
   * Reads the Feature's live coordinates array directly (LineString) or its aggregated
   * getCoordinates (MultiLineString) to avoid the deep-clone cost of toGeoJSON on every
   * throttled mousemove. Uses a geographic distance cap derived from snapDistance px so
   * line-offset paint does not break snaps.
   *
   * When the cursor is over a rendered point feature (e.g. network points), projects that
   * point onto the line and uses that location for the indicator and click if within snap distance.
   * Requires the host app to expose point layers via `snapLayerFilter` / `fetchSnapGeometry`.
   * Hosts should cache `fetchSnapGeometry` / `fetchSourceGeometries` — this runs on throttled
   * mousemove when a point layer is under the cursor and may call into the host hook frequently.
   */
  async snapToSelectedLineForSplitEvent({ point: mousePoint, lngLat }) {
    const fail = () => {
      this.snappedFeature = null;
      this.snappedGeometry = null;
      this.clearSnapCoord();
      this.map.fire("draw.snapped", { snapped: false });
      return lngLat;
    };

    const selectedIds = this.store.getSelectedIds();
    if (!selectedIds || !selectedIds.length) return fail();

    const selectedId = selectedIds[0];
    const drawFeat = this.store.get(selectedId);
    if (!drawFeat) return fail();

    const typ = drawFeat.type;
    if (typ !== "LineString" && typ !== "MultiLineString") return fail();

    // LineString: read the live coords array directly (no clone). MultiLineString: fall back
    // to getCoordinates() since child-feature coords need aggregation; turf does not mutate.
    let coords;
    try {
      coords = typ === "LineString" ? drawFeat.coordinates : drawFeat.getCoordinates();
    } catch (err) {
      return fail();
    }

    const coordsValid =
      typ === "LineString"
        ? Array.isArray(coords) && coords.length >= 2
        : Array.isArray(coords) &&
          coords.length > 0 &&
          coords.every((line) => Array.isArray(line) && line.length >= 2);
    if (!coordsValid) return fail();

    const clickPt = turfPoint(
      this.map.unproject([mousePoint.x, mousePoint.y]).toArray()
    );

    const lineGeom =
      typ === "LineString" ? turfLineString(coords) : turfMultiLineString(coords);

    const nearestFromMouse = getNearestPointOnLine(lineGeom, clickPt, {
      units: "kilometers",
    });

    if (
      !nearestFromMouse ||
      nearestFromMouse.properties.dist === undefined ||
      !Number.isFinite(nearestFromMouse.properties.dist)
    ) {
      return fail();
    }

    const maxSnapKm = this._splitScreenSnapRadiusKm(mousePoint);
    if (nearestFromMouse.properties.dist > maxSnapKm) return fail();

    const maxVertexToLineKm = this._splitScreenSnapRadiusBaseKm(mousePoint);

    let nearest = nearestFromMouse;

    const mapboxPointFeat = this._getClosestMapboxPoint(mousePoint.x, mousePoint.y);
    if (mapboxPointFeat && typeof this.fetchSnapGeometry === "function") {
      try {
        const pointGeom = await this.fetchSnapGeometry(mapboxPointFeat);
        if (pointGeom && pointGeom.type === "Point") {
          const vertexPt = turfPoint(pointGeom.coordinates);
          const nearestFromVertex = getNearestPointOnLine(lineGeom, vertexPt, {
            units: "kilometers",
          });
          if (
            nearestFromVertex &&
            nearestFromVertex.properties.dist !== undefined &&
            Number.isFinite(nearestFromVertex.properties.dist) &&
            nearestFromVertex.properties.dist <= maxVertexToLineKm
          ) {
            nearest = nearestFromVertex;
            this.snappedGeometry = pointGeom;
            this.snappedFeature = mapboxPointFeat;

            const snapSrc = this.map.getSource("_snap_vertex");
            if (!snapSrc) {
              return fail();
            }
            snapSrc.setData(turfFeatureCollection([nearest]));
            this.map.fire("draw.snapped", { snapped: true });

            const [lng, lat] = getCoord(nearest);
            return {
              lng,
              lat,
              snapped: true,
              snappedFeature: this.snappedFeature,
            };
          }
        }
      } catch (err) {
        // fall through to mouse-nearest-on-line
      }
    }

    this.snappedGeometry = { type: typ, coordinates: coords };
    this.snappedFeature = {
      type: "Feature",
      geometry: { type: typ, coordinates: coords },
      properties: { vetro_id: selectedId },
    };

    const snapSrc = this.map.getSource("_snap_vertex");
    if (!snapSrc) {
      return fail();
    }
    snapSrc.setData(turfFeatureCollection([nearest]));
    this.map.fire("draw.snapped", { snapped: true });

    const [lng, lat] = getCoord(nearest);
    return {
      lng,
      lat,
      snapped: true,
      snappedFeature: this.snappedFeature,
    };
  }

  refreshSnapLayers() {
    this._updateSnapLayers();
  }

  setSnapToSelected(shouldSnapToSelected) {
    this.snapToSelected = shouldSnapToSelected;
  }

  cursorIsSnapped() {
    const source = this.map.getSource("_snap_vertex");
    return source && source._data.features.length > 0;
  }

  clearSnapCoord() {
    const source = this.map.getSource("_snap_vertex");
    if (source && source._data.features.length > 0) {
      source.setData({ type: "FeatureCollection", features: [] });
    }
  }

  _addSnapSourceAndLayer() {
    if (this.map.getSource("_snap_vertex")) return;

    this.map.addSource("_snap_vertex", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    this.map.addLayer({
      id: "_snap_vertex",
      type: "circle",
      source: "_snap_vertex",
      paint: {
        "circle-color": "transparent",
        "circle-radius": 5,
        "circle-stroke-width": 3,
        "circle-stroke-color": "orange",
      },
    });
  }

  disableSnapping() {
    this.snappingEnabled = false;
    this.map.off("mousemove", this._throttledMouseMoveHandler);
    this.map.off("mouseout", this._mouseoutHandler);

    if (this.map.getLayer("_snap_vertex")) this.map.removeLayer("_snap_vertex");
    if (this.map.getSource("_snap_vertex"))
      this.map.removeSource("_snap_vertex");
  }

  enableSnapping() {
    this.snappingEnabled = true;
    this._addSnapSourceAndLayer();
    this.map.on("mousemove", this._throttledMouseMoveHandler);
    this.map.on("mouseout", this._mouseoutHandler);

    // If the feature has been snapped to a linestring or
    // a polygon, nearestPointOnLine may give an innacurate result (e.g., slightly off the line),
    // especially if the line is very long. Therefore, when the vertex is "complete", we go to the
    // database to get a point that is truly on the snapped-to feature
    this.map.on("mousedown", (e) => {
      if (!this.snappedGeometry || !this._drawEndsOnMouseDown()) return;

      this._handleSnapEnd(e);
    });

    this.map.on("mouseup", (e) => {
      if (!this.snappedGeometry || !this._drawEndsOnMouseUp()) return;

      this._handleSnapEnd(e);
    });
  }

  _handleSnapEnd(e) {
    // setTimeout called because sometimes the draw store will not have correct coordinates
    // (e.g., point draw will have an empty array of coordinates)
    setTimeout(async () => {
      await this._setSnappedFeature(e);

      if (this._isLineDraw()) {
        this._handleLineStringAndPolygonSnapEnd();
      } else if (this._isPointDraw()) {
        this._handlePointSnapEnd();
      }
    });
  }

  async _setSnappedFeature(e) {
    const {
      point: { x, y },
    } = e;

    let snapToFeature;

    // avoid snapping points to points
    if (this._isLineDraw()) {
      snapToFeature = this._getClosestMapboxPoint(x, y);
    }

    if (!snapToFeature) {
      snapToFeature = await this._getClosestLineStringOrPolygon(x, y);
    }

    if (!snapToFeature) {
      this._mouseoutHandler();
      return;
    }

    if (this.snappedFeature) {
      this._setSnapHoverState(this.snappedFeature, false);
    }

    // snappedGeometry: geometry of snapped-to feature retrieved from database
    // snappedFeature: mapbox feature of snapped to feature - has metadata but simplified geometry
    this.snappedGeometry = await this.fetchSnapGeometry(snapToFeature);

    if (!this.snappedGeometry) return;

    this.snappedFeature = snapToFeature;
    this._setSnapHoverState(this.snappedFeature, true);
  }

  async _handlePointSnapEnd() {
    if (this._isSnappedToPoint()) return;

    const feature = cloneDeep(this.store.ctx.api.getAll().features[0]);
    const [lng, lat] = getCoords(feature);

    const { vetro_id: vetroId } = this.snappedFeature.properties;

    const closestPoint = await this.getClosestPoint(vetroId, lng, lat);

    feature.geometry.coordinates = getCoord(closestPoint);

    const fc = turfFeatureCollection([feature]);

    this.store.ctx.api.set(fc);
  }

  async _handleLineStringAndPolygonSnapEnd() {
    if (!this.snappedFeature) return;
    if (this._isSnappedToPoint()) return;

    // get edited coordinate
    if (!this.store.ctx.api.getSelectedPoints().features[0]) return;
    const updatedCoord = this._getUpdatedLineDrawCoord();

    const [lng, lat] = updatedCoord;

    const { vetro_id: vetroId } = this.snappedFeature.properties;

    // get closest point on snapped feature from db, bypassing issues w/ turf/nearest-point-on-line
    const closestPoint = await this.getClosestPoint(vetroId, lng, lat);

    // find index of coord to update
    const feature = cloneDeep(this.store.ctx.api.getAll().features[0]);
    const isMultiFeature = isMultiGeometry(feature.geometry);
    // Need to extend the functionality below to work with Multi geometry features
    if (!isMultiFeature) {
      const isPolygon = getType(feature) === "Polygon";
      const coords = isPolygon ? getCoords(feature)[0] : getCoords(feature);
      const index = coords.findIndex(
        (coord) => coord[0] === updatedCoord[0] && coord[1] === updatedCoord[1]
      );

      // there is a chance that the vertex is being deleted, so no snapping needed.
      if (index < 0) return;

      // update feature with the true closest point
      const targetCoordinates = isPolygon
        ? feature.geometry.coordinates[0]
        : feature.geometry.coordinates;

      targetCoordinates.splice(index, 1, getCoord(closestPoint));

      // if first coord was changed, need to change last coord as well
      if (isPolygon && index === 0) {
        targetCoordinates.splice(
          feature.geometry.coordinates[0].length - 1,
          1,
          getCoord(closestPoint)
        );
      }
    }

    // set this feature as the drawing
    const fc = turfFeatureCollection([feature]);
    this.store.ctx.api.set(fc);
  }

  _getUpdatedLineDrawCoord() {
    if (!this._isLineDraw()) {
      throw new Error("Cannot get line draw coord for non-line draw");
    }

    if (this.store.ctx.api.getMode() === "direct_select") {
      const coord = getCoord(
        this.store.ctx.api.getSelectedPoints().features[0]
      );

      return coord;
    } else {
      const feature = this.store.ctx.api.getAll().features[0];
      const coords = getCoords(feature);
      if (getType(feature) === "Polygon") {
        // return 2nd to last coordiante (last coordinate is same as first)
        return coords[0][coords[0].length - 2];
      }

      return last(coords);
    }
  }

  _circleFromMousePoint(x, y) {
    const mousePointAsLngLat = this.map.unproject([x, y]).toArray();
    const mouseLatLng = turfPoint(mousePointAsLngLat);

    const snapDistanceDeltaLatLng = turfPoint(
      this.map.unproject([x + this.snapDistance, y]).toArray()
    );

    const km = turfDistance(mouseLatLng, snapDistanceDeltaLatLng);

    const circle = turfCircle(mousePointAsLngLat, km);

    return circle;
  }

  // create a square polygon around a point where each side is <halfPixels> away from the center
  getPixelBboxFromPoint({ x, y, halfPixels = 10 }) {
    // ensure that high dpi screens have the same size bounding box
    const adjustedHalfPixels = halfPixels * window.devicePixelRatio;

    const pixelBbox = [
      [x - adjustedHalfPixels, y - adjustedHalfPixels],
      [x + adjustedHalfPixels, y + adjustedHalfPixels],
    ];

    return pixelBbox;
  }

  _getClosestMapboxPoint(x, y) {
    const pointIds = this.snapLayers.filter(isSnapPointLayerId);

    const bbox = this.getPixelBboxFromPoint({ x, y });

    // get close by points
    const availablePoints = this.map.queryRenderedFeatures(bbox, {
      layers: pointIds,
    });

    return availablePoints[0];
  }

  async _getClosestLineStringOrPolygon(x, y) {
    const polyOrLineIds = this.snapLayers.filter((id) =>
      id.match(/(polygon|linestring)$/)
    );

    const mode = this.store.ctx.api.getMode();
    const selected = this.store.ctx.api.getSelected().features[0];
    // Compare vetro_id as strings — tiles often use numeric ids while the draw store uses strings.
    // In split mode, only the line being split should accept a split mark.
    // Elsewhere, exclude the active feature so vertices snap to other lines, not self.
    let filter;
    if (mode === SPLIT && selected) {
      filter = ["==", ["to-string", ["get", "vetro_id"]], String(selected.id)];
    } else if (selected) {
      filter = ["!=", ["to-string", ["get", "vetro_id"]], String(selected.id)];
    } else {
      filter = ["all"];
    }

    const bbox = this.getPixelBboxFromPoint({ x, y });
    // get close by linestring and polygons
    const availableFeatures = this.map.queryRenderedFeatures(bbox, {
      filter,
      layers: polyOrLineIds,
    });

    if (availableFeatures.length === 0) return null;
    if (availableFeatures.length === 1) return availableFeatures[0];

    // find a feature that has a vertex near the snap point
    const circle = this._circleFromMousePoint(x, y);

    // get real geometry for every feature so that it will have all vertexes
    // limit vertex check to 50 features
    const fullGeometries = await this.fetchSnapGeometries(
      availableFeatures.slice(0, 50)
    );

    const lineStrings = fullGeometries.map((geometry, index) => {
      if (isMultiGeometry(geometry)) {
        return turfMultiLineString(
          geometry.coordinates,
          availableFeatures[index].properties
        );
      }

      return turfLineString(
        geometry.coordinates,
        availableFeatures[index].properties
      );
    });

    const lineWithCloseVertex = lineStrings.find(
      (feature) => !!findVertexInCircleMulti(feature, circle)
    );

    if (lineWithCloseVertex) return lineWithCloseVertex;

    // return the first feature if there is no nearby vertex
    return availableFeatures[0];
  }

  _isSnappedToPoint() {
    return getType(this.snappedFeature) === "Point";
  }

  _isPointDraw() {
    return POINT_MODES.includes(this.store.ctx.api.getMode());
  }

  _isLineDraw() {
    return LINE_MODES.includes(this.store.ctx.api.getMode());
  }

  _drawEndsOnMouseUp() {
    return MOUSE_UP_MODES.includes(this.store.ctx.api.getMode());
  }

  _drawEndsOnMouseDown() {
    return MOUSE_DOWN_MODES.includes(this.store.ctx.api.getMode());
  }

  async _mouseMoveHandler(e) {
    const mode = this.store.ctx.api.getMode();
    if ([FREEHAND, MARQUEE, STATIC].includes(mode)) return;
    if (
      [DIRECT_SELECT, SIMPLE_SELECT].includes(mode) &&
      this.store?.ctx?.map?.dragPan?._mousePan?._enabled
    ) {
      return;
    }

    if (mode === SPLIT) {
      await this.snapToSelectedLineForSplitEvent(e);
      return;
    }

    await this._setSnappedFeature(e);
  }

  _getVertexOrClosestPoint(snapGeom, mousePoint) {
    const { x, y } = mousePoint;
    const circle = this._circleFromMousePoint(x, y);
    const hoverPoint = turfPoint(this.map.unproject([x, y]).toArray());

    const vertex = findVertexInCircleMulti(snapGeom, circle, hoverPoint);
    if (vertex) return turfPoint(vertex);

    let closestPoint;

    if (isMultiGeometry(snapGeom.geometry)) {
      const { features: flattenedFeatures } = deepFlatten(snapGeom);
      const flattenedFeaturesSortedByDistance = flattenedFeatures
        .flatMap((feature) => getNearestPointOnLine(feature, hoverPoint))
        .sort(
          (pointA, pointB) => pointA.properties.dist - pointB.properties.dist
        );
      return flattenedFeaturesSortedByDistance[0];
    } else {
      closestPoint = getNearestPointOnLine(snapGeom, hoverPoint);
    }
    return closestPoint;
  }

  _getSnapPoint(mousePoint) {
    const coordinates = getCoords(this.snappedGeometry);
    const geomType = getType(this.snappedGeometry);

    if (geomType === "Point") return turfPoint(coordinates);

    const lineStringCoordinates = coordinates;

    // polygons are converted to lines for snapping, so this will
    // always be a line or multiline if it's not a point
    let lineString;
    if (geomType === "MultiLineString") {
      lineString = turfMultiLineString(lineStringCoordinates);
    } else {
      lineString = turfLineString(lineStringCoordinates);
    }

    return this._getVertexOrClosestPoint(lineString, mousePoint);
  }

  // uses features established by mousemove handler
  // might not need feature filter
  snapCoord({ point: mousePoint, lngLat }, featureFilter) {
    const snappedFeatureFiltered =
      featureFilter && featureFilter(this.snappedFeature);

    const shouldSnap =
      this.snappedGeometry && this.snappingEnabled && !snappedFeatureFiltered;

    if (shouldSnap) {
      const snapPoint = this._getSnapPoint(mousePoint);

      const fc = turfFeatureCollection([snapPoint]);

      this.map.getSource("_snap_vertex").setData(fc);

      this.map.fire("draw.snapped", { snapped: true });

      const [lng, lat] = getCoord(snapPoint);

      return {
        lng,
        lat,
        snapped: true,
        snappedFeature: this.snappedFeature,
      };
    } else {
      this.clearSnapCoord();
      this.map.fire("draw.snapped", { snapped: false });

      return lngLat;
    }
  }

  /** INTERNAL METHODS */

  _snappableLayers() {
    const style = this.map.getStyle();

    if (style) {
      return style.layers
        .filter((l) => this.snapLayerFilter(l))
        .map((l) => l.id);
    }

    return [];
  }

  _setSnapHoverState(feature, state) {
    if (feature.id !== undefined) {
      const fs = {
        id: feature.id,
        source: feature.source,
      };
      if (feature.sourceLayer) fs.sourceLayer = feature.sourceLayer;
      this.map.setFeatureState(fs, { "snap-hover": state });
    }
  }

  _mouseoutHandler() {
    if (this.snappedFeature) {
      this._setSnapHoverState(this.snappedFeature, false);
      this.snappedGeometry = null;
      this.snappedFeature = null;
    }
  }

  _updateSnapLayers() {
    if (!this.snappingEnabled) return;

    this.snapLayers = this._snappableLayers();
  }
}

module.exports = Snapping;
