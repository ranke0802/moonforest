import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { splitGlb } from './resource-pack.js';

const root = resolve(import.meta.dirname, '../public/assets');
await mkdir(resolve(root, 'content'), { recursive:true });
for (const [manifest, source] of [['character', 'azure-elf.glb'], ['warrior', 'violet-warrior.glb'], ['warrior-v2','violet-warrior-v2.glb'], ['guardian-bear','guardian-bear.glb']]) {
  const configPath = resolve(root, `${manifest}.json`);
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const pack = splitGlb(await readFile(resolve(root, source)));
  for (const [name, file] of pack.files) await writeFile(resolve(root, 'content', name), file.data);
  config.model = `./content/${pack.model}`;
  config.resources = [...pack.files.keys()].map(name => `./content/${name}`);
  config.resourceCacheVersion = 1;
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`${manifest}: ${pack.files.size} immutable resources, ${[...pack.files.values()].reduce((n,f)=>n+f.data.length,0)} bytes`);
}
