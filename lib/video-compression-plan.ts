export const COMPRESSION_TARGET_BYTES = 78 * 1024 * 1024;
export function compressionPlan(duration:number,width:number,height:number,audioBitrate=128_000) {
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(width)||!Number.isFinite(height)||width<2||height<2)throw new Error('This video has unreadable duration or dimensions. Export an MP4 copy and try again.');
 if(!Number.isFinite(audioBitrate)||audioBitrate<0)throw new Error('This video has unreadable audio metadata. Export an MP4 copy and try again.');
 const bitrate=Math.floor(Math.min(2_500_000,COMPRESSION_TARGET_BYTES*8/duration-audioBitrate));
 if(bitrate<400_000)throw new Error('This video is too long to fit the upload limit at usable quality. Use Mux or export a shorter copy.');
 const scale=Math.min(1,1280/Math.max(width,height),720/Math.min(width,height));
 return {width:Math.max(2,Math.floor(width*scale/2)*2),height:Math.max(2,Math.floor(height*scale/2)*2),bitrate};
}
