import { Image, type ImageRef } from 'expo-image';
import { View } from 'react-native';

export type NaturalImageSize = { width: number; height: number };

// "Sprite crops" a vertical slice out of a single source image using an
// overflow-hidden box + a negative top offset on the full image — the
// standard RN technique for showing part of an image without actually
// cutting it server-side. startPercent/endPercent are 0-100, top to bottom,
// as a fraction of the image's own natural height (see ImageSection's own
// comment in schema.ts for where these numbers come from).
//
// `source` takes the already-loaded ImageRef (from expo-image's useImage())
// rather than a bare uri — passing the loaded native reference renders
// immediately and avoids re-fetching/re-decoding the same remote image once
// per cropped panel (there can be 7+ on one screen).
export function ImageSectionCrop({
  source,
  naturalSize,
  startPercent,
  endPercent,
  displayWidth,
  borderRadius,
}: {
  source: ImageRef;
  naturalSize: NaturalImageSize;
  startPercent: number;
  endPercent: number;
  displayWidth: number;
  borderRadius?: number;
}) {
  const scale = displayWidth / naturalSize.width;
  const fullDisplayHeight = naturalSize.height * scale;
  const sectionHeight = Math.max(1, ((endPercent - startPercent) / 100) * fullDisplayHeight);
  const offsetTop = (startPercent / 100) * fullDisplayHeight;

  return (
    <View style={{ width: displayWidth, height: sectionHeight, overflow: 'hidden', borderRadius }}>
      <Image
        source={source}
        style={{ width: displayWidth, height: fullDisplayHeight, marginTop: -offsetTop }}
        contentFit="cover"
      />
    </View>
  );
}
