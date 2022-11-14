const {
  point: turfPoint,
  featureCollection: turfFeatureCollection,
} = require("@turf/helpers");
const turfFlatten = require("@turf/flatten").default;
const getNearestPoint = require("@turf/nearest-point").default;
const pointInPolygon = require("@turf/boolean-point-in-polygon").default;
const { getCoords } = require("@turf/invariant");

const LINE_TYPES = ["line", "fill", "fill-extrusion"];
const CIRCLE_TYPES = ["circle", "symbol"];

const getBufferLayerType = (rootLayer) => {
  if (LINE_TYPES.includes(rootLayer.type)) {
    return "line";
  } else if (CIRCLE_TYPES.includes(rootLayer.type)) {
    return "circle";
  } else {
    console.error(
      `Unsupported snap layer type ${rootLayer.type} for layer ${rootLayer.id}`
    );
  }
};

exports.getBufferLayerId = (layerId) => `_snap_buffer_${layerId}`;

exports.getBufferLayer = (bufferLayerId, rootLayer, snapDistance) => {
  const bufferLayer = {
    id: bufferLayerId,
    source: rootLayer.source,
  };

  bufferLayer.type = getBufferLayerType(rootLayer);

  if (rootLayer.sourceLayer) {
    bufferLayer["source-layer"] = rootLayer.sourceLayer;
  }
  if (rootLayer.filter) {
    bufferLayer.filter = rootLayer.filter.filter(
      (filt) => !(filt instanceof Array) || filt[0] !== "!="
    );
  }
  if (bufferLayer.type === "circle") {
    bufferLayer.paint = {
      "circle-color": "hsla(0,100%,50%,0.001)",
      "circle-radius": snapDistance,
    };
  } else {
    bufferLayer.paint = {
      "line-color": "hsla(0,100%,50%,0.001)",
      "line-width": snapDistance * 2,
    };
  }
  return bufferLayer;
};

const isVertexArray = (coordinates) =>
  Array.isArray(coordinates) &&
  !isNaN(coordinates[0]) &&
  !isNaN(coordinates[1]);

const findVertexInCircle = (feature, circle) =>
  getCoords(feature).find((coord) => pointInPolygon(coord, circle));

exports.isMultiGeometry = (geometry) =>
  geometry &&
  Array.isArray(geometry.coordinates[0]) &&
  Array.isArray(geometry.coordinates[0][0]);

exports.findVertexInCircleMulti = (snapGeom, circle, hoverPoint) => {
  let vertex;
  if (exports.isMultiGeometry(snapGeom.geometry)) {
    const { features: flattenedFeatures } = exports.deepFlatten(
      snapGeom.geometry
    );
    const verticesInCircle = flattenedFeatures
      .map((feature) => findVertexInCircle(feature, circle))
      .filter(isVertexArray);

    if (verticesInCircle.length > 0) {
      if (hoverPoint) {
        const verticesInCircleFeatureCollection = turfFeatureCollection(
          verticesInCircle.map((vertex) => turfPoint(vertex))
        );
        const nearestPoint = getNearestPoint(
          hoverPoint,
          verticesInCircleFeatureCollection
        );
        vertex = nearestPoint.geometry.coordinates;
      } else {
        vertex = verticesInCircle[0];
      }
    }
  } else {
    vertex = findVertexInCircle(snapGeom, circle);
  }
  return vertex;
};

// This function is needed because turfs flatten utility
// assumes there will not be nested Multi features
exports.deepFlatten = (feature) => {
  const { features: flattenedFeatures } = turfFlatten(feature);
  const nf = turfFeatureCollection(
    flattenedFeatures.reduce((deepFlattenedFeatures, nestedFeature) => {
      let nestedFeatures;
      if (exports.isMultiGeometry(nestedFeature.geometry)) {
        // turfs flatten utility will only flatten features that
        // have a Multi geometry type
        if (nestedFeature.geometry.type === "LineString") {
          nestedFeature.geometry.type = "MultiLineString";
        }
        nestedFeatures = turfFlatten(nestedFeature).features;
      } else {
        nestedFeatures = [nestedFeature];
      }
      deepFlattenedFeatures.push(...nestedFeatures);
      return deepFlattenedFeatures;
    }, [])
  );
  return nf;
};
