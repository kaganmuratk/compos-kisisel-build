import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';

// expo-sharing's own web fallback calls navigator.share({ url: dataUri, ... })
// — the browser's native OS share sheet, which (a) blocks the tab like a
// modal dialog until dismissed and (b) mostly does nothing useful, since a
// data: URI isn't a valid Web Share `url` (found 2026-08-25: pressing
// "Paylaş" in a desktop browser hung the tab). There's no good web
// equivalent of "share sheet" anyway, so web downloads the PNG directly
// instead of going through Sharing.shareAsync at all.
export async function shareOrDownloadImage(
  uri: string,
  fileName: string,
  options: { mimeType: string; dialogTitle: string }
): Promise<void> {
  if (Platform.OS === 'web') {
    const link = document.createElement('a');
    link.href = uri;
    link.download = fileName;
    link.click();
    return;
  }
  await Sharing.shareAsync(uri, options);
}
