import {compressVideoCore} from '../../lib/compress-video-core';
const worker=self as unknown as {onmessage:((event:MessageEvent<{file:File}>)=>void)|null;postMessage:(value:unknown)=>void};
worker.onmessage=async({data})=>{
 try{const file=await compressVideoCore(data.file,progress=>worker.postMessage({type:'progress',progress}));worker.postMessage({type:'complete',file});}
 catch(error){worker.postMessage({type:'error',message:error instanceof Error?error.message:'Video compression failed. Export a smaller MP4 or use Mux.'});}
};
