const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('node:path');

/**
 * Metro for a pnpm monorepo — E16-T01.
 *
 * Two things are needed that a standalone Expo app does not have:
 *
 *  - `watchFolders` reaching the repo root, so edits in `packages/*` reload;
 *  - `nodeModulesPaths` including the root store, because the workspace uses
 *    `node-linker=isolated` (.npmrc) and a dependency of a dependency lives in
 *    the root `.pnpm` directory rather than beside the app.
 *
 * `disableHierarchicalLookup` stays off: with isolated linking Metro still has
 * to walk upwards to resolve transitive packages.
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = withNativeWind(config, { input: './global.css' });
