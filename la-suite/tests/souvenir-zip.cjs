const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
(async()=>{
 const ctx={Blob,TextEncoder,DataView,Uint8Array,Uint32Array};vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../souvenir-zip.js','utf8'),ctx);
 const blobs=[new Blob(['Souvenir français — émoji 💛']),new Blob([Uint8Array.from({length:130000},(_,i)=>i%251)]),new Blob([])];
 const names=['Vos-messages.txt','0001-élodie.jpg','vide.txt'],parts=[];let closed=false;
 await ctx.SouvenirZip.write(blobs.map((b,i)=>({name:names[i],size:b.size,load:async()=>b})),{write:async x=>parts.push(x),close:async()=>closed=true});assert(closed);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'suite-zip-')),file=path.join(dir,'memories.zip');fs.writeFileSync(file,Buffer.concat(parts));
 const result=execFileSync('python3',['-c',"import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert z.namelist()==['Vos-messages.txt','0001-élodie.jpg','vide.txt']; assert z.read('Vos-messages.txt').decode()=='Souvenir français — émoji 💛'; assert z.read('0001-élodie.jpg')==bytes(i%251 for i in range(130000)); assert not z.read('vide.txt'); print('ZIP64 round-trip OK')",file],{encoding:'utf8'});process.stdout.write(result);fs.rmSync(dir,{recursive:true});
 await assert.rejects(ctx.SouvenirZip.write([{name:'missing',size:2,load:async()=>new Blob(['x'])}],{write:async()=>{},close:async()=>{}}),/fichier manque/);
 await assert.rejects(ctx.SouvenirZip.write([{name:'../unsafe',size:0,load:async()=>new Blob([])}],{write:async()=>{},close:async()=>{}}),/Nom/);
 console.log('PASS: standard-reader ZIP64 extraction, UTF-8 names, binary data, empty files and missing-file rejection');
})().catch(e=>{console.error(e);process.exit(1)});
