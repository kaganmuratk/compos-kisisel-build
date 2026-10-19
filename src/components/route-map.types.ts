// Shared, react-native-maps-free prop shape for the native/web RouteMap
// split (route-map.native.tsx / route-map.web.tsx) — kept in its own file
// so route-map.web.tsx never has any import, even a type-only one, that
// could pull react-native-maps into the web bundle (it crashes there, see
// route-map.web.tsx's own comment).
export type LatLngPoint = { lat: number; lng: number };

export type RouteMapPolyline = {
  points: LatLngPoint[];
  color: string;
  width: number;
  dashed?: boolean;
  // Small circular dots at the first/last point of this line — a plain
  // line reads as "route not really captured" (looks identical to a
  // straight guess between two taps), and the default react-native-maps
  // pin is an oversized, unrelated-looking teardrop for what's really
  // just "here's where it started/ended."
  showEndpoints?: boolean;
};

export type RouteMapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type RouteMapPressEvent = {
  nativeEvent: { coordinate: { latitude: number; longitude: number } };
};

export type RouteMapHandle = {
  animateCameraTo: (point: LatLngPoint) => void;
  fitToPoints: (points: LatLngPoint[], edgePadding?: { top: number; right: number; bottom: number; left: number }) => void;
};

export type RouteMapProps = {
  initialRegion: RouteMapRegion;
  showsUserLocation?: boolean;
  markers?: LatLngPoint[];
  polylines?: RouteMapPolyline[];
  accentColor: string;
  onMapReady?: () => void;
  onPress?: (event: RouteMapPressEvent) => void;
  style?: object;
};
