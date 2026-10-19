import * as BackgroundTask from 'expo-background-task';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { CoachMessage, IS_PERSONAL, coachFetch, loadCoachConfig } from '@/lib/coach-client';

// Compos Kişisel: koç yazınca telefona bildirim. Ücretsiz Apple ID'de push yok; bunun yerine iOS'un arka plan
// görevi ara ara koç sunucusunu yoklar, yeni mesaj varsa YEREL bildirim gösterir. Sıklığı iOS belirler
// (garanti yok, en az ~15 dk); Telegram zili yedek olarak kalır.

const TASK = 'coach-message-check';
const SEEN_FILE = `${FileSystem.documentDirectory ?? ''}coach-last-seen.txt`;
const enabled = IS_PERSONAL && Platform.OS !== 'web';

async function lastSeen(): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(SEEN_FILE);
    return info.exists ? (await FileSystem.readAsStringAsync(SEEN_FILE)).trim() || null : null;
  } catch {
    return null;
  }
}

/** Kullanıcının gördüğü en son koç mesajı (sohbet ekranı açıkken çağrılır): bunlar için bildirim gelmez. */
export async function markCoachSeen(createdAt: string | undefined) {
  if (!enabled || !createdAt) return;
  const prev = await lastSeen();
  if (!prev || createdAt > prev) await FileSystem.writeAsStringAsync(SEEN_FILE, createdAt);
}

async function checkForNewMessages() {
  const config = await loadCoachConfig();
  if (!config) return;
  const after = await lastSeen();
  const res = await coachFetch<{ messages: CoachMessage[] }>(config, after ? `/messages?after=${encodeURIComponent(after)}` : '/messages');
  const fresh = res.messages.filter((m) => m.role === 'assistant' && (!after || m.created_at > after));
  if (!fresh.length) return;
  const last = fresh[fresh.length - 1];
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Koç',
      body: fresh.length > 1 ? `${fresh.length} yeni mesaj · ${last.content.slice(0, 120)}` : last.content.slice(0, 160),
      data: { url: '/coach' },
    },
    trigger: null,
  });
  await markCoachSeen(last.created_at);
}

if (enabled) {
  TaskManager.defineTask(TASK, async () => {
    try {
      await checkForNewMessages();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

let started = false;

export async function setupCoachNotifications() {
  if (!enabled || started) return;
  started = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  Notifications.addNotificationResponseReceivedListener(() => router.push('/coach' as never));
  const { granted } = await Notifications.requestPermissionsAsync();
  if (!granted) return;
  if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (!(await TaskManager.isTaskRegisteredAsync(TASK))) {
    await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
  }
}
