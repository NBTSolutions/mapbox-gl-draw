import { isOfMetaType, isInactiveFeature, isShiftDown } from "../lib/common_selectors";
import createSupplementaryPoints from "../lib/create_supplementary_points";
import constrainFeatureMovement from "../lib/constrain_feature_movement";
import doubleClickZoom from "../lib/double_click_zoom";
import Constants from "../constants";
import moveFeatures from "../lib/move_features";
import isPolygonSelfIntersecting from "../lib/is_polygon_self_intersecting";
import createPolygonFromPartialRing from "../lib/create_polygon_from_partial_ring";
import ModeInterface from "./mode_interface_accessors";
const cursors = Constants.cursors;

const isVertex = isOfMetaType(Constants.meta.VERTEX);
const isMidpoint = isOfMetaType(Constants.meta.MIDPOINT);

export default class DirectSelect extends ModeInterface {
  fireUpdate() {
    this.map.fire(Constants.events.UPDATE, {
      action: Constants.updateActions.CHANGE_COORDINATES,
      features: super.getSelected().map(f => f.toGeoJSON())
    });
  };

  fireActionable(state) {
    super.setActionableState({
      combineFeatures: false,
      uncombineFeatures: false,
      trash: state.selectedCoordPaths.length > 0
    });
  };

  startDragging(state, e) {
    this.map.dragPan.disable();
    state.canDragMove = true;
    state.dragMoveLocation = e.lngLat;
  };

  stopDragging(state) {
    this.map.dragPan.enable();
    state.dragMoving = false;
    state.canDragMove = false;
    state.dragMoveLocation = null;
    state.previousPointsOriginalCoords = [];
  };

  onVertex(state, e) {
    this.startDragging(state, e);
    const about = e.featureTarget.properties;
    const selectedIndex = state.selectedCoordPaths.indexOf(about.coord_path);
    if (!isShiftDown(e) && selectedIndex === -1) {
      state.selectedCoordPaths = [about.coord_path];
    } else if (isShiftDown(e) && selectedIndex === -1) {
      state.selectedCoordPaths.push(about.coord_path);
    }

    const selectedCoordinates = this.pathsToCoordinates(
      state.featureId,
      state.selectedCoordPaths
    );
    super.setSelectedCoordinates(selectedCoordinates);
  };

  onMidpoint(state, e) {
    this.startDragging(state, e);
    const about = e.featureTarget.properties;
    state.feature.addCoordinate(about.coord_path, about.lng, about.lat);
    this.fireUpdate();
    state.selectedCoordPaths = [about.coord_path];

    const selectedCoordinates = this.pathsToCoordinates(
      state.featureId,
      state.selectedCoordPaths
    );
    super.setSelectedCoordinates(selectedCoordinates);
  };

  pathsToCoordinates(featureId, paths) {
    return paths.map(coord_path => ({ feature_id: featureId, coord_path }));
  };

  onFeature(state, e) {
    if (state.selectedCoordPaths.length === 0) this.startDragging(state, e);
    else this.stopDragging(state);
  };

  dragFeature(state, e, delta) {
    moveFeatures(this.getSelected(), delta);
    state.dragMoveLocation = e.lngLat;
  };

  dragVertex(state, e, delta) {
    const selectedCoords = state.selectedCoordPaths.map(coord_path =>
      state.feature.getCoordinate(coord_path)
    );
    const selectedCoordPoints = selectedCoords.map(coords => ({
      type: Constants.geojsonTypes.FEATURE,
      properties: {},
      geometry: {
        type: Constants.geojsonTypes.POINT,
        coordinates: coords
      }
    }));

    const constrainedDelta = constrainFeatureMovement(selectedCoordPoints, delta);
    for (let i = 0; i < selectedCoords.length; i++) {
      const coord = selectedCoords[i];
      state.feature.updateCoordinate(
        state.selectedCoordPaths[i],
        coord[0] + constrainedDelta.lng,
        coord[1] + constrainedDelta.lat
      );
    }
  };

  clickNoTarget() {
    this.changeMode(Constants.modes.SIMPLE_SELECT);
  };

  clickInactive() {
    this.changeMode(Constants.modes.SIMPLE_SELECT);
  };

  clickActiveFeature(state) {
    state.selectedCoordPaths = [];
    this.clearSelectedCoordinates();
    state.feature.changed();
  };

  onDblClick(state, e) {
    const { feature, selectedCoordPaths } = state;

    const featureClicked = e.featureTarget;
    const featureIsLine = feature.type === 'LineString';
    const onlyOneVertexSelected = selectedCoordPaths.length === 1;
    const selectedVertexIsAtEndOfLine = onlyOneVertexSelected
      && (Number(selectedCoordPaths[0]) === 0
        || Number(selectedCoordPaths[0]) === feature.coordinates.length - 1);

    if (!featureClicked || !featureIsLine || !onlyOneVertexSelected || !selectedVertexIsAtEndOfLine) {
      return;
    }

    const selectedCoordIdx = Number(selectedCoordPaths[0]);
    this.changeMode(Constants.modes.DRAW_LINE_STRING, {
      featureId: state.featureId,
      from: feature.coordinates[selectedCoordIdx]
    });
    this.map.fire(Constants.events.EXTEND_LINE, { feature });
  };

