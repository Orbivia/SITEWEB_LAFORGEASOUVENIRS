/* Server state is authoritative; local time only drives the waiting display. */
(function(root){
 'use strict';
 function welcomeAvailable(state){return Boolean(state&&['open','full','closed'].includes(state.state)&&state.welcome_available!==false);}
 function remaining(opensAt,now=Date.now()){
  const at=Date.parse(opensAt);if(!Number.isFinite(at))return null;
  const total=Math.max(0,Math.ceil((at-now)/1000));
  return {total,days:Math.floor(total/86400),hours:Math.floor(total/3600)%24,minutes:Math.floor(total/60)%60,seconds:total%60};
 }
 const api={welcomeAvailable,remaining};if(typeof module==='object'&&module.exports)module.exports=api;else root.SuiteGuestCalendar=api;
})(globalThis);
