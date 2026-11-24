import test from 'node:test';
import assert from 'node:assert/strict';
import {createTextureMemoryMeter, compactPerformanceText} from '../src/texture-memory.js';
import {readDiagnosticMemory} from '../src/load-diagnostics.js';
import {DotMinimap, MINIMAP_SIZE} from '../src/dot-minimap.js';

test('current and peak are engine texture estimates shared by the HUD and recorder', () => {
  let at = 0, reads = 0, size = 278;
  const meter = createTextureMemoryMeter(() => at);
  const engine = {getLoadedTexturesCache() {
    reads++;
    return [{width: 1024, height: size * 256, format: 5}];
  }};
  assert.equal(meter(undefined), null);
  const first = meter(engine);
  assert.equal(first.peakMiB, 278);
  size = 240;
  at = 999;
  assert.equal(meter(engine), first);
  assert.equal(reads, 1);
  at = 1000;
  const next = meter(engine);
  assert.equal(compactPerformanceText(60, 60, next), '60 fps 60Hz 240/278MiB');
  assert.equal(compactPerformanceText(42, null, null), '42 fps');
  const diagnostic = readDiagnosticMemory({}, {textureSample: next});
  assert.equal(diagnostic.engineTextureMiB, 240);
  assert.equal(diagnostic.peakEngineTextureMiB, 278);
  const restored = meter({getLoadedTexturesCache: () => []});
  assert.equal(compactPerformanceText(60, 120, restored), '60 fps 120Hz 0/278MiB');
});

test('on touch only the minimap terrain is translucent, including repeated frames and input changes', () => {
  let touch=true;
  const calls=[];
  const ctx={globalAlpha:1,clearRect(){calls.push('clear')},drawImage(){calls.push(this.globalAlpha)},fillRect(){assert.equal(this.globalAlpha,1)}};
  const canvas={width:MINIMAP_SIZE,height:MINIMAP_SIZE,getContext:()=>ctx};
  const map=new DotMinimap({querySelector:()=>canvas}, {translucent:()=>touch});
  map.mapId='great-plains';map.static={};
  const actor={position:{x:0,z:0},rotation:{y:0}};
  map.setMarkers([{x:0,z:0,glyph:"!"}]);
  map.update(actor,0);map.update(actor,0.6);
  touch=false;map.update(actor,0.8);
  assert.deepEqual(calls,['clear',.58,'clear',.58,1]);
});
