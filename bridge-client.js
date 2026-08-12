/* SGCM 2.2 — cliente do bridge Apps Script
 * A interface permanece no GitHub Pages. Este cliente cria um iframe invisível
 * do Web App Apps Script e usa postMessage -> google.script.run -> postMessage.
 * Se o bridge não ficar disponível, app.js mantém o transporte HTTP antigo
 * como contingência.
 */
(function(){
  'use strict';

  class SGCMBridgeClient{
    constructor(apiUrl, options={}){
      this.apiUrl=String(apiUrl||'').trim();
      this.origin=options.origin||location.origin;
      this.ready=false;
      this.started=false;
      this.iframe=null;
      this.pending=new Map();
      this.seq=0;
      this.readyWaiters=[];
      this._onMessage=this._onMessage.bind(this);
      window.addEventListener('message',this._onMessage);
    }

    bridgeUrl(){
      const sep=this.apiUrl.includes('?')?'&':'?';
      return this.apiUrl+sep+new URLSearchParams({bridge:'1',origin:this.origin,v:'2.2'}).toString();
    }

    start(){
      if(this.started)return;
      this.started=true;
      const f=document.createElement('iframe');
      f.id='sgcmBridgeFrame';
      f.title='SGCM Bridge';
      f.setAttribute('aria-hidden','true');
      f.tabIndex=-1;
      f.style.cssText='position:fixed!important;width:1px!important;height:1px!important;left:-10000px!important;top:-10000px!important;border:0!important;opacity:0!important;pointer-events:none!important;';
      f.src=this.bridgeUrl();
      this.iframe=f;
      (document.body||document.documentElement).appendChild(f);
    }

    _onMessage(ev){
      const m=ev.data||{};
      if(!m||typeof m!=='object')return;
      if(this.iframe&&ev.source!==this.iframe.contentWindow)return;

      if(m.type==='SGCM_BRIDGE_READY'){
        this.ready=true;
        const waiters=this.readyWaiters.splice(0);
        waiters.forEach(w=>w(true));
        return;
      }

      if(m.type!=='SGCM_BRIDGE_RESULT'||!m.id)return;
      const p=this.pending.get(m.id);if(!p)return;
      this.pending.delete(m.id);clearTimeout(p.timer);
      if(!m.ok){p.reject(new Error(m.error||'Falha no bridge do Apps Script.'));return;}
      try{
        const payload=JSON.parse(String(m.raw||'{}'));
        if(!payload||payload.ok===false)p.reject(new Error(payload?.error||'Erro no backend do SGCM.'));
        else p.resolve(payload.data);
      }catch(e){p.reject(new Error('Resposta inválida do bridge do SGCM.'));}
    }

    waitReady(timeoutMs=2200){
      this.start();
      if(this.ready)return Promise.resolve(true);
      return new Promise(resolve=>{
        let done=false;
        const finish=v=>{if(done)return;done=true;clearTimeout(timer);resolve(v);};
        const timer=setTimeout(()=>finish(false),timeoutMs);
        this.readyWaiters.push(finish);
      });
    }

    request(action,args=[],timeoutMs=30000){
      if(!this.ready||!this.iframe||!this.iframe.contentWindow){
        return Promise.reject(new Error('Bridge do Apps Script ainda não está disponível.'));
      }
      const id='B'+Date.now().toString(36)+(++this.seq).toString(36)+Math.random().toString(36).slice(2,7);
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{
          this.pending.delete(id);
          reject(new Error('Tempo excedido na comunicação direta com o Apps Script.'));
        },timeoutMs);
        this.pending.set(id,{resolve,reject,timer});
        this.iframe.contentWindow.postMessage({type:'SGCM_BRIDGE_CALL',id,action:String(action||''),args:Array.isArray(args)?args:[]},'*');
      });
    }
  }

  window.SGCMBridgeClient=SGCMBridgeClient;
})();
