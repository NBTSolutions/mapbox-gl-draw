import isSelectable from "../lib/is_selectable";
import Constants from "../constants";
import ModeInterface from "./mode_interface_accessors";
const cursors = Constants.cursors;

export default class DrawPoint extends ModeInterface {
  onSetup(opts) {
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

    const point = this.newFeature({
      type: Constants.geojsonTypes.FEATURE as "Feature",
      properties: { selectable: isSelectable(opts) },
      geometry: {
        type: Constants.geojsonTypes.POINT as "Point",
        coordinates: []
      }
    });

    super.addFeature(point);
    super.setSelected(this._ctx.store.getAllIds()[0]);
    super.activateUIButton(Constants.types.ADD);

    super.setActionableState({
      trash: true
    });

    return {
      point,
      redraw: opts.redraw,
      previousFeatureId: opts.previousFeatureId
    };
  };

  stopDrawingAndRemove(state) {
    if (state.redraw) {
      return;
    }
    super.deleteFeature(state.point.id, { silent: true });
    super.changeMode(Constants.modes.SIMPLE_SELECT);
  };

  onTap(state, e) {
    this.updateUIClasses({ mouse: Constants.cursors.MOVE });
    const lngLat = this._ctx.snapping.snapCoord(e);

    state.point.updateCoordinate("", lngLat.lng, lngLat.lat);
    this.map.fire(Constants.events.CREATE, {
      features: [state.point.toGeoJSON()]
    });

    if (state.redraw) {
      // delete previously drawn point if it exists
      if (state.previousFeatureId) {
        super.deleteFeature(state.previousFeatureId, { silent: true });
      }

      super.changeMode(Constants.modes.DRAW_POINT, {
        previousFeatureId: state.point.id,
        redraw: true
      });
    } else {
      super.changeMode(Constants.modes.SIMPLE_SELECT, {
        featureIds: [state.point.id]
      });
    }
  };

  onClick(state, e) {
    this.onTap(state, e);
  };

  onStop(state) {
    super.activateUIButton(null);
    if (!state.point.getCoordinate().length) {
      super.deleteFeature(state.point.id, { silent: true });
    }
  };

  onMouseMove(state, e) {
    this._ctx.snapping.snapCoord(e);
  }

  toDisplayFeatures(state, geojson, display) {
    // Never render the point we're drawing
    const isActivePoint = geojson.properties.id === state.point.id;
    geojson.properties.active = isActivePoint
      ? Constants.activeStates.ACTIVE
      : Constants.activeStates.INACTIVE;
    if (!isActivePoint) {
      return display(geojson);
    }
  };

  onTrash(state) {
    this.stopDrawingAndRemove(state);
  };
}
