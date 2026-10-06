// mock:./ui/PremiumMotionSurface
var PremiumMotionButton = "button";

// mock:../utils/premiumMotion
var premiumMotion = (x) => x;

// mock:../utils/featureGuidance
var reportFeatureAction = () => {
};

// mock:lucide-react
var ChevronDown = () => null;

// mock:react
var useState = (x) => [typeof x === "function" ? x() : x, () => {
}];
var useRef = (x) => ({ current: x });
var useEffect = () => {
};
var useLayoutEffect = () => {
};

// mock:react-dom
var createPortal = (x) => x;

// mock:framer-motion
var useMotionValue = (x) => ({ get: () => x, set: (v) => {
  x = v;
} });
var useIsPresent = () => true;
var useReducedMotion = () => true;
var animate = () => {
};

// mock:../utils/motionPresets
var iosDragRelease = {};

// src/utils/musicDockClearance.ts
function musicDockClearX(desiredX, panelWidth, boundaryLeft = 0) {
  const drawer = document.querySelector(
    ".app-shell--music-page:not(.app-shell--music-dock-closed) .music-widget-drawer"
  );
  if (!drawer) return desiredX;
  return Math.min(desiredX, drawer.getBoundingClientRect().left - boundaryLeft - panelWidth - 12);
}

