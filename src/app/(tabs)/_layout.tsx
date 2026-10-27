import { Tabs } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ColorValue, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { WEB_CONTENT_MAX_WIDTH } from '@/components/themed-view';
import { Fonts, MAX_FONT_SCALE } from '@/constants/theme';
import { useNutritionPalette } from '@/components/nutrition-ui';
import { powerSyncDb } from '@/db/powersync';
import { IS_PERSONAL } from '@/lib/coach-client';
import { useT } from '@/lib/i18n';
import { softSheet } from '@/constants/soft-sheet';

const createTabBarStyle = (palette: ReturnType<typeof useNutritionPalette>) => ({
  backgroundColor: palette.background,
  borderTopColor: palette.border,
  borderTopWidth: StyleSheet.hairlineWidth,
  height: Platform.select({ ios: 84, default: 72 }),
  paddingTop: 7,
  paddingBottom: Platform.select({ ios: 20, default: 7 }),
  ...(Platform.OS === 'web' && {
    alignSelf: 'center' as const,
    width: '100%' as const,
    maxWidth: WEB_CONTENT_MAX_WIDTH,
  }),
});

type TabIconName = 'today' | 'coach' | 'nutrition' | 'history' | 'insights' | 'settings';

// These small stroke icons deliberately use SVG rather than an icon font.
// Android PWA browsers can render an icon-font glyph as a tofu rectangle
// before (or when failing) its font download; SVG has no font dependency.
function TabIcon({ name, color }: { name: TabIconName; color: ColorValue }) {
  const stroke = color;
  const common = { stroke, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      {name === 'today' && <><Rect x={3} y={5} width={18} height={16} rx={2} {...common} /><Line x1={3} y1={9} x2={21} y2={9} {...common} /><Line x1={8} y1={3} x2={8} y2={7} {...common} /><Line x1={16} y1={3} x2={16} y2={7} {...common} /></>}
      {name === 'coach' && <><Path d="M4 5h16v11H9l-5 4V5z" {...common} /><Line x1={8} y1={9.5} x2={16} y2={9.5} {...common} /><Line x1={8} y1={12.5} x2={13} y2={12.5} {...common} /></>}
      {name === 'nutrition' && <><Path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M16 3v18M16 3c3 1 4 4 4 7h-4" {...common} /></>}
      {name === 'history' && <><Circle cx={12} cy={12} r={9} {...common} /><Path d="M12 7v5l3 2" {...common} /></>}
      {name === 'insights' && <><Line x1={5} y1={19} x2={5} y2={11} {...common} /><Line x1={12} y1={19} x2={12} y2={5} {...common} /><Line x1={19} y1={19} x2={19} y2={8} {...common} /></>}
      {name === 'settings' && <><Circle cx={12} cy={12} r={3} {...common} /><Path d="M12 3v2M12 19v2M21 12h-2M5 12H3M18.4 5.6 17 7M7 17l-1.4 1.4M18.4 18.4 17 17M7 7 5.6 5.6" {...common} /></>}
    </Svg>
  );
}

export default function TabsLayout() {
  const { t } = useT();
  const palette = useNutritionPalette();
  const tabBarStyle = useMemo(() => createTabBarStyle(palette), [palette]);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [settingsWarningCount, setSettingsWarningCount] = useState(0);

  useEffect(() => {
    const refresh = () => {
      const offline = Platform.OS === 'web' && !navigator.onLine;
      if (offline) {
        setSettingsWarningCount(1);
        return;
      }
      const status = powerSyncDb.currentStatus;
      setSettingsWarningCount(Number(Boolean(status.uploadError)) + Number(Boolean(status.downloadError)));
    };
    refresh();
    const interval = setInterval(refresh, 5000);
    if (Platform.OS === 'web') {
      window.addEventListener('online', refresh);
      window.addEventListener('offline', refresh);
    }
    return () => {
      clearInterval(interval);
      if (Platform.OS === 'web') {
        window.removeEventListener('online', refresh);
        window.removeEventListener('offline', refresh);
      }
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.blue,
        tabBarInactiveTintColor: palette.muted,
        tabBarLabelPosition: 'below-icon',
        tabBarHideOnKeyboard: true,
        tabBarStyle,
        tabBarItemStyle: styles.item,
        // Own label so a long one ("Beslenme") shrinks to fit a narrow tab at a
        // large text size instead of being cut to "Beslen…".
        tabBarLabel: ({ color, children }) => (
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.label, { color }]}>
            {children}
          </Text>
        ),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('today'),
          tabBarIcon: ({ color }) => <TabIcon name="today" color={color} />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'Koç',
          // Sadece "Compos Kişisel" varyantında görünür; normal sürümde rota gizli kalır.
          href: IS_PERSONAL ? undefined : null,
          tabBarIcon: ({ color }) => <TabIcon name="coach" color={color} />,
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: t('nutrition'),
          tabBarIcon: ({ color }) => <TabIcon name="nutrition" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: t('history'),
          tabBarIcon: ({ color }) => <TabIcon name="history" color={color} />,
        }}
      />
      <Tabs.Screen
        name="analysis"
        options={{
          title: t('insights'),
          tabBarIcon: ({ color }) => <TabIcon name="insights" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('settings'),
          tabBarIcon: ({ color }) => <View><TabIcon name="settings" color={color} />{settingsWarningCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{settingsWarningCount}</Text></View>}</View>,
        }}
      />
    </Tabs>
  );
}

const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => softSheet({
  item: {
    paddingVertical: 0,
  },
  label: {
    fontFamily: Fonts.technical,
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 0.1,
    marginTop: 2,
  },
  badge: { position: 'absolute', top: -6, right: -8, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.red },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700', lineHeight: 11 },
});
