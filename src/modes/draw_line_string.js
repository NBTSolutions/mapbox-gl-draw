const CommonSelectors = require("../lib/common_selectors");
const isEventAtCoordinates = require("../lib/is_event_at_coordinates");
const doubleClickZoom = require("../lib/double_click_zoom");
const Constants = require("../constants");
const createVertex = require("../lib/create_vertex");
const isSelectable = require("../lib/is_selectable");
const cursors = require("../constants").cursors;

const DrawLineString = {};

DrawLineString.onSetup = function (opts) {
  opts = opts || {};
  const featureId = opts.featureId;
  let line, currentVertexPosition;
  let direction = "forward";
  if (this._ctx.snapping) {
    this._ctx.snapping.setSnapToSelected(false);
  }

  this._ctx.setGetCursorTypeLogic(({ snapped, overFeatures }) => {
    if (snapped) {
      return cursors.ADD;
    } else {
      return cursors.POINTER;
    }
  });

  if (featureId) {
    line = this.getFeature(featureId);
    if (!line) {
      throw new Error("Could not find a feature with the provided featureId");
    }
    let from = opts.from;
    if (
      from &&
      from.type === "Feature" &&
      from.geometry &&
      from.geometry.type === "Point"
    ) {
      from = from.geometry;
    }
    if (
      from &&
      from.type === "Point" &&
      from.coordinates &&
      from.coordinates.length === 2
    ) {
      from = from.coordinates;
    }
    if (!from || !Array.isArray(from)) {
      throw new Error(
        "Please use the `from` property to indicate which point to continue the line from"
      );
    }
    const lastCoord = line.coordinates.length - 1;
    if (
      line.coordinates[lastCoord][0] === from[0] &&
      line.coordinates[lastCoord][1] === from[1]
    ) {
      currentVertexPosition = lastCoord + 1;
      // add one new coordinate to continue from
      line.addCoordinate(currentVertexPosition, ...line.coordinates[lastCoord]);
    } else if (
      line.coordinates[0][0] === from[0] &&
      line.coordinates[0][1] === from[1]
    ) {
      direction = "backwards";
      currentVertexPosition = 0;
      // add one new coordinate to continue from
      line.addCoordinate(currentVertexPosition, ...line.coordinates[0]);
    } else {
      throw new Error(
        "`from` should match the point at either the start or the end of the provided LineString"
      );
    }
  } else {
    line = this.newFeature({
      type: Constants.geojsonTypes.FEATURE,
      properties: { selectable: isSelectable(opts) },
      geometry: {
        type: Constants.geojsonTypes.LINE_STRING,
        coordinates: []
      }
    });
    currentVertexPosition = 0;
    this.addFeature(line);
  }

  this.clearSelectedFeatures();
  doubleClickZoom.disable(this);
  // this.updateUIClasses({ mouse: Constants.cursors.ADD });
  this.activateUIButton(Constants.types.LINE);
  this.setActionableState({
    trash: true
  });

  return {
    currentVertexPosition,
    direction,
    ignoreDeleteKey: opts.ignoreDeleteKey,
    line,
    previousFeatureId: opts.previousFeatureId,
    redraw: opts.redraw,
  };
};

DrawLineString.clickAnywhere = function (state, e) {
  if (
    (state.currentVertexPosition > 0 &&
      isEventAtCoordinates(
        e,
        state.line.coordinates[state.currentVertexPosition - 1]
      )) ||
    (state.direction === "backwards" &&
      isEventAtCoordinates(
        e,
        state.line.coordinates[state.currentVertexPosition + 1]
      ))
  ) {
    return this.changeMode(Constants.modes.SIMPLE_SELECT, {
      featureIds: [state.line.id]
    });
  }
  // this.updateUIClasses({ mouse: Constants.cursors.ADD });
  const lngLat = this._ctx.snapping.snapCoord(e);
  state.line.updateCoordinate(
    state.currentVertexPosition,
    lngLat.lng,
    lngLat.lat
  );
  if (state.direction === "forward") {
    state.currentVertexPosition++;
    state.line.updateCoordinate(
      state.currentVertexPosition,
      lngLat.lng,
      lngLat.lat
    );
  } else {
    state.line.addCoordinate(0, lngLat.lng, lngLat.lat);
  }

  this.map.fire(Constants.events.VERTEX_PLACED, { features: [state.line.toGeoJSON()] });

  if (state.line.isCreatingValid()) {
    this.map.fire(Constants.events.CREATING, {
      features: [state.line.toGeoJSON(true)]
    });
  }
};

