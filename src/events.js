const throttle = require("lodash.throttle");

const setupModeHandler = require("./lib/mode_handler");
const getFeaturesAndSetCursor = require("./lib/get_features_and_set_cursor");
const CursorManager = require("./lib/cursor");
const featuresAt = require("./lib/features_at");
const isClick = require("./lib/is_click");
const isTap = require("./lib/is_tap");
const Constants = require("./constants");
const objectToMode = require("./modes/object_to_mode");

module.exports = function (ctx) {
  const modes = Object.keys(ctx.options.modes).reduce((m, k) => {
    m[k] = objectToMode(ctx.options.modes[k]);
    return m;
  }, {});
  const CM = new CursorManager(ctx);
  let mouseDownInfo = {};
  let touchStartInfo = {};
  const events = {};
  let currentModeName = null;
  let currentMode = null;

  events.drag = function (event, isDrag) {
    if (ctx.api.getMode() === Constants.modes.STATIC) return;
    if (
      isDrag({
        point: event.point,
        time: new Date().getTime(),
      })
    ) {
      CM.setCursor(event, "drag");
      // ctx.ui.queueMapClasses({ mouse: Constants.cursors.DRAG });
      currentMode.drag(event);
    } else {
      event.originalEvent.stopPropagation();
    }
  };

  events.mousedrag = function (event) {
    if (ctx.api.getMode() === Constants.modes.STATIC) return;
    events.drag(event, endInfo => !isClick(mouseDownInfo, endInfo));
  };

  events.touchdrag = function (event) {
    if (ctx.api.getMode() === Constants.modes.STATIC) return;
    events.drag(event, endInfo => !isTap(touchStartInfo, endInfo));
  };

  events.mousemove = function (event) {
    if (ctx.api.getMode() === Constants.modes.STATIC) return;

    const button =
      event.originalEvent.buttons !== undefined ? event.originalEvent.buttons : event.originalEvent.which;

    if (button === 1) {
      return events.mousedrag(event);
    }


    const target = CM.setCursor(event, "mousemove");
    event.featureTarget = target;
    currentMode.mousemove(event);
  };

  events.mousedown = function (event) {
    if (ctx.api.getMode() === Constants.modes.STATIC) return;

    mouseDownInfo = {
      time: new Date().getTime(),
      point: event.point,
    };
    const target = CM.setCursor(event, "mousedown");

    event.featureTarget = target;
    currentMode.mousedown(event);
  };

  events.mouseup = function (event) {
    if (ctx.api.getMode() === Constants.modes.STATIC) return;

    const target = CM.setCursor(event, "mouseup");
    event.featureTarget = target;

    if (
      isClick(mouseDownInfo, {
        point: event.point,
        time: new Date().getTime(),
      })
    ) {
      if (!Constants.groupSelectModes.includes(currentModeName)) {
        currentMode.click(event);
      }
    } else {
      // Sometimes after entering a group select mode, if the user clicks while moving the mouse,
      // a drag event will be fired, even though the mouse is not being held down. This causes
      // event.featureTarget to be undefined and the draw mode to revert to normal polygon mode -
      // so instead, we revert it to static here.
      if (event.featureTarget !== undefined) {
        currentMode.mouseup(event);
      } else if (Constants.groupSelectModes.includes(currentModeName)) {
        changeMode(Constants.modes.STATIC);
      }
    }
  };

  events.mouseout = function (event) {
    if (ctx.api.getMode() === Constants.modes.STATIC) return;
    currentMode.mouseout(event);
  };

  events.touchstart = function (event) {
    if (ctx.api.getMode() === Constants.modes.STATIC) return;
    // Prevent emulated mouse events because we will fully handle the touch here.
    // This does not stop the touch events from propogating to mapbox though.
    event.originalEvent.preventDefault();
    if (!ctx.options.touchEnabled) {
      return;
    }

    touchStartInfo = {
      time: new Date().getTime(),
      point: event.point,
    };
    const target = featuresAt.touch(event, null, ctx)[0];
    event.featureTarget = target;
    currentMode.touchstart(event);
  };

  events.touchmove = function (event) {
    if (ctx.api.getMode() === Constants.modes.STATIC) return;
    event.originalEvent.preventDefault();
    if (!ctx.options.touchEnabled) {
      return;
    }

    currentMode.touchmove(event);
    return events.touchdrag(event);
  };

  events.touchend = function (event) {
    if (ctx.api.getMode() === Constants.modes.STATIC) return;
    event.originalEvent.preventDefault();
    if (!ctx.options.touchEnabled) {
      return;
    }

    const target = featuresAt.touch(event, null, ctx)[0];
    event.featureTarget = target;
    if (
      isTap(touchStartInfo, {
        time: new Date().getTime(),
        point: event.point,
      })
    ) {
      currentMode.tap(event);
    } else {
      currentMode.touchend(event);
    }
  };

  // 8 - Backspace
  // 46 - Delete
  const isKeyModeValid = (code) =>
    !(code === 8 || code === 46 || (code >= 48 && code <= 57));

  events.keydown = function (event) {
    if ((event.srcElement || event.target).classList[0] !== "mapboxgl-canvas")
      return; // we only handle events on the map

    if (
      (event.keyCode === 8 || event.keyCode === 46) &&
      ctx.options.controls.trash
    ) {
      event.preventDefault();
      currentMode.trash();
    } else if (isKeyModeValid(event.keyCode)) {
      currentMode.keydown(event);
    } else if (event.keyCode === 49 && ctx.options.controls.point) {
      changeMode(Constants.modes.DRAW_POINT);
    } else if (event.keyCode === 50 && ctx.options.controls.line_string) {
      changeMode(Constants.modes.DRAW_LINE_STRING);
    } else if (event.keyCode === 51 && ctx.options.controls.polygon) {
      changeMode(Constants.modes.DRAW_POLYGON);
    }
  };

  events.keyup = function (event) {
    if (isKeyModeValid(event.keyCode)) {
      currentMode.keyup(event);
    }
  };

  events.zoomend = function () {
    ctx.store.changeZoom();
  };

  events.data = function (event) {
    if (event.dataType === "style") {
      const { setup, map, options, store } = ctx;
      const hasLayers = options.styles.some((style) => map.getLayer(style.id));
      if (!hasLayers) {
        setup.addLayers();
        store.setDirty();
        store.render();
      }
    }
  };

  function changeMode(modename, nextModeOptions, eventOptions = {}) {
    // if a group select draw mode is active, the cursor should always be shown as a crosshair.
    if (Constants.groupSelectModes.includes(modename)) {
      CM.overrideGetCursorTypeLogic(() => Constants.cursors.ADD);
    }
    // Reset cursor if a group select draw mode is being exited.
    if (Constants.groupSelectModes.includes(currentModeName)) {
      CM.overrideGetCursorTypeLogic();
    }

    currentMode.stop();

    const modebuilder = modes[modename];
    if (modebuilder === undefined) {
      throw new Error(`${modename} is not valid`);
    }
    currentModeName = modename;
    const mode = modebuilder(ctx, nextModeOptions);
    currentMode = setupModeHandler(mode, ctx);

    ctx.map.fire(Constants.events.MODE_CHANGE, { mode: modename });

    ctx.store.setDirty();
    ctx.store.render();
  }

  const actionState = {
    trash: false,
    combineFeatures: false,
    uncombineFeatures: false,
  };

  function actionable(actions) {
    let changed = false;
    Object.keys(actions).forEach((action) => {
      if (actionState[action] === undefined)
        throw new Error("Invalid action type");
      if (actionState[action] !== actions[action]) changed = true;
      actionState[action] = actions[action];
    });
    if (changed)
      ctx.map.fire(Constants.events.ACTIONABLE, { actions: actionState });
  }

  const api = {
    start() {
      currentModeName = ctx.options.defaultMode;
      currentMode = setupModeHandler(modes[currentModeName](ctx), ctx);
    },
    changeMode,
    actionable,
    currentModeName() {
      return currentModeName;
    },
    currentModeRender(geojson, push) {
      return currentMode.render(geojson, push);
    },
    fire(name, event) {
      if (events[name]) {
        events[name](event);
      }
    },
    addEventListeners() {
      ctx.map.on("mousemove", throttle(events.mousemove, 40));
      ctx.map.on("mousedown", events.mousedown);
      ctx.map.on("mouseup", events.mouseup);
      ctx.map.on("data", events.data);

      ctx.map.on("touchmove", throttle(events.touchmove), 40);
      ctx.map.on("touchstart", events.touchstart);
      ctx.map.on("touchend", events.touchend);

      ctx.container.addEventListener("mouseout", events.mouseout);

      if (ctx.options.keybindings) {
        ctx.container.addEventListener("keydown", events.keydown);
        ctx.container.addEventListener("keyup", events.keyup);
      }
    },
    removeEventListeners() {
      ctx.map.off("mousemove", events.mousemove);
      ctx.map.off("mousedown", events.mousedown);
      ctx.map.off("mouseup", events.mouseup);
      ctx.map.off("data", events.data);

      ctx.map.off("touchmove", events.touchmove);
      ctx.map.off("touchstart", events.touchstart);
      ctx.map.off("touchend", events.touchend);

      ctx.container.removeEventListener("mouseout", events.mouseout);

      if (ctx.options.keybindings) {
        ctx.container.removeEventListener("keydown", events.keydown);
        ctx.container.removeEventListener("keyup", events.keyup);
      }
    },
    trash(options) {
      currentMode.trash(options);
    },
    combineFeatures() {
      currentMode.combineFeatures();
    },
    uncombineFeatures() {
      currentMode.uncombineFeatures();
    },
    getMode() {
      return currentModeName;
    },
  };

  return api;
};
