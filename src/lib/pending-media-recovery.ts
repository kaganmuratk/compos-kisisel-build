import type { QueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';

import { db } from '@/db/client';
import { workoutSessionMedia } from '@/db/schema';
import { PENDING_PICK_KEY, persistPickedAsset, type PendingPickContext } from '@/lib/media';

// Pairs with the marker pickMedia() writes before launching the picker —
// see the comment on PENDING_PICK_KEY in media.ts for why this exists at
// all. Called from _layout.tsx both on app start AND every time the app
// returns to the foreground: when Android recreates the activity mid-pick,
// the JS process usually SURVIVES (the app never "restarts"), so a
// cold-start-only check would never fire in exactly the scenario this
// exists for.
let recoveryInFlight = false;

export async function recoverPendingMediaPick(queryClient: QueryClient, userId: string) {
  if (recoveryInFlight) {
    return;
  }
  recoveryInFlight = true;
  try {
    const raw = await SecureStore.getItemAsync(PENDING_PICK_KEY);
    if (!raw) {
      return;
    }
    // A healthy in-flight pick also has the marker set while the gallery is
    // open — but in that case nothing was persisted natively, so
    // getPendingResultAsync() returns null below and this is a no-op that
    // leaves the marker for pickMedia() itself to clear on resolve. Only
    // delete the marker once we know there's an actual orphaned result.
    const result = await ImagePicker.getPendingResultAsync();
    if (!result || 'code' in result || (result as { canceled?: boolean }).canceled) {
      return;
    }
    const assets = (result as { assets?: { uri: string; type?: string }[] }).assets;
    if (!assets?.[0]) {
      return;
    }
    await SecureStore.deleteItemAsync(PENDING_PICK_KEY);

    let context: PendingPickContext;
    try {
      context = JSON.parse(raw);
    } catch {
      return;
    }

    const asset = assets[0];
    const uri = await persistPickedAsset(asset.uri);
    const type = asset.type === 'video' ? 'video' : 'image';

    if (context.kind === 'sessionMedia') {
      await db.insert(workoutSessionMedia).values({ userId, workoutSessionId: context.sessionId, uri, type });
      queryClient.invalidateQueries({ queryKey: ['sessions', context.sessionId, 'media'] });
    }
  } catch {
    // Best-effort recovery — never let it crash startup/foregrounding.
  } finally {
    recoveryInFlight = false;
  }
}
