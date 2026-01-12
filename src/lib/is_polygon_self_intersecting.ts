import { polygon } from '@turf/helpers';
import unkinkPolygon from '@turf/unkink-polygon';

/**
 * Determine if polygon(s) cross their own border
 *
 * @param {array} polygon coordinates
 * @return {boolean} true if polygon intersects itself
 */
export default function isPolygonSelfIntersecting(coords) {
  return coords.every(ring => {
    return ring.length >= 4 && unkinkPolygon(polygon([ring])).features.length > 1;
  });
}
