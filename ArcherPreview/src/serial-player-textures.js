import {registerGLTFExtension} from '@babylonjs/loaders/glTF/2.0/glTFLoaderExtensionRegistry.js';

// Babylon 9.31 assigns Texture placeholders synchronously (alpha/UV setup relies
// on that). Gate only image bytes, until the previous decode AND GPU upload have
// completed. Wrapping the whole texture method in a queue breaks that contract.
export function serializeTextureCreation(loader){
  const create=loader._createTextureAsync;
  let tail=Promise.resolve();
  loader._createTextureAsync=function(...args){
    const previous=tail,read=this.loadImageAsync;
    this.loadImageAsync=(...imageArgs)=>previous.then(()=>read.apply(this,imageArgs));
    try{
      const result=create.apply(this,args);
      tail=Promise.resolve(result);
      // Observe the rejection without swallowing it: later textures must stop.
      tail.catch(()=>{});
      return result;
    }finally{this.loadImageAsync=read;}
  };
  return ()=>{loader._createTextureAsync=create;};
}

const name='MOONFOREST_serial_player_textures';
registerGLTFExtension(name,false,loader=>{
  let restore;
  return {name,enabled:true,onLoading(){
    if(loader.gltf.asset.extras?.moonforestSerialTextures)restore=serializeTextureCreation(loader);
  },dispose(){restore?.();}};
});
