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

const findVertexInCircle = (feature, circle) =>
  getCoords(feature).find((coord) => pointInPolygon(coord, circle));

exports.isMultiGeometry = (geometry) => geometry.coordinates && Array.isArray(geometry.coordinates[0][0])

exports.findVertexInCircleMulti = (snapGeom, circle, hoverPoint) => {
  let vertex;
  if (exports.isMultiGeometry(snapGeom.geometry)) {
    const vertexesInCircle = snapGeom.geometry.coordinates
      .flatMap((coords) =>
        coords.map((coord) => {
          if (coord[0]) {
            const coordArray = Array.isArray(coord[0]) ? coord : [coord];
            return findVertexInCircle(coordArray, circle);
          }
        })
      )
      .filter((value) => Array.isArray(value));

    if (vertexesInCircle.length > 0) {
      if (hoverPoint) {
        const vertexesInCircleFeatureCollection = turfFeatureCollection(
          vertexesInCircle.map((vertex) => turfPoint(vertex))
        );
         const nearestPoint = getNearestPoint(
          hoverPoint,
          vertexesInCircleFeatureCollection
        );
        vertex = nearestPoint.geometry.coordinates;
      } else {
        vertex = vertexesInCircle[0];
      }
    }
  } else {
    vertex = findVertexInCircle(snapGeom, circle);
  }
  return vertex;
};

exports.deepFlatten = (feature) => {
  const { features: flattenedFeatures } = turfFlatten(feature);
  flattenedFeatures.reduce((deepFlattenedFeatures, nestedFeature) => {
    deepFlattenedFeatures.push([nestedFeature])
    return deepFlattenedFeatures;
  }, []);
  return turfFeatureCollection(flattenedFeatures);
}
