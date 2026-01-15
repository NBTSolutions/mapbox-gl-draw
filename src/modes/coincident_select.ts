import Constants from "../constants";
import CommonSelectors from "../lib/common_selectors";
import createSupplementaryPoints from "../lib/create_supplementary_points";
import doubleClickZoom from "../lib/double_click_zoom";
import mouseEventPoint from "../lib/mouse_event_point";
import moveFeatures from "../lib/move_features";
import StringSet from "../lib/string_set";
import ModeInterface from "./mode_interface_accessors";
const cursors = Constants.cursors;

const decimalNumber = 100000;
const roundNumber = (input) => Math.round(input * decimalNumber) / decimalNumber;

const pointsEqual = (point1, point2) =>
  roundNumber(point1[0]) === roundNumber(point2[0]) &&
  roundNumber(point1[1]) === roundNumber(point2[1]);

const pointsApproximatelyEqual = (point1, point2) =>
  roundNumber(Math.abs(point1[0] - point2[0])) <= 1 / decimalNumber
  && roundNumber(Math.abs(point1[1] - point2[1])) <= 1 / decimalNumber;

// OverLoaded function. This is serving both to check if the line is connected to the point
// and also to return the adjacent point(s) in the line to the connected point
const getAdjacentLineData = (lineCoords, pointCoord) => {
  if (pointsEqual(lineCoords[0], pointCoord)) {
    return { index: 0, adjacentPoints: [lineCoords[1]] };
  }
  for (let i = 1; i < lineCoords.length - 2; i += 1) {
    if (pointsEqual(lineCoords[i], pointCoord)) {
      return {
        index: i,
        adjacentPoints: [lineCoords[i - 1], lineCoords[i + 1]],
      };
    }
  }
  if (pointsEqual(lineCoords[lineCoords.length - 1], pointCoord)) {
    return {
      index: lineCoords.length - 1,
      adjacentPoints: [lineCoords[lineCoords.length - 2]],
    };
  }
  return null;
};

const isPointLinestringEndpoint = (lineCoords, pointCoord) =>
  pointsApproximatelyEqual(lineCoords[0], pointCoord) ||
  pointsApproximatelyEqual(lineCoords[lineCoords.length - 1], pointCoord);

export default class CoincidentSelect extends ModeInterface {
  async onSetup(opts) {
    if (this._ctx.snapping) {
      this._ctx.snapping.setSnapToSelected(false);
    }

    // turn the opts into state.
    const state = {
      dragMoveLocation: null,
      boxSelectStartLocation: null,
      boxSelectElement: undefined,
      boxSelecting: false,
      canBoxSelect: false,
      dragMoving: false,
      canDragMove: false,
      initiallySelectedFeatureIds: opts.featureIds || [],
      coincidentData: [],
    };

    this._ctx.setGetCursorTypeLogic(({ overFeatures, isOverSelected }) => {
      if (isOverSelected) {
        return cursors.GRAB;
      } else if (overFeatures) {
        return cursors.POINTER;
      }
      return cursors.GRAB;
    });

    super.setSelected(
      state.initiallySelectedFeatureIds.filter(
        (id) => super.getFeature(id) !== undefined
      )
    );

    const feature = super.getFeature(state.initiallySelectedFeatureIds[0]);
    if (feature.type !== "Point") {
      return;
    }
    const { x, y } = this._ctx.map.project(feature.coordinates);
    const halfPixels = 5;
    const bbox = [
      [x - halfPixels, y - halfPixels],
      [x + halfPixels, y + halfPixels],
    ];

    const ptSrcGeom = await this._ctx.options.fetchSourceGeometry(
      state.initiallySelectedFeatureIds[0]
    );
    if (!ptSrcGeom?.coordinates?.length) {
      return;
    }

    // it is possible that queryRenderedFeatures() return MultiLineString
    // e.g. a U shape line with middle part of the line in other tile.
    const features = this._ctx.map.queryRenderedFeatures(bbox);
    for (const f of features) {
      if (
        opts.userEditablePlanIds.includes(f.properties.plan_id) &&
        (f.geometry.type === "LineString" || f.geometry.type === 'MultiLineString') &&
        !f.layer.id.includes("_snap")
      ) {
        const lineSrcGeom = await this._ctx.options.fetchSourceGeometry(f.properties.vetro_id);
        if (!lineSrcGeom?.coordinates?.length) {
          continue;
        }

        if (!isPointLinestringEndpoint(lineSrcGeom.coordinates, ptSrcGeom.coordinates)) {
          continue;
        }

        const adjacentLineData = getAdjacentLineData(
          lineSrcGeom.coordinates,
          ptSrcGeom.coordinates
        );
        if (adjacentLineData) {
          const { index, adjacentPoints } = adjacentLineData;
          state.coincidentData.push({
            id: f.properties.vetro_id,
            layer_id: f.properties.layer_id,
            oldGeom: lineSrcGeom,
            updateIndex: index,
            adjacentPoints,
          });
        }
      }
    }

    this.fireActionable();

    super.setActionableState({
      combineFeatures: true,
      uncombineFeatures: true,
      trash: true,
    });

    return state;
  };