  // EXTERNAL FUNCTIONS

  onSetup(opts) {
    if (this._ctx.snapping) {
      this._ctx.snapping.setSnapToSelected(false);
    }
    const featureId = opts.featureId;
    const feature = this.getFeature(featureId);

    if (!feature) {
      throw new Error("You must provide a featureId to enter direct_select mode");
    }

    if (feature.type === Constants.geojsonTypes.POINT) {
      throw new TypeError("direct_select mode doesn't handle point features");
    }

    const state = {
      featureId,
      feature,
      dragMoveLocation: opts.startPos || null,
      dragMoving: false,
      canDragMove: false,
      selectedCoordPaths: opts.coordPath ? [opts.coordPath] : [],
      previousPointsOriginalCoords: [],
    };

    this._ctx.setGetCursorTypeLogic(({ snapped, overFeatures }) => {
      if (!overFeatures || overFeatures.filter(l => l.layer.id.includes('vertex') || l.layer.id.includes('midpoint')).length) {
        return cursors.GRAB;
      }
      return cursors.POINTER;

    });

    this.setSelected(featureId);
    this.setSelectedCoordinates(
      this.pathsToCoordinates(featureId, state.selectedCoordPaths)
    );
    doubleClickZoom.disable(this);

    this.setActionableState({
      trash: true
    });

    return state;
  };

  onStop() {
    doubleClickZoom.enable(this);
    this.clearSelectedCoordinates();
  };

  toDisplayFeatures(state, geojson, push) {
    if (state.featureId === geojson.properties.id) {
      geojson.properties.active = Constants.activeStates.ACTIVE;
      push(geojson);
      createSupplementaryPoints(geojson, {
        map: this.map,
        midpoints: true,
        selectedPaths: state.selectedCoordPaths
      }).forEach(push);
    } else {
      geojson.properties.active = Constants.activeStates.INACTIVE;
      push(geojson);
    }
    this.fireActionable(state);
  };

  onTrash(state) {
    // Uses number-aware sorting to make sure '9' < '10'. Comparison is reversed because we want them
    // in reverse order so that we can remove by index safely.
    state.selectedCoordPaths
      .sort((a, b) => b.localeCompare(a, "en", { numeric: true }))
      .forEach(id => state.feature.removeCoordinate(id));
    this.fireUpdate();
    state.selectedCoordPaths = [];
    this.clearSelectedCoordinates();
    this.fireActionable(state);
    if (state.feature.isValid() === false) {
      this.deleteFeature(state.featureId);
      this.changeMode(Constants.modes.SIMPLE_SELECT, {});
    }
  };

  onMouseMove(state, e) {
    return true;
  };

  onMouseOut(state) {
    // As soon as you mouse leaves the canvas, update the feature
    if (state.dragMoving) this.fireUpdate();

    // Skip render
    return true;
  };

  onTouchStart(state, e) {
    if (isVertex(e)) return this.onVertex(state, e);
    if (CommonSelectors.isActiveFeature(e)) return this.onFeature(state, e);
    if (isMidpoint(e)) return this.onMidpoint(state, e);
  };

  onDrag(state, e) {
    if (state.canDragMove !== true) return;
    state.dragMoving = true;
    e.originalEvent.stopPropagation();
    let lngLat = e.lngLat;

    if (state.feature.type === 'Polygon' && state.previousPointsOriginalCoords.length === 0) {
      state.previousPointsOriginalCoords = state.selectedCoordPaths.map(path => ({
        path,
        coordinate: state.feature.getCoordinate(path),
      }));
    }

    if (state.selectedCoordPaths.length === 1) {
      lngLat = this._ctx.snapping.snapCoord(e);
      // following the dragVertex() path below seems to cause a lag where our point
      // ends up one step behind the snapped location
      state.feature.updateCoordinate(
        state.selectedCoordPaths[0],
        lngLat.lng,
        lngLat.lat
      );
    } else {
      const delta = {
        lng: lngLat.lng - state.dragMoveLocation.lng,
        lat: lngLat.lat - state.dragMoveLocation.lat
      };

      if (state.selectedCoordPaths.length > 0) this.dragVertex(state, e, delta);
      else this.dragFeature(state, e, delta);
    }
    state.dragMoveLocation = lngLat;
  };

  onClick(state, e) {
    if (CommonSelectors.isActiveFeature(e))
      return this.clickActiveFeature(state);
    if (isInactiveFeature(e)) return this.clickInactive();
    this.stopDragging(state);
  };

  onTap(state, e) {
    if (CommonSelectors.isActiveFeature(e))
      return this.clickActiveFeature(state);
    if (isInactiveFeature(e)) return this.clickInactive();
  };

  onTouchEnd(state) {
    if (state.dragMoving) {
      if (state.feature.type === 'Polygon') {
        const ring = state.feature.coordinates[0];

        if (isPolygonSelfIntersecting(createPolygonFromPartialRing(ring))) {
          state.previousPointsOriginalCoords.forEach(pt => {
            state.feature.updateCoordinate(
              pt.path,
              pt.coordinate[0],
              pt.coordinate[1],
            );
          });
        }
      }

      this.fireUpdate();
    }
    this.stopDragging(state);
  };
}
