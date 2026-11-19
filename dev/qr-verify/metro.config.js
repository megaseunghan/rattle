const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const project = __dirname, root = path.resolve(project, '../..');
const config = getDefaultConfig(project);
config.watchFolders = [root];
config.resolver.nodeModulesPaths = [path.join(root, 'node_modules')];
config.resolver.disableHierarchicalLookup = false;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'expo-router') return { type: 'sourceFile', filePath: path.join(project, 'router.ts') };
  const resolved = context.resolveRequest(context, moduleName, platform);
  if (resolved.type !== 'sourceFile') return resolved;
  const file = resolved.filePath;
  if (file === path.join(root, 'lib/supabase.ts')) return { type: 'sourceFile', filePath: path.join(project, 'network-guard.ts') };
  if (file.startsWith(path.join(root, 'lib/services/'))) return { type: 'sourceFile', filePath: path.join(project, 'services.ts') };
  if (file.startsWith(path.join(root, 'lib/hooks/')) || file === path.join(root, 'lib/contexts/AuthContext.tsx') || file === path.join(root, 'lib/contexts/TabPagerContext.tsx')) return { type: 'sourceFile', filePath: path.join(project, 'fixtures.ts') };
  return resolved;
};
module.exports = config;
