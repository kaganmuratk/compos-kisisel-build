import { Alert, Platform } from 'react-native';

// react-native-web's Alert.alert() is a total no-op (no dialog, no
// callback) — every single-button "informational" alert (error toasts,
// "can't do that" messages) in the app was silently invisible on web.
// Multi-button confirm/cancel dialogs need their own Platform.OS === 'web'
// + window.confirm branch per call site instead (see nutrition/log/[id].tsx)
// since the two buttons usually lead to different app behavior; this helper
// only covers the single-acknowledgment case.
export function alertMessage(title: string, message?: string, onDismiss?: () => void) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    onDismiss?.();
    return;
  }
  if (onDismiss) {
    Alert.alert(title, message, [{ text: 'Tamam', onPress: onDismiss }]);
  } else {
    Alert.alert(title, message);
  }
}
