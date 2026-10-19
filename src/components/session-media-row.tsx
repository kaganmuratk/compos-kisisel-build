import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text } from 'react-native';
// ScrollView from react-native-gesture-handler, not plain react-native: both
// screens that render this row also use RNGH-based gestures (SwipeableRow's
// swipe-to-delete, and DraggableFlatList's pan on the live workout screen).
// A plain RN ScrollView nested inside that gesture tree lost the touch
// responder entirely — its "+" thumb never fired onPress at all, which read
// as the button doing nothing. RNGH's own ScrollView participates in the
// same gesture arena instead of conflicting with it.
import { ScrollView } from 'react-native-gesture-handler';

import { FullscreenImageViewer } from '@/components/fullscreen-image-viewer';
import { Radius, Spacing } from '@/constants/theme';
import { useAddSessionMedia, useRemoveSessionMedia, useSessionMedia } from '@/db/queries/workout';
import { useTheme } from '@/hooks/use-theme';
import { alertMessage } from '@/lib/alert';
import { pickMedia } from '@/lib/media';

// Small horizontal strip for whole-session attachments (separate from
// per-set media) — tap a thumbnail to view it fullscreen, "+" to add,
// long-press a thumbnail to remove.
export function SessionMediaRow({ sessionId }: { sessionId: string }) {
  const theme = useTheme();
  const { data: media = [] } = useSessionMedia(sessionId);
  const addMedia = useAddSessionMedia(sessionId);
  const removeMedia = useRemoveSessionMedia(sessionId);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set());

  const handleAdd = async () => {
    try {
      // Passing sessionId lets a pick survive Android killing the app's
      // activity mid-pick (see lib/pending-media-recovery.ts) — without it,
      // that scenario silently loses the photo with no error, which is what
      // "I select a photo and it never comes back" turned out to be.
      const picked = await pickMedia({ kind: 'sessionMedia', sessionId });
      if (picked) {
        // mutateAsync + await, not fire-and-forget mutate() — a mutationFn
        // failure (e.g. NOT_AUTHENTICATED when the auth session is
        // momentarily stale) needs to reach the catch below instead of
        // being swallowed silently by react-query.
        await addMedia.mutateAsync(picked);
      }
    } catch (error) {
      alertMessage('Could not add media', error instanceof Error ? error.message : String(error));
    }
  };

  const confirmRemove = (id: string) => {
    // Alert.alert() is a no-op on react-native-web — see nutrition/log/[id].tsx.
    if (Platform.OS === 'web') {
      if (window.confirm('Remove media\n\nThis image or video will be removed from the workout.')) {
        removeMedia.mutate(id);
      }
      return;
    }
    Alert.alert('Remove media', 'This image or video will be removed from the workout.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeMedia.mutate(id) },
    ]);
  };

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.row}>
        {media.map((item) => (
          <Pressable
            key={item.id}
            accessibilityLabel="Workout media"
            android_ripple={{ color: theme.border }}
            onPress={() => item.type === 'image' && setViewerUri(item.uri)}
            onLongPress={() => confirmRemove(item.id)}
            style={({ pressed }) => [
              styles.thumb,
              { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.6 : 1 },
            ]}>
            {item.type === 'video' ? (
              <Text style={[styles.mediaCode, { color: theme.textSecondary }]}>VID</Text>
            ) : brokenIds.has(item.id) ? (
              // Dosya kalıcı depolamaya kopyalanamamış veya sonradan
              // silinmiş olabilir — sessizce boş kalmak yerine görünür bir
              // ikon göster, "eklendi ama görünmüyor" belirsizliğini bitirir.
              <Text style={[styles.mediaCode, { color: theme.textSecondary }]}>!</Text>
            ) : (
              <Image
                source={{ uri: item.uri }}
                style={styles.thumbImage}
                onError={() => setBrokenIds((prev) => new Set(prev).add(item.id))}
              />
            )}
          </Pressable>
        ))}
        <Pressable
          accessibilityLabel="Add an image or video to workout"
          android_ripple={{ color: theme.border }}
          onPress={handleAdd}
          style={({ pressed }) => [
            styles.thumb,
            styles.addThumb,
            { borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
          ]}>
          <Text style={[styles.mediaCode, { color: theme.textSecondary }]}>MEDIA</Text>
        </Pressable>
      </ScrollView>
      <FullscreenImageViewer uri={viewerUri} onClose={() => setViewerUri(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  // Without this, the horizontal ScrollView has no explicit size and
  // stretches to fill the leftover vertical space in its flex-column
  // parent — its 48px-tall thumbnail content ends up sitting inside a much
  // taller transparent box, which read as a large blank/dark gap below it.
  scroll: {
    flexGrow: 0,
  },
  row: {
    gap: Spacing.two,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  addThumb: {
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  mediaCode: { fontSize: 8, letterSpacing: 0.4 },
});
