import Feature from './feature';
import Constants from '../constants';
import hat from 'hat';

import Point  from './point';
import LineString from './line_string';
import Polygon from './polygon';

const models = {
  MultiPoint: Point,
  MultiLineString: LineString,
  MultiPolygon: Polygon,
};

interface FeatureAction {
  getCoordinate(path: string | null): any;
  updateCoordinate(path: string | null, lng: number, lat: number): void;
  addCoordinate(path: string | null, lng: number, lat: number): void;
  removeCoordinate(path: string | null): void;
}

const takeAction = (
  features: FeatureAction[], 
  action: keyof FeatureAction, 
  path: string, 
  lng?: number, 
  lat?: number
): any => {
  const parts = path.split('.');
  const idx = parseInt(parts[0], 10);
  const tail = (!parts[1]) ? null : parts.slice(1).join('.');
  return features[idx][action](tail, lng, lat);
};

const MultiFeature = function(ctx, geojson) {
  Feature.call(this, ctx, geojson);

  delete this.coordinates;
  this.model = models[geojson.geometry.type];
  if (this.model === undefined) throw new TypeError(`${geojson.geometry.type} is not a valid type`);
  this.features = this._coordinatesToFeatures(geojson.geometry.coordinates);
};

MultiFeature.prototype = Object.create(Feature.prototype);

MultiFeature.prototype._coordinatesToFeatures = function(coordinates) {
  const Model = this.model.bind(this);
  return coordinates.map(coords => new Model(this.ctx, {
    id: hat(),
    type: Constants.geojsonTypes.FEATURE,
    properties: {},
    geometry: {
      coordinates: coords,
      type: this.type.replace('Multi', '')
    }
  }));
};

MultiFeature.prototype.isValid = function() {
  return this.features.every(f => f.isValid());
};

MultiFeature.prototype.setCoordinates = function(coords) {
  this.features = this._coordinatesToFeatures(coords);
  this.changed();
};

MultiFeature.prototype.getCoordinate = function(path) {
  return takeAction(this.features, 'getCoordinate', path);
};

MultiFeature.prototype.getCoordinates = function() {
  return JSON.parse(JSON.stringify(this.features.map((f) => {
    if (f.type === Constants.geojsonTypes.POLYGON) return f.getCoordinates();
    return f.coordinates;
  })));
};

MultiFeature.prototype.updateCoordinate = function(path, lng, lat) {
  takeAction(this.features, 'updateCoordinate', path, lng, lat);
  this.changed();
};

MultiFeature.prototype.addCoordinate = function(path, lng, lat) {
  takeAction(this.features, 'addCoordinate', path, lng, lat);
  this.changed();
};

MultiFeature.prototype.removeCoordinate = function(path) {
  takeAction(this.features, 'removeCoordinate', path);
  this.changed();
};

MultiFeature.prototype.getFeatures = function() {
  return this.features;
};

export default MultiFeature;
