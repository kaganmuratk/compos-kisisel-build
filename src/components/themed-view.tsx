import { Platform, View, type ViewProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { softSheet } from '@/constants/soft-sheet';

// Web content column cap — shared so anything computing pixel widths from
// useWindowDimensions() (charts, the tab bar) can match what screens are
// actually constrained to here, instead of the full (much wider) browser
// window.
export const WEB_CONTENT_MAX_WIDTH = 480;

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemeColor;
};

// Every screen's root wrapper is a ThemedView, and none of them have ever
// been styled for a wide desktop browser window — everything stretches
// edge-to-edge on web. Capping and centering the content column here, in
// this one shared component, fixes every screen at once instead of
// touching each one individually. Native is untouched (same single View as
// before) since phones are already the right width.
export function ThemedView({ style, lightColor, darkColor, type, ...otherProps }: ThemedViewProps) {
  const theme = useTheme();
  // A few intentionally fixed-theme surfaces (the new dark dashboards) pass
  // both overrides to keep their web gutter and native root in sync.
  const backgroundColor = lightColor ?? darkColor ?? theme[type ?? 'background'];

  if (Platform.OS !== 'web') {
    return <View style={[{ backgroundColor }, style]} {...otherProps} />;
  }

  return (
    <View style={[styles.webOuter, { backgroundColor }]}>
      <View style={[styles.webInner, style]} {...otherProps} />
    </View>
  );
}

const styles = softSheet({
  webOuter: {
    flex: 1,
    alignItems: 'center',
  },
  webInner: {
    flex: 1,
    width: '100%',
    maxWidth: WEB_CONTENT_MAX_WIDTH,
  },
});
