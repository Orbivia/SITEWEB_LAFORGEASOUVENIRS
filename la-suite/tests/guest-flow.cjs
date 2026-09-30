const {chromium}=require('playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),artifacts=process.env.QA_SCREENSHOTS||require('node:os').tmpdir();
(async()=>{
 const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname;try{res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(root,name)))}catch(e){res.statusCode=404;res.end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({args:['--no-sandbox']}),context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.fulfill({body:'',contentType:'application/javascript'}));
 await context.addInitScript(()=>{
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  window._state={state:'open',effective_plan:'premium',couple_name:'Julie & Thomas',wedding_date:today,opens_at:new Date().toISOString(),closes_at:new Date(Date.now()+86400000).toISOString(),expires_at:new Date(Date.now()+3*365*86400000).toISOString(),delivery_before:new Date(Date.now()+900*86400000).toISOString(),quota_bytes:5000000000,used_bytes:0};
  window._calls=[];window._failUpload=false;window._failText=false;window._failFinalize=false;
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
 await page.locator('[data-memory-type="text"]').click();await page.locator('#message_text').fill('Un souvenir pour vous');
 await page.evaluate(()=>window._failText=true);await page.locator('.submit-memory').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('interrompue'));
 assert.equal(await page.locator('#message_text').inputValue(),'Un souvenir pour vous');
 const request=await page.evaluate(()=>_calls.find(c=>c.action==='submit_text').body.request_id);
 await page.evaluate(()=>window._failText=false);await page.locator('.submit-memory').click();await page.waitForSelector('#guest-success:not([hidden])');
 assert.match(await page.locator('#guest-success-date').innerText(),/déjà/);
 assert.equal(await page.evaluate(()=>_calls.filter(c=>c.action==='submit_text').at(-1).body.request_id),request);
 await page.locator('#another-memory').click();await page.locator('[data-memory-type="text"]').click();await page.locator('#message_text').fill('Dans six mois');
 await page.locator('[data-delivery="6"]').click();assert.equal(await page.locator('#delivery-date-wrap').isVisible(),false);
 assert.match(await page.locator('#delivery-help').innerText(),/secret/);await page.locator('.submit-memory').click();await page.waitForSelector('#guest-success:not([hidden])');assert.match(await page.locator('#guest-success-date').innerText(),/secret/);
 await page.locator('#another-memory').click();
 await page.locator('#media-file').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYhEAAAAASUVORK5CYII=','base64')});
 await page.waitForFunction(()=>document.querySelector('#status').textContent==='Votre souvenir est prêt.');
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
 assert.deepEqual(errors,[]);console.log('PASS: optional name, immediate/delayed delivery, preserved failures, retry idempotency, photo optimization, resumed signed TUS upload, finalize retry, formula restrictions, full/closed capsules and responsive widths');
 await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
