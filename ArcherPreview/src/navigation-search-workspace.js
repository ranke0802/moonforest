// One sequential A* workspace per navigator, not one buffer set per route or
// per collision radius. Generation marks make untouched scores infinite without
// filling the whole map on every search. Grid nodes/edges remain caller-owned.
export class NavigationSearchWorkspace{
 constructor(){this.capacity=0;this.epoch=0;this.busy=false;this.queries=0;this.bufferAllocations=0;this.allocatedBytes=0;}
 begin(length){
  if(this.busy)throw Error('Navigation search workspace is already in use');
  if(!Number.isSafeInteger(length)||length<1)throw Error('Invalid navigation workspace size');
  if(length>this.capacity){
   this.capacity=length;this.scores=new Float64Array(length);this.parents=new Int32Array(length);this.scoreEpoch=new Uint32Array(length);this.closed=new Uint32Array(length);
   this.bufferAllocations+=4;this.allocatedBytes+=length*20;
  }
  this.epoch=(this.epoch+1)>>>0;
  if(!this.epoch){this.scoreEpoch.fill(0);this.closed.fill(0);this.epoch=1;}
  this.busy=true;this.queries++;return this;
 }
 end(){this.busy=false;}
 snapshot(){return {capacity:this.capacity,bytes:this.capacity*20,queries:this.queries,bufferAllocations:this.bufferAllocations,allocatedBytes:this.allocatedBytes,scope:'CPU A* search scratch buffers; excludes nodes, edges, heap and routes'};}
}