  fireUpdate(coincidentData) {
    const features = super.getSelected().map((f) => f.toGeoJSON());
    const newPointCoords = (features[0].geometry as any).coordinates;
    const formattedCoincidentData = coincidentData.map(
      ({ id, oldGeom, updateIndex, layer_id }) => {
        const newLineCoords = [...oldGeom.coordinates];
        newLineCoords.splice(updateIndex, 1, newPointCoords);
        return {
          "x-vetro": { vetro_id: id, layer_id },
          geometry: {
            ...oldGeom,
            coordinates: newLineCoords,
          },
        };
      }
    );
    this.map.fire(Constants.events.UPDATE, {
      action: Constants.updateActions.MOVE,
      features,
      coincidentData: formattedCoincidentData,
    });
  };

  fireActionable() {
    const selectedFeatures = super.getSelected();

    const multiFeatures = selectedFeatures.filter((feature) =>
      super.isInstanceOf("MultiFeature", feature)
    );

    let combineFeatures = false;

    if (selectedFeatures.length > 1) {
      combineFeatures = true;
      const featureType = selectedFeatures[0].type.replace("Multi", "");
      selectedFeatures.forEach((feature) => {
        if (feature.type.replace("Multi", "") !== featureType) {
          combineFeatures = false;
        }
      });
    }

    const uncombineFeatures = multiFeatures.length > 0;
    const trash = selectedFeatures.length > 0;

    super.setActionableState({
      combineFeatures,
      uncombineFeatures,
      trash,
    });
  };

  getUniqueIds(allFeatures) {
    if (!allFeatures.length) return [];
    const ids = allFeatures
      .map((s) => s.properties.id)
      .filter((id) => id !== undefined)
      .reduce((memo, id) => {
        memo.add(id);
        return memo;
      }, new StringSet());

    return ids.values();
  };

  stopExtendedInteractions(state) {
    if (state.boxSelectElement) {
      if (state.boxSelectElement.parentNode)
        state.boxSelectElement.parentNode.removeChild(state.boxSelectElement);
      state.boxSelectElement = null;
    }

    this.map.dragPan.enable();

    state.boxSelecting = false;
    state.canBoxSelect = false;
    state.dragMoving = false;
    state.canDragMove = false;
  };

  onStop() {
    doubleClickZoom.enable(this);
  };

  onMouseMove(state) {
    // On mousemove that is not a drag, stop extended interactions.
    // This is useful if you drag off the canvas, release the button,
    // then move the mouse back over the canvas --- we don't allow the
    // interaction to continue then, but we do let it continue if you held
    // the mouse button that whole time
    this.stopExtendedInteractions(state);

    // Skip render
    return true;
  };

  onMouseOut(state) {
    // As soon as you mouse leaves the canvas, update the feature
    if (state.dragMoving) return this.fireUpdate(state.coincidentData);

    // Skip render
    return true;
  };

  onTap(state, e) {
    // Click (with or without shift) on no feature
    if (CommonSelectors.noTarget(e)) return this.clickAnywhere(state, e);

    // no need to handle clicking on coincident lines
    // if (CommonSelectors.isOfMetaType(Constants.meta.VERTEX)(e))
    //   return this.clickOnVertex(state, e);

    // handle clicking on selected point
    if (CommonSelectors.isFeature(e)) return this.clickOnFeature(state, e);
  };

  onClick(state, e) {
    this.onTap(state, e);
  };

  clickAnywhere(state, _e) {
    // Clear the re-render selection
    const wasSelected = super.getSelectedIds();
    if (wasSelected.length) {
      super.clearSelectedFeatures();
      wasSelected.forEach((id) => super.doRender(id));
    }
    doubleClickZoom.enable(this);
    this.stopExtendedInteractions(state);
  };

