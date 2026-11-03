// Babylon's built-in overlay uses a distinct draw wrapper. Keep its private
// pass/batch compatibility details in one place for player and boss warmup.
export function overlaySubMeshReadiness(scene,sub){
  const renderer=scene.getOutlineRenderer(),pass=renderer?._passIdForDrawWrapper?.[3];
  if(pass===undefined)throw new Error('화면 오버레이 셰이더를 준비하지 못했습니다.');
  const mesh=sub.getMesh(),batch=mesh._getInstancesRenderList?.(sub._id,mesh._internalAbstractMeshDataInfo?._actAsRegularMesh===true);
  const instances=!!(scene.getEngine().getCaps().instancedArrays&&((batch?.visibleInstances?.[sub._id]!==null&&batch?.visibleInstances?.[sub._id]!==undefined)||sub.getRenderingMesh().hasThinInstances));
  const ready=renderer.isReady(sub,instances,pass);
  return {ready,effect:sub._getDrawWrapper(pass)?.effect};
}
