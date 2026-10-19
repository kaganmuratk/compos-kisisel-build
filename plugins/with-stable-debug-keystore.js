const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Expo may regenerate android/app/debug.keystore during `prebuild --clean`.
// Restore the project-owned key after native generation so local preview APKs
// remain upgrade-compatible between builds.
module.exports = function withStableDebugKeystore(config) {
  return withDangerousMod(config, ['android', (modConfig) => {
    const root = modConfig.modRequest.projectRoot;
    const source = path.join(root, 'assets', 'android-debug.keystore');
    const target = path.join(root, 'android', 'app', 'debug.keystore');
    if (fs.existsSync(source)) fs.copyFileSync(source, target);
    return modConfig;
  }]);
};
