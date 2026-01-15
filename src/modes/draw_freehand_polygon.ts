import simplify from "@turf/simplify";
import Constants from "../constants";
import calculateTolerance from "../lib/calculate_tolerance";
import doubleClickZoom from "../lib/double_click_zoom";
import isPolygonSelfIntersecting from "../lib/is_polygon_self_intersecting";
import isSelectable from "../lib/is_selectable";
import DrawPolygon from "./draw_polygon";

export default class DrawFreehandPolygon extends DrawPolygon {
  onSetup(opts) {
    const polygon = super.newFeature({
      type: Constants.geojsonTypes.FEATURE as "Feature",
      properties: {
        freehand: true,
        selectable: isSelectable(opts)
      },
      geometry: {
        type: Constants.geojsonTypes.POLYGON as "Polygon",
        coordinates: [[]],
      },
    });

    super.addFeature(polygon);

    super.clearSelectedFeatures();
    doubleClickZoom.disable(this);
    // disable dragPan
    setTimeout(() => {
      if (!this.map || !this.map.dragPan) return;
      this.map.dragPan.disable();
    });

    super.setActionableState({
      trash: true,
    });

    return {
      polygon,
      currentVertexPosition: 0,
      dragMoving: false,
      multiple: opts.multiple,
      ignoreDeleteKey: opts.ignoreDeleteKey,
      previousFeatureId: opts.previousFeatureId,
      redraw: opts.redraw,
    };
  };

  onDrag(state, e) {
    state.dragMoving = true;
    state.polygon.updateCoordinate(
      `0.${state.currentVertexPosition}`,
      e.lngLat.lng,
      e.lngLat.lat
    );
    state.currentVertexPosition++;
    state.polygon.updateCoordinate(
      `0.${state.currentVertexPosition}`,
      e.lngLat.lng,
      e.lngLat.lat
    );
  };
  onTouchMove(state, e) {
    this.onDrag(state, e);
  };

  onMouseUp(state, e) {
    if (state.dragMoving) {
      simplify(state.polygon, {
        mutate: true,
        tolerance: calculateTolerance(this.map.getZoom()),
        highQuality: true,
      });

      if (isPolygonSelfIntersecting(state.polygon.coordinates)) {
        state.polygon.ctx.store.delete(state.polygon.id, { silent: true });
        super.changeMode(Constants.modes.DRAW_FREEHAND_POLYGON, { multiple: !!state.multiple });
      } else if (state.multiple) {
        super.changeMode(Constants.modes.DRAW_FREEHAND_POLYGON, { multiple: true });
      } else {
        super.changeMode(Constants.modes.SIMPLE_SELECT, { featureIds: [state.polygon.id] });
      }
    }
  };

  onTouchEnd(state, e) {
    this.onMouseUp(state, e);
  };
}
