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
