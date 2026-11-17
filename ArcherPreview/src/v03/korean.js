// Korean particle by final consonant: particle('여관 주인','과','와') → '여관 주인과'.
export function particle(word,withFinal,withoutFinal){
 const code=word.charCodeAt(word.length-1)-0xac00;
 return word+(code>=0&&code<=11171&&code%28?withFinal:withoutFinal);
}
