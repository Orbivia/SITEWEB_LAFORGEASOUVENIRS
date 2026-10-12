/* Accessible souvenir reader. Data access stays in app.js; dependencies are supplied by the caller. */
(function(root){
'use strict';
function mount(article,item,available,depositedAt,{fParis,fdate,memoryWasRead,markMemoryRead,applyMemoryFilter}){
 article.classList.add('memory-compact');
 const typeLabel=article.querySelector('.memory-meta span');
 const depositDate=depositedAt||item.created_at;
 if(typeLabel)typeLabel.textContent='Découverte le '+fParis(item.delivery_at);
 article.dataset.memoryId=item.id;
 const stateIcon=article.querySelector('.memory-icon');
 const updateReadState=()=>{const read=memoryWasRead(item.id);article.classList.toggle('memory-unread',available&&!read);article.classList.toggle('memory-read',available&&read);stateIcon.innerHTML='<i class="fa-solid '+(read?'fa-envelope-open':'fa-envelope')+'" aria-hidden="true"></i>';stateIcon.setAttribute('aria-label',read?'Souvenir lu':'Souvenir non lu');};
 if(!available){stateIcon.innerHTML='<i class="fa-solid fa-envelope" aria-hidden="true"></i><i class="fa-solid fa-lock memory-envelope-lock" aria-hidden="true"></i>';stateIcon.setAttribute('aria-label','Souvenir verrouillé');const badge=article.querySelector('.lock-badge');if(badge){badge.innerHTML='<i class="fa-solid fa-lock" aria-hidden="true"></i>';badge.setAttribute('aria-label','Ouverture le '+fdate(item.delivery_at));badge.title='Ouverture le '+fdate(item.delivery_at);}return;}
 updateReadState();
 article.querySelector('.lock-badge')?.remove();
 const content=article.querySelector('.memory-content'),actions=article.querySelector('.memory-actions');
 const dialog=document.createElement('dialog');dialog.className='memory-reader';
 dialog.setAttribute('aria-label','Souvenir de '+(item.guest_name||'votre invité'));
 const heading=document.createElement('div');heading.className='memory-reader-heading';
 const title=document.createElement('strong');title.textContent=item.guest_name||'Invité';
 const close=document.createElement('button');close.type='button';close.className='memory-reader-close';close.textContent='×';close.setAttribute('aria-label','Fermer le souvenir');
 const titleBlock=document.createElement('div');titleBlock.className='memory-reader-title';titleBlock.append(title);
 if(depositDate){const timestamp=document.createElement('p');timestamp.className='memory-reader-date';timestamp.textContent='Déposé le '+new Date(depositDate).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+' · Découverte le '+fParis(item.delivery_at);titleBlock.append(timestamp);}
 heading.append(titleBlock,close);
 const readerTools=document.createElement('div');readerTools.className='memory-reader-tools';
 actions.querySelectorAll('.mini-link').forEach(button=>readerTools.append(button));
 dialog.append(heading,readerTools);article.append(dialog);
 const open=document.createElement('button');open.type='button';open.className='memory-read-button';
 open.innerHTML='<i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';
 open.setAttribute('aria-label',(({image:'Voir la photo',video:'Voir la vidéo',audio:'Écouter'})[item.media_type]||'Lire le message')+' de '+(item.guest_name||'votre invité'));
 open.onclick=()=>{dialog.insertBefore(content,readerTools);document.body.append(dialog);dialog.showModal();markMemoryRead(item.id);updateReadState();applyMemoryFilter();article.refreshMemoryMedia?.()};
 close.onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{content.querySelectorAll('audio,video').forEach(media=>media.pause());article.append(content,dialog);open.focus();document.dispatchEvent(new Event('suite-memory-reader-closed'))});
 actions.append(open);
 article.classList.add('memory-row-clickable');article.tabIndex=0;article.setAttribute('role','button');article.setAttribute('aria-label',open.getAttribute('aria-label'));
 article.addEventListener('click',event=>{if(event.target.closest('button,a,dialog'))return;open.click()});
 article.addEventListener('keydown',event=>{if(event.target!==article)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();open.click()}});

}

root.SuiteMemoryReader=Object.freeze({mount});
})(window);
