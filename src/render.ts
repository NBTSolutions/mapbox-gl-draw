import Constants from "./constants";

// Type definitions for render context
interface DrawStore {
  ctx: {
    map: {
      getSource(source: string): any;
      fire(event: string, data?: any): void;
    };
    events: {
      currentModeName(): string;
      currentModeRender(feature: any, callback: (geojson: any) => void): void;
    };
    ui: {
      queueMapClasses(classes: { mode?: string }): void;
    };
  };
  isDirty: boolean;
  sources: {
    hot: any[];
    cold: any[];
  };
  _emitSelectionChange: boolean;
  _deletedFeaturesToEmit: any[];
  getAllIds(): string[];
  getChangedIds(): string[];
  get(id: string): any;
  getSelected(): any[];
  getSelectedCoordinates(): Array<{ coordinates: number[] }>;
  clearChangedIds(): void;
}

export default function render(this: DrawStore): void {
  const store = this;
  const mapExists =
    store.ctx.map &&
    store.ctx.map.getSource(Constants.sources.HOT) !== undefined;
  if (!mapExists) return cleanup();

  const mode = store.ctx.events.currentModeName();

  store.ctx.ui.queueMapClasses({ mode });

  let newHotIds: string[] = [];
  let newColdIds: string[] = [];

  if (store.isDirty) {
    newColdIds = store.getAllIds();
  } else {
    newHotIds = store.getChangedIds().filter((id: string) => store.get(id) !== undefined);
    newColdIds = store.sources.hot
      .filter(
        (geojson: any) =>
          geojson.properties.id &&
          newHotIds.indexOf(geojson.properties.id) === -1 &&
          store.get(geojson.properties.id) !== undefined
      )
      .map((geojson: any) => geojson.properties.id);
  }

  store.sources.hot = [];
  const lastColdCount = store.sources.cold.length;
  store.sources.cold = store.isDirty
    ? []
    : store.sources.cold.filter((geojson: any) => {
        const id = geojson.properties.id || geojson.properties.parent;
        return newHotIds.indexOf(id) === -1;
      });

  const coldChanged =
    lastColdCount !== store.sources.cold.length || newColdIds.length > 0;
  newHotIds.forEach((id: string) => renderFeature(id, "hot"));
  newColdIds.forEach((id: string) => renderFeature(id, "cold"));

  function renderFeature(id: string, source: "hot" | "cold"): void {
    const feature = store.get(id);
    const featureInternal = feature.internal(mode);
    store.ctx.events.currentModeRender(featureInternal, (geojson: any) => {
      store.sources[source].push(geojson);
    });
  }

  if (coldChanged) {
    store.ctx.map.getSource(Constants.sources.COLD).setData({
      type: Constants.geojsonTypes.FEATURE_COLLECTION,
      features: store.sources.cold
    });
  }

  store.ctx.map.getSource(Constants.sources.HOT).setData({
    type: Constants.geojsonTypes.FEATURE_COLLECTION,
    features: store.sources.hot
  });

  if (store._emitSelectionChange) {
    store.ctx.map.fire(Constants.events.SELECTION_CHANGE, {
      features: store.getSelected().map((feature: any) => feature.toGeoJSON()),
      points: store.getSelectedCoordinates().map((coordinate: { coordinates: number[] }) => ({
        type: Constants.geojsonTypes.FEATURE,
        properties: {},
        geometry: {
          type: Constants.geojsonTypes.POINT,
          coordinates: coordinate.coordinates
        }
      }))
    });
    store._emitSelectionChange = false;
  }

  if (store._deletedFeaturesToEmit.length) {
    const geojsonToEmit = store._deletedFeaturesToEmit.map((feature: any) =>
      feature.toGeoJSON()
    );

    store._deletedFeaturesToEmit = [];

    store.ctx.map.fire(Constants.events.DELETE, {
      features: geojsonToEmit
    });
  }

  cleanup();
  store.ctx.map.fire(Constants.events.RENDER, {});

  function cleanup(): void {
    store.isDirty = false;
    store.clearChangedIds();
  }
}
