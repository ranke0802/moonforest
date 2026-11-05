import {Matrix,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {Ray} from '@babylonjs/core/Culling/ray.js';

const finite=point=>point&&['x','y','z'].every(key=>Number.isFinite(point[key])&&Math.abs(point[key])<=10000);
const heightAt=(world,x,z)=>{try{const height=world.terrain?.heightAt?.(x,z);return Number.isFinite(height)?height:null;}catch{return null;}};
// The geometry query deliberately allows the unpickable gameplay floor only;
// sky, props and actors can never become the captured terrain target.
export function cinematicTerrainHit(world,ray){
 if(!finite(ray?.origin)||!finite(ray?.direction)||ray.direction.lengthSquared()<1e-12)return null;
 const limit=Math.min(2000,Number.isFinite(ray.length)?Math.max(0,ray.length):2000);if(!limit)return null;
 const cast=new Ray(ray.origin.clone(),ray.direction.clone().normalize(),limit),ground=world.ground;
 if(ground&&!ground.isDisposed?.()&&world.scene?.pickWithRay){const hit=world.scene.pickWithRay(cast,mesh=>mesh===ground);if(hit?.hit&&finite(hit.pickedPoint)){const point=hit.pickedPoint,inside=Math.abs(point.x)<=(world.terrain?.half??Infinity)&&Math.abs(point.z)<=(world.terrain?.half??Infinity),height=heightAt(world,point.x,point.z);if(!inside||height===null||Math.abs(height-point.y)<.08)return point.clone();}}
 if(typeof world.terrain?.heightAt!=='function')return null;
 const box=ground?.getBoundingInfo?.().boundingBox,half=world.terrain.half??world.terrain.size/2,bounds=box?{x:[box.minimumWorld.x,box.maximumWorld.x],z:[box.minimumWorld.z,box.maximumWorld.z]}:Number.isFinite(half)?{x:[-half,half],z:[-half,half]}:{x:[-10000,10000],z:[-10000,10000]};let near=0,far=limit;
 for(const axis of ['x','z']){const [min,max]=bounds[axis],direction=cast.direction[axis],origin=cast.origin[axis];if(Math.abs(direction)<1e-10){if(origin<min||origin>max)return null;}else{const a=(min-origin)/direction,b=(max-origin)/direction;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));}}if(near>far)return null;
 const sample=distance=>{const point=cast.origin.add(cast.direction.scale(distance)),height=heightAt(world,point.x,point.z);return height===null||!finite(point)?null:{point,difference:point.y-height};};
 let previous=sample(near);if(!previous)return null;if(Math.abs(previous.difference)<1e-5)return previous.point;
 const step=Math.max(.1,world.terrain.step??1),horizontal=Math.hypot(cast.direction.x,cast.direction.z)*(far-near),count=Math.min(1024,Math.max(16,Math.ceil(horizontal/step*2)));
 for(let index=1;index<=count;index++){const distance=near+(far-near)*index/count,current=sample(distance);if(!current)return null;if(Math.abs(current.difference)<1e-5)return current.point;if(previous.difference*current.difference<0){let low=near+(far-near)*(index-1)/count,high=distance,lowValue=previous.difference;for(let iteration=0;iteration<28;iteration++){const middle=(low+high)/2,next=sample(middle);if(!next)return null;if(Math.abs(next.difference)<1e-6)return next.point;if(lowValue*next.difference<=0)high=middle;else{low=middle;lowValue=next.difference;}}return sample((low+high)/2)?.point??null;}previous=current;}
 return null;
}
// x/y are canvas-local CSS pixels, matching Babylon pre-pointer localPosition.
export function cinematicGroundAtScreen(world,x,y){if(!Number.isFinite(x)||!Number.isFinite(y))return null;return cinematicTerrainHit(world,world.scene.createPickingRay(x,y,Matrix.Identity(),world.camera));}
