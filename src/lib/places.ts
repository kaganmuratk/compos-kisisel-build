export type PlaceSuggestion = { placeId: string; text: string };

export class PlacesError extends Error {}

function apiKey(): string {
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new PlacesError('Google Maps API anahtarı bulunamadı.');
  }
  return key;
}

function placesErrorMessage(status: string): string {
  switch (status) {
    case 'REQUEST_DENIED':
      return "Places API isteği reddedildi — Google Cloud Console'da Places API'nin etkin olduğundan emin ol.";
    case 'OVER_QUERY_LIMIT':
      return 'Günlük/aylık istek kotası aşıldı.';
    default:
      return `Yer araması başarısız (${status}).`;
  }
}

// The legacy Places API (not "Places API (New)" — a separate, similarly
// named service in Google Cloud Console) — used for the manual-run "yer"
// picker so a place can be searched by name instead of tapping a map.
export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const params = new URLSearchParams({ input: trimmed, key: apiKey(), language: 'tr' });

  let response: Response;
  try {
    response = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`);
  } catch {
    throw new PlacesError('Yer aranırken bağlantı hatası oluştu.');
  }

  const data = await response.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new PlacesError(placesErrorMessage(data.status));
  }

  return (data.predictions ?? []).map((p: { place_id: string; description: string }) => ({
    placeId: p.place_id,
    text: p.description,
  }));
}

// Resolves a placeId (from searchPlaces) into coordinates.
export async function getPlaceLocation(placeId: string): Promise<{ lat: number; lng: number }> {
  const params = new URLSearchParams({ place_id: placeId, fields: 'geometry', key: apiKey() });

  let response: Response;
  try {
    response = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`);
  } catch {
    throw new PlacesError('Yer bilgisi alınırken bağlantı hatası oluştu.');
  }

  const data = await response.json();
  if (data.status !== 'OK') {
    throw new PlacesError(placesErrorMessage(data.status));
  }

  const location = data.result.geometry.location;
  return { lat: location.lat, lng: location.lng };
}
