const {chromium}=require('playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),artifacts=process.env.QA_SCREENSHOTS||require('node:os').tmpdir();
(async()=>{
 const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname;try{res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(root,name)))}catch(e){res.statusCode=404;res.end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}),context=await browser.newContext({viewport:{width:390,height:844},permissions:['camera','microphone']}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.fulfill({body:'',contentType:'application/javascript'}));
 await context.addInitScript(()=>{
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  window._state={state:'open',effective_plan:'premium',couple_name:'Julie & Thomas',wedding_date:today,opens_at:new Date().toISOString(),closes_at:new Date(Date.now()+86400000).toISOString(),expires_at:new Date(Date.now()+3*365*86400000).toISOString(),delivery_before:new Date(Date.now()+900*86400000).toISOString(),quota_bytes:5000000000,used_bytes:0};
  window._calls=[];window._failUpload=false;window._failText=false;window._failFinalize=false;
  window._recordOffset=0;window._captureStreams=[];window._failPermission=false;window._delayMedia=false;
  const nativeNow=Date.now;Date.now=()=>nativeNow()+window._recordOffset;
  const getMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async constraints=>{if(_failPermission)throw new DOMException("Denied","NotAllowedError");const stream=await getMedia(constraints);window._captureStreams.push(stream);if(_delayMedia)await new Promise(resolve=>window._releaseMedia=resolve);return stream};
  const call=(action,body)=>_calls.push({action,body});
  window.supabase={createClient:()=>({functions:{invoke:async(_,{body})=>{
   call(body.action,body);if(body.action==='get_status')return{data:{..._state}};
   if(body.action==='submit_text')return _failText?{error:{context:{json:async()=>({error:'Connexion interrompue. Réessayez.'})}}}:{data:{ok:true}};
   if(body.action==='init_media')return{data:{path:'capsule/message/media.jpg',token:'signed',message_id:'message'}};
   if(body.action==='finalize_media')return _failFinalize?{data:{error:'Confirmation interrompue. Réessayez.'}}:{data:{ok:true}};
   return{data:{}};
  }}})};
  window.tus={Upload:class{
   constructor(file,options){this.options=options;call('upload_created',{size:file.size,type:file.type,headers:options.headers,chunkSize:options.chunkSize})}
   start(){call('upload_start',{});setTimeout(()=>{this.options.onProgress(50,100);if(_failUpload){_failUpload=false;this.options.onError(new Error('network'))}else this.options.onSuccess()},30)}
  }};
 });
 await page.goto(base+'/capsule.html?t='+'a'.repeat(36));await page.waitForSelector('#guest-message:not([hidden])');
 assert.equal(await page.locator('[data-memory-type]').count(),4);
 assert.equal(await page.locator('#guest_name').getAttribute('required'),null);
 // Real MediaRecorder with Chromium's fake camera/microphone; advance the timer
 // without recording three minutes of audio in CI.
 await page.locator('#capture-memory').click();assert.equal(await page.locator('#photo-file').getAttribute('capture'),'environment');
 await page.locator('[data-memory-type="video"]').click();await page.locator('#capture-memory').click();await page.locator('#prepare-video').click();await page.locator('#start-video').waitFor({state:'visible'});await page.locator('#start-video').click();
 await page.locator('#video-countdown').waitFor({state:'visible'});assert(await page.locator('#video-timer').isHidden());
 await page.locator('#video-timer').waitFor({state:'visible'});assert(await page.locator('#video-countdown').isHidden());
 assert.match(await page.locator('#video-timer .record-remaining').innerText(),/00:5\d|01:00/);
 await page.waitForFunction(()=>document.querySelector('#video-timer .record-elapsed').textContent!=='00:00');
 for(const width of [390,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const badge=await page.locator('#video-timer').boundingBox(),stage=await page.locator('.recorder-stage').boundingBox();assert(badge.height<80&&badge.height<stage.height/2);await page.screenshot({path:path.join(artifacts,'guest-video-recording-'+width+'.png'),fullPage:true})}
 await page.evaluate(()=>window._recordOffset=51000);await page.waitForFunction(()=>document.querySelector('#video-timer').classList.contains('ending'));
 await page.evaluate(()=>window._recordOffset=61000);await page.waitForFunction(()=>document.querySelector('#capture-status').textContent==='Votre souvenir est prêt.');assert(await page.locator('#video-timer').isHidden());assert(await page.locator('#preview-video').isVisible());assert(await page.evaluate(()=>_captureStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));
 await page.evaluate(()=>window._recordOffset=0);await page.locator('[data-memory-type="audio"]').click();await page.locator('#capture-memory').click();await page.locator('#prepare-audio').click();await page.locator('#start-audio').waitFor({state:'visible'});await page.locator('#start-audio').click();await page.locator('#audio-timer').waitFor({state:'visible'});
 assert.match(await page.locator('#audio-timer .record-remaining').innerText(),/02:5\d|03:00/);assert.match(await page.locator('#audio-indicator').innerText(),/en cours/);
 await page.waitForFunction(()=>document.querySelector('#audio-timer .record-elapsed').textContent!=='00:00');await page.locator('#stop-audio').click();await page.waitForFunction(()=>document.querySelector('#capture-status').textContent==='Votre souvenir est prêt.');assert(await page.locator('#audio-timer').isHidden());assert(await page.locator('#preview-audio').isVisible());assert.match(await page.locator('#audio-indicator').innerText(),/terminé/);
 await page.locator('#prepare-audio').click();await page.locator('#start-audio').waitFor({state:'visible'});await page.locator('#start-audio').click();await page.locator('#audio-timer').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelector('#audio-timer .record-elapsed').textContent!=='00:00');
 for(const width of [390,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(artifacts,'guest-audio-recording-'+width+'.png'),fullPage:true})}
 await page.evaluate(()=>window._recordOffset=181000);await page.waitForFunction(()=>document.querySelector('#capture-status').textContent==='Votre souvenir est prêt.');assert(await page.locator('#audio-timer').isHidden());assert(await page.evaluate(()=>_captureStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));await page.evaluate(()=>window._recordOffset=0);
 // Permission errors stay next to capture; late permissions never reopen abandoned media.
 await page.locator('[data-memory-type="video"]').click();await page.locator('#capture-memory').click();await page.evaluate(()=>window._failPermission=true);await page.locator('#prepare-video').click();
 await page.waitForFunction(()=>document.querySelector('#capture-status').textContent.includes('Autorisez'));assert(await page.locator('#capture-status').isVisible());assert(await page.locator('#prepare-video').isEnabled());
 await page.evaluate(()=>{window._failPermission=false;window._delayMedia=true});await page.locator('#prepare-video').click();await page.waitForFunction(()=>Boolean(window._releaseMedia));await page.locator('[data-memory-type="text"]').click();
 await page.evaluate(()=>{window._delayMedia=false;window._releaseMedia()});await page.waitForFunction(()=>_captureStreams.at(-1).getTracks().every(t=>t.readyState==='ended'));assert(await page.locator('#video-timer').isHidden());
 // Cancel a countdown and immediately use another recording mode.
 await page.locator('[data-memory-type="video"]').click();await page.locator('#capture-memory').click();await page.locator('#prepare-video').click();await page.locator('#start-video').waitFor({state:'visible'});await page.locator('#start-video').click();await page.locator('#video-countdown').waitFor({state:'visible'});
 await page.locator('[data-media-mode="upload"]').click();assert(await page.locator('.submit-memory').isEnabled());assert(await page.locator('#video-countdown').isHidden());
 await page.locator('[data-memory-type="audio"]').click();await page.locator('#capture-memory').click();await page.locator('#prepare-audio').click();await page.locator('#start-audio').waitFor({state:'visible'});await page.locator('#start-audio').click();await page.locator('#audio-timer').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#audio-timer .record-elapsed').textContent!=='00:00');
 // Background interruption preserves the available clip and shows a warning.
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));delete document.visibilityState});
 await page.waitForFunction(()=>document.querySelector('#capture-status').textContent.includes('quitté la page'));assert(await page.locator('#preview-audio').isVisible());assert(await page.locator('#audio-timer').isHidden());assert(await page.locator('.submit-memory').isEnabled());
 // A hardware track ending also releases the other tracks and retains the clip.
 await page.locator('#prepare-audio').click();await page.locator('#start-audio').waitFor({state:'visible'});await page.locator('#start-audio').click();await page.locator('#audio-timer').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#audio-timer .record-elapsed').textContent!=='00:00');
 await page.evaluate(()=>_captureStreams.at(-1).getAudioTracks()[0].dispatchEvent(new Event('ended')));await page.waitForFunction(()=>document.querySelector('#capture-status').textContent.includes('a été coupé'));assert(await page.locator('#preview-audio').isVisible());assert(await page.evaluate(()=>_captureStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));
 await page.locator('[data-memory-type="text"]').click();await page.locator('#message_text').fill('Un souvenir pour vous');
 await page.evaluate(()=>window._failText=true);await page.locator('.submit-memory').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('interrompue'));
 assert.equal(await page.locator('#message_text').inputValue(),'Un souvenir pour vous');
 const request=await page.evaluate(()=>_calls.find(c=>c.action==='submit_text').body.request_id);
 await page.evaluate(()=>window._failText=false);await page.locator('.submit-memory').click();await page.waitForSelector('#guest-success:not([hidden])');
 assert.match(await page.locator('#guest-success-date').innerText(),/déjà/);
 assert.equal(await page.evaluate(()=>_calls.filter(c=>c.action==='submit_text').at(-1).body.request_id),request);
 const identity=await page.evaluate(()=>_calls.find(c=>c.action==='submit_text').body.guest_id);assert.match(identity,/^[a-f0-9-]{36}$/);assert.equal(await page.evaluate(()=>_calls.filter(c=>c.action==='submit_text').at(-1).body.guest_id),identity);
 await page.locator('#another-memory').click();await page.locator('[data-memory-type="text"]').click();await page.locator('#message_text').fill('Dans six mois');
 await page.locator('[data-delivery="6"]').click();assert.equal(await page.locator('#delivery-date-wrap').isVisible(),false);
 assert.match(await page.locator('#delivery-help').innerText(),/secret/);await page.locator('.submit-memory').click();await page.waitForSelector('#guest-success:not([hidden])');assert.match(await page.locator('#guest-success-date').innerText(),/secret/);
 await page.locator('#another-memory').click();
 await page.locator('#media-file').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYhEAAAAASUVORK5CYII=','base64')});
 await page.waitForFunction(()=>document.querySelector('#capture-status').textContent==='Votre souvenir est prêt.');
 await page.evaluate(()=>window._failUpload=true);await page.locator('.submit-memory').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('interrompu'));
 assert.equal(await page.locator('#media-preview').isVisible(),true);
 await page.evaluate(()=>window._failFinalize=true);await page.locator('.submit-memory').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Confirmation interrompue'));
 await page.evaluate(()=>window._failFinalize=false);await page.locator('.submit-memory').click();await page.waitForSelector('#guest-success:not([hidden])');
 assert.equal(await page.evaluate(()=>_calls.filter(c=>c.action==='upload_created').length),1);
 assert.equal(await page.evaluate(()=>_calls.filter(c=>c.action==='upload_start').length),2);
 assert.equal(await page.evaluate(()=>_calls.filter(c=>c.action==='init_media').length),1);
 const upload=await page.evaluate(()=>_calls.find(c=>c.action==='upload_created').body);
 assert.equal(upload.type,'image/jpeg');assert.equal(upload.headers['x-signature'],'signed');assert.equal(upload.chunkSize,6*1024*1024);
 await page.locator('#another-memory').click();await page.evaluate(()=>window._state.effective_plan='photo');await page.locator('[data-memory-type="text"]').click();await page.locator('#message_text').fill('Encore');await page.locator('.submit-memory').click();await page.waitForSelector('#guest-success:not([hidden])');await page.locator('#another-memory').click();
 assert.equal(await page.locator('[data-memory-type="audio"]').isVisible(),false);assert.equal(await page.locator('[data-memory-type="video"]').isVisible(),false);
 for(const width of [390,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(artifacts,'guest-'+width+'.png'),fullPage:true})}
 await page.evaluate(()=>window._state.state='full');await page.locator('[data-memory-type="text"]').click();await page.locator('#message_text').fill('Dernier');await page.locator('.submit-memory').click();await page.waitForSelector('#guest-success:not([hidden])');await page.locator('#another-memory').click();assert.equal(await page.locator('[data-memory-type="image"]').isVisible(),false);assert.equal(await page.locator('[data-memory-type="text"]').isVisible(),true);
 await page.evaluate(()=>window._state.state='closed');await page.locator('#message_text').fill('Clôture');await page.locator('.submit-memory').click();await page.waitForSelector('#guest-success:not([hidden])');await page.locator('#another-memory').click();assert.equal(await page.locator('#guest-message').isVisible(),false);assert.match(await page.locator('#guest-state').innerText(),/terminés/);
 await page.reload();await page.waitForSelector('#guest-message:not([hidden])');await page.locator('[data-memory-type="text"]').click();await page.locator('#message_text').fill('Same browser after reload');await page.locator('.submit-memory').click();await page.waitForSelector('#guest-success:not([hidden])');assert.equal(await page.evaluate(()=>_calls.find(c=>c.action==='submit_text').body.guest_id),identity);
 assert.deepEqual(errors,[]);console.log('PASS: permission errors, late streams, countdown cancellation, background/track interruptions and stable guest identity; live photo chooser, real video/audio recording, compact elapsed/remaining timers, manual/automatic stops, released camera/mic, responsive recording screens, optional name, immediate/delayed delivery, retries, optimization, signed TUS, quotas and closure');
 await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
