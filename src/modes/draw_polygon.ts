import Constants from "../constants";
import createVertex from "../lib/create_vertex";
import doubleClickZoom from "../lib/double_click_zoom";
import isEventAtCoordinates from "../lib/is_event_at_coordinates";
import isPolygonSelfIntersecting from "../lib/is_polygon_self_intersecting";
import isSelectable from "../lib/is_selectable";
import ModeInterface from "./mode_interface_accessors";
const cursors = Constants.cursors;

export default class DrawPolygon extends ModeInterface {

  onSetup(opts) {
    if (this._ctx.snapping) {
      this._ctx.snapping.setSnapToSelected(false);
    }

    this._ctx.setGetCursorTypeLogic(({ snapped }) => {
      if (snapped) {
        return cursors.ADD;
      } else {
        return cursors.POINTER;
      }
    });

    const polygon = this.newFeature({
      type: Constants.geojsonTypes.FEATURE as "Feature",
      properties: { selectable: isSelectable(opts) },
      geometry: {
        type: Constants.geojsonTypes.POLYGON as "Polygon",
        coordinates: [[]],
      },
    });

    this.addFeature(polygon);

    this.clearSelectedFeatures();
    doubleClickZoom.disable(this);
    this.updateUIClasses({ mouse: Constants.cursors.ADD });
    this.activateUIButton(Constants.types.POLYGON);
    this.setActionableState({
      trash: true,
    });

    return {
      polygon,
      currentVertexPosition: 0,
      ignoreDeleteKey: opts.ignoreDeleteKey,
      multiple: opts.multiple,
      previousFeatureId: opts.previousFeatureId,
      redraw: opts.redraw,
    };
  };

  clickAnywhere(state, e) {
    if (
      state.currentVertexPosition > 0 &&
      isEventAtCoordinates(
        e,
        state.polygon.coordinates[0][state.currentVertexPosition - 1]
      )
    ) {
      return this.changeMode(Constants.modes.SIMPLE_SELECT, {
        featureIds: [state.polygon.id],
      });
    }

    const lngLat = this._ctx.snapping.snapCoord(e);
    const ring = state.polygon.coordinates[0].slice();
    ring[ring.length - 1] = [lngLat.lng, lngLat.lat];

    this.updateUIClasses({ mouse: Constants.cursors.ADD });
    state.polygon.updateCoordinate(
      `0.${state.currentVertexPosition}`,
      lngLat.lng,
      lngLat.lat
    );
    state.currentVertexPosition++;
    state.polygon.updateCoordinate(
      `0.${state.currentVertexPosition}`,
      lngLat.lng,
      lngLat.lat
    );

    this.map.fire(Constants.events.VERTEX_PLACED, {
      features: [state.polygon.toGeoJSON()],
    });

    if (state.polygon.isCreatingValid()) {
      this.map.fire(Constants.events.CREATING, {
        features: [state.polygon.toGeoJSON(true)],
      });
    }
  };

  clickOnVertex(state) {
    // clicking on the vertex places another vertex so 3 coordinates is actually only 2 vertices for the polygon
    if (state.polygon.coordinates[0].length <= 3) {
      super.deleteFeature(state.polygon.id, { silent: true });
      return super.changeMode(Constants.modes.DRAW_POLYGON, {
        multiple: state.multiple,
        redraw: state.redraw,
      });
    }

    if (state.redraw) {
      return super.changeMode(Constants.modes.DRAW_POLYGON, {
        previousFeatureId: state.polygon.id,
        redraw: true,
      });
    }

    if (state.multiple) {
      return super.changeMode(Constants.modes.DRAW_POLYGON, { multiple: true });
    }

    return super.changeMode(Constants.modes.SIMPLE_SELECT, {
      featureIds: [state.polygon.id],
    });
  };

  onMouseMove(state, e) {
    const lngLat = this._ctx.snapping.snapCoord(e);
    state.polygon.updateCoordinate(
      `0.${state.currentVertexPosition}`,
      lngLat.lng,
      lngLat.lat
    );
    if (CommonSelectors.isVertex(e)) {
      this.updateUIClasses({ mouse: Constants.cursors.POINTER });
    }
  };

