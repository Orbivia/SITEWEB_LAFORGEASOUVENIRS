/* Printable PDFs with exact page dimensions, generated locally from the card canvas. */
(function(){
 'use strict';
 const pt=mm=>mm*72/25.4,n=v=>Number(v.toFixed(5)).toString();
 const bytes=s=>Uint8Array.from(s,c=>c.charCodeAt(0));
 const literal=s=>'('+s.replace(/[\\()]/g,'\\$&')+')';
 async function create(card,format='10x15'){
  if(!['10x15','A4'].includes(format))throw Error('Format de fiche inconnu.');
  const [width,height]=format==='A4'?[210,297]:[100,150];
  const w=pt(width),h=pt(height),cw=pt(100),ch=pt(150),x=(w-cw)/2,y=(h-ch)/2;
  let image,filter;
  if(typeof CompressionStream==='function'){
   const rgba=card.getContext('2d').getImageData(0,0,card.width,card.height).data,rgb=new Uint8Array(card.width*card.height*3);
   for(let i=0,j=0;i<rgba.length;i+=4){const a=rgba[i+3]/255;for(let k=0;k<3;k++)rgb[j++]=Math.round(rgba[i+k]*a+255*(1-a));}
   image=new Uint8Array(await new Response(new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());filter='FlateDecode';
  }else{
   const encoded=atob(card.toDataURL('image/jpeg',1).split(',')[1]);image=bytes(encoded);filter='DCTDecode';
  }
  let drawing=`q ${n(cw)} 0 0 ${n(ch)} ${n(x)} ${n(y)} cm /Card Do Q\n`;
  if(format==='A4'){
   drawing+='q 0.65 G 0.4 w [3 3] 0 d '+`${n(x)} ${n(y)} ${n(cw)} ${n(ch)} re S [] 0 d\n`;
   for(const [cx,cy,sx,sy] of [[x,y,-1,-1],[x+cw,y,1,-1],[x,y+ch,-1,1],[x+cw,y+ch,1,1]])drawing+=`${n(cx+sx*pt(3))} ${n(cy)} m ${n(cx+sx*pt(.7))} ${n(cy)} l S ${n(cx)} ${n(cy+sy*pt(3))} m ${n(cx)} ${n(cy+sy*pt(.7))} l S\n`;
   drawing+='Q\n';
   const lines=[['Comment utiliser votre carte',12,'Bold'],['1. Imprimez sur A4 à 100 %, sans ajuster à la page.',9,'Regular'],['2. Découpez sur les repères pour obtenir la carte 10 × 15 cm.',9,'Regular'],['3. Placez-la sur les tables : vos invités scannent le QR code.',9,'Regular'],['Les dépôts sont ouverts le jour de l’événement et le lendemain.'.replace('’',"'"),9,'Regular']];
   lines.forEach(([text,size,font],i)=>{const approx=text.length*size*.235;drawing+=`BT /${font} ${size} Tf 0.33 0.3 0.28 rg 1 0 0 1 ${n(w/2-approx)} ${n(y-pt(11)-i*15)} Tm ${literal(text)} Tj ET\n`});
  }
  const stream=bytes(drawing),parts=[],offsets=[0];let offset=0;
  const add=part=>{parts.push(part);offset+=part.length};
  const object=(id,header,data)=>{offsets[id]=offset;add(bytes(id+' 0 obj\n'+header+(data?'\nstream\n':'\n')));if(data){add(data);add(bytes('\nendstream\n'));}add(bytes('endobj\n'));};
  add(bytes('%PDF-1.4\n%LaSuite\n'));
  object(1,'<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>');
  object(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(w)} ${n(h)}] /Resources << /XObject << /Card 4 0 R >> /Font << /Regular 6 0 R /Bold 7 0 R >> >> /Contents 5 0 R >>`);
  object(4,`<< /Type /XObject /Subtype /Image /Width ${card.width} /Height ${card.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Interpolate false /Filter /${filter} /Length ${image.length} >>`,image);
  object(5,`<< /Length ${stream.length} >>`,stream);
  object(6,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  object(7,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const xref=offset;add(bytes('xref\n0 8\n0000000000 65535 f \n'+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n'));
  return new Blob(parts,{type:'application/pdf'});
 }
 window.SuitePrintPdf={create};
})();
