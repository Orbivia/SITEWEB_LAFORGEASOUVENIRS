/* Single-threaded FFmpeg: works without cross-origin isolation, including Firefox. */
'use strict';
self.onmessage = async ({data}) => {
 try {
  importScripts('vendor/ffmpeg-core-0.12.10/ffmpeg-core.js');
  const coreURL = new URL('vendor/ffmpeg-core-0.12.10/ffmpeg-core.js', self.location.href).href;
  // Split static assets keep repository uploads small; the browser assembles the codec locally.
  const wasmBinary = new Uint8Array(32232419);
  let offset = 0;
  for (let part = 1; part <= 4; part++) {
   const response = await fetch(new URL('vendor/ffmpeg-core-0.12.10/ffmpeg-core.wasm.part' + part, self.location.href));
   if (!response.ok) throw new Error('Impossible de charger la compression. Vérifiez votre connexion et réessayez.');
   const bytes = new Uint8Array(await response.arrayBuffer()); wasmBinary.set(bytes, offset); offset += bytes.length;
  }
  if (offset !== wasmBinary.length) throw new Error('Chargement incomplet. Rechargez la page et réessayez.');
  const ffmpeg = await createFFmpegCore({wasmBinary, mainScriptUrlOrBlob: coreURL + '#' + btoa(JSON.stringify({wasmURL: coreURL + '.wasm'}))});
  let duration = 0;
  ffmpeg.setLogger(({message}) => {
   const match = /Duration: (\d+):(\d+):([\d.]+)/.exec(message);
   if (match) duration = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  });
  ffmpeg.FS.writeFile('input.bin', new Uint8Array(data.buffer));
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
