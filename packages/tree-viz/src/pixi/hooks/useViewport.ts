import { useCallback, useRef, useState } from "react";
import type { Viewport, Bounds } from "../../core/data/types";

export interface UseViewportOptions {
  initialScale?: number;
  minScale?: number;
  maxScale?: number;
}

export function useViewport(options: UseViewportOptions = {}) {
  const { initialScale = 1, minScale = 0.05, maxScale = 2 } = options;

  const [viewport, setViewport] = useState<Viewport>({
    x: 0,
    y: 0,
    scale: initialScale,
  });

  const isDragging = useRef(false);
  const lastPosition = useRef({ x: 0, y: 0 });

  const pan = useCallback((dx: number, dy: number) => {
    setViewport((prev) => ({
      ...prev,
      x: prev.x - dx / prev.scale,
      y: prev.y - dy / prev.scale,
    }));
  }, []);

  const zoomAt = useCallback(
    (delta: number, centerX: number, centerY: number) => {
      setViewport((prev) => {
        const factor = delta > 0 ? 0.9 : 1.1;
        const newScale = Math.max(minScale, Math.min(maxScale, prev.scale * factor));

        // Zoom towards cursor position
        const worldX = prev.x + centerX / prev.scale;
        const worldY = prev.y + centerY / prev.scale;

        return {
          x: worldX - centerX / newScale,
          y: worldY - centerY / newScale,
          scale: newScale,
        };
      });
    },
    [minScale, maxScale],
  );

  const fitToBounds = useCallback(
    (bounds: Bounds, containerWidth: number, containerHeight: number, padding = 50) => {
      const width = bounds.maxX - bounds.minX + padding * 2;
      const height = bounds.maxY - bounds.minY + padding * 2;

      if (width === 0 || height === 0) return;

      // Calculate scale to fit
      const scaleX = containerWidth / width;
      const scaleY = containerHeight / height;
      const scale = Math.max(minScale, Math.min(scaleX, scaleY, maxScale));

      // Center the content
      const contentCenterX = bounds.minX + (bounds.maxX - bounds.minX) / 2;
      const contentCenterY = bounds.minY + (bounds.maxY - bounds.minY) / 2;

      setViewport({
        x: contentCenterX - containerWidth / scale / 2,
        y: contentCenterY - containerHeight / scale / 2,
        scale,
      });
    },
    [minScale, maxScale],
  );

  const centerOn = useCallback(
    (x: number, y: number, containerWidth: number, containerHeight: number) => {
      setViewport((prev) => ({
        ...prev,
        x: x - containerWidth / prev.scale / 2,
        y: y - containerHeight / prev.scale / 2,
      }));
    },
    [],
  );

  // Get visible bounds in world coordinates
  const getVisibleBounds = useCallback(
    (containerWidth: number, containerHeight: number): Bounds => {
      return {
        minX: viewport.x,
        minY: viewport.y,
        maxX: viewport.x + containerWidth / viewport.scale,
        maxY: viewport.y + containerHeight / viewport.scale,
      };
    },
    [viewport],
  );

  // Screen to world coordinate conversion
  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => {
      return {
        x: viewport.x + screenX / viewport.scale,
        y: viewport.y + screenY / viewport.scale,
      };
    },
    [viewport],
  );

  // World to screen coordinate conversion
  const worldToScreen = useCallback(
    (worldX: number, worldY: number) => {
      return {
        x: (worldX - viewport.x) * viewport.scale,
        y: (worldY - viewport.y) * viewport.scale,
      };
    },
    [viewport],
  );

  // Event handlers for pan/zoom
  const handlers = {
    onWheel: useCallback(
      (e: React.WheelEvent) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          zoomAt(e.deltaY, e.nativeEvent.offsetX, e.nativeEvent.offsetY);
        } else {
          pan(e.deltaX, e.deltaY);
        }
      },
      [pan, zoomAt],
    ),

    onPointerDown: useCallback((e: React.PointerEvent) => {
      if (e.button === 0) {
        // Left mouse button
        isDragging.current = true;
        lastPosition.current = { x: e.clientX, y: e.clientY };
      }
    }, []),

    onPointerMove: useCallback(
      (e: React.PointerEvent) => {
        if (!isDragging.current) return;

        const dx = e.clientX - lastPosition.current.x;
        const dy = e.clientY - lastPosition.current.y;
        lastPosition.current = { x: e.clientX, y: e.clientY };

        pan(dx, dy);
      },
      [pan],
    ),

    onPointerUp: useCallback(() => {
      isDragging.current = false;
    }, []),

    onPointerLeave: useCallback(() => {
      isDragging.current = false;
    }, []),
  };

  return {
    viewport,
    setViewport,
    pan,
    zoomAt,
    fitToBounds,
    centerOn,
    getVisibleBounds,
    screenToWorld,
    worldToScreen,
    isDragging: isDragging.current,
    handlers,
  };
}
