/* Independent body/finder shapes; only finder patterns use the selected color. */
(function(){
 'use strict';
 function draw(ctx,model,{shape='classic',eyes='square',ink='#202020',cell=12,quiet=4}={}){
  const n=model.getModuleCount(),finders=[[0,0],[n-7,0],[0,n-7]];
  ctx.fillStyle='#202020';
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(model.isDark(y,x)){
   if(finders.some(([fx,fy])=>x>=fx&&x<fx+7&&y>=fy&&y<fy+7))continue;
   const px=(x+quiet)*cell,py=(y+quiet)*cell;
   const protectedCell=x===6||y===6||(x<9&&y<9)||(x>=n-9&&y<9)||(x<9&&y>=n-9);
   if(shape==='dots'&&!protectedCell){ctx.beginPath();ctx.arc(px+cell/2,py+cell/2,cell*.5,0,Math.PI*2);ctx.fill();}
   else if(shape==='rounded'&&!protectedCell&&typeof ctx.roundRect==='function'){
    ctx.beginPath();ctx.roundRect(px,py,cell,cell,cell*.3);ctx.fill();
   }else ctx.fillRect(px,py,cell,cell);
  }
  function mark(x,y,size,color,radius){ctx.fillStyle=color;
   if(eyes==='circle'){ctx.beginPath();ctx.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);ctx.fill();}
   else if(eyes==='rounded'&&typeof ctx.roundRect==='function'){ctx.beginPath();ctx.roundRect(x,y,size,size,radius);ctx.fill();}
   else ctx.fillRect(x,y,size,size);
  }
  for(const [x,y] of finders){const px=(x+quiet)*cell,py=(y+quiet)*cell;
   mark(px,py,7*cell,ink,cell);mark(px+cell,py+cell,5*cell,'#ffffff',cell*.7);mark(px+2*cell,py+2*cell,3*cell,ink,cell*.5);
  }
  ctx.fillStyle='#202020';
 }
 window.SuiteQr={draw};
})();
