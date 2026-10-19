export type LatLng = { lat: number; lng: number };

export class DirectionsError extends Error {}

// Google's encoded polyline algorithm, decoded by hand (no extra package —
// this is the only piece of the Directions API response we need to parse).
function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

function directionsErrorMessage(status: string): string {
  switch (status) {
    case 'ZERO_RESULTS':
      return 'Bu noktalar arasında yürüyüş rotası bulunamadı.';
    case 'REQUEST_DENIED':
      return "Directions API isteği reddedildi — Google Cloud Console'da Directions API'nin etkin olduğundan emin ol.";
    case 'OVER_QUERY_LIMIT':
      return 'Günlük/aylık istek kotası aşıldı.';
    default:
      return `Rota alınamadı (${status}).`;
  }
}

// Walking route through the given waypoints (first = origin, last =
// destination, anything between = via-points), following real streets —
// not a straight line between the raw taps.
export async function fetchWalkingRoute(waypoints: LatLng[]): Promise<{ points: LatLng[]; distanceMeters: number }> {
  if (waypoints.length < 2) {
    throw new DirectionsError('Rota için en az 2 nokta gerekiyor.');
  }

  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new DirectionsError('Google Maps API anahtarı bulunamadı.');
  }

  const origin = waypoints[0];
  const destination = waypoints[waypoints.length - 1];
  const middle = waypoints.slice(1, -1);

  const params = new URLSearchParams({
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    mode: 'walking',
    key: apiKey,
  });
  if (middle.length > 0) {
    params.set('waypoints', middle.map((p) => `${p.lat},${p.lng}`).join('|'));
  }

  let response: Response;
  try {
    response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
  } catch {
    throw new DirectionsError('Rota alınırken bağlantı hatası oluştu. İnternet bağlantını kontrol et.');
  }

  const data = await response.json();
  if (data.status !== 'OK') {
    throw new DirectionsError(directionsErrorMessage(data.status));
  }

  const route = data.routes[0];
  const distanceMeters = route.legs.reduce((sum: number, leg: { distance: { value: number } }) => sum + leg.distance.value, 0);
  const points = decodePolyline(route.overview_polyline.points);

  return { points, distanceMeters };
}
