import * as normalize from "@mapbox/geojson-normalize";
import * as hat from "hat";
import _ from "lodash";
import Constants from "./constants";
import LineString from "./feature_types/line_string";
import { default as MultiLineString, default as MultiPoint, default as MultiPolygon } from "./feature_types/multi_feature";
import Point from "./feature_types/point";
import Polygon from "./feature_types/polygon";
import featuresAt from "./lib/features_at";
import StringSet from "./lib/string_set";
import stringSetsAreEqual from "./lib/string_sets_are_equal";
import updateLineWidth from "./utils/linePaintProperties";

// Type definitions
export interface Point {
  x: number;
  y: number;
}

export interface DrawContext {
  store: DrawStore;
  events: DrawEvents;
  options: any;
  api: DrawAPI;
  map?: any;
}

export interface DrawStore {
  getSelectedIds(): string[];
  get(id: string): DrawFeature | undefined;
  getAll(): DrawFeature[];
  getAllIds(): string[];
  add(feature: DrawFeature): void;
  delete(ids: string | string[], options?: { silent?: boolean }): void;
  setSelected(ids: string[], options?: { silent?: boolean }): void;
  getSelectedCoordinates(): Array<{ coordinates: number[] }>;
  setFeatureProperty(featureId: string, property: string, value: any): void;
  render(): void;
  createRenderBatch(): () => void;
}

export interface DrawEvents {
  changeMode(mode: string, modeOptions?: any, options?: { silent?: boolean }): void;
  getMode(): string;
  trash(options?: { silent?: boolean }): void;
  combineFeatures(options?: { silent?: boolean }): void;
  uncombineFeatures(options?: { silent?: boolean }): void;
}

export interface DrawFeature {
  type: string;
  id: string;
  properties: Record<string, any>;
  toGeoJSON(): GeoJSON.Feature;
  getCoordinates(): any;
  incomingCoords(coords: any): void;
}

export interface FeatureCollection {
  type: "FeatureCollection";
  features: GeoJSON.Feature[];
}

export interface DrawAPI {
  modes: any;
  getFeatureIdsAt(point: Point): string[];
  getSelectedIds(): string[];
  getSelected(): FeatureCollection;
  getSelectedPoints(): FeatureCollection;
  set(featureCollection: GeoJSON.FeatureCollection): string[];
  add(geojson: GeoJSON.GeoJSON): string[];
  get(id: string): GeoJSON.Feature | undefined;
  getAll(): FeatureCollection;
  delete(featureIds: string | string[]): DrawAPI;
  deleteAll(): DrawAPI;
  changeMode(mode: string, modeOptions?: any): DrawAPI;
  getMode(): string;
  trash(): DrawAPI;
  combineFeatures(): DrawAPI;
  uncombineFeatures(): DrawAPI;
  setFeatureProperty(featureId: string, property: string, value: any): DrawAPI;
  updateLineWidthProperty(value: number): void;
  resetLineWidthProperty(): void;
}

const featureTypes = {
  Polygon: Polygon,
  LineString: LineString,
  Point: Point,
  MultiPolygon: MultiPolygon,
  MultiLineString: MultiLineString,
  MultiPoint: MultiPoint,
};

