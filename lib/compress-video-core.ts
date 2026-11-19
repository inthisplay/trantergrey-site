import {Input,BlobSource,MP4,QTFF,WEBM,Output,Mp4OutputFormat,BufferTarget,Conversion,Quality} from 'mediabunny';
import {compressionPlan} from './video-compression-plan';
import {MAX_UPLOAD_BYTES} from './rolodex-upload';

export async function compressVideoCore(file:File,onProgress:(progress:number)=>void):Promise<File> {
 if(typeof VideoEncoder==='undefined'||typeof VideoDecoder==='undefined')throw new Error('This browser cannot compress videos. Try an updated Chrome, Edge, or Safari, or export an MP4 under 90 MB.');
 if(file.size>2*1024*1024*1024)throw new Error('This video is too large for browser compression. Use Mux or export a smaller MP4.');
 const input=new Input({source:new BlobSource(file),formats:[MP4,QTFF,WEBM]});
 try {
  const videos=await input.getVideoTracks(),audio=await input.getAudioTracks();
  if(videos.length!==1||audio.length>4)throw new Error('This video has an unsupported track layout. Export a standard MP4 with its audition audio and try again.');
  const video=videos[0],duration=await input.computeDuration();
  let audioBitrate=0;
  for(const track of audio){audioBitrate+=await track.getCodec()==='aac'?Math.max(128_000,(await track.computePacketStats(100)).averageBitrate*1.25):128_000;}
  const plan=compressionPlan(duration,video.displayWidth,video.displayHeight,audioBitrate);
  const target=new BufferTarget(),output=new Output({format:new Mp4OutputFormat(),target});
  const conversion=await Conversion.init({input,output,
   video:{codec:'avc',width:plan.width,height:plan.height,fit:'contain',quality:new Quality({bitrate:plan.bitrate,bitrateMode:'variable'}),forceTranscode:true},
   audio:async track=>(await track.getCodec())==='aac'?{codec:'aac'}:{codec:'aac',quality:new Quality({bitrate:128_000}),forceTranscode:true},
  });
  // Never quietly strip audition audio or another unsupported source track.
  if(!conversion.isValid||conversion.discardedTracks.length)throw new Error('This browser cannot convert this video while preserving its tracks and audio. Export an H.264 MP4 under 90 MB, or use Mux.');
  let tooLarge=false;
  const stop=target.on('write',({end})=>{if(end>MAX_UPLOAD_BYTES&&!tooLarge){tooLarge=true;void conversion.cancel();}});
  conversion.onProgress=value=>onProgress(Math.min(.99,value));
  try {await conversion.execute();}catch(error){if(tooLarge)throw new Error('The compressed copy still exceeds 90 MB. Use Mux or export a shorter or smaller MP4.');throw error;}finally{stop();}
  if(tooLarge)throw new Error('The compressed copy still exceeds 90 MB. Use Mux or export a smaller MP4.');
  if(!target.buffer?.byteLength||target.buffer.byteLength>MAX_UPLOAD_BYTES)throw new Error('The compressed copy could not fit under 90 MB. Use Mux or export a smaller MP4.');
  const result=new File([target.buffer],file.name.replace(/\.[^.]+$/,'')+'-compressed.mp4',{type:'video/mp4'});
  const check=new Input({source:new BlobSource(result),formats:[MP4]});
  try {
   const outputVideo=await check.getVideoTracks(),outputAudio=await check.getAudioTracks(),outputDuration=await check.computeDuration();
   if(outputVideo.length!==videos.length||outputAudio.length!==audio.length||!Number.isFinite(outputDuration)||Math.abs(outputDuration-duration)>Math.max(1,duration*.01))throw new Error('The compressed copy did not pass the duration/audio check. Nothing was uploaded. Use Mux or export a smaller MP4.');
  }finally{check.dispose();}
  onProgress(1);return result;
 }finally{input.dispose();}
}
