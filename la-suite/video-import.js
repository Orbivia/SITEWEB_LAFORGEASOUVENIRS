/* Local, bounded video conversion. No upload, microphone or external dependency. */
(() => {
 'use strict';
 let active = null;
 const INPUT_LIMIT = 500 * 1024 * 1024, OUTPUT_LIMIT = 50 * 1024 * 1024;
 const unsupported = () => new Error('Ce navigateur ne peut pas convertir cette vidéo. Ouvrez la page dans Chrome ou Safari, ou choisissez une autre vidéo.');
 const cancelled = () => new DOMException('Préparation annulée. Choisissez à nouveau votre vidéo.', 'AbortError');
 function cancel() { active?.abort(); }
 function fit(width, height) {
  if (!(width > 0 && height > 0)) throw unsupported();
  const ratio = Math.min(1, 1280 / Math.max(width, height), 720 / Math.min(width, height));
  return { width: Math.max(2, Math.floor(width * ratio / 2) * 2), height: Math.max(2, Math.floor(height * ratio / 2) * 2) };
 }
 // MediaRecorder writes live WebM with no Duration. Finalize its small Info header
 // without copying the video payload, so mobile players can seek and display time.
 async function finalizeWebm(file, seconds) {
  if (file.type !== 'video/webm') return file;
  const bytes = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
  function element(offset) {
   const first = bytes[offset]; if (!first) return null;
   let idLength = 1; while (idLength <= 4 && !(first & (1 << (8 - idLength)))) idLength++;
   if (idLength > 4 || offset + idLength >= bytes.length) return null;
   let id = 0; for (let i = 0; i < idLength; i++) id = id * 256 + bytes[offset + i];
   const sizePos = offset + idLength, lead = bytes[sizePos]; if (!lead) return null;
   let width = 1; while (width <= 8 && !(lead & (1 << (8 - width)))) width++;
   if (width > 8 || sizePos + width > bytes.length) return null;
   let size = lead & ((1 << (8 - width)) - 1), unknown = size === ((1 << (8 - width)) - 1);
   for (let i = 1; i < width; i++) { size = size * 256 + bytes[sizePos + i]; unknown = unknown && bytes[sizePos + i] === 255; }
   const start = sizePos + width;
   return { id, sizePos, width, size, start, end: start + size, unknown };
  }
  const ebml = element(0); if (ebml?.id !== 0x1a45dfa3) return file;
  const segment = element(ebml.end); if (segment?.id !== 0x18538067 || !segment.unknown) return file;
  const info = element(segment.start);
  if (info?.id !== 0x1549a966 || info.unknown || info.end > bytes.length) return file;
  let scale = 1000000;
  for (let pos = info.start; pos < info.end;) {
   const child = element(pos); if (!child || child.unknown || child.end > info.end) return file;
   if (child.id === 0x4489) return file;
   if (child.id === 0x2ad7b1) { scale = 0; for (let p = child.start; p < child.end; p++) scale = scale * 256 + bytes[p]; }
   pos = child.end;
  }
  if (!(scale > 0 && Number.isFinite(seconds) && seconds > 0)) return file;
  const duration = new Uint8Array(11); duration.set([0x44, 0x89, 0x88]);
  new DataView(duration.buffer).setFloat64(3, seconds * 1e9 / scale, false);
  let size = info.size + duration.length;
  if (size >= 2 ** (7 * info.width) - 1) return file;
  const encodedSize = new Uint8Array(info.width);
  for (let p = info.width - 1; p >= 0; p--) { encodedSize[p] = size % 256; size = Math.floor(size / 256); }
  encodedSize[0] |= 1 << (8 - info.width);
  return new File([bytes.slice(0, info.sizePos), encodedSize, bytes.slice(info.start, info.end), duration, file.slice(info.end)], file.name, { type: file.type });
 }
 async function prepare(file, onProgress = () => {}, onPlaybackBlocked) {
  cancel();
  if (!file?.size || file.size > INPUT_LIMIT) throw new Error('Choisissez une vidéo de 500 Mo maximum.');
  const controller = new AbortController(), signal = controller.signal;
  active = controller;
  const video = document.createElement('video'), canvas = document.createElement('canvas');
  const Audio = window.AudioContext || window.webkitAudioContext;
  let context, source, destination, stream, recorder, url, frame, videoFrame, timer, bytes = 0, paintedFrames = 0, poster = '';
  const listeners = [];
  const listen = (target, event, handler) => { target.addEventListener(event, handler); listeners.push(() => target.removeEventListener(event, handler)); };
  const check = () => { if (signal.aborted) throw cancelled(); };
  const waitFor = (event, timeout = 15000) => new Promise((resolve, reject) => {
   let clock;
   const finish = error => { clearTimeout(clock); video.removeEventListener(event, success); video.removeEventListener('error', failure); signal.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
   const success = () => finish(), failure = () => finish(unsupported()), abort = () => finish(cancelled());
   video.addEventListener(event, success, { once: true }); video.addEventListener('error', failure, { once: true }); signal.addEventListener('abort', abort, { once: true });
   clock = setTimeout(() => finish(new Error('La vidéo ne peut pas être lue sur ce téléphone. Essayez une autre vidéo ou un autre navigateur.')), timeout);
   if (signal.aborted) abort();
  });
  try {
   if (!window.MediaRecorder || !canvas.captureStream || !Audio) throw unsupported();
   // Start audio while still in the file-selection gesture. Sound goes only to the encoded file.
   context = new Audio();
   const resumed = context.resume();
   // Handle an early rejection even while metadata is loading.
   resumed.catch(() => {});
   video.playsInline = true; video.preload = 'auto'; video.loop = false;
   // Keep the source in the visible dialog: offscreen video may be throttled on mobile.
   video.setAttribute('aria-hidden', 'true');
   video.className = 'guest-conversion-video';
   video.style.cssText = 'display:block;width:100%;height:160px;max-height:25dvh;object-fit:contain;background:#141414;border-radius:12px;flex:none';
   (document.querySelector('.guest-capture-dialog[open] .guest-media-dialog-body') || document.body).append(video);
   url = URL.createObjectURL(file);
   onProgress(0);
   const metadata = waitFor('loadedmetadata'); video.src = url; await metadata; check();
   if (!Number.isFinite(video.duration) || video.duration <= 0) throw unsupported();
   if (video.duration > 60.1) throw new Error('Choisissez une vidéo d’une minute maximum.');
   const size = fit(video.videoWidth, video.videoHeight);
   canvas.width = size.width; canvas.height = size.height;
   if (video.readyState < 2) await waitFor('loadeddata');
   check();
   // A suspended audio graph must never produce a silently muted souvenir.
   // If autoplay is blocked, resume both audio and video from a real button click.
   if (context.state !== 'running' && !onPlaybackBlocked) throw unsupported();
   source = context.createMediaElementSource(video);
   destination = context.createMediaStreamDestination(); source.connect(destination);
   const ctx = canvas.getContext('2d', { alpha: false });
   if (!ctx) throw unsupported();
   ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
   stream = canvas.captureStream(30);
   for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
   const mime = ['video/webm;codecs=vp8,opus', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
   if (!mime) throw unsupported();
   recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1500000, audioBitsPerSecond: 64000 });
   const chunks = [];
   const encoded = new Promise((resolve, reject) => {
    let done = false, watchdog;
    const finish = error => {
     if (done) return; done = true; clearTimeout(watchdog);
     signal.removeEventListener('abort', abort);
     if (error) { reject(error); if (recorder.state !== 'inactive') recorder.stop(); }
     else resolve();
    };
    const abort = () => finish(cancelled());
    signal.addEventListener('abort', abort, { once: true });
    listen(recorder, 'dataavailable', event => {
     if (done || !event.data.size) return;
     bytes += event.data.size;
     if (bytes > OUTPUT_LIMIT) finish(new Error('Cette vidéo reste trop volumineuse après conversion. Choisissez une vidéo plus courte.'));
     else chunks.push(event.data);
    });
    listen(recorder, 'error', () => finish(unsupported()));
    listen(recorder, 'stop', () => finish());
    listen(video, 'error', () => finish(unsupported()));
    listen(video, 'ended', () => { if (recorder.state !== 'inactive') recorder.stop(); });
    listen(document, 'visibilitychange', () => { if (document.hidden) controller.abort(); });
    watchdog = setTimeout(() => finish(new Error('La conversion a été interrompue. Gardez cette page ouverte et réessayez.')), Math.max(30000, video.duration * 1000 + 30000));
    let lastProgress = -1;
    const draw = () => {
     if (done || signal.aborted) return;
     try {
      if (video.readyState >= 2) {
       ctx.drawImage(video, 0, 0, canvas.width, canvas.height); paintedFrames++;
       stream.getVideoTracks()[0]?.requestFrame?.();
       if (!poster && video.currentTime > 0 && canvas.toDataURL) poster = canvas.toDataURL('image/jpeg', 0.82);
      }
      const progress = Math.min(99, Math.floor(video.currentTime / video.duration * 100));
      if (progress !== lastProgress) { lastProgress = progress; onProgress(progress); }
     }
     catch { finish(unsupported()); return; }
     if (video.requestVideoFrameCallback) videoFrame = video.requestVideoFrameCallback(draw);
     else frame = requestAnimationFrame(draw);
    };
    let prompted = false, starting = false;
    const startPlayback = () => {
     if (done || signal.aborted || starting) return;
     starting = true;
     // Invoke both calls synchronously so a retry retains user activation.
     const audioReady = context.resume(), playing = video.play();
     Promise.race([Promise.all([audioReady, playing]), new Promise((_, reject) => {
      timer = setTimeout(() => reject(unsupported()), 5000);
     })]).then(() => {
      clearTimeout(timer); starting = false;
      if (done || signal.aborted) return;
      if (context.state !== 'running') throw unsupported();
      recorder.start(500); draw();
     }).catch(error => {
      clearTimeout(timer); starting = false; video.pause();
      if (done || signal.aborted) return;
      if (!prompted && onPlaybackBlocked && (error.name === 'NotAllowedError' || context.state !== 'running')) {
       prompted = true; onPlaybackBlocked(startPlayback);
      } else finish(unsupported());
     });
    };
    try { startPlayback(); } catch { finish(unsupported()); }
   });
   await encoded; check();
   if (!paintedFrames) throw new Error('Les images de cette vidéo ne peuvent pas être converties sur ce navigateur. Essayez une autre vidéo ou un autre navigateur.');
   if (video.currentTime < video.duration - 0.25) throw new Error('La conversion est incomplète. Réessayez en gardant la page ouverte.');
   const type = recorder.mimeType.split(';')[0];
   const output = await finalizeWebm(new File(chunks, 'souvenir.' + (type === 'video/mp4' ? 'mp4' : 'webm'), { type }), video.duration);
   check();
   if (!output.size || output.size > OUTPUT_LIMIT) throw unsupported();
   onProgress(100);
   return { file: output, duration: video.duration, poster };
  } finally {
   clearTimeout(timer); cancelAnimationFrame(frame);
   if (videoFrame !== undefined) video.cancelVideoFrameCallback?.(videoFrame);
   for (const remove of listeners) remove();
   if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch {} }
   video.pause(); video.removeAttribute('src'); video.load(); video.remove();
   for (const track of stream?.getTracks() || []) track.stop();
   for (const track of destination?.stream.getTracks() || []) track.stop();
   source?.disconnect(); destination?.disconnect();
   if (context) { try { await context.close(); } catch {} }
   if (url) URL.revokeObjectURL(url);
   canvas.width = canvas.height = 0;
   if (active === controller) active = null;
  }
 }
 window.SuiteVideoImport = Object.freeze({ prepare, cancel, fit, inputLimit: INPUT_LIMIT });
})();
