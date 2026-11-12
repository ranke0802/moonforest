import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectSidecar,inspectGlb} from './inspect-canine.mjs';

const fixture=()=>({clips:[{name:'Nip',duration:1,fps:30,rootTrack:[[0,0,0],[0,0,0]],yawTrack:[0,0],channels:[{node:'fore.L.upper',path:'scale',times:[0,1],values:[[1,1,1],[1,1+1e-7,1]]},{node:'head',path:'rotation',times:[0,1],values:[[0,0,0,1],[0,0,0,1]]}]}]});
test('float-export scale noise is retained and measured',()=>{const r=inspectSidecar(fixture());assert.equal(r.clips.length,1);assert.ok(r.clips[0].maximumScaleExcursion>0);});
test('reject actual animated limb stretching',()=>{const f=fixture();f.clips[0].channels[0].values[1][1]=1.08;assert.throws(()=>inspectSidecar(f),/scale/);});
test('reject skipped/reversed/duplicate source key time',()=>{const f=fixture();f.clips[0].channels[1].times=[1,0];assert.throws(()=>inspectSidecar(f),/unordered/);});
test('reject non-unit quaternion and invalid root metadata',()=>{const f=fixture();f.clips[0].channels[1].values[1][3]=2;assert.throws(()=>inspectSidecar(f),/quaternion/);const g=fixture();g.clips[0].rootTrack[1][0]=NaN;assert.throws(()=>inspectSidecar(g),/root/);});
test('reject incomplete or ambiguous duplicate targets',()=>{const f=fixture();f.clips[0].channels.push(structuredClone(f.clips[0].channels[0]));assert.throws(()=>inspectSidecar(f),/duplicate target/);});
test('reject invalid GLB instead of reporting zero polygon success',()=>{assert.throws(()=>inspectGlb(Buffer.alloc(32)),/GLB/);});
