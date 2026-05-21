import test from 'tape';
import {
  getSnapLayerBasename,
  isSnapPointLayerId,
} from '../src/snapping/is_snap_point_layer_id';

test('getSnapLayerBasename', (t) => {
  const cases = [
    { id: 'circle-123-point', want: 'circle-123-point' },
    {
      id: 'mfth_circle-network-999-point_myOwnerKey',
      want: 'circle-network-999-point',
    },
    { id: 'mfth_mapbox-layer-1-point_u1', want: 'mapbox-layer-1-point' },
  ];

  cases.forEach(({ id, want }) => {
    t.equal(getSnapLayerBasename(id), want, `'${id}' basename`);
  });
  t.end();
});

test('isSnapPointLayerId', (t) => {
  const positive = [
    'circle-network-123-point',
    'polygon-outline-42-point',
    'dashed-line-7-point',
    // mapbox-layer-{digits}_ + vetro embedding regex
    'mapbox-layer--1_-point',
    'mapbox-layer-901-point',

    // MFTH: preview owner trailing segment; basename must encode point geometry.
    'mfth_circle-network-123-point_previewOwner',
    'mfth_mapbox-layer-902-point_xyz',
    'mfth_mfth_abc_-999_-point_own',

    // Inner mapbox-like id strings may nest mfth-looking segments; outer mfth still peels owner.
    'mfth_mfth_w_-999_-999_-point_previewOwner123',
  ];

  const negative = [
    'polygon-outline-linestring-feature',
    'mapbox-layer-2-linestring',
    'fancy-thing-polygon',

    '',
    'not-a-map-layer',

    // Non-point Vetros tails
    'trail-dottedlinestring',
    'road-guidelinedottedlinestring',

    // Decorative trailers on full layer id
    'circle-888-point_some_label',
    'circle-777-point_icons_icon',
    'polygon-outline-extra_point_icon',
    'polygon-outline-extra_icons_label',
    'whatever_label',
    'whatever_icon',
    'polygon-outline-extra_point_label',
    'circle-123-point_text_label',

    // Polygon / linestring basenames after mfth unwrap

    'mfth_polygon-outline-linestring-tail-polygon_own',
    'mfth_mapbox-layer-3-linestring_x',
    'mfth_mapbox-layer-303-polygon_x',

    // Label-like basename
    'mapbox-layer-1-feature-label-marker',
    'mfth_mapbox-layer-1-point-label-marker_own',
    'polygon-outline-area-label-extra',

    // Not outer Vetros mfth wrapper — last '_' is part of basename, no owner peel.

    'prefix_mfth_circle-1-point_ownerXYZ',
    'blah_mfth_w_-1_-999_-point_own',
  ];

  positive.forEach((id) =>
    t.ok(isSnapPointLayerId(id), `expected POINT: '${id}'`)
  );

  negative.forEach((id) =>
    t.notOk(isSnapPointLayerId(id), `expected non-point: '${id}'`)
  );

  t.end();
});
