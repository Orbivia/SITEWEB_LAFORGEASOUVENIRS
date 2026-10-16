/* Single-threaded FFmpeg: works without cross-origin isolation, including Firefox. */
'use strict';
self.onmessage = async ({data}) => {
 try {
  importScripts('vendor/ffmpeg-core-0.12.10/ffmpeg-core.js');
  const coreURL = new URL('vendor/ffmpeg-core-0.12.10/ffmpeg-core.js', self.location.href).href;
  // Two bounded streams fill the destination directly, without retaining whole part copies.
  // Versioned static assets may be reused from the browser cache on subsequent imports.
  const sizes=[8388576,8388576,8388576,7066691],wasmBinary=new Uint8Array(32232419);
  let loaded=0,lastLoadingPercent=-1,codecCache=null;
  try{codecCache=await self.caches?.open('la-suite-video-codec-0.12.10');}catch{/* Private browsing or storage restrictions: use ordinary HTTP caching. */}
  const reportLoading=bytes=>{loaded+=bytes;const percent=Math.floor(loaded/wasmBinary.length*100);if(percent!==lastLoadingPercent){lastLoadingPercent=percent;self.postMessage({phase:'loading',progress:percent/100});}};
  async function loadPart(index){
   const url=new URL('vendor/ffmpeg-core-0.12.10/ffmpeg-core.wasm.part'+(index+1),self.location.href).href;
   let response;try{response=await codecCache?.match(url);}catch{}
   const cached=Boolean(response);response=response||await fetch(url,{cache:'force-cache'});
   if(!response.ok)throw new Error('Impossible de charger la compression. Vérifiez votre connexion et réessayez.');
   const cacheWrite=!cached&&codecCache?codecCache.put(url,response.clone()).catch(()=>{}):Promise.resolve();
   const start=sizes.slice(0,index).reduce((sum,size)=>sum+size,0);let count=0;
   const append=bytes=>{if(count+bytes.length>sizes[index])throw new Error('Chargement incorrect. Rechargez la page et réessayez.');wasmBinary.set(bytes,start+count);count+=bytes.length;reportLoading(bytes.length);};
   try{
   if(response.body?.getReader){
    const reader=response.body.getReader();try{while(true){const {done,value}=await reader.read();if(done)break;append(value);}}finally{reader.releaseLock();}
   }else append(new Uint8Array(await response.arrayBuffer()));
   if(count!==sizes[index])throw new Error('Chargement incomplet. Rechargez la page et réessayez.');
   await cacheWrite;
   }catch(error){await cacheWrite;try{await codecCache?.delete(url);}catch{}throw error;}
  }
  for(let index=0;index<sizes.length;index+=2)await Promise.all([loadPart(index),loadPart(index+1)]);
  const ffmpeg = await createFFmpegCore({wasmBinary, mainScriptUrlOrBlob: coreURL + '#' + btoa(JSON.stringify({wasmURL: coreURL + '.wasm'}))});
  let duration = 0;
  ffmpeg.setLogger(({message}) => {
   const match = /Duration: (\d+):(\d+):([\d.]+)/.exec(message);
   if (match) duration = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  });
  ffmpeg.FS.writeFile('input.bin', new Uint8Array(data.buffer));
  data.buffer=null;
  ffmpeg.exec('-i', 'input.bin');
  if (!(duration > 0)) throw new Error('Ce fichier vidéo ne peut pas être lu. Choisissez une autre vidéo.');
  if (duration > 60.1) throw new Error('Choisissez une vidéo d’une minute maximum.');
  ffmpeg.setProgress(({time}) => self.postMessage({progress: Math.min(.99, time / (duration * 1000000))}));
  self.postMessage({progress: .01});
  const filter = "scale=w='if(gte(iw,ih),min(1280,iw),min(720,iw))':h='if(gte(iw,ih),min(720,ih),min(1280,ih))':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,fps=30";
  const code = ffmpeg.exec('-i','input.bin','-map','0:v:0','-map','0:a:0?','-vf',filter,'-c:v','libx264','-preset','ultrafast','-crf','26','-maxrate','1800k','-bufsize','3600k','-pix_fmt','yuv420p','-c:a','aac','-b:a','96000','-ac','2','-movflags','+faststart','-map_metadata','-1','-y','output.mp4');
  if (code) throw new Error('La compression a échoué. Choisissez une vidéo plus légère ou un autre format.');
  ffmpeg.setProgress(() => {});
  let poster = '';
  if (!ffmpeg.exec('-i','output.mp4','-ss',String(Math.min(.2, duration / 2)),'-frames:v','1','-vf','scale=480:-2','-y','poster.jpg')) {
   const bytes = ffmpeg.FS.readFile('poster.jpg');
   let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
   poster = 'data:image/jpeg;base64,' + btoa(binary);
  }
  const output = ffmpeg.FS.readFile('output.mp4');
  self.postMessage({buffer: output.buffer, duration, poster}, [output.buffer]);
 } catch (error) {
  self.postMessage({error: /memory|alloc/i.test(error.message) ? 'Ce téléphone manque de mémoire. Choisissez une vidéo plus courte ou plus légère.' : error.message || 'Impossible de compresser cette vidéo.'});
 }
};
