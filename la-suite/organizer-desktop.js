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
 const text=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
 function mount(context,studio){
  const c=context.capsule,owned=[],moves=[];
  const overview=document.createElement('section');overview.className='pc-capsule-overview';overview.setAttribute('aria-label','Votre capsule');
  const identity=document.createElement('div');identity.className='pc-capsule-identity';
  const name=document.createElement('strong'),facts=document.createElement('span');facts.className='pc-capsule-facts';identity.append(name,facts);
  const navigation=document.createElement('nav');navigation.className='pc-owner-navigation';navigation.setAttribute('aria-label','Navigation de la capsule');
  for(const [label,target] of [['Personnaliser','configuration'],['Découvrir','messages']]){
   const b=document.createElement('button');b.type='button';b.className='pc-button';b.textContent=label;b.dataset.panel=target;
   b.onclick=async()=>{if(await context.saveAll())document.querySelector('[data-owner-tab-link="'+target+'"]')?.click();sync();};navigation.append(b);
  }
  const state=document.createElement('span');state.className='pc-capsule-state';overview.append(identity,navigation,state);$('dashboard-content').prepend(overview);owned.push(overview);
  const column=document.createElement('div');column.className='pc-preview-column';studio.append(column);owned.push(column);
  for(const node of [studio.querySelector('.visual-targets'),studio.querySelector('.visual-stage'),studio.querySelector('.visual-actions')]){
   const home=document.createComment('PC placement');node.before(home);moves.push({node,home});column.append(node);
  }
  studio.classList.add('pc-workspace');
  function sync(){
   if(!wide.matches||!studio.isConnected)return;
   text(name,$('capsule-name')?.value||c.couple_name);
   const plan=window.SuiteDesign.effectivePlan(c),date=$('capsule-date')?.value||c.wedding_date;
   const formatted=/^\d{4}-\d{2}-\d{2}$/.test(date)?new Date(date+'T12:00:00').toLocaleDateString('fr-FR'):'';
   text(facts,formatted+' · '+({photo:'Essentiel',audio:'Plus',premium:'Premium'}[plan]||plan));
   const usage=c.usage;
   text(state,({draft:'En préparation',scheduled:'Prête à partager',open:'Dépôts ouverts',closed:'Dépôts terminés',full:'Stockage rempli',expired:'Conservation terminée',suspended:'Dépôts en pause'}[c.status==='draft'?'draft':usage?.state]||'Capsule active')+(usage?.quota_bytes?' · '+new Intl.NumberFormat('fr-FR',{maximumFractionDigits:1}).format((usage.used_bytes||0)/1e9)+' / '+usage.quota_bytes/1e9+' Go':''));
   const active=document.querySelector('[data-owner-panel=messages]')&&!document.querySelector('[data-owner-panel=messages]').hidden;
   for(const b of navigation.children){b.hidden=b.dataset.panel==='messages'&&c.status!=='active';b.setAttribute('aria-current',(b.dataset.panel==='messages')===Boolean(active)?'page':'false');}
   // Size to the available viewport, leaving a small-screen fallback instead of clipping actions.
   const top=studio.getBoundingClientRect().top+window.scrollY;
   studio.style.setProperty('--pc-workspace-height',Math.max(360,innerHeight-top-12)+'px');
  }
  const onUpdate=()=>requestAnimationFrame(sync);
  window.addEventListener('resize',onUpdate);document.addEventListener('input',onUpdate);document.addEventListener('change',onUpdate);
  const observer=new MutationObserver(()=>{if(!studio.isConnected){mounted?.destroy();mounted=null;current=null;}else onUpdate();});
  observer.observe($('dashboard-content'),{childList:true,subtree:true});sync();
  return {studio,sync,destroy(){observer.disconnect();window.removeEventListener('resize',onUpdate);document.removeEventListener('input',onUpdate);document.removeEventListener('change',onUpdate);for(const {node,home} of moves)home.replaceWith(node);owned.forEach(node=>node.remove());studio.classList.remove('pc-workspace');studio.style.removeProperty('--pc-workspace-height');}};
 }
 function update(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!wide.matches){mounted?.destroy();mounted=null;return;}const studio=$('welcome-visual-editor');if(mounted&&mounted.studio!==studio){mounted.destroy();mounted=null;}if(current&&studio&&document.body.classList.contains('visual-primary-ready')&&!mounted)mounted=mount(current,studio);mounted?.sync();});}
 window.SuiteWelcome.setup=function(context){const designer=original(context);current=context;if(wide.matches)queueMicrotask(update);return designer;};
 wide.addEventListener('change',update);
})();