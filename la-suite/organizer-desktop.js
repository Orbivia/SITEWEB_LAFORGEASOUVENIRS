/* Layout follows available space; input capabilities refine desktop controls. */
(function(){
 'use strict';
 const wide=matchMedia('(min-width:761px)'),coarse=matchMedia('(any-pointer:coarse)'),fine=matchMedia('(any-pointer:fine)'),hover=matchMedia('(hover:hover)'),short=matchMedia('(max-height:649px)');
 const snapshot=()=>({layout:wide.matches?'wide':'compact',input:coarse.matches?(fine.matches?'hybrid':'touch'):'precise',hover:hover.matches,height:short.matches?'short':'regular'});
 function update(){const state=snapshot(),body=document.body;if(!body)return;
  if(!wide.matches){delete body.dataset.organizerInput;delete body.dataset.organizerHover;delete body.dataset.organizerHeight;return;}
  body.dataset.organizerInput=state.input;body.dataset.organizerHover=String(state.hover);body.dataset.organizerHeight=state.height;
 }
 window.SuiteOrganizerCapabilities=Object.freeze({get:snapshot});
 for(const query of [wide,coarse,fine,hover,short])query.addEventListener('change',update);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',update,{once:true});else update();
})();
/* PC presentation only: reuse all native smartphone editing and export actions. */
(function(){
 'use strict';
 if(!window.SuiteWelcome?.setup)return;
 const wide=matchMedia('(min-width:761px)'),original=window.SuiteWelcome.setup,$=id=>document.getElementById(id);
 let current=null,mounted=null,frame=0;
 function mount(context,studio){
  const owned=[],moves=[];
  const column=document.createElement('div');column.className='pc-preview-column';studio.append(column);owned.push(column);
  for(const node of [studio.querySelector('.visual-targets'),studio.querySelector('.visual-stage'),studio.querySelector('.visual-actions')]){
   const home=document.createComment('PC placement');node.before(home);moves.push({node,home});column.append(node);
  }
  studio.classList.add('pc-workspace');
  function sync(){
   if(!wide.matches||!studio.isConnected)return;
   // Size to the available viewport, leaving a small-screen fallback instead of clipping actions.
   const top=studio.getBoundingClientRect().top+window.scrollY;
   studio.style.setProperty('--pc-workspace-height',Math.max(360,innerHeight-top-12)+'px');
  }
  const onUpdate=()=>requestAnimationFrame(sync);
  window.addEventListener('resize',onUpdate);window.addEventListener('studio-layout',onUpdate);document.addEventListener('input',onUpdate);document.addEventListener('change',onUpdate);
  const observer=new MutationObserver(()=>{if(!studio.isConnected){mounted?.destroy();mounted=null;current=null;}else onUpdate();});
  observer.observe($('dashboard-content'),{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});sync();
  return {studio,sync,destroy(){observer.disconnect();window.removeEventListener('resize',onUpdate);window.removeEventListener('studio-layout',onUpdate);document.removeEventListener('input',onUpdate);document.removeEventListener('change',onUpdate);for(const {node,home} of moves)home.replaceWith(node);owned.forEach(node=>node.remove());studio.classList.remove('pc-workspace');studio.style.removeProperty('--pc-workspace-height');}};
 }
 function update(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!wide.matches){mounted?.destroy();mounted=null;return;}const studio=$('welcome-visual-editor');if(mounted&&mounted.studio!==studio){mounted.destroy();mounted=null;}if(current&&studio&&document.body.classList.contains('visual-primary-ready')&&!mounted)mounted=mount(current,studio);mounted?.sync();});}
 window.SuiteWelcome.setup=function(context){const designer=original(context);current=context;if(wide.matches)queueMicrotask(update);return designer;};
 wide.addEventListener('change',update);
})();