export default function (ctx: DrawContext, api: DrawAPI): DrawAPI {
  api.modes = Constants.modes;

  api.getFeatureIdsAt = function (point: Point): string[] {
    const features = featuresAt.click({ point }, null, ctx);
    return features.map((feature: any) => feature.properties.id);
  };

  api.getSelectedIds = function () {
    return ctx.store.getSelectedIds();
  };

  api.getSelected = function (): FeatureCollection {
    const features = ctx.store
      ?.getSelectedIds()
      ?.map((id: string) => ctx.store.get(id))
      ?.map((feature: DrawFeature) => feature!.toGeoJSON()) ?? [];
    return {
      type: "FeatureCollection",
      features,
    };
  };

  api.getSelectedPoints = function (): FeatureCollection {
    return {
      type: "FeatureCollection",
      features: ctx.store.getSelectedCoordinates().map((coordinate): GeoJSON.Feature => ({
        type: "Feature",
        properties: {},
        geometry: {
          type: "Point",
          coordinates: coordinate.coordinates,
        },
      })),
    };
  };

  api.set = function (featureCollection: GeoJSON.FeatureCollection): string[] {
    if (
      featureCollection.type === undefined ||
      featureCollection.type !== Constants.geojsonTypes.FEATURE_COLLECTION ||
      !Array.isArray(featureCollection.features)
    ) {
      throw new Error("Invalid FeatureCollection");
    }
    const renderBatch = ctx.store.createRenderBatch();
    let toDelete = ctx.store.getAllIds().slice();
    const newIds = api.add(featureCollection);
    const newIdsLookup = new StringSet(newIds);

    toDelete = toDelete.filter((id: string) => !newIdsLookup.has(id));
    if (toDelete.length) {
      api.delete(toDelete);
    }

    renderBatch();
    return newIds;
  };

  api.add = function (geojson: GeoJSON.GeoJSON): string[] {
    const featureCollection = JSON.parse(JSON.stringify(normalize(geojson)));

    const ids = featureCollection.features.map((feature: any) => {
      feature.id =
        feature.id ||
        (feature["x-vetro"] && feature["x-vetro"].vetroId) ||
        hat();

      if (feature.geometry === null) {
        throw new Error("Invalid geometry: null");
      }

      if (
        ctx.store.get(feature.id) === undefined ||
        ctx.store.get(feature.id)!.type !== feature.geometry.type
      ) {
        // If the feature has not yet been created ...
        const Model = featureTypes[feature.geometry.type];
        if (Model === undefined) {
          throw new Error(`Invalid geometry type: ${feature.geometry.type}.`);
        }
        const internalFeature = new Model(ctx, feature);
        ctx.store.add(internalFeature);
      } else {
        // If a feature of that id has already been created, and we are swapping it out ...
        const internalFeature = ctx.store.get(feature.id)!;
        internalFeature.properties = feature.properties;
        if (
          !_.isEqual(
            internalFeature.getCoordinates(),
            feature.geometry.coordinates
          )
        ) {
          internalFeature.incomingCoords(feature.geometry.coordinates);
        }
      }
      return feature.id;
    });

    ctx.store.render();
    return ids;
  };

  api.get = function (id: string): GeoJSON.Feature | undefined {
    const feature = ctx.store.get(id);
    if (feature) {
      return feature.toGeoJSON();
    }
  };

  api.getAll = function (): FeatureCollection {
    const features =
      ctx?.store?.getAll().map((feature: DrawFeature) => feature.toGeoJSON()) ?? [];
    return {
      type: "FeatureCollection",
      features,
    };
  };

  api.delete = function (featureIds: string | string[]): DrawAPI {
    ctx.store.delete(featureIds, { silent: true });
    // If we were in direct select mode and our selected feature no longer exists
    // (because it was deleted), we need to get out of that mode.
    if (
      api.getMode() === Constants.modes.DIRECT_SELECT &&
      !ctx.store.getSelectedIds().length
    ) {
      ctx.events.changeMode(Constants.modes.SIMPLE_SELECT, undefined, {
        silent: true,
      });
    } else {
      ctx.store.render();
    }

    return api;
  };

  api.deleteAll = function (): DrawAPI {
    ctx.store.delete(ctx.store.getAllIds(), { silent: true });
    // If we were in direct select mode, now our selected feature no longer exists,
    // so escape that mode.
    if (api.getMode() === Constants.modes.DIRECT_SELECT) {
      ctx.events.changeMode(Constants.modes.SIMPLE_SELECT, undefined, {
        silent: true,
      });
    } else {
      ctx.store.render();
    }

    return api;
  };

  api.changeMode = function (mode: string, modeOptions: any = {}): DrawAPI {
    // Avoid changing modes just to re-select what's already selected
    if (
      mode === Constants.modes.SIMPLE_SELECT &&
      api.getMode() === Constants.modes.SIMPLE_SELECT
    ) {
      if (
        stringSetsAreEqual(
          modeOptions.featureIds || [],
          ctx.store.getSelectedIds()
        )
      )
        return api;
      // And if we are changing the selection within simple_select mode, just change the selection,
      // instead of stopping and re-starting the mode
      ctx.store.setSelected(modeOptions.featureIds, { silent: true });
      ctx.store.render();
      return api;
    }

    if (
      mode === Constants.modes.DIRECT_SELECT &&
      api.getMode() === Constants.modes.DIRECT_SELECT &&
      modeOptions.featureId === ctx.store.getSelectedIds()[0]
    ) {
      return api;
    }

    ctx.events.changeMode(mode, modeOptions, { silent: true });
    return api;
  };

  api.getMode = function (): string {
    return ctx.events.getMode();
  };

  api.trash = function (): DrawAPI {
    ctx.events.trash({ silent: true });
    return api;
  };

  api.combineFeatures = function (): DrawAPI {
    ctx.events.combineFeatures({ silent: true });
    return api;
  };

  api.uncombineFeatures = function (): DrawAPI {
    ctx.events.uncombineFeatures({ silent: true });
    return api;
  };

  api.setFeatureProperty = function (featureId: string, property: string, value: any): DrawAPI {
    ctx.store.setFeatureProperty(featureId, property, value);
    return api;
  };

  api.updateLineWidthProperty = function (value: number): void {
    updateLineWidth(ctx, value);
  };

  api.resetLineWidthProperty = function (): void {
    updateLineWidth(
      ctx,
      Constants.paintProperties.LINE.WIDTH
    );
  };

  return api;
};
