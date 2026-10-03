/* ZIP64, uncompressed and streamed: bounded memory even for multi-GB capsules. */
(function(root){
 'use strict';
 const enc=new TextEncoder(),table=new Uint32Array(256);
 for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}
 const header=(size,build)=>{const data=new Uint8Array(size);build(new DataView(data.buffer));return data;};
 async function write(entries,writable,progress=()=>{}){
  let offset=0n;const central=[];
  const emit=async bytes=>{await writable.write(bytes);offset+=BigInt(bytes.byteLength);};
  for(let i=0;i<entries.length;i++){
   const e=entries[i],name=enc.encode(e.name),blob=await e.load();
   if(!(blob instanceof Blob)||blob.size!==e.size)throw Error('Un fichier manque ou a changé. Actualisez les souvenirs et réessayez.');
   if(!name.length||name.length>65535||e.name.startsWith('/')||e.name.split('/').includes('..'))throw Error('Nom de fichier invalide.');
   const size=BigInt(blob.size),start=offset;
   await emit(header(30,v=>{v.setUint32(0,0x04034b50,true);v.setUint16(4,45,true);v.setUint16(6,0x808,true);v.setUint16(12,33,true);v.setUint32(18,0xffffffff,true);v.setUint32(22,0xffffffff,true);v.setUint16(26,name.length,true);v.setUint16(28,20,true);}));await emit(name);
   await emit(header(20,v=>{v.setUint16(0,1,true);v.setUint16(2,16,true);v.setBigUint64(4,size,true);v.setBigUint64(12,size,true);}));
   let crc=0xffffffff,read=0;const reader=blob.stream().getReader();
   try{while(true){const {done,value}=await reader.read();if(done)break;read+=value.length;for(const b of value)crc=table[(crc^b)&255]^(crc>>>8);await emit(value);}}finally{reader.releaseLock();}
   if(read!==blob.size)throw Error('Fichier incomplet.');crc=(crc^0xffffffff)>>>0;
   await emit(header(24,v=>{v.setUint32(0,0x08074b50,true);v.setUint32(4,crc,true);v.setBigUint64(8,size,true);v.setBigUint64(16,size,true);}));
   central.push({name,size,start,crc});progress(i+1,entries.length);
  }
  const directory=offset;
  for(const e of central){await emit(header(46,v=>{v.setUint32(0,0x02014b50,true);v.setUint16(4,45,true);v.setUint16(6,45,true);v.setUint16(8,0x808,true);v.setUint16(14,33,true);v.setUint32(16,e.crc,true);v.setUint32(20,0xffffffff,true);v.setUint32(24,0xffffffff,true);v.setUint16(28,e.name.length,true);v.setUint16(30,28,true);v.setUint32(42,0xffffffff,true);}));await emit(e.name);await emit(header(28,v=>{v.setUint16(0,1,true);v.setUint16(2,24,true);v.setBigUint64(4,e.size,true);v.setBigUint64(12,e.size,true);v.setBigUint64(20,e.start,true);}));}
  const directorySize=offset-directory,end=offset,count=BigInt(central.length);
  await emit(header(56,v=>{v.setUint32(0,0x06064b50,true);v.setBigUint64(4,44n,true);v.setUint16(12,45,true);v.setUint16(14,45,true);v.setBigUint64(24,count,true);v.setBigUint64(32,count,true);v.setBigUint64(40,directorySize,true);v.setBigUint64(48,directory,true);}));
  await emit(header(20,v=>{v.setUint32(0,0x07064b50,true);v.setBigUint64(8,end,true);v.setUint32(16,1,true);}));
  await emit(header(22,v=>{v.setUint32(0,0x06054b50,true);v.setUint16(8,65535,true);v.setUint16(10,65535,true);v.setUint32(12,0xffffffff,true);v.setUint32(16,0xffffffff,true);}));
  await writable.close();
 }
 root.SouvenirZip={write};
})(typeof window==='undefined'?globalThis:window);
