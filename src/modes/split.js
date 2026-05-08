const cursors = require("../constants").cursors;

const SplitLine = {};

const appendData = (map, coordinates) => {
  const source = map.getSource("_split_vertecies");
  const features = [
    ...source._data.features,
    { type: "Feature", geometry: { type: "Point", coordinates } }
  ];
  source.setData({
    type: "FeatureCollection",
    features
  });

  const type = features.length > 1 ? "MultiPoint" : "Point";
  const splitPointCoordinates =
    features.length > 1
      ? features.map(feature => feature.geometry.coordinates)
      : features[0].geometry.coordinates;
  const splitPointGeometry = {
    type,
    coordinates: splitPointCoordinates
  };
  map.fire("draw.splitPoints", { splitPointGeometry });
};

const clearData = map => {
  const source = map.getSource("_split_vertecies");
  if (source) {
    source.setData({
      type: "FeatureCollection",
      features: []
    });
  }
  map.fire("draw.splitPoints", { splitPointGeometry: null });
};

SplitLine.onSetup = function onSetup({ featureFilter, featureId } = {}) {
  // Select the target feature in the draw store so snapping can restrict to it.
  // Without this, getSelectedIds() is empty and snapToSelectedLineForSplitEvent bails out.
  if (featureId != null && this._ctx.store.get(featureId)) {
    this._ctx.store.setSelected(featureId);
  }
  this._ctx.snapping.setSnapToSelected(true);
  clearData(this.map);
  const removeSplitVertecies = () => {
    clearData(this.map);
  };

  // Do not use overFeatures here: it includes any map line under the cursor, which misleads
  // users into thinking other lines are splittable. Only the snap ring indicates a valid mark.
  this._ctx.setGetCursorTypeLogic(({ snapped }) => {
    if (snapped) {
      return cursors.ADD;
    }
    return cursors.GRAB;
  });

  this._ctx.api.removeSplitVertecies = removeSplitVertecies;
  if (!this.map.getSource("_split_vertecies")) {
    this._ctx.map.addSource("_split_vertecies", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: []
      }
    });
  }
  if (!this.map.getLayer("_split_vertecies")) {
    this.map.addLayer({
      id: "_split_vertecies",
      type: "circle",
      source: "_split_vertecies",
      paint: {
        "circle-color": "transparent",
        "circle-radius": 3,
        "circle-stroke-width": 2,
        "circle-stroke-color": "orange"
      }
    });
  }

  setTimeout(() => {
    this.map.on("draw.modechange", ({ mode }) => {
      if (mode !== "split") {
        this.map.fire("draw.splitPoints", { splitPointGeometry: null });
        if (this.map.getLayer("_split_vertecies")) {
          this.map.removeLayer("_split_vertecies");
        }
        if (this.map.getSource("_split_vertecies")) {
          this.map.removeSource("_split_vertecies");
        }
        this.map.getCanvas().style.cursor = null;
      }
    });
  });

  this.setActionableState({});

  return { featureFilter, featureId }; // this state will be passed to future events
};

SplitLine.onClick = async function onClick(state, e) {
  if (this._splitClickBusy) {
    return;
  }
  this._splitClickBusy = true;
  try {
    const lngLat = await this._ctx.api.snapToSelectedLineForSplitEvent(e);
    if (!lngLat || !lngLat.snapped) {
      return;
    }
    const { lat, lng } = lngLat;
    // snappedFeature on lngLat is available for future use (e.g. attributing the split to a snapped network point).
    appendData(this.map, [lng, lat]);
  } finally {
    this._splitClickBusy = false;
  }
};

// Snapping._mouseMoveHandler handles split snap on map mousemove (see SPLIT branch).
SplitLine.onMouseMove = function onMouseMove() {};

SplitLine.onTap = SplitLine.onClick;

SplitLine.toDisplayFeatures = function toDisplayFeatures(
  state,
  geojson,
  display
) {
  geojson.properties.active = true;
  return display(geojson);
};

SplitLine.stopDrawingAndRemove = function stopDrawingAndRemove(state) {
  this.changeMode("simple_select");
};

SplitLine.onTrash = SplitLine.stopDrawingAndRemove;

module.exports = SplitLine;
