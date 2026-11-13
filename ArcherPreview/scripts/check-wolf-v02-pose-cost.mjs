import assert from 'node:assert/strict';
import {NullEngine,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {WolfV02HurtVolumes,WOLF_V02_HURT_VOLUMES} from '../src/wolf-v02-hurt.js';
const engine=new NullEngine(),scene=new Scene(engine),parent=new TransformNode('actor',scene),nodes={};
for(const fit of WOLF_V02_HURT_VOLUMES)if(!nodes[fit.node]){const n=new TransformNode(fit.node,scene);n.parent=parent;n.position.set(.1,.4,.2);nodes[fit.node]=n;}
const hurt=new WolfV02HurtVolumes(nodes,2.5),point=new Vector3();
function compare(){const actual=hurt.sample();for(let i=0;i<WOLF_V02_HURT_VOLUMES.length;i++){const fit=WOLF_V02_HURT_VOLUMES[i],m=nodes[fit.node].getWorldMatrix();for(const [j,p] of [fit.a,fit.b].entries()){Vector3.TransformCoordinatesToRef(Vector3.FromArray(p),m,point);assert.ok(Vector3.Distance(point,Vector3.FromArray(actual[i].points[j]))<1e-8);}assert.equal(actual[i].radius,fit.radius*2.5);}}
try{compare();const first=hurt.transforms;for(let i=0;i<9;i++)compare();assert.equal(hurt.transforms,first);parent.position.x+=.5;parent.computeWorldMatrix(true);for(const node of Object.values(nodes))node.computeWorldMatrix(true);compare();assert.equal(hurt.transforms,first*2);nodes.chest.rotation.y=.3;nodes.chest.computeWorldMatrix(true);compare();assert.ok(hurt.transforms>first*2);console.log(JSON.stringify({passed:true,capsules:hurt.capsules.length,unchangedPoseChecks:10,uncachedTransformsForTenChecks:first*10,actualTransformsForTenChecks:first,parentAndBoneInvalidation:true,geometryAndRadiiUnchanged:true}));}finally{scene.dispose();engine.dispose();}