  onTap(state, e) {
    if (state.polygon.properties.freehand) return;

    // delete previously drawn polygon if it exists
    if (state.redraw && state.previousFeatureId) {
      super.deleteFeature(state.previousFeatureId, { silent: true });
    }

    if (CommonSelectors.isVertex(e)) return this.clickOnVertex(state);
    return this.clickAnywhere(state, e);
  };
  onClick(state, e) {
    this.onTap(state, e);
  }

  onStop(state) {
    this.updateUIClasses({ mouse: Constants.cursors.NONE });
    doubleClickZoom.enable(this);
    super.activateUIButton(null);

    // check to see if we've deleted this feature
    if (
      state?.polygon?.id === null ||
      this.getFeature(state.polygon.id) === undefined
    )
      return;

    //remove last added coordinate
    state.polygon.removeCoordinate(`0.${state.currentVertexPosition}`);
    if (!state.polygon.isValid()) {
      super.deleteFeature(state.polygon.id, { silent: true });
      super.changeMode(Constants.modes.SIMPLE_SELECT, {}, { silent: true });
      return;
    }
    const ring = [...state.polygon.coordinates[0]];
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push(ring[0]);
    }

    if (isPolygonSelfIntersecting([ring])) {
      super.deleteFeature(state.polygon.id, { silent: true });
      super.changeMode(Constants.modes.SIMPLE_SELECT, {}, { silent: true });
      return;
    }

    this.map.fire(Constants.events.CREATE, {
      features: [state.polygon.toGeoJSON()],
    });
  };

  toDisplayFeatures(state, geojson, display) {
    const isActivePolygon = geojson.properties.id === state.polygon.id;
    geojson.properties.active = isActivePolygon
      ? Constants.activeStates.ACTIVE
      : Constants.activeStates.INACTIVE;
    if (!isActivePolygon) return display(geojson);

    // Don't render a polygon until it has two positions
    // (and a 3rd which is just the first repeated)
    if (geojson.geometry.coordinates.length === 0) return;

    const coordinateCount = geojson.geometry.coordinates[0].length;
    // 2 coordinates after selecting a draw type
    // 3 after creating the first point
    if (coordinateCount < 3) {
      return;
    }
    geojson.properties.meta = Constants.meta.FEATURE;
    display(
      createVertex(
        state.polygon.id,
        geojson.geometry.coordinates[0][0],
        "0.0",
        false
      )
    );
    if (coordinateCount > 3) {
      // Add a start position marker to the map, clicking on this will finish the feature
      // This should only be shown when we're in a valid spot
      const endPos = geojson.geometry.coordinates[0].length - 3;
      display(
        createVertex(
          state.polygon.id,
          geojson.geometry.coordinates[0][endPos],
          `0.${endPos}`,
          false
        )
      );
    }
    if (coordinateCount <= 4) {
      // If we've only drawn two positions (plus the closer),
      // make a LineString instead of a Polygon
      const lineCoordinates = [
        [
          geojson.geometry.coordinates[0][0][0],
          geojson.geometry.coordinates[0][0][1],
        ],
        [
          geojson.geometry.coordinates[0][1][0],
          geojson.geometry.coordinates[0][1][1],
        ],
      ];
      // create an initial vertex so that we can track the first point on mobile devices
      display({
        type: Constants.geojsonTypes.FEATURE,
        properties: geojson.properties,
        geometry: {
          coordinates: lineCoordinates,
          type: Constants.geojsonTypes.LINE_STRING,
        },
      });
      if (coordinateCount === 3) {
        return;
      }
    }
    // render the Polygon
    return display(geojson);
  };

  onTrash(state) {
    if (state.redraw || state.ignoreDeleteKey) return;

    super.deleteFeature(state.polygon.id, { silent: true });
    super.changeMode(Constants.modes.SIMPLE_SELECT);
  };
}
