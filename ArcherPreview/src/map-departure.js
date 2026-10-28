// A portal is a move within one game. Replacing its history entry avoids a
// stack of old worlds. Disk caches survive; the renderer and pending work are
// released before the next page starts. Ordinary tab hiding still only pauses.
export function createMapDeparture({prepare,release,navigate,frame=()=>new Promise(resolve=>requestAnimationFrame(resolve)),onError=()=>{}}){
  let departing=false;
  return {
    get departing(){return departing;},
    async leave(url){
      if(departing)return false;departing=true;
      try{
        prepare();await frame();await frame();
        release();navigate(url);return true;
      }catch(error){onError(error);return false;}
    },
  };
}
