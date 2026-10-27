import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Radius } from '@/constants/theme';
import { softSheet } from '@/constants/soft-sheet';

// Real native backdrop blur (BlurView — actually blurs whatever RN content
// sits behind the button, unlike a CSS-style approximation) plus a slow
// animated light sweep for the "liquid" shimmer. No GPU shader / Skia here:
// react-native-skia's Android Canvas currently has an open upstream bug
// where it clears opaque instead of transparent (github.com/Shopify/
// react-native-skia/issues/3683), which made an earlier shader-based version
// of this button render as a solid block instead of glass. This version
// avoids that entirely.
export function LiquidGlassButton({
  children,
  onPress,
  style,
  disabled,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const sweep = useSharedValue(-1);

  useEffect(() => {
    sweep.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [sweep]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sweep.value * 120 }, { rotate: '20deg' }],
  }));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, style, pressed && styles.pressed]}>
      <BlurView intensity={36} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.tint]} pointerEvents="none" />
      <LinearGradient
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        colors={['rgba(255,255,255,0.32)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0)']}
        locations={[0, 0.45, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.View style={[styles.sweep, sweepStyle]}>
          <LinearGradient
            style={StyleSheet.absoluteFill}
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          />
        </Animated.View>
      </View>
      <View style={[StyleSheet.absoluteFill, styles.border]} pointerEvents="none" />
      <View style={styles.content}>{children}</View>
    </Pressable>
  );
}

const styles = softSheet({
  button: {
    borderRadius: Radius.full,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.92,
  },
  tint: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  sweep: {
    position: 'absolute',
    top: -20,
    bottom: -20,
    left: '30%',
    width: 40,
  },
  border: {
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  content: {
    paddingVertical: 14,
    paddingHorizontal: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
