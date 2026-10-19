import { forwardRef, Fragment, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type MapPressEvent } from 'react-native-maps';

import type { RouteMapHandle, RouteMapProps } from './route-map.types';

export const RouteMap = forwardRef<RouteMapHandle, RouteMapProps>(function RouteMap(
  { initialRegion, showsUserLocation, markers, polylines, accentColor, onMapReady, onPress, style },
  ref
) {
  const mapRef = useRef<MapView>(null);

  useImperativeHandle(ref, () => ({
    animateCameraTo: (point) => mapRef.current?.animateCamera({ center: { latitude: point.lat, longitude: point.lng } }),
    fitToPoints: (points, edgePadding) =>
      mapRef.current?.fitToCoordinates(
        points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
        { edgePadding: edgePadding ?? { top: 80, right: 60, bottom: 80, left: 60 }, animated: false }
      ),
  }));

  const handlePress = onPress ? (event: MapPressEvent) => onPress({ nativeEvent: event.nativeEvent }) : undefined;

  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={style ?? StyleSheet.absoluteFill}
      showsUserLocation={showsUserLocation}
      onMapReady={onMapReady}
      onPress={handlePress}
      initialRegion={initialRegion}>
      {markers?.map((point, index) => (
        <Marker key={index} coordinate={{ latitude: point.lat, longitude: point.lng }} pinColor={accentColor} />
      ))}
      {polylines?.map((line, index) => (
        <Polyline
          key={index}
          coordinates={line.points.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
          strokeColor={line.color}
          strokeWidth={line.width}
          lineDashPattern={line.dashed ? [6, 6] : undefined}
        />
      ))}
      {polylines?.map((line, index) => {
        if (!line.showEndpoints || line.points.length < 2) {
          return null;
        }
        const start = line.points[0];
        const end = line.points[line.points.length - 1];
        return (
          <Fragment key={`endpoints-${index}`}>
            <Marker coordinate={{ latitude: start.lat, longitude: start.lng }} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={[styles.endpointDot, { borderColor: line.color }]} />
            </Marker>
            <Marker coordinate={{ latitude: end.lat, longitude: end.lng }} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={[styles.endpointDot, styles.endpointDotFilled, { backgroundColor: line.color, borderColor: line.color }]} />
            </Marker>
          </Fragment>
        );
      })}
    </MapView>
  );
});

const styles = StyleSheet.create({
  endpointDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'white',
    borderWidth: 2,
  },
  endpointDotFilled: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
