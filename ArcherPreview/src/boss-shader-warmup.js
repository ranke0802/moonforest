function nextFrame(){
  if(typeof requestAnimationFrame!=='function')return Promise.resolve();
  return new Promise(resolve=>{
    let frame,timer,done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);cancelAnimationFrame(frame);resolve();};
    frame=requestAnimationFrame(finish);timer=setTimeout(finish,50);
  });
}
// Compile body and silhouette before showing the actor. Yield between shader
// variants so a first summon does not queue every expensive driver job at once.
export async function prepareBossShaders(asset,{frame=nextFrame}={}){
  for(const mesh of asset.meshes){
    if(!mesh.getTotalVertices()||!(mesh.metadata?.moonforestOutline||mesh.material?.metadata?.moonforestMonsterToon))continue;
    await frame();await mesh.material.forceCompilationAsync(mesh);
  }
}