  clickOnVertex(state, e) {
    // Enter direct select mode
    super.changeMode(Constants.modes.DIRECT_SELECT, {
      featureId: e.featureTarget.properties.parent,
      coordPath: e.featureTarget.properties.coord_path,
      startPos: e.lngLat,
    });
  };

  startOnActiveFeature(state, e) {
    // Stop any already-underway extended interactions
    this.stopExtendedInteractions(state);

    // Disable map.dragPan immediately so it can't start
    this.map.dragPan.disable();

    // Re-render it and enable drag move
    super.doRender(e.featureTarget.properties.id);

    // Set up the state for drag moving
    state.canDragMove = true;
    state.dragMoveLocation = e.lngLat;
  };

  clickOnFeature(state, e) {
    // Stop everything
    doubleClickZoom.disable(this);
    this.stopExtendedInteractions(state);

    const isShiftClick = CommonSelectors.isShiftDown(e);
    const selectedFeatureIds = super.getSelectedIds();
    const featureId = e.featureTarget.properties.id;
    const isFeatureSelected = super.isSelected(featureId);

    // Click (without shift) on any selected feature but a point
    if (
      !isShiftClick &&
      isFeatureSelected &&
      super.getFeature(featureId).type !== Constants.geojsonTypes.POINT
    ) {
      // Enter direct select mode
      return super.changeMode(Constants.modes.DIRECT_SELECT, {
        featureId,
      });
    }

    // Shift-click on a selected feature
    if (isFeatureSelected && isShiftClick) {
      // Deselect it
      super.deselect(featureId);
      if (selectedFeatureIds.length === 1) {
        doubleClickZoom.enable(this);
      }
      // Shift-click on an unselected feature
    } else if (!isFeatureSelected && isShiftClick) {
      // Add it to the selection
      super.select(featureId);
      // Click (without shift) on an unselected feature
    } else if (!isFeatureSelected && !isShiftClick) {
      // Make it the only selected feature
      selectedFeatureIds.forEach((id) => super.doRender(id));

      super.setSelected(featureId);
    }

    // No matter what, re-render the clicked feature
    super.doRender(featureId);
  };

  onMouseDown(state, e) {
    if (CommonSelectors.isActiveFeature(e))
      return this.startOnActiveFeature(state, e);
    if (this.drawConfig.boxSelect && CommonSelectors.isShiftMousedown(e))
      return this.startBoxSelect(state, e);
  };

  startBoxSelect(state, e) {
    this.stopExtendedInteractions(state);
    this.map.dragPan.disable();
    // Enable box select
    state.boxSelectStartLocation = mouseEventPoint(
      e.originalEvent,
      this.map.getContainer()
    );
    state.canBoxSelect = true;
  };

  onTouchStart(state, e) {
    if (CommonSelectors.isActiveFeature(e))
      return this.startOnActiveFeature(state, e);
  };

  onDrag(state, e) {
    if (state.canDragMove) return this.dragMove(state, e);
    if (this.drawConfig.boxSelect && state.canBoxSelect)
      return this.whileBoxSelect(state, e);
  };

  whileBoxSelect(state, e) {
    state.boxSelecting = true;

    // Create the box node if it doesn't exist
    if (!state.boxSelectElement) {
      state.boxSelectElement = document.createElement("div");
      state.boxSelectElement.classList.add(Constants.classes.BOX_SELECT);
      this.map.getContainer().appendChild(state.boxSelectElement);
    }

    // Adjust the box node's width and xy position
    const current = mouseEventPoint(e.originalEvent, this.map.getContainer());
    const minX = Math.min(state.boxSelectStartLocation.x, current.x);
    const maxX = Math.max(state.boxSelectStartLocation.x, current.x);
    const minY = Math.min(state.boxSelectStartLocation.y, current.y);
    const maxY = Math.max(state.boxSelectStartLocation.y, current.y);
    const translateValue = `translate(${minX}px, ${minY}px)`;
    state.boxSelectElement.style.transform = translateValue;
    state.boxSelectElement.style.WebkitTransform = translateValue;
    state.boxSelectElement.style.width = `${maxX - minX}px`;
    state.boxSelectElement.style.height = `${maxY - minY}px`;
  };

