import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet } from 'react-native';

// Tap-to-close, aspect-fit fullscreen preview — used wherever a small media
// thumbnail (session/set images) needs a "look bigger" affordance.
export function FullscreenImageViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return (
    <Modal visible={uri != null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Kapat" style={styles.backdrop} onPress={onClose}>
        {uri ? <Image source={{ uri }} style={styles.image} contentFit="contain" /> : null}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
