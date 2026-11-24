import {GLTFLoader,ArrayItem} from '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {registerGLTFExtension} from '@babylonjs/loaders/glTF/2.0/glTFLoaderExtensionRegistry.js';

// Shared models whose colour texture still ships as JPG/PNG get the KTX2 encoding of the same
// picture at load time. The model file is not changed: its content hash is the asset's version,
// which placements and the approved-scenery records point at (2026-11-21: changing the glTF
// stopped 0.1 with a version conflict). public/assets/texture-replacements.json lists the same
// files so they are published. A JPG in the GPU is 4 bytes a pixel, the KTX2 one.
const SCENERY_COLORS=Object.freeze({
 'a22ee8b1e9ac7a3b09f9a356fdfcb755107aa1e5b4f8be54d752d76915244fdd.jpg':'c41ddc1ca993a20422d4dad7a67f3be9e358d12af81932a54585c3edd198b130.ktx2',// grass tuft
 'a7a6bc98a461f098e5d680c24a6bfb580f706dc1662e14c27998778376e7282d.jpg':'6bf3b8874526704f61c661bb37da04aed43808d1c5dfa34794aa456319c68b77.ktx2',// scarecrow
});
export const TEXTURE_REPLACEMENTS=Object.freeze({
 ...SCENERY_COLORS,
 '1b34cc211da0bfaebe7ad511e076c4bef79b823446458fbd4de8c9331dfae32e.png':'26a157566a0fc08fba18d1e77641daa8f85eb3372e17000ec5dec816fb9e3ef0.ktx2',// guardian bear
 'd25537cd4b2c0360a9305944cc48c05f21fee8fb44755b6fe59712cd3d7a95c0.png':'10595a08679a7891fe87df62f6ba6486d4eb719d33fec415408ce6f8b720d2ed.ktx2',// hooded goblin (2026-11-23)
});

export function sceneryPrefetchPaths(paths){
  if(!decoderReady)return paths;
  // The KTX2 is requested and cached by the model loader when this LOD is used.
  return paths.filter(path=>!path.endsWith('.jpg')||!Object.hasOwn(SCENERY_COLORS,path.slice(path.lastIndexOf('/')+1)));
}

// 0.3: regular (non-boss) monsters load their 2048 level instead of the 4096 one (2026-11-23, user:
// free texture memory, keep 4K for bosses). Each file is the original KTX2 with its top mip level
// removed (scripts/trim-ktx2-top-level.mjs): the 2048 picture the encoder made, byte for byte.
// Download, cache read and GPU memory drop to about a quarter (S23: 21.3MB -> 5.3MB a species).
export const MONSTER_2K_TEXTURES=Object.freeze({
 '2b2172d65ea23af3cb0b76ad61ea08487152af482f88eb4768124c62d53c9af0.ktx2':'fb1780ac8c0334fd6d3e5b39eec6063b401b69d3eb0d6c7975b967d6be8f4aeb.ktx2',// gray wolf
 'a66589bb6da2396be286420dc247eba7eb7f544d953ed3380248c0e7dae28254.ktx2':'2aeddc81143df21a87594b80be7bab4ed8bc4a7249ac0d793bd792ef9f8deb9d.ktx2',// wolf 2 (stylized)
 'a328c19df0c9d6ab224c03052df3552db00fc7e604a171d4ca6ec3fbe178ca2a.ktx2':'253dfcd76b5be0bb3cccc8e3c3eadd0266932123947bf056d4a2a69d8365e4a3.ktx2',// wolf 3
 '0687ad19cadfb59cff676af8a8c681a62359761adf8d8bf96cbb8d62ace21e7a.ktx2':'94f4ef62245cfd185d7e1d30b7252a502455eacad91ca229ae325067c7ff96e4.ktx2',// fox
 '577c85721044a7d3e6b58201094e1311ce0b8bc7a782bafadec473dc2df796e2.ktx2':'a95c49e4f5ef086012dc74bbed5a809e89bb82cd6f02a270a7eca5abb40f9b0f.ktx2',// boar
});
let tier=null;
export function setTextureTier(map){tier=map&&typeof map==='object'?map:null;}

// The swap waits for our own decoder (village-ktx2.js): without it Babylon would fetch one from its CDN.
let decoderReady=false;
export function setTextureReplacementsReady(ready){decoderReady=ready===true;}

const name='MOONFOREST_texture_replacements';
export function replacementExtension(loader,{replacements=TEXTURE_REPLACEMENTS,tiers=()=>tier,ready=()=>decoderReady}={}){
  const standIns=new Map();
  // order: ahead of KHR_texture_basisu, so a KTX2 image can be swapped for another KTX2 too.
  return {name,enabled:true,order:1,
    _loadTextureAsync(context,texture,assign){
      const source=texture.source??texture.extensions?.KHR_texture_basisu?.source;
      if(!ready()||source===undefined)return null;
      const image=loader.gltf.images?.[source],uri=image?.uri;
      if(typeof uri!=='string')return null;
      const slash=uri.lastIndexOf('/'),file=uri.slice(slash+1),packed=replacements[file]??tiers()?.[file];
      if(!packed)return null;
      // One stand-in per image: the loader keeps the downloaded bytes on it, as it does for its own images.
      let standIn=standIns.get(image);
      if(!standIn){standIn={uri:uri.slice(0,slash+1)+packed,mimeType:'image/ktx2',index:image.index};standIns.set(image,standIn);}
      const sampler=texture.sampler===undefined?GLTFLoader.DefaultSampler:ArrayItem.Get(`${context}/sampler`,loader.gltf.samplers,texture.sampler),colour=!texture._textureInfo?.nonColorData;
      // Same call KHR_texture_basisu makes for a texture that names a KTX2 image itself.
      return loader._createTextureAsync(context,sampler,standIn,babylonTexture=>assign(babylonTexture),colour?undefined:{useRGBAIfASTCBC7NotAvailableWhenUASTC:true},colour,texture);
    },
    dispose(){standIns.clear();}};
}
registerGLTFExtension(name,false,replacementExtension);
