/* Local video compression. Worker and codec are served from this site; no media upload. */
(() => {
 'use strict';
 const INPUT_LIMIT = 100 * 1024 * 1024;
 const scriptURL = document.currentScript.src;
 let active = null;
 const cancelled = () => new DOMException('Préparation annulée.', 'AbortError');
 function cancel() { active?.abort(); }
 function fit(width, height) {
  const ratio = Math.min(1, 1280 / Math.max(width, height), 720 / Math.min(width, height));
  return {width: Math.max(2, Math.floor(width * ratio / 2) * 2), height: Math.max(2, Math.floor(height * ratio / 2) * 2)};
 }
 async function prepare(file, onProgress = () => {}) {
  cancel();
  if (!file?.size || file.size > INPUT_LIMIT) throw new Error('Choisissez une vidéo de 100 Mo maximum.');
  const controller = new AbortController(); active = controller;
  let worker, timeout, wakeLock, lastProgress = -1, lastPhase = null;
  const preventLeave = event => { event.preventDefault(); event.returnValue = ''; };
  window.addEventListener('beforeunload', preventLeave);
  try {
   onProgress(0, 'loading');
   navigator.wakeLock?.request('screen').then(lock => { if (controller.signal.aborted || active !== controller) lock.release().catch(() => {}); else wakeLock = lock; }).catch(() => {});
   const buffer = await file.arrayBuffer();
   if (controller.signal.aborted) throw cancelled();
   return await new Promise((resolve, reject) => {
    const fail = message => reject(new Error(message));
    controller.signal.addEventListener('abort', () => reject(cancelled()), {once: true});
    worker = new Worker(new URL('video-convert.worker.js?v=20261016-guest-opt1', scriptURL));
    timeout = setTimeout(() => fail('La compression prend trop de temps. Choisissez une vidéo plus courte ou plus légère.'), 15 * 60 * 1000);
    worker.onerror = () => fail('Impossible de préparer cette vidéo sur cet appareil. Essayez un fichier plus léger.');
    worker.onmessage = ({data}) => {
     if (data.error) return fail(data.error);
     if (data.progress !== undefined) {
      const phase=data.phase==='loading'?'loading':'encode';
      if(phase!==lastPhase){lastPhase=phase;lastProgress=-1;}
      const percent=Math.max(lastProgress,Math.max(0,Math.min(phase==='loading'?100:99,Math.round(data.progress*100))));
      if(percent!==lastProgress){lastProgress=percent;onProgress(percent,phase);}
     }
     if (data.buffer) {
      const output = new File([data.buffer], 'souvenir.mp4', {type: 'video/mp4'});
      if (!output.size || output.size > 50 * 1024 * 1024) return fail('La vidéo compressée dépasse la taille autorisée. Choisissez une vidéo plus courte.');
      onProgress(100,'encode');
      resolve({file: output, duration: data.duration, poster: data.poster});
     }
    };
    worker.postMessage({buffer}, [buffer]);
   });
  } finally {
   clearTimeout(timeout); worker?.terminate();
   wakeLock?.release().catch(() => {});
   window.removeEventListener('beforeunload', preventLeave);
   if (active === controller) active = null;
  }
 }
 window.SuiteVideoImport = Object.freeze({prepare, cancel, fit, inputLimit: INPUT_LIMIT});
})();
