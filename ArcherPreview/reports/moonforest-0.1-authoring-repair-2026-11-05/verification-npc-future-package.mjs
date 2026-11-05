import {createHash} from 'node:crypto';
import {readPackage,readGlb} from './verification-blacksmith-package.mjs';
import {makeGlb,makeZip} from './verification-npc-fixtures.mjs';

export function futureNpcPackage(){
 const supplied=readPackage(),manifest=JSON.parse(supplied.entries.get('asset-manifest.json').bytes),original=supplied.entries.get(manifest.model).bytes,{json,bin}=readGlb(original),copy=structuredClone(json);copy.asset.extras={independentFutureRegistration:true};const bytes=makeGlb(copy,bin),sha256=createHash('sha256').update(bytes).digest('hex'),descriptor={...manifest,assetId:'independent-future-npc',version:'future-1',character:'독립 미래 NPC',modelSha256:sha256},zip=makeZip([['asset-manifest.json',Buffer.from(JSON.stringify(descriptor))],[manifest.model,bytes],['shared/runtime.js',Buffer.from('globalThis.UNTRUSTED_NPC_SCRIPT_EXECUTED=true;')]]);
 return {file:new File([zip],'Future_NPC.zip',{type:'application/zip'}),assetId:descriptor.assetId,version:descriptor.version,sha256,bytes,manifest:descriptor,originalBinarySHA256:createHash('sha256').update(bin).digest('hex')};
}
