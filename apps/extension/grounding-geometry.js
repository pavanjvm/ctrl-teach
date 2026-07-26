(function initTarsGroundingGeometry(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TarsGroundingGeometry = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTarsGroundingGeometry() {
  "use strict";

  function screenshotToViewportPoint({
    x,
    y,
    screenshotWidth,
    screenshotHeight,
    viewportWidth,
    viewportHeight,
  }) {
    if (![x, y, screenshotWidth, screenshotHeight, viewportWidth, viewportHeight].every(Number.isFinite)) {
      return null;
    }
    if (screenshotWidth <= 0 || screenshotHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
      return null;
    }
    return {
      x: Math.max(0, Math.min(viewportWidth, (x / screenshotWidth) * viewportWidth)),
      y: Math.max(0, Math.min(viewportHeight, (y / screenshotHeight) * viewportHeight)),
    };
  }

  function framePointToParentViewport({
    x,
    y,
    childViewportWidth,
    childViewportHeight,
    frameLeft,
    frameTop,
    frameWidth,
    frameHeight,
    frameOffsetWidth,
    frameOffsetHeight,
    frameClientLeft = 0,
    frameClientTop = 0,
    frameClientWidth,
    frameClientHeight,
  }) {
    const required = [
      x,
      y,
      childViewportWidth,
      childViewportHeight,
      frameLeft,
      frameTop,
      frameWidth,
      frameHeight,
    ];
    if (!required.every(Number.isFinite)) return null;
    if (
      childViewportWidth <= 0
      || childViewportHeight <= 0
      || frameWidth <= 0
      || frameHeight <= 0
    ) return null;

    const safeOffsetWidth = Number.isFinite(frameOffsetWidth) && frameOffsetWidth > 0
      ? frameOffsetWidth
      : frameWidth;
    const safeOffsetHeight = Number.isFinite(frameOffsetHeight) && frameOffsetHeight > 0
      ? frameOffsetHeight
      : frameHeight;
    const scaleX = frameWidth / safeOffsetWidth;
    const scaleY = frameHeight / safeOffsetHeight;
    const safeClientWidth = Number.isFinite(frameClientWidth) && frameClientWidth > 0
      ? frameClientWidth
      : safeOffsetWidth;
    const safeClientHeight = Number.isFinite(frameClientHeight) && frameClientHeight > 0
      ? frameClientHeight
      : safeOffsetHeight;
    const contentLeft = frameLeft + Math.max(0, frameClientLeft) * scaleX;
    const contentTop = frameTop + Math.max(0, frameClientTop) * scaleY;
    const contentWidth = safeClientWidth * scaleX;
    const contentHeight = safeClientHeight * scaleY;

    return {
      x: contentLeft + (Math.max(0, Math.min(childViewportWidth, x)) / childViewportWidth) * contentWidth,
      y: contentTop + (Math.max(0, Math.min(childViewportHeight, y)) / childViewportHeight) * contentHeight,
    };
  }

  function shouldCropFocusRegion(region) {
    const kind = String(region?.kind || "").toLowerCase();
    return Boolean(region?.rect) && kind !== "img" && kind !== "image";
  }

  function scaleCtrlGesture(gesture, scaleX, scaleY) {
    if (!gesture || !Number.isFinite(scaleX) || !Number.isFinite(scaleY)) return null;
    const scaled = { ...gesture };
    if (Number.isFinite(gesture.x)) scaled.x = gesture.x * scaleX;
    if (Number.isFinite(gesture.y)) scaled.y = gesture.y * scaleY;
    if (Number.isFinite(gesture.end_x)) scaled.end_x = gesture.end_x * scaleX;
    if (Number.isFinite(gesture.end_y)) scaled.end_y = gesture.end_y * scaleY;
    if (gesture.nearestElement?.rect) {
      const rect = gesture.nearestElement.rect;
      scaled.nearestElement = {
        ...gesture.nearestElement,
        rect: {
          x: rect.x * scaleX,
          y: rect.y * scaleY,
          width: rect.width * scaleX,
          height: rect.height * scaleY,
        },
      };
    }
    return scaled;
  }

  function classifyCtrlGesture(points) {
    const usablePoints = Array.isArray(points)
      ? points.filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
      : [];
    if (!usablePoints.length) return null;

    const xs = usablePoints.map((point) => point.x);
    const ys = usablePoints.map((point) => point.y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    const width = right - left;
    const height = bottom - top;
    const pathLength = usablePoints.slice(1).reduce((total, point, index) => {
      const previous = usablePoints[index];
      return total + Math.hypot(point.x - previous.x, point.y - previous.y);
    }, 0);
    const start = usablePoints[0];
    const end = usablePoints[usablePoints.length - 1];
    const startEnd = Math.hypot(end.x - start.x, end.y - start.y);
    let gesture = {
      type: "point",
      x: end.x,
      y: end.y,
      label: "pointed region",
    };
    let referencePoint = { x: end.x, y: end.y };

    if (pathLength >= 30 && width >= Math.max(60, height * 2.4)) {
      const leftPoint = start.x <= end.x ? start : end;
      const rightPoint = start.x <= end.x ? end : start;
      gesture = {
        type: "underline",
        x: leftPoint.x,
        y: leftPoint.y,
        end_x: rightPoint.x,
        end_y: rightPoint.y,
        label: "underlined region",
      };
      referencePoint = { x: (left + right) / 2, y: (top + bottom) / 2 };
    } else if (
      pathLength >= 80
      && width >= 28
      && height >= 28
      && startEnd <= Math.max(36, Math.min(width, height) * .55)
    ) {
      gesture = {
        type: "circle",
        x: left,
        y: top,
        end_x: right,
        end_y: bottom,
        label: "circled region",
      };
      referencePoint = { x: (left + right) / 2, y: (top + bottom) / 2 };
    } else if (width >= 28 || height >= 28) {
      gesture = {
        type: "region",
        x: left,
        y: top,
        end_x: right,
        end_y: bottom,
        label: "selected region",
      };
      referencePoint = { x: (left + right) / 2, y: (top + bottom) / 2 };
    }

    return { gesture, referencePoint };
  }

  return {
    framePointToParentViewport,
    screenshotToViewportPoint,
    shouldCropFocusRegion,
    scaleCtrlGesture,
    classifyCtrlGesture,
  };
});
