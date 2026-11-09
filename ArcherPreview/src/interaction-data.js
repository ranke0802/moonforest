// Data-only interaction: no scripts or URLs from user-authored files are run.
export function normalizeInteraction(value){
 if(value===undefined||value===null)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['label','text','range'].includes(key)))throw Error('상호작용 설정을 확인하세요.');
 const label=typeof value.label==='string'?value.label.trim():'',text=typeof value.text==='string'?value.text.trim():'',range=value.range??3;
 if(!label||label.length>40||!text||text.length>1200||!Number.isFinite(range)||range<1||range>8)throw Error('상호작용 이름은 1~40자, 내용은 1~1200자, 거리는 1~8로 입력하세요.');
 return {label,text,range};
}