DrawLineString.clickOnVertex = function (state) {
  // clicking on the vertex places another vertex so 2 coordinates is only 1 vertex for the line
  if (state.line.coordinates.length <= 2) {
    this.deleteFeature([state.line.id], { silent: true });
    return this.changeMode(Constants.modes.DRAW_LINE_STRING, { redraw: state.redraw });
  }

  if (state.redraw) {
    return this.changeMode(Constants.modes.DRAW_LINE_STRING, {
      previousFeatureId: state.line.id,
      redraw: true
    });
  }

  return this.changeMode(Constants.modes.SIMPLE_SELECT, {
    featureIds: [state.line.id]
  });
};

DrawLineString.onMouseMove = function (state, e) {
  const lngLat = this._ctx.snapping.snapCoord(e);
  state.line.updateCoordinate(
    state.currentVertexPosition,
    lngLat.lng,
    lngLat.lat
  );
  if (CommonSelectors.isVertex(e)) {
    this.updateUIClasses({ mouse: Constants.cursors.POINTER });
  }
};

DrawLineString.onTap = DrawLineString.onClick = function (state, e) {
  // delete previously drawn line if it exists
  if (state.redraw && state.previousFeatureId) {
    this.deleteFeature(state.previousFeatureId, { silent: true });
  }

  if (CommonSelectors.isVertex(e)) return this.clickOnVertex(state, e);
  this.clickAnywhere(state, e);
};

DrawLineString.onStop = function (state) {
  doubleClickZoom.enable(this);
  this.activateUIButton();

  // check to see if we've deleted this feature
  if (this.getFeature(state.line.id) === undefined) return;

  // remove last added coordinate created by clicking on vertex to stop drawing
  state.line.removeCoordinate(`${state.currentVertexPosition}`);

  if (state.line.isValid()) {
    this.map.fire(Constants.events.CREATE, {
      features: [state.line.toGeoJSON()]
    });
  } else {
    this.deleteFeature([state.line.id], { silent: true });
    this.changeMode(Constants.modes.SIMPLE_SELECT, {}, { silent: true });
  }
};

DrawLineString.onTrash = function (state) {
  if (state.redraw || state.ignoreDeleteKey) return;

  this.deleteFeature([state.line.id], { silent: true });
  this.changeMode(Constants.modes.SIMPLE_SELECT);
};

DrawLineString.toDisplayFeatures = function (state, geojson, display) {
  const isActiveLine = geojson.properties.id === state.line.id;
  geojson.properties.active = isActiveLine
    ? Constants.activeStates.ACTIVE
    : Constants.activeStates.INACTIVE;
  if (!isActiveLine) return display(geojson);
  // Only render the line if it has at least one real coordinate
  if (geojson.geometry.coordinates.length < 2) return;
  geojson.properties.meta = Constants.meta.FEATURE;
  display(
    createVertex(
      state.line.id,
      geojson.geometry.coordinates[
      state.direction === "forward"
        ? geojson.geometry.coordinates.length - 2
        : 1
      ],
      `${
      state.direction === "forward"
        ? geojson.geometry.coordinates.length - 2
        : 1
      }`,
      false
    )
  );

  display(geojson);
};

module.exports = DrawLineString;
