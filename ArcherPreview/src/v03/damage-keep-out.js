// Hit numbers keep out of the HUD corners (2026-11-27 player review, 844×390: health,
// stamina, the quest and the hit numbers piled up on the left in a fight; numbers also
// sat on the boss bar's name). damage-numbers.js hands each number's screen spot here
// before it is written; a spot inside a HUD box moves out of it, away from the screen edge
// the box sits on (a top-middle box: down).
//
// Cost: the boxes are measured only when one of the HUD pieces changes size or shows
// or hides (ResizeObserver) and on a window resize, never in the frame. place() does
// arithmetic over at most BOXES boxes. A piece not on the page yet is looked up again
// at most every RESCAN_SECONDS (querySelector, no layout read).
// Lifetime: one per document, as long as the page (the damage numbers live as long).
// It holds at most one element per selector and lets go of one that left the page.
const SELECTORS=Object.freeze(['#player-hud','#gold-balance','.v03-quest','#boss-hud','#dot-minimap','.top-actions']);
// A number is drawn above its spot (translate(-50%,-100%)): about this tall and half this wide.
const TALL=30,HALF=22,GAP=4,RESCAN_SECONDS=2;
const instances=new WeakMap();

export function damageKeepOut(doc=globalThis.document){
 if(!doc)return null;
 let made=instances.get(doc);if(!made){made=createDamageKeepOut({doc});instances.set(doc,made);}
 return made;
}

export function createDamageKeepOut({doc,selectors=SELECTORS,now=()=>globalThis.performance?.now?.()??Date.now()}){
 const win=doc.defaultView,nodes=new Array(selectors.length).fill(null);
 // left, top, right, bottom per box; count: boxes in use.
 const boxes=new Float64Array(selectors.length*4),sides=new Int8Array(selectors.length);let count=0,missing=true,lastScan=-Infinity,disposed=false;
 const Observer=win?.ResizeObserver;
 const observer=Observer?new Observer(()=>measure()):null;
 function scan(){
  missing=false;lastScan=now();
  for(let i=0;i<selectors.length;i++){
   const old=nodes[i];if(old&&old.isConnected)continue;
   if(old)observer?.unobserve(old);
   const node=doc.querySelector(selectors[i]);nodes[i]=node;
   if(node)observer?.observe(node);else missing=true;
  }
 }
 function measure(){
  if(disposed)return;count=0;const width=win?.innerWidth||1;
  for(let i=0;i<nodes.length;i++){
   const node=nodes[i];if(!node||!node.isConnected||node.hidden){if(node&&!node.isConnected)missing=true;continue;}
   // A boss bar that follows its foe in the world moves every frame: only the fixed one is a corner.
   if(node.id==='boss-hud'&&node.dataset?.hud!=='fixed')continue;
   const box=node.getBoundingClientRect?.();if(!box||box.width<=0||box.height<=0)continue;
   const at=count*4;boxes[at]=box.left;boxes[at+1]=box.top;boxes[at+2]=box.right;boxes[at+3]=box.bottom;
   const middle=(box.left+box.right)/2;sides[count]=middle<width*.35?-1:middle>width*.65?1:0;count++;
  }
 }
 const onResize=()=>measure();
 win?.addEventListener?.('resize',onResize);
 scan();if(!observer)measure();
 function inside(spot,at){
  return spot.x>boxes[at]-HALF&&spot.x<boxes[at+2]+HALF&&spot.y>boxes[at+1]&&spot.y<boxes[at+3]+TALL;
 }
 return {
  // spot: {x,y} in CSS pixels, the number's bottom centre; moved in place. Frame path: no allocation.
  place(spot){
   if(disposed)return spot;
   if(missing&&now()-lastScan>RESCAN_SECONDS*1000){scan();}
   // Two passes: a spot pushed out of one box can land in its neighbour (health above the quest).
   for(let pass=0;pass<2;pass++){
    let moved=false;
    for(let i=0;i<count;i++){
     const at=i*4;if(!inside(spot,at))continue;
     // The side a box sits on says the way out: a left corner pushes right, a right one
     // left, a top-middle one (the boss bar) down.
     const side=sides[i];
     if(side<0)spot.x=boxes[at+2]+HALF+GAP;else if(side>0)spot.x=boxes[at]-HALF-GAP;else spot.y=boxes[at+3]+TALL+GAP;
     moved=true;
    }
    if(!moved)break;
   }
   // Not above the top edge (a number over a foe at the top of the view stays readable).
   if(spot.y<TALL+8)spot.y=TALL+8;
   return spot;
  },
  get boxes(){return count;},
  refresh(){scan();measure();},
  dispose(){
   if(disposed)return;disposed=true;observer?.disconnect();win?.removeEventListener?.('resize',onResize);
   nodes.fill(null);count=0;
  },
 };
}
