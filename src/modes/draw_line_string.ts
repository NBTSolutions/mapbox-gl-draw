import isEventAtCoordinates from "../lib/is_event_at_coordinates";
import doubleClickZoom from "../lib/double_click_zoom";
import Constants from "../constants";
import createVertex from "../lib/create_vertex";
import isSelectable from "../lib/is_selectable";
import ModeInterface from "./mode_interface_accessors";
const cursors = Constants.cursors;

export default class DrawLineString extends ModeInterface {
  onSetup(opts) {
    opts = opts || {};
    const featureId = opts.featureId;
    let line, currentVertexPosition;
    let direction = "forward";
    if (this._ctx.snapping) {
      this._ctx.snapping.setSnapToSelected(false);
    }

    this._ctx.setGetCursorTypeLogic(({ snapped, _overFeatures }) => {
      if (snapped) {
        return cursors.ADD;
      } else {
        return cursors.POINTER;
      }
    });

    if (featureId) {
      line = super.getFeature(featureId);
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
      line = super.newFeature({
        type: Constants.geojsonTypes.FEATURE as "Feature",
        properties: { selectable: isSelectable(opts) },
        geometry: {
          type: Constants.geojsonTypes.LINE_STRING as "LineString",
          coordinates: []
        }
      });
      currentVertexPosition = 0;
      super.addFeature(line);
    }

    super.clearSelectedFeatures();
    doubleClickZoom.disable(this);
    super.activateUIButton(Constants.types.LINE);
    super.setActionableState({
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

  clickAnywhere(state, e) {
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
      return super.changeMode(Constants.modes.SIMPLE_SELECT, {
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

  clickOnVertex(state) {
    // clicking on the vertex places another vertex so 2 coordinates is only 1 vertex for the line
    if (state.line.coordinates.length <= 2) {
      super.deleteFeature(state.line.id, { silent: true });
      return super.changeMode(Constants.modes.DRAW_LINE_STRING, { redraw: state.redraw });
    }

    if (state.redraw) {
      return super.changeMode(Constants.modes.DRAW_LINE_STRING, {
        previousFeatureId: state.line.id,
        redraw: true
      });
    }

    return super.changeMode(Constants.modes.SIMPLE_SELECT, {
      featureIds: [state.line.id]
    });
  };

  onMouseMove(state, e) {
    const lngLat = this._ctx.snapping.snapCoord(e);
    state.line.updateCoordinate(
      state.currentVertexPosition,
      lngLat.lng,
      lngLat.lat
    );
    if (CommonSelectors.isVertex(e)) {
      super.updateUIClasses({ mouse: Constants.cursors.POINTER });
    }
  };

  onTap(state, e) {
    // delete previously drawn line if it exists
    if (state.redraw && state.previousFeatureId) {
      super.deleteFeature(state.previousFeatureId, { silent: true });
    }

    if (CommonSelectors.isVertex(e)) return this.clickOnVertex(state);
    this.clickAnywhere(state, e);
  };

  onClick(state, e) {
    this.onTap(state, e);
  };

  onStop(state) {
    doubleClickZoom.enable(this);
    super.activateUIButton(null);

    // check to see if we've deleted this feature
    if (this.getFeature(state.line.id) === undefined) return;

    // remove last added coordinate created by clicking on vertex to stop drawing
    state.line.removeCoordinate(`${state.currentVertexPosition}`);

    if (state.line.isValid()) {
      this.map.fire(Constants.events.CREATE, {
        features: [state.line.toGeoJSON()]
      });
    } else {
      super.deleteFeature(state.line.id, { silent: true });
      super.changeMode(Constants.modes.SIMPLE_SELECT, {}, { silent: true });
    }
  };

  onTrash(state) {
    if (state.redraw || state.ignoreDeleteKey) return;

    super.deleteFeature(state.line.id, { silent: true });
    super.changeMode(Constants.modes.SIMPLE_SELECT);
  };

  toDisplayFeatures(state, geojson, display) {
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
}
