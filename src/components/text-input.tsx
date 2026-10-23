import { forwardRef } from 'react';
import { TextInput as RNTextInput, type TextInputProps } from 'react-native';

import { MAX_FONT_SCALE } from '@/constants/theme';

// react-native's TextInput with the app-wide text-size cap (see
// MAX_FONT_SCALE) as its default — import this one, not react-native's.
export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput(props, ref) {
  return <RNTextInput ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
});
export type TextInput = RNTextInput;
