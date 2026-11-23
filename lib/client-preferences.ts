export type ClientPreference = { pinned: boolean; color: string | null; sortOrder?: number | null };

export function clientPinColor(background?: string | null): string {
 if (!background || !/^#[0-9a-f]{6}$/i.test(background)) return '#f5cd38';
 const rgb = [1,3,5].map(offset=>parseInt(background.slice(offset,offset+2),16));
 // Rotate the hue 180 degrees, preserving saturation and lightness.
 const sum = Math.max(...rgb)+Math.min(...rgb);
 const complement = rgb.map(channel=>sum-channel);
 const luminance = (channels:number[])=>channels.map(channel=>{
  const value=channel/255;
  return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
 }).reduce((total,value,index)=>total+value*[.2126,.7152,.0722][index],0);
 const base = luminance(rgb);
 const contrast = (channels:number[])=>{
  const ink=luminance(channels);
  return (Math.max(base,ink)+.05)/(Math.min(base,ink)+.05);
 };
 const hex = (channels:number[])=>'#'+channels.map(value=>value.toString(16).padStart(2,'0')).join('');
 // Keep the complementary hue, adjusting brightness only when needed for visibility.
 for(let step=0;step<=20;step++) {
  for(const target of [0,255]) {
   const candidate=complement.map(channel=>Math.round(channel+(target-channel)*step/20));
   if(contrast(candidate)>=3)return hex(candidate);
  }
 }
 return base>.179?'#000000':'#ffffff';
}

export function compareClientCards(a:{id:string;name:string;archived?:number},b:{id:string;name:string;archived?:number},preferences:Record<string,ClientPreference>) {
 return Number(Boolean(a.archived))-Number(Boolean(b.archived)) ||
  (a.archived?0:Number(Boolean(preferences[b.id]?.pinned))-Number(Boolean(preferences[a.id]?.pinned))) ||
  (preferences[a.id]?.sortOrder??Number.MAX_SAFE_INTEGER)-(preferences[b.id]?.sortOrder??Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name);
}

export function reorderVisibleClients(all:string[],visible:string[],active:string,over:string):string[] {
 const from=visible.indexOf(active),to=visible.indexOf(over);
 if(from<0||to<0||from===to)return all;
 const reordered=[...visible];reordered.splice(to,0,reordered.splice(from,1)[0]);
 const shown=new Set(visible);let index=0;
 return all.map(id=>shown.has(id)?reordered[index++]:id);
}
