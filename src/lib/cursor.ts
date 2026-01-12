import featuresAt from "./features_at";
import Constants from "../constants";

const cursors = Constants.cursors;

const defaultCursorSelector = ({ overFeatures }) => {
  return overFeatures ? cursors.POINTER : cursors.GRAB;
};

class CursorManager {
  ctx: any;
  snapped: boolean;
  mode: null;
  cursor: string;
  setGetCursorTypeLogic: any;
  overrideGetCursorTypeLogic: any;
  overridedGetCursorType: any;
  getCursorType: any;

  constructor(ctx) {
    this.ctx = ctx;
    this.snapped = false;
    this.mode = null;
    this.cursor = '';
    ctx.setGetCursorTypeLogic = this.setGetCursorTypeLogic;
    this.init();
  }

  init() {
    this.ctx.map.on("draw.snapped", ({ snapped }) => {
      this.snapped = snapped;
    });
    this.ctx.api.overrideGetCursorTypeLogic = this.overrideGetCursorTypeLogic;
  }

  setCursor(event, eventType) {
    const glDrawFeats = featuresAt.click(event, null, this.ctx);
    const allFeatures = featuresAt
      .any(event, null, this.ctx)
      .filter((l) => !l.layer.id.includes("snap"));

    let cursorType;
    if (this.overridedGetCursorType) {
      cursorType = this.overridedGetCursorType({
        snapped: this.snapped,
        isOverSelected: Boolean(glDrawFeats[0]),
        overFeatures: allFeatures.length > 0 ? allFeatures : null,
      });
    } else {
      if (eventType === "drag") {
        cursorType = cursors.GRABBING;
      } else if (this.getCursorType) {
        cursorType = this.getCursorType({
          snapped: this.snapped,
          isOverSelected: Boolean(glDrawFeats[0]),
          overFeatures: allFeatures.length > 0 ? allFeatures : null,
        });
      } else {
        cursorType = defaultCursorSelector({
          overFeatures: allFeatures.length > 0,
        });
      }
    }

    if (cursorType) {
      this.ctx.ui.queueMapClasses({ mouse: cursorType });
      this.ctx.ui.updateMapClasses();
    } else {
      this.ctx.ui.queueMapClasses({ mouse: cursors.NONE });
      this.ctx.ui.updateMapClasses();
    }
    return glDrawFeats[0];
  }
}
CursorManager.prototype.overrideGetCursorTypeLogic = function (fn) {
  if (fn) {
    CursorManager.prototype.overridedGetCursorType = fn;
  } else {
    CursorManager.prototype.overridedGetCursorType = null;
  }
};

CursorManager.prototype.setGetCursorTypeLogic = function (fn) {
  if (fn) {
    CursorManager.prototype.getCursorType = fn;
  } else {
    CursorManager.prototype.getCursorType = null;
  }
};

export default CursorManager;
