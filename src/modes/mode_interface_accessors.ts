import { Feature as GeoJSONFeature } from 'geojson';
import { DrawFeature } from '../api';
import Constants from '../constants';
import LineString from '../feature_types/line_string';
import MultiFeature from '../feature_types/multi_feature';
import Point from '../feature_types/point';
import Polygon from '../feature_types/polygon';
import featuresAt from '../lib/features_at';

export default class ModeInterface {
  protected map: any;
  protected drawConfig: any;
  protected _ctx: any;

  constructor(ctx) {
    this.map = ctx.map;
    this.drawConfig = JSON.parse(JSON.stringify(ctx.options || {}));
    this._ctx = ctx;
  };

  /**
   * Sets Draw's internal selected state
   * @name this.setSelected
   * @param {DrawFeature[]} - whats selected as a [DrawFeature](https://github.com/mapbox/mapbox-gl-draw/blob/master/src/feature_types/feature.js)
   */
  setSelected(features) {
    return this._ctx.store.setSelected(features);
  };

  /**
   * Sets Draw's internal selected coordinate state
   * @name this.setSelectedCoordinates
   * @param {Object[]} coords - a array of {coord_path: 'string', featureId: 'string'}
   */
  setSelectedCoordinates(coords: { coord_path: string; feature_id: string }[]) {
    this._ctx.store.setSelectedCoordinates(coords);
    coords.reduce((m, c) => {
      if (m[c.feature_id] === undefined) {
        m[c.feature_id] = true;
        this._ctx.store.get(c.feature_id).changed();
      }
      return m;
    }, {});
  };

  /**
   * Get all selected features as a [DrawFeature](https://github.com/mapbox/mapbox-gl-draw/blob/master/src/feature_types/feature.js)
   * @name this.getSelected
   * @returns {DrawFeature[]}
   */
  getSelected(): DrawFeature[] {
    return this._ctx.store.getSelected();
  };

  /**
   * Get the ids of all currently selected features
   * @name this.getSelectedIds
   * @returns {String[]}
   */
  getSelectedIds(): string[] {
    return this._ctx.store.getSelectedIds();
  };

  /**
   * Check if a feature is selected
   * @name this.isSelected
   * @param {String} id - a feature id
   * @returns {Boolean}
   */
  isSelected(id: string): boolean {
    return this._ctx.store.isSelected(id);
  };

  /**
   * Get a [DrawFeature](https://github.com/mapbox/mapbox-gl-draw/blob/master/src/feature_types/feature.js) by its id
   * @name this.getFeature
   * @param {String} id - a feature id
   * @returns {DrawFeature}
   */
  getFeature(id: string): DrawFeature {
    return this._ctx.store.get(id);
  };

  /**
   * Add a feature to draw's internal selected state
   * @name this.select
   * @param {String} id
   */
  select(id: string) {
    return this._ctx.store.select(id);
  };

  /**
   * Remove a feature from draw's internal selected state
   * @name this.delete
   * @param {String} id
   */
  deselect(id: string) {
    return this._ctx.store.deselect(id);
  };

  /**
   * Delete a feature from draw
   * @name this.deleteFeature
   * @param {String} id - a feature id
   */
  deleteFeature(id: string, opts = {}) {
    return this._ctx.store.delete(id, opts);
  };

  /**
   * Add a [DrawFeature](https://github.com/mapbox/mapbox-gl-draw/blob/master/src/feature_types/feature.js) to draw.
   * See `this.newFeature` for converting geojson into a DrawFeature
   * @name this.addFeature
   * @param {DrawFeature} feature - the feature to add
   */
  addFeature(feature: DrawFeature) {
    return this._ctx.store.add(feature);
  };

  /**
   * Clear all selected features
   */
  clearSelectedFeatures() {
    return this._ctx.store.clearSelected();
  };

  /**
   * Clear all selected coordinates
   */
  clearSelectedCoordinates() {
    return this._ctx.store.clearSelectedCoordinates();
  };

