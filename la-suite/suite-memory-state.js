/* Discovery state and ordering, independent of the UI. */
(function(){
 'use strict';
 const readIds=new Set();
 function wasRead(id){if(readIds.has(id))return true;try{return localStorage.getItem('la_suite_memory_read_'+id)==='1';}catch{return false;}}
 function markRead(id){readIds.add(id);try{localStorage.setItem('la_suite_memory_read_'+id,'1');}catch{}}
 function rank(card){return card.classList.contains('memory-unread')?0:card.classList.contains('locked')?2:1;}
 function timestamp(value){return Date.parse(value)||0;}
 function compare(a,b){return rank(a)-rank(b)||(rank(a)===2?timestamp(a.dataset.deliveryAt)-timestamp(b.dataset.deliveryAt):timestamp(b.dataset.depositedAt)-timestamp(a.dataset.depositedAt));}
 function countdown(date,now=Date.now()){
  const remaining=Math.max(0,Math.ceil((Date.parse(date)-now)/1000));
  const days=Math.floor(remaining/86400),hours=Math.floor(remaining%86400/3600),minutes=Math.floor(remaining%3600/60),seconds=remaining%60;
  return {remaining,text:days?days+' j '+hours+' h':hours?hours+' h '+minutes+' min':minutes+' min '+seconds+' s'};
 }
 window.SuiteMemoryState=Object.freeze({wasRead,markRead,rank,compare,countdown});
})();
