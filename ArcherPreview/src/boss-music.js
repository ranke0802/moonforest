// Track names are optional manifest entries, never aliases for an existing song.
export const ELENA_MUSIC_KEYS=Object.freeze({saint:'elena_saint',mourning:'elena_mourning'});

export function bossMusicContext(encounters=[]){
  let selected=null;
  for(const enemy of encounters??[]){
    if(!enemy?.active||!(enemy.brain?.hp>0)||enemy.reviewMode)continue;
    if(enemy.kind==='elena'){
      if(!enemy.engaged)continue;
      if(enemy.phase===2)return ELENA_MUSIC_KEYS.mourning;
      if(enemy.phase===1)selected=ELENA_MUSIC_KEYS.saint;
      else selected??='boss';
    }else if(enemy.kind!=='goblin')selected??='boss';
  }
  return selected;
}

export function availableBossMusic(key,definitions={},failed=new Set()){
  return key&&definitions[key]?.url&&!failed.has('music:'+key)?key:'boss';
}
