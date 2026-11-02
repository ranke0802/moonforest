import {writeFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,Vector3,TransformNode,StandardMaterial,Color3} from '@babylonjs/core';
import {createElenaContact} from '../../src/elena-style.js';
import {createTerrainRing} from '../../src/terrain-mesh.js';

const engine=new NullEngine(),scene=new Scene(engine);new FreeCamera('camera',new Vector3(0,4,-8),scene).setTarget(Vector3.Zero());
const terrain={heightAt:()=>0},world={scene,terrain},actor=new TransformNode('boss',scene),effects=[],seen=new Set(),create=engine.createEffect.bind(engine);
engine.createEffect=(...args)=>{const effect=create(...args);if(!seen.has(effect)){seen.add(effect);effects.push({shader:typeof args[0]==='string'?args[0]:'source',id:effect.uniqueId});}return effect;};
const counts=()=>({meshes:scene.meshes.length,geometries:scene.geometries.length,materials:scene.materials.length,effects:effects.length});
const beforeContact=counts(),contact=createElenaContact(world),afterCreation=counts();contact.update(actor,true);scene.render();const firstContact=counts(),firstContactEffects=[...effects];scene.render();const repeatedContact=counts();contact.hide();
const ring=createTerrainRing(scene,terrain);ring.mesh.material=new StandardMaterial('boss-warning-gold',scene);ring.mesh.material.emissiveColor=new Color3(.9,.32,.05);ring.mesh.material.disableLighting=true;ring.mesh.isVisible=true;ring.update(Vector3.Zero(),2);const beforeWarning=counts();scene.render();const firstWarning=counts();scene.render();const repeatedWarning=counts();
const report={baseline:'71f9165',contact:{beforeCreation:beforeContact,afterCreation,beforeFirstVisible:afterCreation,firstVisible:firstContact,secondVisible:repeatedContact,firstEffects:firstContactEffects},warningRing:{beforeFirstVisible:beforeWarning,firstVisible:firstWarning,secondVisible:repeatedWarning},scope:'Actual unchanged createElenaContact/createTerrainRing helpers plus Babylon material readiness/render. Current boss warmup does not receive either helper mesh.',limitations:['NullEngine SDK Effect/resource events only, no real GPU time or visual validation.','The contact is a confirmed first-summon/phase-switch auxiliary allocation path; the non-Elena warning ring is a first-attack path, not necessarily the reported death event.']};
writeFileSync(new URL('auxiliary-shader-audit.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));scene.dispose();engine.dispose();
