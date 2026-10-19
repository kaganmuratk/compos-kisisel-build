import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
// The revealed action is nested in RNGH's ReanimatedSwipeable. Use RNGH's
// Pressable too: on Android, a plain React Native Pressable can lose the
// touch to the translated row underneath and trigger that row's navigation.
import { Pressable } from 'react-native-gesture-handler';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Svg, { Line, Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

// Swipe-left-to-reveal-delete for a list row. Reuses the same
// Alert.alert(title, message, [cancel, destructive]) confirmation shape
// already used everywhere else in the app — the swipe only reveals the
// button, it never deletes on its own.
export function SwipeableRow({
  children,
  onDelete,
  confirmTitle,
  confirmMessage,
}: {
  children: ReactNode;
  onDelete: () => void;
  confirmTitle: string;
  confirmMessage: string;
}) {
  const theme = useTheme();
  const ref = useRef<SwipeableMethods>(null);
  const containerRef = useRef<View>(null);

  // On web, releasing the mouse right after a swipe fires a native "click"
  // on whatever now sits under the cursor — since the row's own content
  // just slid left under a held-down mouse, that's usually the row itself,
  // so letting go of a swipe silently re-triggered the row's own tap (e.g.
  // opening the workout you meant to delete). There's no swipe-vs-click
  // ambiguity on native touch (the gesture responder system already owns
  // it), but this guard is harmless there too. `locked` disables the row's
  // own content for a brief window around the drag so that stray click
  // never reaches it; the delete button itself lives outside this layer
  // (in renderRightActions) so it's never affected.
  const [locked, setLocked] = useState(false);
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The `locked`/`open` state above drives childrenContainerStyle's
  // pointerEvents:'none', but that only takes effect once React commits the
  // re-render — and the browser fires the native "click" for a mouseup
  // synchronously, before that commit lands. A swipe-then-release can still
  // slip through as a genuine click on the row underneath. `blockClicks` is
  // a plain ref (no render involved) checked by a capturing 'click'
  // listener, so it can swallow that click the instant the drag starts —
  // no timing gap.
  const blockClicks = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleClickCapture = (event: MouseEvent) => {
      if (!blockClicks.current) return;
      const node = containerRef.current as unknown as HTMLElement | null;
      if (node && event.target instanceof Node && node.contains(event.target)) {
        event.stopPropagation();
        event.preventDefault();
      }
    };
    window.addEventListener('click', handleClickCapture, true);
    return () => window.removeEventListener('click', handleClickCapture, true);
  }, []);

  const lock = () => {
    if (unlockTimer.current) clearTimeout(unlockTimer.current);
    blockClicks.current = true;
    setLocked(true);
  };
  const scheduleUnlock = () => {
    if (unlockTimer.current) clearTimeout(unlockTimer.current);
    unlockTimer.current = setTimeout(() => {
      blockClicks.current = false;
      setLocked(false);
    }, 300);
  };

  // The 300ms window above only covers the drag itself — it doesn't cover a
  // user swiping open, then, as a SEPARATE later click, tapping the now-
  // revealed delete button. On web that click has been seen landing on the
  // row's own content instead of the button sitting on top of it, making
  // the delete button unreachable (the row's tap handler fires and
  // navigates away instead). Keeping content non-interactive for the whole
  // time the row is open — not just around the drag — closes that gap.
  const [open, setOpen] = useState(false);

  const confirmDelete = () => {
    // Alert.alert() is a no-op on react-native-web (no dialog, no
    // callback) — same reason as nutrition/log/[id].tsx's confirmDelete,
    // falls back to window.confirm there.
    if (Platform.OS === 'web') {
      if (window.confirm(`${confirmTitle}\n\n${confirmMessage}`)) {
        onDelete();
      } else {
        ref.current?.close();
      }
      return;
    }
    Alert.alert(confirmTitle, confirmMessage, [
      { text: 'Cancel', style: 'cancel', onPress: () => ref.current?.close() },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <Swipeable
      ref={ref}
      renderRightActions={() => (
        <Pressable
          accessibilityLabel="Delete"
          onPress={confirmDelete}
          style={[styles.action, { backgroundColor: theme.destructive }]}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            <Line x1={9} y1={4} x2={15} y2={4} stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" />
          </Svg>
        </Pressable>
      )}
      overshootRight={false}
      rightThreshold={40}
      friction={2}
      onSwipeableOpenStartDrag={lock}
      onSwipeableCloseStartDrag={lock}
      onSwipeableWillOpen={scheduleUnlock}
      onSwipeableWillClose={scheduleUnlock}
      onSwipeableOpen={() => {
        blockClicks.current = true;
        setOpen(true);
      }}
      onSwipeableClose={() => {
        blockClicks.current = false;
        setOpen(false);
      }}
      childrenContainerStyle={locked || open ? styles.locked : undefined}>
      <View ref={containerRef}>{children}</View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  action: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locked: {
    pointerEvents: 'none',
  },
});
