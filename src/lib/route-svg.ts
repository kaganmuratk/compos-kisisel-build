import type { Coordinate } from '@/lib/geo';

export type ProjectedPoint = { x: number; y: number };

// Projects lat/lng onto a flat local plane (equirectangular — fine at
// run/city scale) and fits it into a width×height box with padding,
// preserving aspect ratio so the route silhouette isn't stretched.
export function projectRoute(
  points: Coordinate[],
  { width, height, padding }: { width: number; height: number; padding: number }
): ProjectedPoint[] {
  if (points.length === 0) {
    return [];
  }

  const origin = points[0];
  const cosLat0 = Math.cos((origin.lat * Math.PI) / 180);
  const flat = points.map((p) => ({
    x: (p.lng - origin.lng) * cosLat0,
    y: -(p.lat - origin.lat), // latitude increases north; SVG y increases downward
  }));

  const xs = flat.map((p) => p.x);
  const ys = flat.map((p) => p.y);
  const spanX = Math.max(...xs) - Math.min(...xs) || 1e-9;
  const spanY = Math.max(...ys) - Math.min(...ys) || 1e-9;
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);

  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;
  const scale = Math.min(availableWidth / spanX, availableHeight / spanY);

  const offsetX = padding + (availableWidth - spanX * scale) / 2;
  const offsetY = padding + (availableHeight - spanY * scale) / 2;

  return flat.map((p) => ({
    x: offsetX + (p.x - minX) * scale,
    y: offsetY + (p.y - minY) * scale,
  }));
}
