import type { ReactElement, ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { KeyboardToolbar } from 'react-native-keyboard-controller';

import { useNutritionPalette } from '@/components/nutrition-ui';
import { useT } from '@/lib/i18n';

// A "TAMAM" bar riding on top of the keyboard whenever any input is focused —
// the one reliable way out of the keyboard. Before this, closing it meant
// tapping some empty spot on the screen, and on busy screens (or the
// decimal pad, which has no return key on iOS) there often wasn't one
// (2026-10-23).
//
// The root layout renders one for every screen. Anything drawn in its own
// native window sits above that one and needs its own copy, rendered as the
// last child of its root view:
// - `placement="modal"`: inside a react-native <Modal> (own window on both
//   platforms).
// - `placement="iosModalScreen"`: a route presented as 'modal' /
//   'fullScreenModal' — its own view controller on iOS only; on Android it's
//   drawn in the same window, where the root bar already covers it.
// KeyboardToolbar's own height (42) plus breathing room: what a
// KeyboardAwareScrollView must keep clear above the keyboard so the focused
// input's last line isn't hidden behind this bar.
export const KEYBOARD_BAR_CLEARANCE = 42 + 16;

export function KeyboardDoneBar({ placement = 'root' }: { placement?: 'root' | 'modal' | 'iosModalScreen' }) {
  const { t } = useT();
  const palette = useNutritionPalette();
  if (Platform.OS === 'web') return null;
  if (placement === 'iosModalScreen' && Platform.OS !== 'ios') return null;
  const theme = { primary: palette.blue, disabled: palette.muted, background: palette.card, ripple: palette.border };
  return <KeyboardToolbar showArrows={false} doneText={t('done').toUpperCase()} theme={{ light: theme, dark: theme }} />;
}

// `screenLayout` for a Stack: gives every screen it presents as a modal its
// own bar (see `iosModalScreen` above), so a new modal route is covered
// without remembering to add one by hand.
export function modalScreenLayout({ children, options }: { children: ReactNode; options: { presentation?: string } }): ReactElement {
  if (Platform.OS !== 'ios' || (options.presentation !== 'modal' && options.presentation !== 'fullScreenModal')) return <>{children}</>;
  return (
    <View style={styles.fill}>
      {children}
      <KeyboardDoneBar placement="iosModalScreen" />
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
