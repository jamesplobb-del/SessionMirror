// src/components/MusicWidgetDrawer.tsx
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { jsx, jsxs } from "react/jsx-runtime";
function MusicWidgetDrawer({ open, onOpenChange }) {
  const gesture = useRef(null);
  const ignoreClick = useRef(false);
  const start = (event) => {
    if (event.button !== 0 || event.currentTarget.id === "music-widget-dock" && event.target !== event.currentTarget) return;
    gesture.current = { pointerId: event.pointerId, x: event.clientX };
    ignoreClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const end = (event) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const dx = event.clientX - current.x;
    if (Math.abs(dx) < 36) return;
    ignoreClick.current = true;
    onOpenChange(dx < 0);
  };
  return /* @__PURE__ */ jsxs("div", { className: `music-widget-drawer${open ? "" : " music-widget-drawer--closed"}`, children: [
    /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        className: "music-widget-drawer__handle",
        "aria-label": open ? "Hide music tools" : "Show music tools",
        "aria-expanded": open,
        "aria-controls": "music-widget-dock",
        title: open ? "Hide music tools" : "Show music tools",
        onPointerDown: start,
        onPointerUp: end,
        onPointerCancel: () => {
          gesture.current = null;
        },
        onLostPointerCapture: () => {
          gesture.current = null;
        },
        onClick: (event) => {
          if (ignoreClick.current && event.detail !== 0) {
            ignoreClick.current = false;
            return;
          }
          onOpenChange(!open);
        },
        children: open ? /* @__PURE__ */ jsx(ChevronRight, { "aria-hidden": true }) : /* @__PURE__ */ jsx(ChevronLeft, { "aria-hidden": true })
      }
    ),
    /* @__PURE__ */ jsx(
      "div",
      {
        id: "music-widget-dock",
        className: "music-widget-dock",
        role: "toolbar",
        "aria-label": "Music tools",
        onPointerDown: start,
        onPointerUp: end,
        onPointerCancel: () => {
          gesture.current = null;
        },
        onLostPointerCapture: () => {
          gesture.current = null;
        }
      }
    )
  ] });
}
export {
  MusicWidgetDrawer as default
};
