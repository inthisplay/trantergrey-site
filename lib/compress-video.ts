export function compressVideo(file:File,onProgress:(progress:number)=>void,signal?:AbortSignal):Promise<File> {
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('../workers/browser/video-compressor.ts',import.meta.url),{type:'module'});
  let done=false;let idle:ReturnType<typeof setTimeout>;let total:ReturnType<typeof setTimeout>;
  const finish=(error?:Error,result?:File)=>{if(done)return;done=true;clearTimeout(idle);clearTimeout(total);signal?.removeEventListener('abort',cancel);worker.terminate();if(error)reject(error);else resolve(result!);};
  const cancel=()=>finish(new Error('Compression canceled. Your original file is unchanged.'));
  const watchdog=()=>{clearTimeout(idle);idle=setTimeout(()=>finish(new Error('Video compression stopped making progress. Keep this tab open and try again, or export a smaller MP4.')),120_000);};
  worker.onmessage=({data})=>{if(data.type==='progress'){watchdog();onProgress(data.progress);}else if(data.type==='complete')finish(undefined,data.file);else if(data.type==='error')finish(new Error(data.message));};
  worker.onerror=()=>finish(new Error('This browser could not compress the video. Try an updated browser, export a smaller MP4, or use Mux.'));
  worker.onmessageerror=()=>finish(new Error('The compressed file could not be returned by the browser. Export a smaller MP4 or use Mux.'));
  if(signal?.aborted){cancel();return;}signal?.addEventListener('abort',cancel,{once:true});
  watchdog();total=setTimeout(()=>finish(new Error('Video compression exceeded 20 minutes. Export a smaller MP4 or use Mux.')),20*60*1000);
  worker.postMessage({file});
 });
}
