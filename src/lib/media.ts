import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';

export type MediaAttachment = { uri: string; type: 'image' | 'video' };

// Android sometimes kills the app's activity while the system gallery picker
// is open (low memory, or "Don't keep activities") — the in-flight
// launchImageLibraryAsync() promise is lost forever when that happens, with
// no error, which read as "I pick a photo and it never comes back, then the
// button stops responding at all." expo-image-picker's own docs name this
// exact scenario and provide getPendingResultAsync() to recover the result
// on the next launch — but recovering it usefully requires knowing what the
// pick was FOR, which that call alone doesn't carry. PENDING_PICK_KEY is a
// small marker written just before the picker launches (see pickMedia) and
// read back by recoverPendingMediaPick() on the next app start.
export const PENDING_PICK_KEY = 'compos_pending_media_pick';

export type PendingPickContext = { kind: 'sessionMedia'; sessionId: string };

const MEDIA_DIR = `${FileSystem.documentDirectory}media/`;

// expo-image-picker's result `uri` lives in the app's cache directory, which
// the OS is free to clear at any time (this is documented behavior, not a
// bug in that library) — copying it here into the document directory is
// what makes a picked photo/video still be there next time the user opens
// this screen, instead of the DB row surviving with a dead file behind it.
export async function persistPickedAsset(uri: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
  const extension = uri.split('.').pop()?.split(/[?#]/)[0] || 'jpg';
  const destination = `${MEDIA_DIR}${Crypto.randomUUID()}.${extension}`;
  await FileSystem.copyAsync({ from: uri, to: destination });
  // copyAsync resolving isn't proof the file is actually there and
  // non-empty — verify explicitly instead of trusting a silent success,
  // so a bad copy fails loudly here instead of surfacing later as an
  // unexplained "added it but can't see it."
  const info = await FileSystem.getInfoAsync(destination);
  if (!info.exists || info.size === 0) {
    throw new Error(`Dosya kalıcı depolamaya kopyalanamadı (kaynak: ${uri}).`);
  }
  return destination;
}

// Shared picker for set/session attachments — same permission+launch pattern
// already used for the exercise reference photo, just widened to also allow
// video. No in-app video playback yet (that needs expo-video, a new native
// module); videos are stored and shown as a placeholder until that ships.
//
// pendingContext is optional: pass it when the caller can identify what the
// pick is for (currently just session media) so a killed-activity pick can
// be recovered on next launch by recoverPendingMediaPick(). Without it, a
// killed activity still loses the pick — same as before this fix, just not
// upgraded to recoverable.
export async function pickMedia(pendingContext?: PendingPickContext): Promise<MediaAttachment | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    // Used to silently return null here — with no dialog and no in-app
    // feedback, a denied/blocked permission (including Android silently
    // returning granted:false with no re-prompt after a prior "don't ask
    // again") read as the + button simply doing nothing at all. Throwing
    // routes this through the callers' existing try/catch → Alert instead.
    throw new Error(
      permission.canAskAgain
        ? 'Galeri izni verilmedi.'
        : 'Galeri izni reddedilmiş. Telefon Ayarları → Uygulamalar → Compos → İzinler üzerinden açman gerekiyor.'
    );
  }
  if (pendingContext) {
    await SecureStore.setItemAsync(PENDING_PICK_KEY, JSON.stringify(pendingContext));
  }
  // legacy: true (Android-only flag) bypasses Google's newer system Photo
  // Picker — a separate cross-process component that is unreliable on
  // MIUI/Xiaomi devices: it opens and cancels fine, but the result handoff
  // after actually SELECTING a photo can silently never arrive, wedging the
  // picker until a full app restart. The legacy intent is handled by the
  // device's own gallery app instead, which doesn't have this problem.
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    quality: 0.6,
    legacy: true,
  });
  // Reaching this line means the activity survived and the promise actually
  // resolved — nothing to recover, clear the marker so a later unrelated
  // launch doesn't misread it as a still-pending pick.
  if (pendingContext) {
    await SecureStore.deleteItemAsync(PENDING_PICK_KEY);
  }
  if (result.canceled || !result.assets[0]) {
    return null;
  }
  const asset = result.assets[0];
  const uri = await persistPickedAsset(asset.uri);
  return { uri, type: asset.type === 'video' ? 'video' : 'image' };
}
