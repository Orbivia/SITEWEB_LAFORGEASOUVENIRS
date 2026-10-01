const assert=require('node:assert/strict'),fs=require('node:fs'),{stripTypeScriptTypes}=require('node:module');
const Archive=require('../backup-archive.js');
(async()=>{
 const source=stripTypeScriptTypes(fs.readFileSync(__dirname+'/../supabase/functions/suite-admin/crypto.ts','utf8'));const {importKey,seal,open}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const key=await importKey('a'.repeat(64)),raw=new TextEncoder().encode(JSON.stringify({delivery_at:'2028-11-04T23:00:00Z',message_text:'Surprise'})),name='12345678-1234-4234-8234-123456789abc/manifest';const encrypted=await seal(key,raw,name);assert.deepEqual(await open(key,encrypted,name),raw);assert(!Buffer.from(encrypted).includes(Buffer.from('Surprise')));
 await assert.rejects(()=>open(key,encrypted,name+'wrong'));const corrupted=encrypted.slice();corrupted[30]^=1;await assert.rejects(()=>open(key,corrupted,name));
 const parts=[],writable={write:async x=>parts.push(x),close:async()=>{}};global.fetch=async()=>new Response(encrypted);
 await Archive.write(async()=>({total:1,entries:[{name,url:'sealed'}]}),writable,()=>{});const file=new Blob(parts),entries=await Archive.entries(file);assert.equal(entries.length,1);assert.equal(entries[0].name,name);assert.deepEqual(new Uint8Array(await entries[0].blob.arrayBuffer()),encrypted);await assert.rejects(()=>Archive.entries(file.slice(0,file.size-2)));await assert.rejects(()=>Archive.entries(new Blob(['not an archive'])));
 console.log('Backup encryption, integrity, date preservation and archive round-trip passed');
})().catch(e=>{console.error(e);process.exit(1)});
