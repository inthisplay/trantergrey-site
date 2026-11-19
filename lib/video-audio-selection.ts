type AudioTrackInfo={codec:string|null;internalCodec:string|number|Uint8Array|null;start:number;duration:number;language:string};
// iPhone spatial recordings can include an APAC track plus a compatible AAC rendition.
// Only omit APAC when a same-language AAC track covers the same timeline.
export function spatialAudioFallbacks(tracks:AudioTrackInfo[]):Set<number>{
 const omitted=new Set<number>();
 tracks.forEach((track,index)=>{
  if(track.internalCodec!=='apac')return;
  const fallback=tracks.some(other=>other.codec==='aac'&&other.language===track.language&&
   Number.isFinite(track.start)&&Number.isFinite(other.start)&&Number.isFinite(track.duration)&&Number.isFinite(other.duration)&&
   Math.abs(track.start-other.start)<.1&&Math.abs(track.duration-other.duration)<.1);
  if(!fallback)throw new Error('This video uses Apple spatial audio without a matching stereo track. Export a stereo MP4 from Photos or QuickTime and try again.');
  omitted.add(index);
 });
 return omitted;
}
