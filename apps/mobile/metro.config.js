// Metro config for Expo in a pnpm workspace. Watches the monorepo root so
// changes to workspace packages (@actorrise/*) hot-reload, and resolves
// modules from both the app's own node_modules and the workspace root.
// See https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Prefer the workspace's hoisted copies; only fall back to the app's local
// node_modules. Avoids duplicate React instances when both web and mobile
// pull in shared workspace packages.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
