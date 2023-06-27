const {
  point: turfPoint,
  featureCollection: turfFeatureCollection,
} = require("@turf/helpers");
const turfFlatten = require("@turf/flatten").default;
const getNearestPoint = require("@turf/nearest-point").default;
const pointInPolygon = require("@turf/boolean-point-in-polygon").default;
const { getCoords } = require("@turf/invariant");

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
