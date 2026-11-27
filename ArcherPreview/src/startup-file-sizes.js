import mobileExterior from '../public/assets/v03-mobile-village-exterior.json' with {type:'json'};
import player2kSizes from './v03/data/player-mobile2k-sizes.json' with {type:'json'};

export function startupFileSizes(indexFiles,{edition,mobile,usesPlayer2k}){
  if(!edition||!mobile&&!usesPlayer2k)return indexFiles;
  return {...indexFiles,...(mobile?mobileExterior.extraFileSizes:null),...(usesPlayer2k?player2kSizes:null)};
}
