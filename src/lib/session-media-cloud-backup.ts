import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const BUCKET = 'session-media';

function extensionFor(uri: string, type: 'image' | 'video') {
  const extension = uri.split('.').pop()?.split(/[?#]/)[0]?.toLowerCase();
  return extension || (type === 'video' ? 'mp4' : 'jpg');
}

function contentTypeFor(extension: string, type: 'image' | 'video') {
  const types: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };
  return types[extension] ?? (type === 'video' ? 'video/mp4' : 'image/jpeg');
}

// Called after the local PowerSync write succeeds. A failed upload is
// deliberately non-blocking: the local file and its workout record remain
// usable, while a later re-add can try the cloud path again.
export async function uploadSessionMediaToCloud({ userId, mediaId, uri, type }: { userId: string; mediaId: string; uri: string; type: 'image' | 'video' }) {
  const extension = extensionFor(uri, type);
  const body = Platform.OS === 'web' ? await (await fetch(uri)).arrayBuffer() : await new File(uri).arrayBuffer();
  const path = `${userId}/${mediaId}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: contentTypeFor(extension, type), upsert: false });
  if (error) throw error;
  return path;
}

// Mirrors uploadSessionMediaToCloud: best-effort, never blocks the local
// delete that always happens regardless of whether a cloud copy exists.
export async function deleteSessionMediaFromCloud(paths: string[]) {
  if (paths.length === 0) return;
  await supabase.storage.from(BUCKET).remove(paths).catch(() => undefined);
}
