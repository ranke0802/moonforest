import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(import.meta.dirname, '..');
let loadedManifest;
const manifest = () => loadedManifest ??= JSON.parse(readFileSync(resolve(import.meta.dirname, 'source-inputs.json'), 'utf8'));
function contained(path) {
  const rel = relative(projectRoot, path);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\')) throw new Error('Source path leaves MoonForest: ' + path);
  return path;
}
/** Resolve a bundled source ID. Provenance origins are never a fallback. */
export function sourcePath(id, ...parts) {
  const registry = manifest();
  const base = registry.directories?.[id] ?? registry.inputs.find(input => input.id === id)?.path ?? (id.startsWith('file:') ? registry.aliases?.[id.slice(5)] : undefined);
  if (!base) throw new Error('Unknown bundled source: ' + id);
  const requested = contained(resolve(projectRoot, base, ...parts));
  const alias = registry.aliases?.[relative(projectRoot, requested).replaceAll('\\', '/')];
  const path = alias ? contained(resolve(projectRoot, alias)) : requested;
  if (!existsSync(path)) throw new Error('Bundled source is missing: ' + relative(projectRoot, path));
  contained(realpathSync(path));
  return path;
}
export function projectPath(...parts) { return contained(resolve(projectRoot, ...parts)); }
/** Explicit overrides win; Windows Python uses the portable runtime before PATH. */
export function toolPath(name) {
  const override = process.env[name.toUpperCase() + '_EXE'];
  if (override) return override;
  if (name === 'python' && process.platform === 'win32') {
    const bundled = projectPath('Tools/portable/runtime/win-x64/python/python.exe');
    if (existsSync(bundled)) return bundled;
  }
  return name;
}
export async function checkSources() {
  const registry = manifest();
  let bytes = 0;
  for (const input of registry.inputs) {
    const path = sourcePath(input.id), data = await readFile(path);
    if (data.length !== input.bytes || createHash('sha256').update(data).digest('hex') !== input.sha256) throw new Error('Bundled source changed: ' + input.path);
    bytes += data.length;
  }
  return { version: registry.version, inputs: registry.inputs.length, bytes, complete: true };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--check') console.log(JSON.stringify(await checkSources()));
  else console.log(sourcePath(process.argv[2], ...process.argv.slice(3)));
}
