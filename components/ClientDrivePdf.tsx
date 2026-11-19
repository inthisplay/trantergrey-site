'use client';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import styles from './ClientHQ.module.css';

export function ClientDrivePdf({url}:{url:string}) {
 const [document,setDocument]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[error,setError]=useState(''),[loading,setLoading]=useState(true),[width,setWidth]=useState(300);
 const wrap=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{let active=true;let task:ReturnType<typeof import('pdfjs-dist')['getDocument']>|undefined;
  setLoading(true);setError('');setPage(1);setDocument(null);
  void import('pdfjs-dist').then(pdf=>{
   if(!active)return;
   pdf.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString();
   const assets=`/vendor/pdfjs/${pdf.version}/`;
   task=pdf.getDocument({url,cMapUrl:`${assets}cmaps/`,cMapPacked:true,standardFontDataUrl:`${assets}standard_fonts/`,wasmUrl:`${assets}wasm/`});
   return task.promise.then(doc=>{if(active){setDocument(doc);setLoading(false);}});
  }).catch(()=>{if(active){setError('Unable to preview this PDF. Try downloading it below.');setLoading(false);}});
  return()=>{active=false;void task?.destroy();};
 },[url]);
 useEffect(()=>{if(!wrap.current)return;const observer=new ResizeObserver(([entry])=>setWidth(entry.contentRect.width));observer.observe(wrap.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  if(!document||!canvas.current)return;let active=true;let render:ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>|undefined;
  void document.getPage(page).then(pdfPage=>{
   if(!active||!canvas.current)return;
   const viewport=pdfPage.getViewport({scale:1});const scale=Math.min(2,window.devicePixelRatio||1);const fitted=pdfPage.getViewport({scale:Math.max(1,width)/viewport.width*scale});
   canvas.current.width=fitted.width;canvas.current.height=fitted.height;canvas.current.style.width='100%';canvas.current.style.height='auto';
   render=pdfPage.render({canvas:canvas.current,viewport:fitted});return render.promise;
  }).catch(e=>{if(active&&e.name!=='RenderingCancelledException')setError('This PDF page could not be displayed. Try downloading it below.');});
  return()=>{active=false;render?.cancel();};
 },[document,page,width]);
 return <div ref={wrap} className={styles.drivePdf}>{loading&&<p role="status">Loading PDF…</p>}{error&&<p role="alert">{error}</p>}{document&&<><div className={styles.drivePdfPages}><button disabled={page<=1} onClick={()=>setPage(p=>p-1)} aria-label="Previous PDF page">‹</button><span>Page {page} of {document.numPages}</span><button disabled={page>=document.numPages} onClick={()=>setPage(p=>p+1)} aria-label="Next PDF page">›</button></div><canvas ref={canvas} role="img" aria-label={`PDF page ${page} of ${document.numPages}`}/></>}</div>;
}
