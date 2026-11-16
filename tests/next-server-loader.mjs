import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') {
    return nextResolve(new URL('../node_modules/next/server.js', import.meta.url).href, context);
  }
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2);
    const basePath = path.resolve(process.cwd(), 'src', rel);
    let resolved = basePath;
    if (fs.existsSync(basePath + '.ts')) {
      resolved = basePath + '.ts';
    } else if (fs.existsSync(basePath + '.tsx')) {
      resolved = basePath + '.tsx';
    } else if (fs.existsSync(path.join(basePath, 'index.ts'))) {
      resolved = path.join(basePath, 'index.ts');
    }
    return nextResolve(pathToFileURL(resolved).href, context);
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
    try {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const targetPath = path.resolve(parentDir, specifier);
      if (!fs.existsSync(targetPath)) {
        if (fs.existsSync(targetPath + '.ts')) {
          return nextResolve(pathToFileURL(targetPath + '.ts').href, context);
        } else if (fs.existsSync(targetPath + '.tsx')) {
          return nextResolve(pathToFileURL(targetPath + '.tsx').href, context);
        } else if (fs.existsSync(path.join(targetPath, 'index.ts'))) {
          return nextResolve(pathToFileURL(path.join(targetPath, 'index.ts')).href, context);
        }
      }
    } catch {
      // Fall through to default resolution
    }
  }
  return nextResolve(specifier, context);
}
