/* Card artwork renderer. One QR matrix cache per application instance. */
(function(){
function create({qrThemes,qrFontFamily,qrFontWeight}){
function qrInk(color){
 const hex=/^#[0-9a-f]{6}$/i.test(color)?color:"#b78b38";
 let rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16));
 const luminance=()=>rgb.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((v,x,i)=>v+x*[.2126,.7152,.0722][i],0);
 while(luminance()>.10)rgb=rgb.map(x=>Math.floor(x*.9));
 return "#"+rgb.map(x=>x.toString(16).padStart(2,"0")).join("");
}
function qrAccent(color,dark=false){
 if(!dark)return qrInk(color);
 let rgb=(/^#[0-9a-f]{6}$/i.test(color)?color:'#8b2730').slice(1).match(/../g).map(x=>parseInt(x,16));
 const luminance=()=>rgb.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((v,x,i)=>v+x*[.2126,.7152,.0722][i],0);
 while(luminance()<.45)rgb=rgb.map(x=>Math.min(255,Math.ceil(x+(255-x)*.1)));
 return '#'+rgb.map(x=>x.toString(16).padStart(2,'0')).join('');
}
let qrModelCache=null;
function makeQrCanvas(url,o){
 const key=JSON.stringify([url,qrInk(o.color)]);
 if(qrModelCache?.key!==key){
  const holder=document.createElement("div");
  const code=new QRCode(holder,{text:url,width:512,height:512,colorDark:qrInk(o.color),colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.H});
  qrModelCache={key,model:code._oQRCode};
 }
 // Repaint from the cached matrix: reused canvas bitmaps may be discarded by the browser.
 const model=qrModelCache.model,n=model.getModuleCount(),cell=12,quiet=4;
 const canvas=document.createElement("canvas");canvas.width=canvas.height=(n+quiet*2)*cell;
 const ctx=canvas.getContext("2d");
 ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.fillStyle=qrInk(o.color);
 window.SuiteQr.draw(ctx,model,{shape:o.shape,eyes:o.eyes,ink:qrInk(o.color),cell,quiet});
 return canvas;
}
function drawQrMonogram(ctx,o,cx,cy,size,background){
 const d=size*.18,r=d/2,theme=qrThemes[o.style];
 ctx.save();
 // Keep the monogram readable even on dark or imported artwork.
 ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();
 ctx.fillStyle="#ffffff";ctx.fillRect(cx-r,cy-r,d,d);
 ctx.restore();ctx.save();ctx.translate(cx,cy);
 ctx.strokeStyle=qrInk(o.color);ctx.lineWidth=Math.max(.8,size*.0013);ctx.globalAlpha=.45;
 const badge=theme.badge;
 if(badge!=="plain"){
  ctx.beginPath();
  if(badge==="diamond"){ctx.moveTo(0,-r*.84);ctx.lineTo(r*.84,0);ctx.lineTo(0,r*.84);ctx.lineTo(-r*.84,0);ctx.closePath()}
  else ctx.ellipse(0,0,r*.83,r*(badge==="oval"?.72:.83),0,0,Math.PI*2);
  ctx.stroke();
  if(badge==="double"){ctx.globalAlpha=.2;ctx.beginPath();ctx.arc(0,0,r*.93,0,Math.PI*2);ctx.stroke()}
 }
 ctx.globalAlpha=1;
 const letters=Array.from(o.initials.trim().toUpperCase()).slice(0,4).join("");
 const family=qrFontFamily(o.font),weight=qrFontWeight(o.font);
 const maxW=d*(badge==="diamond"?.52:.66),maxH=d*(badge==="diamond"?.43:.48);
 ctx.textAlign="left";ctx.textBaseline="alphabetic";
 let fontSize=d*.5,metrics;
 do{
  ctx.font=weight+" "+fontSize+'px "'+family+'", serif';
  metrics=ctx.measureText(letters);
  if(Math.max(metrics.width,metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight)<=maxW&&metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent<=maxH)break;
  fontSize--;
 }while(fontSize>12);
 ctx.fillStyle=qrInk(o.color);ctx.textAlign="left";ctx.textBaseline="alphabetic";
 ctx.fillText(letters,(metrics.actualBoundingBoxLeft-metrics.actualBoundingBoxRight)/2,(metrics.actualBoundingBoxAscent-metrics.actualBoundingBoxDescent)/2);
 ctx.restore();
}
function drawQrBackdrop(ctx,o,W,H){
 const theme=qrThemes[o.style],style=o.style;
 ctx.fillStyle=theme.background;ctx.fillRect(0,0,W,H);
 if(style==="minimal")return;
 const wash=(x,y,r,alpha)=>{
  const g=ctx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,o.color);g.addColorStop(1,theme.background);
  ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=g;ctx.fillRect(0,0,W,H);ctx.restore();
 };
 const soft=["romantic","pressed","botanical","olive","signature","pearl","celestial"].includes(style);
 wash(0,0,W*.9,soft?.14:.07);wash(W,H,W,soft?.12:.06);
 if(style==="pearl")wash(W*.8,H*.35,W*.7,.07);
 ctx.save();ctx.strokeStyle=o.color;ctx.fillStyle=o.color;
 // Fine paper texture lives in the margins, away from the quiet zone and text.
 ctx.globalAlpha=.045;
 for(let i=0;i<1100;i++){
  const x=(i*83.37)%W,y=(i*173.29)%H;
  if(x<125||x>W-125)ctx.fillRect(x,y,1.1,1.1);
 }
 ctx.globalAlpha=.14;ctx.lineWidth=1.3;
 if(["chic","palace","retro","editorial"].includes(style)){
  for(let i=0;i<5;i++){
   const inset=24+i*7;ctx.beginPath();ctx.moveTo(inset,150);ctx.lineTo(inset,inset);ctx.lineTo(150,inset);ctx.stroke();
   ctx.beginPath();ctx.moveTo(W-inset,H-150);ctx.lineTo(W-inset,H-inset);ctx.lineTo(W-150,H-inset);ctx.stroke();
  }
 }
 if(["romantic","pressed","botanical","olive"].includes(style)){
  for(const flip of [false,true]){
   ctx.save();if(flip){ctx.translate(W,H);ctx.rotate(Math.PI)}
   ctx.globalAlpha=.09;
   for(let i=0;i<5;i++){
    ctx.beginPath();ctx.ellipse(55+i*9,510+i*135,70,150,-.4+i*.15,0,Math.PI*2);ctx.fill();
   }
   ctx.globalAlpha=.24;ctx.beginPath();ctx.moveTo(36,185);ctx.bezierCurveTo(135,360,18,650,83,980);ctx.stroke();
   ctx.restore();
  }
 }
 if(style==="celestial"){
  ctx.globalAlpha=.16;
  for(const [x,y] of [[35,95],[W-35,H-95]]){ctx.beginPath();ctx.arc(x,y,145,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(x,y,165,0,Math.PI*2);ctx.stroke()}
  ctx.globalAlpha=.38;
  for(let i=0;i<38;i++){const x=i%2?W-35-(i*11)%80:35+(i*11)%80,y=170+(i*73)%(H-300);ctx.beginPath();ctx.arc(x,y,i%3?1.4:2.5,0,Math.PI*2);ctx.fill()}
 }
 if(style==="seaside"){
  ctx.globalAlpha=.09;
  for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(0,H-65-i*12);ctx.bezierCurveTo(W*.3,H-190-i*8,W*.6,H+20-i*12,W,H-110-i*12);ctx.stroke()}
 }
 if(style==="dolce"){
  ctx.globalAlpha=.18;
  for(let y=320;y<H-320;y+=85)for(const x of [50,W-50]){ctx.beginPath();ctx.moveTo(x,y-10);ctx.lineTo(x+10,y);ctx.lineTo(x,y+10);ctx.lineTo(x-10,y);ctx.closePath();ctx.stroke()}
 }
 if(style==="boho"){
  ctx.globalAlpha=.16;
  for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(-10,H-180,160+i*14,300+i*14,.35,0,Math.PI*2);ctx.stroke()}
 }
 ctx.restore();
}
function drawQrDecor(ctx,o,W,H){
 ctx.save();ctx.strokeStyle=o.color;ctx.fillStyle=o.color;ctx.lineWidth=2;
 const style=o.style;
 const line=(x,y,x2,y2)=>{ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke()};
 const ellipse=(x,y,rx,ry,angle=0,fill=false)=>{ctx.beginPath();ctx.ellipse(x,y,rx,ry,angle,0,Math.PI*2);fill?ctx.fill():ctx.stroke()};
 const star=(x,y,r)=>{ctx.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,l=i%2?r*.25:r;ctx.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l)}ctx.closePath();ctx.fill()};
 const branch=(x,y,angle,filled=false)=>{
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(20,-70,8,-145,40,-210);ctx.stroke();
  for(let i=0;i<7;i++){const ly=-25-i*26,lx=6+i*4,dir=i%2?1:-1;ellipse(lx+dir*17,ly-12,22,6,dir*.65,filled)}ctx.restore();
 };
 const flower=(x,y,r)=>{for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ellipse(x+Math.cos(a)*r*.65,y+Math.sin(a)*r*.65,r*.6,r*.28,a)}ellipse(x,y,r*.18,r*.18,0,true)};
 if(style==="chic"){
  ctx.globalAlpha=.45;ctx.strokeRect(60,60,W-120,H-120);ctx.globalAlpha=.25;ctx.strokeRect(75,75,W-150,H-150);ctx.globalAlpha=.8;
  for(const [x,y,a] of [[60,60,0],[W-60,60,Math.PI/2],[W-60,H-60,Math.PI],[60,H-60,-Math.PI/2]]){ctx.save();ctx.translate(x,y);ctx.rotate(a);line(0,95,0,0);line(0,0,95,0);line(15,70,15,15);line(15,15,70,15);ctx.translate(15,15);ctx.rotate(Math.PI/4);ctx.fillRect(-4,-4,8,8);ctx.restore()}
 }else if(style==="editorial"){
  ctx.lineWidth=5;line(145,125,W-145,125);ctx.lineWidth=1;line(145,H-250,W-145,H-250);
  ctx.globalAlpha=.25;ctx.fillRect(62,185,10,250);ctx.fillRect(W-72,H-495,10,250);
 }else if(style==="signature"){
  ctx.globalAlpha=.55;ctx.beginPath();ctx.moveTo(340,125);ctx.bezierCurveTo(550,60,650,200,840,120);ctx.bezierCurveTo(750,175,630,80,530,145);ctx.stroke();
  line(145,H-250,245,H-250);
 }else if(style==="palace"){
  ctx.globalAlpha=.42;ctx.strokeRect(70,70,W-140,H-140);
  for(const [x,y,a] of [[85,85,0],[W-85,85,Math.PI/2],[W-85,H-85,Math.PI],[85,H-85,-Math.PI/2]]){ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.beginPath();ctx.moveTo(0,105);ctx.bezierCurveTo(75,95,95,75,105,0);ctx.stroke();ellipse(45,45,25,12,-Math.PI/4);ellipse(22,72,12,6,-Math.PI/3);ellipse(72,22,12,6,-Math.PI/6);ctx.restore()}
 }else if(style==="arch"){
  ctx.globalAlpha=.08;ctx.beginPath();ctx.roundRect(125,110,W-250,H-390,[450,450,18,18]);ctx.fill();ctx.globalAlpha=.45;ctx.beginPath();ctx.roundRect(145,135,W-290,H-440,[425,425,12,12]);ctx.stroke();
 }else if(["botanical","olive","pressed","romantic"].includes(style)){
  ctx.globalAlpha=style==="botanical"?.45:.5;
  branch(100,360,-.2,style==="botanical");branch(W-100,H-360,Math.PI-.2,style==="botanical");
  if(style==="olive"){for(let i=0;i<4;i++){ellipse(76+i*3,205+i*25,4,7,.3,true);ellipse(W-76-i*3,H-205-i*25,4,7,.3,true)}}
  if(style==="pressed"||style==="romantic"){
   if(style==="pressed")ctx.strokeStyle="#b89749";
   flower(112,130,style==="romantic"?32:20);flower(70,230,18);
   flower(W-112,H-130,style==="romantic"?32:20);flower(W-70,H-230,18);
   if(style==="romantic"){flower(112,130,18);flower(W-112,H-130,18)}
  }
 }else if(style==="boho"){
  ctx.globalAlpha=.1;ellipse(0,H-180,190,280,.4,true);ellipse(W,210,170,260,.4,true);ctx.globalAlpha=.55;
  for(let i=0;i<15;i++){const a=Math.PI+i*Math.PI/14;line(W/2+Math.cos(a)*48,155+Math.sin(a)*48,W/2+Math.cos(a)*68,155+Math.sin(a)*68)}
  ctx.beginPath();ctx.arc(W/2,155,35,Math.PI,Math.PI*2);ctx.stroke();
 }else if(style==="riviera"){
  ctx.globalAlpha=.14;for(let x=0;x<W;x+=70)ctx.fillRect(x,0,35,H);
  ctx.globalAlpha=1;ctx.fillStyle="#fffdf7";ctx.fillRect(110,110,W-220,H-220);
  for(let y=125;y<H-110;y+=35){ellipse(110,y,18,18,0,true);ellipse(W-110,y,18,18,0,true)}
  ctx.strokeStyle=o.color;ctx.globalAlpha=.3;ctx.strokeRect(130,130,W-260,H-260);
 }else if(style==="dolce"){
  ctx.globalAlpha=.5;ctx.setLineDash([5,10]);ctx.strokeRect(65,65,W-130,H-130);ctx.setLineDash([]);ctx.globalAlpha=1;
  for(const [x,y] of [[103,150],[W-103,H-170]]){ctx.fillStyle="#eed36a";ellipse(x,y,30,45,.5,true);ctx.fillStyle="#6f8853";ellipse(x+15,y-49,23,7,-.4,true)}
 }else if(style==="seaside"){
  ctx.globalAlpha=.3;
  for(const base of [85,H-120])for(let j=0;j<3;j++){ctx.beginPath();ctx.moveTo(60,base+j*14);for(let x=60;x<W-60;x+=100)ctx.quadraticCurveTo(x+25,base+j*14-18,x+50,base+j*14);ctx.stroke()}
 }else if(style==="celestial"){
  ctx.globalAlpha=.6;for(const [x,y,r] of [[110,170,15],[W-100,330,10],[90,960,9],[W-100,1330,14],[170,H-165,11],[W-260,110,8]])star(x,y,r);
  ctx.beginPath();ctx.arc(W/2,130,27,.2,Math.PI*1.85);ctx.bezierCurveTo(W/2-10,100,W/2-10,150,W/2+26,135);ctx.stroke();
 }else if(style==="pearl"){
  ctx.globalAlpha=.4;for(let x=70;x<W-60;x+=24){ellipse(x,70,3,3,0,true);ellipse(x,H-70,3,3,0,true)}for(let y=94;y<H-90;y+=24){ellipse(70,y,3,3,0,true);ellipse(W-70,y,3,3,0,true)}
  ctx.globalAlpha=.2;ctx.strokeRect(86,86,W-172,H-172);
 }else if(style==="retro"){
  ctx.globalAlpha=.65;ctx.lineWidth=5;ctx.beginPath();ctx.roundRect(70,70,W-140,H-140,130);ctx.stroke();ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(85,85,W-170,H-170,118);ctx.stroke();
  ctx.globalAlpha=.15;for(let i=0;i<3;i++){line(105+i*12,290,105+i*12,H-290);line(W-105-i*12,290,W-105-i*12,H-290)}
 }else if(style==="confetti"){
  const colors=["#c99383","#d8b557","#7e9b92","#9092b1"];
  for(let i=0;i<30;i++){const x=i%2?W-55-(i*19)%65:55+(i*19)%65,y=90+(i*137)%(H-180);ctx.save();ctx.translate(x,y);ctx.rotate(i*.7);ctx.fillStyle=colors[i%4];ctx.globalAlpha=.7;i%3?ctx.fillRect(-4,-9,8,18):ellipse(0,0,5,5,0,true);ctx.restore()}
 }
 ctx.restore();
}
function drawQrDivider(ctx,o,x,y){
 ctx.save();ctx.strokeStyle=o.color;ctx.fillStyle=o.color;ctx.lineWidth=2;
 const half=qrThemes[o.style].badge==="plain"?32:90,gap=qrThemes[o.style].badge==="plain"?0:20;
 ctx.beginPath();ctx.moveTo(x-half,y);ctx.lineTo(x-gap,y);ctx.moveTo(x+gap,y);ctx.lineTo(x+half,y);ctx.stroke();
 if(o.style==="chic"){
  ctx.translate(x,y);ctx.rotate(Math.PI/4);ctx.strokeRect(-6,-6,12,12);
 }else if(o.style==="romantic"){
  ctx.beginPath();ctx.ellipse(x-7,y,9,4,-.5,0,Math.PI*2);ctx.ellipse(x+7,y,9,4,.5,0,Math.PI*2);ctx.stroke();
 }
 ctx.restore();
}
return Object.freeze({qrInk,qrAccent,makeQrCanvas,drawQrMonogram,drawQrBackdrop,drawQrDecor,drawQrDivider});
}
window.SuiteCardArtwork=Object.freeze({create});
})();
