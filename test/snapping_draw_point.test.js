import test from 'tape';
import Snapping from '../src/snapping/index';
import Constants from '../src/constants';

const { DRAW_POINT, SIMPLE_SELECT, COINCIDENT_SELECT } = Constants.modes;

// getPixelBboxFromPoint reads devicePixelRatio; mock-browser omits it.
global.window.devicePixelRatio = 1;

function createMockCtx(mode, selectedFeatures = [], allFeatures = []) {
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
    getSelected: () => ({
      type: 'FeatureCollection',
      features: selectedFeatures,
    }),
    getSelectedPoints: () => ({ features: [] }),
    getAll: () => ({ features: allFeatures }),
    set: (fc) => {
      api.lastSet = fc;
    },
    lastSet: null,
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

const selectedPointFeature = {
  type: 'Feature',
  properties: { id: 'draw-point-1' },
  geometry: { type: 'Point', coordinates: [-122.6, 37.83] },
};

[SIMPLE_SELECT, COINCIDENT_SELECT].forEach((mode) => {
  test(`_setSnappedFeature: ${mode} queries point layers when dragging a single Point`, (t) => {
    const { ctx, pointFeatureHit, getPointLayerPassQueryLayers } = createMockCtx(
      mode,
      [selectedPointFeature]
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
});

test('_handlePointSnapEnd: simple_select uses selected Point when store has multiple features', (t) => {
  const lineInStore = {
    type: 'Feature',
    properties: { id: 'line-1' },
    geometry: {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [1, 1],
      ],
    },
  };
  const selectedPoint = {
    type: 'Feature',
    properties: { id: 'point-selected' },
    geometry: { type: 'Point', coordinates: [-122.6, 37.83] },
  };

  const { ctx } = createMockCtx(
    SIMPLE_SELECT,
    [selectedPoint],
    [lineInStore, selectedPoint]
  );

  ctx.options.getClosestPoint = async () => ({
    type: 'Point',
    coordinates: [-99, 40],
  });

  const snapping = new Snapping(ctx);
  snapping.snappedFeature = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
    properties: { vetro_id: 'line-vetro-id' },
  };

  snapping._handlePointSnapEnd().then(() => {
    t.ok(ctx.api.lastSet, 'set was called');
    t.equal(
      ctx.api.lastSet.features[0].properties.id,
      'point-selected',
      'updates the selected Point, not getAll().features[0]'
    );
    t.deepEqual(
      ctx.api.lastSet.features[0].geometry.coordinates,
      [-99, 40],
      'applies getClosestPoint result to selected Point'
    );

    snapping.disableSnapping();
    t.end();
  }).catch((err) => {
    snapping.disableSnapping();
    t.error(err);
    t.end();
  });
});

test('_setSnappedFeature: simple_select skips point pass when multiple features selected', (t) => {
  const { ctx, getPointLayerPassQueryLayers } = createMockCtx(SIMPLE_SELECT, [
    selectedPointFeature,
    {
      type: 'Feature',
      properties: { id: 'draw-point-2' },
      geometry: { type: 'Point', coordinates: [-122.7, 37.84] },
    },
  ]);
  const snapping = new Snapping(ctx);
  snapping.snapLayers = ['circle-network-9-point'];

  snapping._setSnappedFeature({ point: { x: 100, y: 200 } }).then(() => {
    t.equal(
      getPointLayerPassQueryLayers(),
      undefined,
      'does not query point layers for multi-select drag'
    );

    snapping.disableSnapping();
    t.end();
  }).catch((err) => {
    snapping.disableSnapping();
    t.error(err);
    t.end();
  });
});