  dragMove(state, e) {
    // Dragging when drag move is enabled
    state.dragMoving = true;
    e.originalEvent.stopPropagation();
    let lngLat = e.lngLat;
    // TODO more efficient
    if (
      super.getSelected().length === 1 &&
      super.getSelected()[0].type === "Point"
    ) {
      lngLat = this._ctx.snapping.snapCoord(e);
      super.getSelected()[0].incomingCoords([lngLat.lng, lngLat.lat]);
    } else {
      const delta = {
        lng: lngLat.lng - state.dragMoveLocation.lng,
        lat: lngLat.lat - state.dragMoveLocation.lat,
      };

      moveFeatures(super.getSelected(), delta);
    }
    state.dragMoveLocation = lngLat;
  };

  onMouseUp(state, e) {
    // End any extended interactions
    if (state.dragMoving) {
      this.fireUpdate(state.coincidentData);
    } else if (state.boxSelecting) {
      const bbox = [
        state.boxSelectStartLocation,
        mouseEventPoint(e.originalEvent, this.map.getContainer()),
      ];
      const featuresInBox = super.featuresAt(null, bbox, "click");
      const idsToSelect = this.getUniqueIds(featuresInBox).filter(
        (id) => !super.isSelected(id)
      );

      if (idsToSelect.length) {
        super.select(idsToSelect);
        idsToSelect.forEach((id) => super.doRender(id));
      }
    }
    this.stopExtendedInteractions(state);
  };

  toDisplayFeatures(state, geojson, display) {
    const { coincidentData } = state;
    geojson.properties.active = super.isSelected(geojson.properties.id)
      ? Constants.activeStates.ACTIVE
      : Constants.activeStates.INACTIVE;
    display(geojson);
    this.fireActionable();

    createSupplementaryPoints(geojson, { coincidentData }).forEach(display);
  };

  onTrash(_state) {
    for (const id of super.getSelectedIds()) {
      super.deleteFeature(id);
    }
    this.fireActionable();
  };

  onCombineFeatures(_state) {
    const selectedFeatures = super.getSelected();

    if (selectedFeatures.length === 0 || selectedFeatures.length < 2) {
      return;
    }

    const coordinates = [],
      featuresCombined = [];
    const featureType = selectedFeatures[0].type.replace("Multi", "");

    for (let i = 0; i < selectedFeatures.length; i++) {
      const feature = selectedFeatures[i];

      if (feature.type.replace("Multi", "") !== featureType) {
        return;
      }
      if (feature.type.includes("Multi")) {
        feature.getCoordinates().forEach((subcoords) => {
          coordinates.push(subcoords);
        });
      } else {
        coordinates.push(feature.getCoordinates());
      }

      featuresCombined.push(feature.toGeoJSON());
    }

    if (featuresCombined.length > 1) {
      const multiFeature = super.newFeature({
        type: "Feature" as const,
        properties: featuresCombined[0].properties,
        geometry: {
          type: `Multi${featureType}` as any,
          coordinates,
        },
      });

      super.addFeature(multiFeature);
      for (const id of super.getSelectedIds()) {
        super.deleteFeature(id, { silent: true });
      }
      super.setSelected([multiFeature.id]);

      this.map.fire(Constants.events.COMBINE_FEATURES, {
        createdFeatures: [multiFeature.toGeoJSON()],
        deletedFeatures: featuresCombined,
      });
    }
    this.fireActionable();
  };

  onUncombineFeatures(_state) {
    const selectedFeatures = super.getSelected();
    if (selectedFeatures.length === 0) {
      return;
    }

    const createdFeatures = [];
    const featuresUncombined = [];

    for (let i = 0; i < selectedFeatures.length; i++) {
      const feature = selectedFeatures[i];

      if (super.isInstanceOf("MultiFeature", feature)) {
        feature.getFeatures().forEach((subFeature) => {
          super.addFeature(subFeature);
          subFeature.properties = feature.properties;
          createdFeatures.push(subFeature.toGeoJSON());
          super.select(String(subFeature.id));
        });
        super.deleteFeature(feature.id, { silent: true });
        featuresUncombined.push(feature.toGeoJSON());
      }
    }

    if (createdFeatures.length > 1) {
      this.map.fire(Constants.events.UNCOMBINE_FEATURES, {
        createdFeatures,
        deletedFeatures: featuresUncombined,
      });
    }
    this.fireActionable();
  };
}
