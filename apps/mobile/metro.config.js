// Metro config for Expo in a pnpm workspace, wrapped with NativeWind.
// Watches the monorepo root so changes to workspace packages hot-reload,
// and resolves modules from both the app's own node_modules and the
// workspace root.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Prefer the workspace's hoisted copies; only fall back to the app's local
// node_modules. Avoids duplicate React instances.
config.resolver.disableHierarchicalLookup = true;

module.exports = withNativeWind(config, { input: './global.css' });
