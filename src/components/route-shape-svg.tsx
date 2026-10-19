import Svg, { Polyline } from 'react-native-svg';

export type ShapePoint = { x: number; y: number };

// Renders a route LINE's shape (traced from a screenshot, see
// routeShapePoints's comment in schema.ts — not real GPS) as a bare SVG
// polyline, no background/map imagery — same accent-line look as a real
// GPS route's SVG projection (run-share-card.tsx), just skipping the
// lat/lng projection step since these points are already 0-100 relative.
export function RouteShapeSvg({
  points,
  width,
  height,
  padding = 12,
  color,
  strokeWidth = 5,
}: {
  points: ShapePoint[];
  width: number;
  height: number;
  padding?: number;
  color: string;
  strokeWidth?: number;
}) {
  if (points.length < 2) {
    return null;
  }
  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;
  const scaled = points.map((p) => ({
    x: padding + (p.x / 100) * availableWidth,
    y: padding + (p.y / 100) * availableHeight,
  }));
  const pathPoints = scaled.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <Svg width={width} height={height}>
      <Polyline points={pathPoints} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
