import test from 'node:test';
import assert from 'node:assert/strict';
import {outlineTriangleCount,selectVillageOutlines,VILLAGE_INK_MIN_COVERAGE} from '../src/village-outline-policy.js';

// The pre-cache implementation is the oracle, including sorting, rounding,
// filtering, budget skipping and stable rank ordering.
function originalTriangleCount(mesh,coverage){
 const source=mesh.sourceMesh??mesh;let chosen=source;
 if(source.useLODScreenCoverage)for(const level of [...source.getLODLevels()].sort((a,b)=>b.distance-a.distance))if(coverage<level.distance)chosen=level.mesh;
 return chosen?Math.ceil(chosen.getTotalIndices()/3):0;
}
function originalSelection(entries,touch,previous=new Set()){
 const budget=touch?160000:260000,limit=touch?96:144;
 const ranked=entries.map(entry=>({entry,triangles:originalTriangleCount(entry.mesh,entry.coverage),rank:Math.sqrt(entry.coverage)*(previous.has(entry)?1.15:1)}))
  .filter(v=>v.entry.coverage>VILLAGE_INK_MIN_COVERAGE&&v.triangles>0).sort((a,b)=>b.rank-a.rank);
 const chosen=new Set();let triangles=0;
 for(const v of ranked){if(chosen.size===limit)break;if(triangles+v.triangles>budget)continue;triangles+=v.triangles;chosen.add(v.entry);}
 return {chosen,triangles};
}
function fixture(){
 const calls={lods:0,indices:0};
 const mesh=(indices,lod=false)=>({indices,useLODScreenCoverage:lod,levels:[],getTotalIndices(){calls.indices++;return this.indices;},getLODLevels(){calls.lods++;return this.levels;}});
 const full=mesh(15001,true),mid=mesh(7202),far=mesh(3000),other=mesh(4803);
 full.levels=[{distance:.035,mesh:far},{distance:.22,mesh:mid},{distance:.002,mesh:null}];
 const coverages=[.7,.22,.2,.035,.02,.002,.0015,.001,0];
 const entries=Array.from({length:540},(_,i)=>({mesh:{sourceMesh:i%6===0?other:full},coverage:coverages[i%coverages.length]}));
 const previous=new Set(entries.filter((_,i)=>i%7===0));
 return {calls,full,mid,far,other,entries,previous,mesh};
}
function equalResult(actual,expected){assert.equal(actual.triangles,expected.triangles);assert.deepEqual([...actual.chosen],[...expected.chosen]);}

test('per-selection reuse preserves the exact original ordering, budgets and hysteresis',()=>{
 for(const touch of [false,true]){
  const {calls,entries,previous}=fixture();
  const expected=originalSelection(entries,touch,previous),original={...calls};calls.lods=calls.indices=0;
  const actual=selectVillageOutlines(entries,touch,previous);equalResult(actual,expected);
  assert.equal(original.lods,450);assert.ok(original.indices>300);
  assert.equal(calls.lods,1);assert.equal(calls.indices,4);
  assert.ok(actual.chosen.size<= (touch?96:144));assert.ok(actual.triangles<= (touch?160000:260000));
 }
});

test('new selection sees threshold, LOD replacement and index changes without stale results',()=>{
 const {full,mid,far,other,entries,previous,mesh}=fixture();
 const verify=()=>{for(const touch of [true,false])equalResult(selectVillageOutlines(entries,touch,previous),originalSelection(entries,touch,previous));};
 verify();full.levels[1].distance=.5;verify();
 const replacement=mesh(113,true);full.levels[0].mesh=replacement;verify();
 replacement.indices=30002;mid.indices=333;far.indices=0;other.indices=120002;verify();
 full.levels=[{distance:.3,mesh:mid}];full.indices=99;verify();
 full.useLODScreenCoverage=false;verify();
 assert.equal(outlineTriangleCount({sourceMesh:full},.2),33);
 assert.equal(outlineTriangleCount({sourceMesh:replacement},.2),10001);
});
