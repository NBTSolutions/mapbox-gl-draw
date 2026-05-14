import test from 'tape';
import Snapping from '../src/snapping/index';
import Constants from '../src/constants';

const { DRAW_POINT } = Constants.modes;

// getPixelBboxFromPoint reads devicePixelRatio; mock-browser omits it.
global.window.devicePixelRatio = 1;

function createMockCtx(mode) {
  const pointFeatureHit = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-122.4, 37.81] },
    properties: { vetro_id: 'target-xyz' },
    id: 'mb-1',
    source: 'vector-tiles',
  };

  /** Set when `_getClosestMapboxPoint` runs `queryRenderedFeatures` against point-layer ids */
  let pointLayerPassQueryLayers;

  const map = {
    on: () => {},
    off: () => {},
    fire: () => {},
    getStyle: () => ({
      layers: [{ id: 'circle-network-9-point', type: 'circle' }],
    }),
    queryRenderedFeatures: (_bbox, opts) => {
      const layers = opts && opts.layers ? opts.layers : [];
      if (layers.includes('circle-network-9-point')) {
        pointLayerPassQueryLayers = layers.slice();
        return [pointFeatureHit];
      }
      return [];
    },
    setFeatureState: () => {},
    getSource: () => ({
      _data: { features: [] },
      setData: () => {},
    }),
    addSource: () => {},
    addLayer: () => {},
    getLayer: () => null,
    removeLayer: () => {},
    removeSource: () => {},
    unproject: () => ({
      toArray: () => [-122.5, 37.82],
    }),
  };

  const api = {
    getMode: () => mode,
    getSelected: () => ({ features: [] }),
    getSelectedPoints: () => ({ features: [] }),
    getAll: () => ({ features: [] }),
    set: () => {},
  };

  const ctx = {
    map,
    store: { ctx: null },
    api,
    options: {
      snapLayerFilter: (layer) => /(?:^|-)point(?:$|-)/.test(layer.id),
      snapDistance: 20,
      fetchSnapGeometry: async (feat) => (
        feat === pointFeatureHit
          ? { type: 'Point', coordinates: [-100, 41] }
          : null
      ),
      fetchSnapGeometries: async () => [],
      getClosestPoint: async () => ({
        type: 'Point',
        coordinates: [0, 0],
      }),
      resetSnappingGeomCache: () => {},
      _updateSourceGeomCache: () => {},
      _setGeomCacheIfNotExists: () => {},
      fetchSourceGeometry: () => {},
      fetchSourceGeometries: () => {},
      fetchMapExtentGeometry: () => {},
    },
  };

  ctx.store.ctx = ctx;

  return {
    ctx,
    pointFeatureHit,
    getPointLayerPassQueryLayers: () => pointLayerPassQueryLayers,
  };
}

test('_setSnappedFeature: draw_point queries point-capable layers and uses fetchSnapGeometry', (t) => {
  const { ctx, pointFeatureHit, getPointLayerPassQueryLayers } = createMockCtx(
    DRAW_POINT
  );
  const snapping = new Snapping(ctx);
  snapping.snapLayers = ['circle-network-9-point'];

  snapping._setSnappedFeature({ point: { x: 100, y: 200 } }).then(() => {
    const layers = getPointLayerPassQueryLayers();

    t.ok(
      Array.isArray(layers) && layers.includes('circle-network-9-point'),
      'point pass queries snap point layer ids'
    );

    t.deepEqual(
      snapping.snappedGeometry,
      { type: 'Point', coordinates: [-100, 41] },
      'geometry from fetchSnapGeometry after tile hit'
    );
    t.equal(
      snapping.snappedFeature,
      pointFeatureHit,
      'snap target is queried feature'
    );

    snapping.disableSnapping();
    t.end();
  }).catch((err) => {
    snapping.disableSnapping();
    t.error(err);
    t.end();
  });
});
