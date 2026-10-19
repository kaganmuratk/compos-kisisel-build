const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('sql');

// The Codex sub-agent runs out of agents/gpt-terra/ (its own working
// directory inside this repo) and creates/removes its own transient config
// dirs there (e.g. .codex) mid-session. Metro's default watcher covers the
// whole project root and crashed the entire dev server with an ENOENT when
// one of those directories disappeared out from under it — excluding the
// agent's directory from the watcher/bundler avoids that crash.
config.resolver.blockList = [/agents\/gpt-terra\/.*/];

// Web only: PowerSync/expo-sqlite's browser build uses a wasm-based SQLite
// engine, which needs both wasm treated as a loadable asset and the
// COEP/COOP headers below (required for SharedArrayBuffer).
config.resolver.assetExts.push('wasm');

// @powersync/web's default export resolves to a plain Vite/webpack build
// (uses import.meta.url to spawn its worker, which Metro doesn't rewrite —
// the worker script 404s and every PowerSync query hangs forever). The
// package publishes a Metro-safe build behind the "react-native-web" export
// condition instead; see src/db/powersync.web.ts for the matching worker
// path config this requires.
config.resolver.unstable_conditionsByPlatform = {
  ...config.resolver.unstable_conditionsByPlatform,
  web: [...(config.resolver.unstable_conditionsByPlatform?.web ?? []), 'react-native-web'],
};
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    middleware(req, res, next);
  };
};

module.exports = config;
