// Web has no equivalent — react-native-maps renders as an empty box on web
// (per its own MapView.web.ts), and its Marker/Polyline subcomponents have
// no web implementation at all, crashing on import (`codegenNativeComponent
// is not a function`) rather than degrading gracefully. So this file never
// imports react-native-maps; Metro's .native.tsx/.web.tsx split keeps it
// out of the web bundle entirely. Falls back to a simple normalized SVG
// line preview of the route when there's polyline data, or just a message
// when there isn't (e.g. the tap-to-draw-a-route screen, which needs a real
// map and has nothing useful to show here).
import { forwardRef, useImperativeHandle } from 'react';
import { View } from 'react-native';
import Svg, { Polyline as SvgPolyline } from 'react-native-svg';

import { ThemedText } from './themed-text';
import type { RouteMapHandle, RouteMapProps } from './route-map.types';
import { softSheet } from '@/constants/soft-sheet';

const PREVIEW_SIZE = 280;
const PADDING = 16;

export const RouteMap = forwardRef<RouteMapHandle, RouteMapProps>(function RouteMap({ polylines, accentColor, style }, ref) {
  useImperativeHandle(ref, () => ({
    animateCameraTo: () => {},
    fitToPoints: () => {},
  }));

  const allPoints = (polylines ?? []).flatMap((line) => line.points);

  return (
    <View style={[styles.container, style]}>
      {allPoints.length > 1 ? (
        <Svg width={PREVIEW_SIZE} height={PREVIEW_SIZE} viewBox={`0 0 ${PREVIEW_SIZE} ${PREVIEW_SIZE}`}>
          {(polylines ?? []).map((line, index) => (
            <SvgPolyline
              key={index}
              points={normalizeToSvgPoints(line.points, allPoints)}
              fill="none"
              stroke={line.color}
              strokeWidth={line.width}
              strokeDasharray={line.dashed ? '6,6' : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>
      ) : (
        <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
          Harita tarayıcıda gösterilemiyor — bu özellik telefon uygulamasına özel.
        </ThemedText>
      )}
    </View>
  );
});

// Flips lat/lng into a top-left-origin PREVIEW_SIZE×PREVIEW_SIZE box (lat
// inverted — smaller latitude = further south = lower on screen), scaled to
// the bounding box of every point across all lines so multiple polylines
// (e.g. planned route + actual route) share one consistent frame.
function normalizeToSvgPoints(points: { lat: number; lng: number }[], allPoints: { lat: number; lng: number }[]): string {
  const lats = allPoints.map((p) => p.lat);
  const lngs = allPoints.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latRange = maxLat - minLat || 1;
  const lngRange = maxLng - minLng || 1;
  const usable = PREVIEW_SIZE - PADDING * 2;

  return points
    .map((p) => {
      const x = PADDING + ((p.lng - minLng) / lngRange) * usable;
      const y = PADDING + (1 - (p.lat - minLat) / latRange) * usable;
      return `${x},${y}`;
    })
    .join(' ');
}

const styles = softSheet({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