// src/utils/floatingWidgetLayout.ts
var EDGE_INSET = 12;
var POSITION_STORAGE_PREFIX = "sessionmirror:widget-pos:";
var PERSISTENT_POSITION_STORAGE_PREFIX = "sessionmirror:persistent-widget-pos:";
var WIDGET_CONTROL_LAYOUT_EVENT = "besttake:widget-controls-layout";
function findAvailableWidgetPanelPosition(boundsWidth, boundsHeight, widgetWidth, widgetHeight, desired, occupied, protectedControls = []) {
  const gap = 12;
  const start = clampWidgetPosition(boundsWidth, boundsHeight, widgetWidth, widgetHeight, desired.x, desired.y);
  const maxX = Math.max(gap, boundsWidth - widgetWidth - gap);
  const maxY = Math.max(gap, boundsHeight - widgetHeight - gap);
  const obstacles = [...occupied, ...protectedControls];
  const xs = [start.x, gap, maxX, ...obstacles.flatMap((rect) => [rect.x - widgetWidth - gap, rect.x + rect.width + gap])];
  const ys = [start.y, gap, maxY, ...obstacles.flatMap((rect) => [rect.y - widgetHeight - gap, rect.y + rect.height + gap])];
  const candidates = xs.flatMap((x) => ys.map((y) => clampWidgetPosition(
    boundsWidth,
    boundsHeight,
    widgetWidth,
    widgetHeight,
    x,
    y
  )));
  const overlap = (position, rect) => Math.max(0, Math.min(position.x + widgetWidth + gap, rect.x + rect.width + gap) - Math.max(position.x, rect.x)) * Math.max(0, Math.min(position.y + widgetHeight + gap, rect.y + rect.height + gap) - Math.max(position.y, rect.y));
  candidates.sort((a, b) => {
    const score = (position) => protectedControls.reduce((area, rect) => area + overlap(position, rect), 0) * 1e6 + occupied.reduce((area, rect) => area + overlap(position, rect), 0) * 1e3 + (position.x - start.x) ** 2 + (position.y - start.y) ** 2;
    return score(a) - score(b);
  });
  return candidates[0] ?? start;
}
function clampWidgetPosition(boundsWidth, boundsHeight, widgetWidth, widgetHeight, x, y) {
  const maxX = Math.max(EDGE_INSET, boundsWidth - widgetWidth - EDGE_INSET);
  const maxY = Math.max(EDGE_INSET, boundsHeight - widgetHeight - EDGE_INSET);
  return {
    x: Math.max(EDGE_INSET, Math.min(maxX, x)),
    y: Math.max(EDGE_INSET, Math.min(maxY, y))
  };
}
function saveWidgetPosition(id, x, y) {
  try {
    localStorage.setItem(
      `${POSITION_STORAGE_PREFIX}${id}`,
      JSON.stringify({ x: Math.round(x), y: Math.round(y) })
    );
  } catch {
  }
}
function loadPersistentWidgetPosition(id) {
  try {
    const raw = localStorage.getItem(`${PERSISTENT_POSITION_STORAGE_PREFIX}${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.userPlaced) return null;
    if (typeof window !== "undefined" && (Math.abs((parsed.viewportWidth ?? 0) - window.innerWidth) > 80 || Math.abs((parsed.viewportHeight ?? 0) - window.innerHeight) > 200)) return null;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}
function savePersistentWidgetPosition(id, x, y) {
  try {
    localStorage.setItem(
      `${PERSISTENT_POSITION_STORAGE_PREFIX}${id}`,
      JSON.stringify({ x: Math.round(x), y: Math.round(y), userPlaced: true, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight })
    );
  } catch {
  }
}
function findAvailableWidgetBallPosition(width, height, desired, occupied) {
  const size = 56;
  const gap = 12;
  const start = clampWidgetPosition(width, height, size, size, desired.x, desired.y);
  const free = (p) => occupied.every((other) => Math.abs(p.x - other.x) >= size + gap || Math.abs(p.y - other.y) >= size + gap);
  if (free(start)) return start;
  const candidates = [];
  const maxX = Math.max(12, width - size - 12);
  const maxY = Math.max(12, height - size - 12);
  const xs = [start.x, 12, maxX];
  const ys = [start.y, 12, maxY];
  for (let x = maxX; x >= 12; x -= size + gap) xs.push(x);
  for (let y = maxY; y >= 12; y -= size + gap) ys.push(y);
  for (const x of xs) for (const y of ys) candidates.push({ x, y });
  candidates.sort((a, b) => Math.hypot(a.x - start.x, a.y - start.y) - Math.hypot(b.x - start.x, b.y - start.y));
  return candidates.find(free) ?? start;
}

// mock:./useMusicDockItem
var useMusicDockItem = () => ({});

// src/components/useCollapsibleWidget.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var BALL_SIZE = 56;
var ballPlacements = /* @__PURE__ */ new Map();
var panelPlacements = /* @__PURE__ */ new Map();
function useCollapsibleWidget({
  boundaryRef,
  widgetRef,
  x,
  y,
  positionId,
  label,
  icon,
  detail,
  active = false,
  resetKey,
  expandRequest = false,
  onExpandRequestConsumed,
  onRestore,
  ballSlot = 0,
  visible = true,
  dockRight = false,
  showBall = true
}) {
  const [collapsed, setCollapsed] = useState(() => !expandRequest);
  const [portalHost, setPortalHost] = useState(null);
  const present = useIsPresent();
  useLayoutEffect(() => {
    const findHost = () => setPortalHost(
      dockRight && (boundaryRef.current?.clientWidth ?? window.innerWidth) >= 700 ? document.getElementById("music-widget-dock") ?? boundaryRef.current : boundaryRef.current
    );
    findHost();
    const observer = new ResizeObserver(findHost);
    if (boundaryRef.current) observer.observe(boundaryRef.current);
    window.addEventListener("resize", findHost);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", findHost);
    };
  }, [boundaryRef, dockRight]);
  const ballRef = useRef(null);
  const placementId = useRef(Symbol(positionId));
  const ballX = useMotionValue(0);
  const ballY = useMotionValue(0);
  const dragged = useRef(false);
  const ballGesture = useRef(null);
  const transferFocus = useRef(false);
  const reducedMotion = useReducedMotion();
  const previousPlacement = useRef({ resetKey, positionId, ballSlot, boundaryRef });
  const previousExpandRequest = useRef(expandRequest);
  const expandRequestConsumed = useRef(false);
  const useRightDock = () => dockRight && (boundaryRef.current?.clientWidth ?? window.innerWidth) >= 700;
  const docked = portalHost?.id === "music-widget-dock";
  const ballStorageId = () => `${positionId}-ball${useRightDock() ? "-music" : ""}`;
  useLayoutEffect(() => {
    if (!transferFocus.current) return;
    transferFocus.current = false;
    if (collapsed) ballRef.current?.focus({ preventScroll: true });
    else widgetRef.current?.querySelector(".widget-collapse")?.focus({ preventScroll: true });
  }, [collapsed, widgetRef]);
  const clampBall = (nextX, nextY, avoidOverlap = true) => {
    const bounds = boundaryRef.current;
    const origin = bounds?.getBoundingClientRect();
    const occupied = [...ballPlacements.entries()].filter(([id]) => id !== placementId.current).map(([, entry]) => {
      const other = entry.boundary.current?.getBoundingClientRect();
      return {
        x: entry.x.get() + (other?.left ?? 0) - (origin?.left ?? 0),
        y: entry.y.get() + (other?.top ?? 0) - (origin?.top ?? 0)
      };
    });
    const next = findAvailableWidgetBallPosition(
      bounds?.clientWidth ?? window.innerWidth,
      bounds?.clientHeight ?? window.innerHeight,
      { x: nextX, y: nextY },
      avoidOverlap ? occupied : []
    );
    if (visible && present && !docked && showBall) ballPlacements.set(placementId.current, { boundary: boundaryRef, x: ballX, y: ballY });
    ballX.set(next.x);
    ballY.set(next.y);
  };
  const placeExpandedPanel = (desired) => {
    const bounds = boundaryRef.current;
    const widget = widgetRef.current;
    if (!bounds || !widget) return desired;
    const origin = bounds.getBoundingClientRect();
    const scaleX = origin.width / Math.max(1, bounds.clientWidth);
    const scaleY = origin.height / Math.max(1, bounds.clientHeight);
    const localRect = (rect) => ({
      x: (rect.left - origin.left) / scaleX,
      y: (rect.top - origin.top) / scaleY,
      width: rect.width / scaleX,
      height: rect.height / scaleY
    });
    const occupied = [...panelPlacements.entries()].filter(([id]) => id !== placementId.current).flatMap(([, entry]) => {
      const otherBounds = entry.boundary.current;
      const otherWidget = entry.widget.current;
      if (!otherBounds || !otherWidget) return [];
      const otherRect = otherBounds.getBoundingClientRect();
      const otherScaleX = otherRect.width / Math.max(1, otherBounds.clientWidth);
      const otherScaleY = otherRect.height / Math.max(1, otherBounds.clientHeight);
      return [{
        x: (otherRect.left + entry.x.get() * otherScaleX - origin.left) / scaleX,
        y: (otherRect.top + entry.y.get() * otherScaleY - origin.top) / scaleY,
        width: otherWidget.offsetWidth * otherScaleX / scaleX,
        height: otherWidget.offsetHeight * otherScaleY / scaleY
      }];
    });
    const protectedControls = [];
    for (const selector of ["#music-workspace-tools", ".practice-chart-topbar"]) {
      const protectedControl = bounds.querySelector(selector);
      if (protectedControl && protectedControl.getClientRects().length) {
        protectedControls.push(localRect(protectedControl.getBoundingClientRect()));
      }
    }
    return findAvailableWidgetPanelPosition(
      bounds.clientWidth,
      bounds.clientHeight,
      widget.offsetWidth,
      widget.offsetHeight,
      desired,
      occupied,
      protectedControls
    );
  };
  useLayoutEffect(() => {
    const prior = previousPlacement.current;
    const shouldReset = prior.resetKey !== resetKey || prior.positionId !== positionId || prior.ballSlot !== ballSlot || prior.boundaryRef !== boundaryRef;
    previousPlacement.current = { resetKey, positionId, ballSlot, boundaryRef };
    const bounds = boundaryRef.current;
    const saved = useRightDock() ? null : loadPersistentWidgetPosition(ballStorageId());
    clampBall(
      saved?.x ?? (bounds?.clientWidth ?? window.innerWidth) - BALL_SIZE - 12,
      saved?.y ?? (useRightDock() ? 160 : Math.min(220, (bounds?.clientHeight ?? window.innerHeight) * 0.3)) + ballSlot * 68
    );
    if (shouldReset) setCollapsed(true);
  }, [resetKey, positionId, ballSlot, boundaryRef, dockRight]);
  useLayoutEffect(() => {
    if (!expandRequest) {
      previousExpandRequest.current = false;
      return;
    }
    if (previousExpandRequest.current) return;
    previousExpandRequest.current = true;
    setCollapsed(false);
  }, [expandRequest]);
  useEffect(() => {
    if (!expandRequest) {
      expandRequestConsumed.current = false;
      return;
    }
    if (expandRequestConsumed.current) return;
    expandRequestConsumed.current = true;
    onExpandRequestConsumed?.();
  }, [expandRequest, onExpandRequestConsumed]);
  useLayoutEffect(() => {
    const id = placementId.current;
    if (collapsed && visible && present && portalHost && !docked && showBall) clampBall(ballX.get(), ballY.get());
    else ballPlacements.delete(id);
    return () => {
      ballPlacements.delete(id);
    };
  }, [collapsed, visible, present, portalHost, docked, showBall]);
  useLayoutEffect(() => {
    const id = placementId.current;
    const reposition = () => {
      if (!widgetRef.current || !boundaryRef.current) return;
      const next = placeExpandedPanel({ x: x.get(), y: y.get() });
      x.set(next.x);
      y.set(next.y);
      panelPlacements.set(id, { boundary: boundaryRef, widget: widgetRef, x, y });
      saveWidgetPosition(positionId, next.x, next.y);
      onRestore?.(next);
    };
    if (!collapsed && visible && present && widgetRef.current && boundaryRef.current) {
      reposition();
      window.addEventListener(WIDGET_CONTROL_LAYOUT_EVENT, reposition);
    } else panelPlacements.delete(id);
    return () => {
      window.removeEventListener(WIDGET_CONTROL_LAYOUT_EVENT, reposition);
      panelPlacements.delete(id);
    };
  }, [collapsed, visible, present, portalHost, boundaryRef, positionId]);
  const rememberBall = () => savePersistentWidgetPosition(ballStorageId(), ballX.get(), ballY.get());
  const settleBall = () => {
    const width = boundaryRef.current?.clientWidth ?? window.innerWidth;
    const fromX = ballX.get();
    const fromY = ballY.get();
    const edgeX = useRightDock() ? width - BALL_SIZE - 12 : fromX + BALL_SIZE / 2 < width / 2 ? 12 : width - BALL_SIZE - 12;
    clampBall(edgeX, fromY);
    const toX = ballX.get();
    const toY = ballY.get();
    rememberBall();
    if (reducedMotion) return;
    ballX.set(fromX);
    ballY.set(fromY);
    void animate(ballX, toX, iosDragRelease);
    void animate(ballY, toY, iosDragRelease);
  };
  useLayoutEffect(() => {
    if (!collapsed || docked || !showBall) return;
    let previousWidth = boundaryRef.current?.clientWidth;
    const resize = () => {
      if (ballGesture.current) return;
      const width = boundaryRef.current?.clientWidth;
      const rotated = width !== void 0 && previousWidth !== void 0 && Math.abs(width - previousWidth) > 8;
      previousWidth = width;
      clampBall(rotated && useRightDock() ? width - BALL_SIZE - 12 : ballX.get(), ballY.get());
    };
    const observer = new ResizeObserver(resize);
    if (boundaryRef.current) observer.observe(boundaryRef.current);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [collapsed, docked, showBall, boundaryRef, ballX, ballY]);
  const startBallDrag = (event) => {
    if (event.button !== 0 || ballGesture.current) return;
    event.stopPropagation();
    dragged.current = false;
    ballGesture.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: ballX.get(),
      y: ballY.get()
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveBall = (event) => {
    const gesture = ballGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.clientX;
    const dy = event.clientY - gesture.clientY;
    if (!dragged.current && Math.hypot(dx, dy) < 6) return;
    dragged.current = true;
    event.preventDefault();
    const bounds = boundaryRef.current;
    const rect = bounds?.getBoundingClientRect();
    const scaleX = bounds?.clientWidth && rect?.width ? rect.width / bounds.clientWidth : 1;
    const scaleY = bounds?.clientHeight && rect?.height ? rect.height / bounds.clientHeight : 1;
    clampBall(gesture.x + dx / scaleX, gesture.y + dy / scaleY, false);
  };
  const endBallDrag = (event, cancel = false) => {
    const gesture = ballGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!cancel) moveBall(event);
    ballGesture.current = null;
    if (cancel) {
      clampBall(gesture.x, gesture.y, false);
      dragged.current = true;
    } else if (dragged.current) settleBall();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const collapse = () => {
    const widget = widgetRef.current;
    if (!widget) return;
    if (!docked && showBall) {
      const width = boundaryRef.current?.clientWidth ?? window.innerWidth;
      const cornerX = x.get() + widget.offsetWidth - BALL_SIZE;
      clampBall(useRightDock() ? width - BALL_SIZE - 12 : cornerX + BALL_SIZE / 2 < width / 2 ? 12 : width - BALL_SIZE - 12, y.get());
      rememberBall();
    }
    transferFocus.current = widget.contains(document.activeElement);
    dragged.current = false;
    setCollapsed(true);
  };
  const expand = (point) => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    const bounds = boundaryRef.current;
    const widget = widgetRef.current;
    if (!bounds || !widget) return;
    const ballRect = docked ? ballRef.current?.getBoundingClientRect() : null;
    const boundsRect = bounds.getBoundingClientRect();
    const fromX = point ? point.x - boundsRect.left - widget.offsetWidth / 2 : ballRect ? ballRect.left - boundsRect.left - widget.offsetWidth - 12 : ballX.get() + BALL_SIZE - widget.offsetWidth;
    const fromY = point ? point.y - boundsRect.top - 28 : ballRect ? ballRect.top - boundsRect.top : ballY.get();
    const next = placeExpandedPanel({ x: docked ? musicDockClearX(fromX, widget.offsetWidth, boundsRect.left) : fromX, y: fromY });
    x.set(next.x);
    y.set(next.y);
    saveWidgetPosition(positionId, next.x, next.y);
    onRestore?.(next);
    transferFocus.current = document.activeElement === ballRef.current;
    ballPlacements.delete(placementId.current);
    reportFeatureAction("widget-expanded");
    setCollapsed(false);
  };
  const dockItem = useMusicDockItem(positionId, expand);
  const ball = collapsed && visible && present && showBall ? /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsxs(
    PremiumMotionButton,
    {
      ref: ballRef,
      type: "button",
      className: `widget-ball pointer-events-auto${docked ? " widget-ball--docked" : ""}`,
      "aria-label": `Expand ${label}${detail ? `, ${detail}` : ""}`,
      "aria-expanded": false,
      title: docked ? `Open ${label}; drag left to place, or up/down to reorder` : `Open ${label}`,
      "data-active": active,
      "data-music-dock-id": docked ? positionId : void 0,
      style: { x: ballX, y: ballY, order: docked ? dockItem.order : ballSlot, translate: docked ? dockItem.translate : void 0 },
      onPointerDown: docked ? dockItem.pointerDown : startBallDrag,
      onPointerMove: docked ? dockItem.pointerMove : moveBall,
      onPointerUp: docked ? (event) => dockItem.pointerEnd(event) : (event) => endBallDrag(event),
      onPointerCancel: docked ? (event) => dockItem.pointerEnd(event, true) : (event) => endBallDrag(event, true),
      onLostPointerCapture: docked ? (event) => dockItem.pointerEnd(event, true) : (event) => endBallDrag(event, true),
      onClick: docked ? dockItem.click : () => expand(),
      onKeyDown: (event) => {
        if (docked) {
          dockItem.keyDown(event);
          return;
        }
        const delta = {
          ArrowLeft: [-12, 0],
          ArrowRight: [12, 0],
          ArrowUp: [0, -12],
          ArrowDown: [0, 12]
        };
        const move = delta[event.key];
        if (move) {
          event.preventDefault();
          clampBall(ballX.get() + move[0], ballY.get() + move[1], false);
          rememberBall();
        } else if (event.key === "Enter" || event.key === " ") dragged.current = false;
      },
      initial: { opacity: 0, scale: reducedMotion ? 1 : 0.75 },
      animate: { opacity: 1, scale: 1 },
      transition: premiumMotion({ duration: reducedMotion ? 0 : 0.18 }, "widget"),
      children: [
        icon,
        /* @__PURE__ */ jsx("span", { children: detail ?? label }),
        /* @__PURE__ */ jsx(ChevronDown, { className: "widget-ball__expand", "aria-hidden": true }),
        /* @__PURE__ */ jsx("i", { "aria-hidden": true })
      ]
    }
  ) }) : null;
  return {
    collapsed,
    collapse,
    ball: ball && portalHost ? createPortal(ball, portalHost) : ball,
    panelAnimation: { opacity: collapsed ? 0 : 1, scale: collapsed && !reducedMotion ? 0.94 : 1 }
  };
}
export {
  useCollapsibleWidget
};
