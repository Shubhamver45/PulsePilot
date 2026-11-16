import { pathToFileURL } from 'node:url';
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
  return nextResolve(specifier, context);
}
