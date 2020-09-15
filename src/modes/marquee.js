const DrawPolygon = require("./draw_polygon");
const { geojsonTypes, updateActions, modes, events } = require("../constants");
const doubleClickZoom = require("../lib/double_click_zoom");
const { onMouseMove, ...RectangularDraw } = Object.assign({}, DrawPolygon);

RectangularDraw.onSetup = function () {
  const polygon = this.newFeature({
    type: geojsonTypes.FEATURE,
    properties: {},
    geometry: {
      type: geojsonTypes.POLYGON,
      coordinates: [[]],
    },
    id: "freehand",
  });

  this.addFeature(polygon);

  this.clearSelectedFeatures();
  doubleClickZoom.disable(this);

  this.setActionableState({
    trash: true,
  });

  return {
    polygon,
    dragMoving: false,
  };
};

RectangularDraw.onDrag = RectangularDraw.onTouchMove = function (state, e) {
  state.dragMoving = true;

  const [startLng, startLat] = state.polygon.getCoordinates()[0][0];
  const { lng: endLng, lat: endLat } = e.lngLat;

  state.polygon.updateCoordinate("0.1", startLng, endLat);
  state.polygon.updateCoordinate("0.2", endLng, startLat);
  state.polygon.updateCoordinate("0.3", endLng, endLat);

  console.log(state.polygon);
};

RectangularDraw.onMouseDown = function (state, e) {
  const { lng, lat } = e.lngLat;

  // Initialize corners of rectangle
  state.polygon.updateCoordinate("0.0", lng, lat);
  state.polygon.updateCoordinate("0.1", lng, lat);
  state.polygon.updateCoordinate("0.2", lng, lat);
  state.polygon.updateCoordinate("0.3", lng, lat);
  state.polygon.updateCoordinate("0.4", lng, lat);
};

RectangularDraw.onMouseUp = function (state, e) {
  if (state.dragMoving) {
    this.fireUpdate();
    this.changeMode(modes.SIMPLE_SELECT, { featureIds: [state.polygon.id] });
  }
};

RectangularDraw.fireUpdate = function () {
  this.map.fire(events.UPDATE, {
    action: updateActions.MOVE,
    features: this.getSelected().map((f) => f.toGeoJSON()),
  });
};

module.exports = RectangularDraw;
