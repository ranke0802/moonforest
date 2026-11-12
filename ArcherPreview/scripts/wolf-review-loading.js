// Standalone review uses ordinary decoded PNG/JPEG; no external decoder needed.
export function bytes64(s){const b=atob(s.trim()),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a;}
export function embeddedGlbData(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),length=view.getUint32(12,true),start=28+length,size=view.getUint32(20+length,true);
 if(view.getUint32(0,true)!==0x46546c67||view.getUint32(8,true)!==bytes.length||start+size!==bytes.length)throw Error('내장 모델 데이터 길이가 올바르지 않습니다.');
 return {json:JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+length))),bin:{byteLength:size,readAsync(offset,count){if(offset<0||count<0||offset+count>size)return Promise.reject(Error('내장 모델 범위를 벗어났습니다.'));return Promise.resolve(bytes.subarray(start+offset,start+offset+count));}}};
}
