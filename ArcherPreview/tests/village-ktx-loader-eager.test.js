import test from 'node:test';
import assert from 'node:assert/strict';
import {_GetCompatibleTextureLoader} from '@babylonjs/core/Materials/Textures/Loaders/textureLoaderManager.js';
import {_KTXTextureLoader} from '@babylonjs/core/Materials/Textures/Loaders/ktxTextureLoader.js';
import {registerVillageKtxTextureLoader} from '../src/village-ktx2.js';

test('both KTX extensions use the eagerly imported Babylon loader',async()=>{
  registerVillageKtxTextureLoader();
  registerVillageKtxTextureLoader();
  for(const extension of ['.ktx','.ktx2'])assert.ok(await _GetCompatibleTextureLoader(extension) instanceof _KTXTextureLoader);
});
