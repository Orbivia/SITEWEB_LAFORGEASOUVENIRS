/* Conservative QR variants: protected finders and an uninterrupted four-cell quiet zone. */
(function(){
 'use strict';
 function draw(ctx,model,{shape='classic',cell=12,quiet=4}={}){
  const n=model.getModuleCount();
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(model.isDark(y,x)){
   const px=(x+quiet)*cell,py=(y+quiet)*cell;
   const protectedCell=x===6||y===6||(x<9&&y<9)||(x>=n-9&&y<9)||(x<9&&y>=n-9);
   if(shape==='rounded'&&!protectedCell&&typeof ctx.roundRect==='function'){
    ctx.beginPath();ctx.roundRect(px,py,cell,cell,cell*.18);ctx.fill();
   }else ctx.fillRect(px,py,cell,cell);
  }
  // Hearts sit beyond the quiet zone, never inside the finder patterns.
  if(shape==='hearts'&&quiet>=7){
   const extent=(n+quiet*2)*cell,d=cell*1.5;
   for(const [x,y] of [[cell*1.5,cell*1.5],[extent-cell*1.5,cell*1.5],[cell*1.5,extent-cell*1.5]]){
    ctx.beginPath();ctx.moveTo(x,y+d*.4);
    ctx.bezierCurveTo(x-d,y-d*.2,x-d*.4,y-d*.8,x,y-d*.25);
    ctx.bezierCurveTo(x+d*.4,y-d*.8,x+d,y-d*.2,x,y+d*.4);ctx.fill();
   }
  }
 }
 window.SuiteQr={draw};
})();
