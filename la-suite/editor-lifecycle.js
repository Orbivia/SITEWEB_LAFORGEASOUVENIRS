/* Own the resources of one editor instance; closing a popup is not destruction. */
(function(root){
 'use strict';
 function create(){
  let destroyed=false;
  const listeners=new Set(),observers=new Set(),frames=new Set(),delays=new Set(),cleanups=[];
  function listen(target,type,listener,options){
   if(destroyed||!target)return ()=>{};
   const wrapped=function(event){if(options?.once)remove();if(!destroyed)return listener.call(this,event)};
   target.addEventListener(type,wrapped,options);
   const remove=()=>{target.removeEventListener(type,wrapped,options);listeners.delete(remove)};
   listeners.add(remove);return remove;
  }
  function observer(Type,callback){
   if(destroyed)throw new Error('The editor has been destroyed');
   const instance=new Type((...args)=>{if(!destroyed)callback(...args)});observers.add(instance);return instance;
  }
  function frame(callback){
   if(destroyed)return null;
   const id=root.requestAnimationFrame(time=>{frames.delete(id);if(!destroyed)callback(time)});frames.add(id);return id;
  }
  function delay(callback,ms){
   if(destroyed)return null;
   const id=root.setTimeout(()=>{delays.delete(id);if(!destroyed)callback()},ms);delays.add(id);return id;
  }
  function cancelDelay(id){root.clearTimeout(id);delays.delete(id)}
  function onDestroy(callback){if(destroyed)callback();else cleanups.push(callback)}
  function destroy(){
   if(destroyed)return;destroyed=true;
   for(const remove of [...listeners])remove();
   for(const instance of observers)instance.disconnect();observers.clear();
   for(const id of frames)root.cancelAnimationFrame(id);frames.clear();
   for(const id of delays)root.clearTimeout(id);delays.clear();
   // Each resource is released even if an unrelated cleanup fails.
   let error;for(const cleanup of cleanups.splice(0).reverse())try{cleanup()}catch(e){error??=e}
   if(error)root.console?.error('Editor cleanup failed',error);
  }
  function stats(){return {listeners:listeners.size,observers:observers.size,frames:frames.size,delays:delays.size,cleanups:cleanups.length}}
  return {listen,mutation:callback=>observer(root.MutationObserver,callback),resize:callback=>observer(root.ResizeObserver,callback),frame,delay,cancelDelay,onDestroy,destroy,stats,get destroyed(){return destroyed}};
 }
 root.SuiteEditorLifetime=Object.freeze({create});
})(typeof window==='undefined'?globalThis:window);
