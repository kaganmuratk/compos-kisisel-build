import { copyFileSync, mkdirSync } from 'node:fs';

const packageRoot = new URL('../node_modules/.pnpm/', import.meta.url);
const publicFonts = new URL('../public/fonts/', import.meta.url);

const fonts = [
  ['@expo-google-fonts+bricolage-grotesque@0.4.1/node_modules/@expo-google-fonts/bricolage-grotesque/400Regular/BricolageGrotesque_400Regular.ttf', 'BricolageGrotesque-Regular.ttf'],
  ['@expo-google-fonts+bricolage-grotesque@0.4.1/node_modules/@expo-google-fonts/bricolage-grotesque/500Medium/BricolageGrotesque_500Medium.ttf', 'BricolageGrotesque-Medium.ttf'],
  ['@expo-google-fonts+bricolage-grotesque@0.4.1/node_modules/@expo-google-fonts/bricolage-grotesque/600SemiBold/BricolageGrotesque_600SemiBold.ttf', 'BricolageGrotesque-SemiBold.ttf'],
  ['@expo-google-fonts+bricolage-grotesque@0.4.1/node_modules/@expo-google-fonts/bricolage-grotesque/700Bold/BricolageGrotesque_700Bold.ttf', 'BricolageGrotesque-Bold.ttf'],
  ['@expo-google-fonts+barlow-condensed@0.4.1/node_modules/@expo-google-fonts/barlow-condensed/600SemiBold/BarlowCondensed_600SemiBold.ttf', 'BarlowCondensed-SemiBold.ttf'],
  ['@expo-google-fonts+barlow-condensed@0.4.1/node_modules/@expo-google-fonts/barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf', 'BarlowCondensed-Bold.ttf'],
  ['@expo-google-fonts+ibm-plex-mono@0.4.1/node_modules/@expo-google-fonts/ibm-plex-mono/500Medium/IBMPlexMono_500Medium.ttf', 'IBMPlexMono-Medium.ttf'],
];

mkdirSync(publicFonts, { recursive: true });
for (const [source, target] of fonts) {
  copyFileSync(new URL(source, packageRoot), new URL(target, publicFonts));
}
