import {GLTFLoader,ArrayItem} from '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {registerGLTFExtension} from '@babylonjs/loaders/glTF/2.0/glTFLoaderExtensionRegistry.js';

// Shared models whose colour texture still ships as JPG/PNG get the KTX2 encoding of the same
// picture at load time. The model file is not changed: its content hash is the asset's version,
// which placements and the approved-scenery records point at (2026-11-21: changing the glTF
// stopped 0.1 with a version conflict). public/assets/texture-replacements.json lists the same
// files so they are published. A JPG in the GPU is 4 bytes a pixel, the KTX2 one.
export const TEXTURE_REPLACEMENTS=Object.freeze({
 'a22ee8b1e9ac7a3b09f9a356fdfcb755107aa1e5b4f8be54d752d76915244fdd.jpg':'c41ddc1ca993a20422d4dad7a67f3be9e358d12af81932a54585c3edd198b130.ktx2',// grass tuft
 'a7a6bc98a461f098e5d680c24a6bfb580f706dc1662e14c27998778376e7282d.jpg':'6bf3b8874526704f61c661bb37da04aed43808d1c5dfa34794aa456319c68b77.ktx2',// scarecrow
 '1b34cc211da0bfaebe7ad511e076c4bef79b823446458fbd4de8c9331dfae32e.png':'26a157566a0fc08fba18d1e77641daa8f85eb3372e17000ec5dec816fb9e3ef0.ktx2',// guardian bear
});

// The swap waits for our own decoder (village-ktx2.js): without it Babylon would fetch one from its CDN.
let decoderReady=false;
export function setTextureReplacementsReady(ready){decoderReady=ready===true;}

const name='MOONFOREST_texture_replacements';
export function replacementExtension(loader,{replacements=TEXTURE_REPLACEMENTS,ready=()=>decoderReady}={}){
  const standIns=new Map();
  return {name,enabled:true,
    _loadTextureAsync(context,texture,assign){
      if(!ready()||texture.source===undefined)return null;
      const image=loader.gltf.images?.[texture.source],uri=image?.uri;
      if(typeof uri!=='string')return null;
      const slash=uri.lastIndexOf('/'),packed=replacements[uri.slice(slash+1)];
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