  /**
   * Indicate if the different action are currently possible with your mode
   * See [draw.actionable](https://github.com/mapbox/mapbox-gl-draw/blob/master/API.md#drawactionable) for a list of possible actions. All undefined actions are set to **false** by default
   * @name this.setActionableState
   * @param {Object} actions
   */
  setActionableState(actions: { trash?: boolean; combineFeatures?: boolean; uncombineFeatures?: boolean } = {}) {
    const newSet = {
      trash: actions.trash || false,
      combineFeatures: actions.combineFeatures || false,
      uncombineFeatures: actions.uncombineFeatures || false
    };
    return this._ctx.events.actionable(newSet);
  };

  /**
   * Trigger a mode change
   * @name this.changeMode
   * @param {String} mode - the mode to transition into
   * @param {Object} opts - the options object to pass to the new mode
   * @param {Object} eventOpts - used to control what kind of events are emitted.
   */
  changeMode(mode: string, opts: object = {}, eventOpts: object = {}) {
    return this._ctx.events.changeMode(mode, opts, eventOpts);
  };

  /**
   * Update the state of draw map classes
   * @name this.updateUIClasses
   * @param {Object} opts
   */
  updateUIClasses(opts: object) {
    return this._ctx.ui.queueMapClasses(opts);
  };

  /**
   * If a name is provided it makes that button active, else if makes all buttons inactive
   * @name this.activateUIButton
   * @param {String?} name - name of the button to make active, leave as undefined to set buttons to be inactive
   */
  activateUIButton(name: string | null) {
    return this._ctx.ui.setActiveButton(name);
  };

  /**
   * Get the features at the location of an event object or in a bbox
   * @name this.featuresAt
   * @param {Event||NULL} event - a mapbox-gl event object
   * @param {BBOX||NULL} bbox - the area to get features from
   * @param {String} bufferType - is this `click` or `tap` event, defaults to click
   */
  featuresAt(event, bbox, bufferType: string = 'click') {
    if (bufferType !== 'click' && bufferType !== 'touch') throw new Error('invalid buffer type');
    return featuresAt[bufferType](event, bbox, this._ctx);
  };

  /**
   * Create a new [DrawFeature](https://github.com/mapbox/mapbox-gl-draw/blob/master/src/feature_types/feature.js) from geojson
   * @name this.newFeature
   * @param {GeoJSONFeature} geojson
   * @returns {DrawFeature}
   */
  newFeature(geojson: GeoJSONFeature): DrawFeature {
    const type = geojson.geometry.type;
    if (type === Constants.geojsonTypes.POINT) return new Point(this._ctx, geojson);
    if (type === Constants.geojsonTypes.LINE_STRING) return new LineString(this._ctx, geojson);
    if (type === Constants.geojsonTypes.POLYGON) return new Polygon(this._ctx, geojson);
    return new MultiFeature(this._ctx, geojson);
  };

  /**
   * Check is an object is an instance of a [DrawFeature](https://github.com/mapbox/mapbox-gl-draw/blob/master/src/feature_types/feature.js)
   * @name this.isInstanceOf
   * @param {String} type - `Point`, `LineString`, `Polygon`, `MultiFeature`
   * @param {Object} feature - the object that needs to be checked
   * @returns {Boolean}
   */
  isInstanceOf(type: string, feature: object): boolean {
    if (type === Constants.geojsonTypes.POINT) return feature instanceof Point;
    if (type === Constants.geojsonTypes.LINE_STRING) return feature instanceof LineString;
    if (type === Constants.geojsonTypes.POLYGON) return feature instanceof Polygon;
    if (type === 'MultiFeature') return feature instanceof MultiFeature;
    throw new Error(`Unknown feature class: ${type}`);
  };

  /**
   * Force draw to rerender the feature of the provided id
   * @name this.doRender
   * @param {String} id - a feature id
   */
  doRender(id: string) {
    return this._ctx.store.featureChanged(id);
  };
}
