/**
 * Resolves Vetros mfth_<mapboxLayerId>_<previewOwner> wrapper to the embedded mapbox
 * layer id (see vetro-2-front-end formatMapboxLayerId).
 *
 * @param {string} id
 * @returns {string}
 */
function getSnapLayerBasename(id) {
  if (!id.startsWith("mfth_")) {
    return id;
  }

  const withoutPrefix = id.slice(5);
  const lastSep = withoutPrefix.lastIndexOf("_");

  if (lastSep <= 0) {
    return withoutPrefix;
  }

  return withoutPrefix.slice(0, lastSep);
}

/** Line / polygon tails used for snapping non-point geometries (mirror _getClosestLineStringOrPolygon). */
const NON_POINT_GEOMETRY_TAIL =
  /-(?:linestring|polygon|dottedlinestring|guidelinedottedlinestring)$/i;

/**
 * Same geometry capture as vetro-2-front-end getLayerTypeFromMapboxLayerId for ids that match
 * the mapbox-layer / nested mfth template.
 */
const VETRO_EMBEDDED_GEOMETRY_SEGMENT =
  /(?:mapbox-layer[-_]-?\d+[-_]|mfth[-_]\w+[-_]-?\d+[-_])(point|linestring|polygon|dottedlinestring|guidelinedottedlinestring)/i;

/**
 * True when `id` denotes a rendered point geometry layer suitable for point snap queries.
 * Decorative layers (_label / _icon) are excluded where possible; hosts still rely on snapLayerFilter.
 *
 * @param {string} id
 * @returns {boolean}
 */
function isSnapPointLayerId(id) {
  if (typeof id !== "string" || id.length === 0) {
    return false;
  }

  const fullLower = id.toLowerCase();
  if (fullLower.endsWith("_label") || fullLower.endsWith("_icon")) {
    return false;
  }

  const basename = getSnapLayerBasename(id);
  if (!basename.length) {
    return false;
  }

  const baseLower = basename.toLowerCase();
  if (baseLower.includes("label")) {
    return false;
  }

  if (NON_POINT_GEOMETRY_TAIL.test(basename)) {
    return false;
  }

  // Only interpret the Vetros geometry fragment when the basename is actually a
  // mapbox-layer / mfth-prefixed layer id (avoid matching spurious "…_mfth_…"
  // segments inside unrelated ids).
  const useEmbeddedFragment =
    basename.startsWith("mapbox-layer") || basename.startsWith("mfth_");
  if (useEmbeddedFragment) {
    const embedded = basename.match(VETRO_EMBEDDED_GEOMETRY_SEGMENT);
    if (embedded) {
      return embedded[1].toLowerCase() === "point";
    }
  }

  // circle-… , polygon-outline-… , dashed-line-… convention: basename ends with "point".
  return baseLower.endsWith("point");
}

module.exports = {
  getSnapLayerBasename,
  isSnapPointLayerId,
};
