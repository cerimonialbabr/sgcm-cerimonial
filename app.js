const state = {
  screen: 'recepcao',
  bootstrap: null,
  currentGuest: null,
  eventGuests: [],
  visiblePeople: [],
  authorityPage: { query: '', items: [], nextOffset: null, total: 0 },
  authoritySearchTimer: null,
  nomData: null,
  nomItems: [],
  statsConfig: null,
  addGuestSelectedAuthority: null,
  operation: { idCer:'', versao:'0', convidados:[], familiares:[], atualizadoEm:'', ready:false }
};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

const CACHE_PREFIX='SGCM22_';
function cacheSet(key,value){
  try{localStorage.setItem(CACHE_PREFIX+key,JSON.stringify({at:Date.now(),value}));}catch(e){}
}
function cacheGet(key,maxAgeMs=12*60*60*1000){
  try{
    const raw=localStorage.getItem(CACHE_PREFIX+key); if(!raw)return null;
    const obj=JSON.parse(raw); if(!obj||!obj.at)return null;
    if(Date.now()-obj.at>maxAgeMs)return null;
    return obj.value;
  }catch(e){return null}
}
function cacheRemove(key){try{localStorage.removeItem(CACHE_PREFIX+key)}catch(e){}}
function ceremonyCacheKey(kind,id){return kind+'_'+String(id||'');}
const SGCM_READ_ACTIONS = new Set([
  'apiBootstrap','apiOperacaoSnapshot','apiListarCerimonias','apiListarConvidados','apiListarConvidadosResumo',
  'apiObterConvidado','apiObterConvidadoResumo','apiListarAutoridades','apiListarAutoridadesPagina',
  'apiObterAutoridade','apiListarFamiliares','apiObterTribuna','apiListarNominata','apiNominataPainel',
  'apiListarMensagensNominata','apiEstatisticas','apiListarGruposEstatistica',
  'apiOpcoesEstatistica','apiDashboard','apiDashboardVersao','apiFotoBase64','apiFotosBase64Lote','apiResultadoComando'
]);

function apiUrl(){
  const u = String(window.SGCM_CONFIG?.API_URL || '').trim();
  if(!u || u.includes('COLE_AQUI')) throw new Error('Configure a URL do Apps Script em config.js.');
  return u;
}

let __sgcmBridge=null;
async function initBridgeTransport(timeoutMs=2200){
  try{
    if(typeof window.SGCMBridgeClient!=='function')return false;
    if(!__sgcmBridge)__sgcmBridge=new window.SGCMBridgeClient(apiUrl(),{origin:location.origin});
    return await __sgcmBridge.waitReady(timeoutMs);
  }catch(e){console.warn('SGCM bridge indisponível; usando contingência HTTP.',e);return false;}
}
function bridgeReady(){return !!(__sgcmBridge&&__sgcmBridge.ready);}


function jsonp(fn,args=[]){
  return new Promise((resolve,reject)=>{
    let done=false;
    const cb='__sgcm_cb_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const s=document.createElement('script');
    const cleanup=()=>{
      if(done)return; done=true;
      try{delete window[cb]}catch(e){window[cb]=undefined}
      if(s.parentNode)s.parentNode.removeChild(s);
    };
    const timer=setTimeout(()=>{cleanup();reject(new Error('Tempo excedido ao consultar o backend do SGCM.'));},20000);
    window[cb]=payload=>{
      clearTimeout(timer); cleanup();
      if(!payload || payload.ok===false) reject(new Error(payload?.error || 'Erro no backend do SGCM.'));
      else resolve(payload.data);
    };
    const q=new URLSearchParams({action:fn,args:JSON.stringify(args),prefix:cb,_:String(Date.now())});
    s.src=apiUrl()+'?'+q.toString();
    s.onerror=()=>{clearTimeout(timer);cleanup();reject(new Error('Não foi possível acessar o backend do SGCM.'));};
    document.head.appendChild(s);
  });
}

async function writeCommand(fn,args=[]){
  const requestId='CMD_'+Date.now()+'_'+Math.random().toString(36).slice(2);
  const body=new URLSearchParams({requestId,action:fn,args:JSON.stringify(args)});
  try{ await fetch(apiUrl(),{method:'POST',mode:'no-cors',body}); }
  catch(e){ throw new Error('Não foi possível enviar a alteração ao backend do SGCM.'); }

  for(let i=0;i<180;i++){
    await new Promise(r=>setTimeout(r,i<6?350:600));
    const res=await jsonp('apiResultadoComando',[requestId]);
    if(!res?.pending){
      if(res.ok===false) throw new Error(res.error || 'A operação não foi concluída.');
      return res.data;
    }
  }
  throw new Error('A operação foi enviada, mas o resultado não foi confirmado a tempo. Atualize a tela para conferir.');
}

function server(fn,...args){
  if(bridgeReady()){
    // Uma chamada direta pelo bridge. Escritas nunca são repetidas
    // automaticamente; assim não há risco de duplicar uma ação operacional.
    return __sgcmBridge.request(fn,args,SGCM_READ_ACTIONS.has(fn)?25000:45000);
  }
  return SGCM_READ_ACTIONS.has(fn) ? jsonp(fn,args) : writeCommand(fn,args);
}
function showToast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),2600); }
function openModal(html,wide=false){ $('#modal').classList.toggle('modal-wide',!!wide); $('#modal').innerHTML=html; $('#modalBackdrop').classList.remove('hidden'); }
function closeModal(e){ if(e && e.target!==$('#modalBackdrop'))return; $('#modalBackdrop').classList.add('hidden'); $('#modal').classList.remove('modal-wide'); $('#modal').innerHTML=''; }
function modalCloseButton(){ return '<button class="modal-close" onclick="closeModal()">FECHAR</button>'; }
function toggleDrawer(on){ $('#drawer').classList.toggle('open',on); $('#drawerBackdrop').classList.toggle('hidden',!on); }
function sideNavigate(s){ toggleDrawer(false); navigate(s); }
function activeCeremony(){ return state.bootstrap && state.bootstrap.ativa; }
function contextCeremony(){ return activeCeremony(); }

function operacaoAtual(){return state.operation||{idCer:'',versao:'0',convidados:[],familiares:[],ready:false};}
function convidadosOperacao(){const c=contextCeremony(),o=operacaoAtual();return c&&o.idCer===String(c.ID_CERIMONIA)?(o.convidados||[]):[];}
function familiaresOperacao(){const c=contextCeremony(),o=operacaoAtual();return c&&o.idCer===String(c.ID_CERIMONIA)?(o.familiares||[]):[];}
function convidadoOperacaoPorId(id){return convidadosOperacao().find(g=>String(g.ID_CONVIDADO)===String(id))||null;}
function familiarOperacaoPorId(id){return familiaresOperacao().find(f=>String(f.ID_FAMILIAR)===String(id))||null;}

function aplicarSnapshotOperacional(snap,fromCache=false){
  if(!snap)return false;
  if(snap.bootstrap)state.bootstrap=snap.bootstrap;
  state.operation={
    idCer:String(snap.idCer||''),versao:String(snap.versao||'0'),
    convidados:Array.isArray(snap.convidados)?snap.convidados:[],
    familiares:Array.isArray(snap.familiares)?snap.familiares:[],
    atualizadoEm:snap.atualizadoEm||'',ready:true,fromCache:!!fromCache
  };
  state.eventGuests=state.operation.convidados;
  updateHeader();
  return true;
}

function salvarSnapshotOperacional(snap){
  try{localStorage.setItem(CACHE_PREFIX+'operation_snapshot',JSON.stringify({at:Date.now(),value:snap}));}catch(e){}
}
function carregarSnapshotOperacionalCache(maxAgeMs=24*60*60*1000){
  try{
    const raw=localStorage.getItem(CACHE_PREFIX+'operation_snapshot');if(!raw)return null;
    const obj=JSON.parse(raw);if(!obj||!obj.at||Date.now()-obj.at>maxAgeMs)return null;
    return obj.value||null;
  }catch(e){return null;}
}

async function reloadOperationalSnapshot(options={}){
  const silent=!!options.silent;
  try{
    const snap=await server('apiOperacaoSnapshot');
    aplicarSnapshotOperacional(snap,false);salvarSnapshotOperacional(snap);cacheSet('bootstrap',state.bootstrap);
    return snap;
  }catch(e){
    const cached=carregarSnapshotOperacionalCache();
    if(cached){
      aplicarSnapshotOperacional(cached,true);
      if(!silent)showToast('Sem resposta do backend. Exibindo a última sincronização operacional.');
      return cached;
    }
    throw e;
  }
}

function atualizarConvidadoLocal(id,patch){
  const o=operacaoAtual(),idx=(o.convidados||[]).findIndex(g=>String(g.ID_CONVIDADO)===String(id));
  if(idx<0)return null;
  o.convidados[idx]=Object.assign({},o.convidados[idx],patch||{});
  state.eventGuests=o.convidados;
  salvarSnapshotOperacional({bootstrap:state.bootstrap,idCer:o.idCer,versao:o.versao,convidados:o.convidados,familiares:o.familiares,atualizadoEm:new Date().toISOString()});
  return o.convidados[idx];
}
function atualizarFamiliarLocal(id,patch){
  const o=operacaoAtual(),idx=(o.familiares||[]).findIndex(f=>String(f.ID_FAMILIAR)===String(id));
  if(idx<0)return null;
  o.familiares[idx]=Object.assign({},o.familiares[idx],patch||{});
  salvarSnapshotOperacional({bootstrap:state.bootstrap,idCer:o.idCer,versao:o.versao,convidados:o.convidados,familiares:o.familiares,atualizadoEm:new Date().toISOString()});
  return o.familiares[idx];
}

function filtroOperacao(tipo){
  const list=convidadosOperacao();
  if(tipo==='RECEPCAO')return list.filter(g=>!g.PRESENCA&&(g.STATUS_CONFIRMACAO==='CONFIRMADO'||g.STATUS_CONFIRMACAO==='PENDENTE'));
  if(tipo==='PRESENTES')return list.filter(g=>!!g.PRESENCA);
  return list;
}

function formatDate(s){ if(!s)return''; const p=String(s).split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:s; }
function badgeStatus(s){ const u=String(s||'').toUpperCase(); if(u.includes('NÃO'))return '<span class="badge no">NÃO COMPARECERÁ</span>'; if(u.includes('CONFIRM'))return '<span class="badge active">CONFIRMADO</span>'; return '<span class="badge pending">PENDENTE</span>'; }

function photoHtml(p,cls='avatar'){
  if(!p || !p.FOTO_FILE_ID) return `<div class="${cls} placeholder">SEM<br>FOTO</div>`;
  const url=p.FOTO_URL||'';
  return `<img class="${cls}" src="${esc(url)}" data-file-id="${esc(p.FOTO_FILE_ID)}" loading="lazy" decoding="async" onerror="fallbackPhoto(this)" alt="Foto">`;
}

const __photoFallbackQueue=new Map();
const __photoFallbackMemory=new Map();
let __photoFallbackTimer=null;

/* Cache persistente de fotos de contingência.
 * A foto original continua no Drive; o navegador guarda somente a versão
 * Base64 já usada naquele aparelho, evitando novo Drive -> Apps Script em
 * aberturas posteriores no iPhone/iPad/PWA.
 */
const __PHOTO_DB_NAME='SGCM22_PHOTOS';
const __PHOTO_DB_STORE='photos';
let __photoDbPromise=null;
function photoDbOpen(){
  if(!('indexedDB' in window))return Promise.resolve(null);
  if(__photoDbPromise)return __photoDbPromise;
  __photoDbPromise=new Promise(resolve=>{
    try{
      const req=indexedDB.open(__PHOTO_DB_NAME,1);
      req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(__PHOTO_DB_STORE))db.createObjectStore(__PHOTO_DB_STORE,{keyPath:'id'});};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>resolve(null);
    }catch(e){resolve(null);}
  });
  return __photoDbPromise;
}
async function photoDbGet(id){
  const db=await photoDbOpen();if(!db)return'';
  return new Promise(resolve=>{
    try{
      const tx=db.transaction(__PHOTO_DB_STORE,'readonly');
      const req=tx.objectStore(__PHOTO_DB_STORE).get(String(id));
      req.onsuccess=()=>{
        const r=req.result;
        if(!r||!r.data){resolve('');return;}
        if(Date.now()-Number(r.ts||0)>90*24*60*60*1000){resolve('');return;}
        resolve(String(r.data||''));
      };
      req.onerror=()=>resolve('');
    }catch(e){resolve('');}
  });
}
async function photoDbPut(id,data){
  if(!data||!String(data).startsWith('data:image/'))return;
  // Evita armazenar acidentalmente blobs muito grandes por autoridade.
  if(String(data).length>1200000)return;
  const db=await photoDbOpen();if(!db)return;
  try{
    const tx=db.transaction(__PHOTO_DB_STORE,'readwrite');
    tx.objectStore(__PHOTO_DB_STORE).put({id:String(id),data:String(data),ts:Date.now()});
  }catch(e){}
}

async function fallbackPhoto(img){
  if(!img||img.dataset.fallback==='1'||img.dataset.fallback==='queued')return;
  const id=String(img.dataset.fileId||'').trim();
  if(!id){img.replaceWith(placeholderNode(img.className));return;}

  if(__photoFallbackMemory.has(id)){
    const data=__photoFallbackMemory.get(id);
    if(data){img.dataset.fallback='1';img.src=data;}
    else img.replaceWith(placeholderNode(img.className,'FOTO<br>INDISP.'));
    return;
  }

  img.dataset.fallback='cache';
  const cached=await photoDbGet(id);
  if(!img.isConnected)return;
  if(cached){
    __photoFallbackMemory.set(id,cached);
    img.dataset.fallback='1';img.src=cached;return;
  }

  img.dataset.fallback='queued';
  const list=__photoFallbackQueue.get(id)||[];
  list.push(img);
  __photoFallbackQueue.set(id,list);

  clearTimeout(__photoFallbackTimer);
  __photoFallbackTimer=setTimeout(flushPhotoFallbackQueue,80);
}

async function flushPhotoFallbackQueue(){
  const entries=[...__photoFallbackQueue.entries()];
  __photoFallbackQueue.clear();
  if(!entries.length)return;

  for(let i=0;i<entries.length;i+=10){
    const chunk=entries.slice(i,i+10);
    const ids=chunk.map(x=>x[0]);
    let map={};
    try{map=await server('apiFotosBase64Lote',ids)||{};}catch(e){map={};}

    chunk.forEach(([id,imgs])=>{
      const data=map[id]||'';
      __photoFallbackMemory.set(id,data);
      if(data)photoDbPut(id,data);
      imgs.forEach(img=>{
        if(!img||!img.isConnected)return;
        if(data){
          img.dataset.fallback='1';
          img.src=data;
        }else{
          img.replaceWith(placeholderNode(img.className,'FOTO<br>INDISP.'));
        }
      });
    });
  }
}
function placeholderNode(className,label='SEM<br>FOTO'){
  const d=document.createElement('div');
  d.className=className+' placeholder';
  d.innerHTML=label;
  return d;
}

function guestWarningsHtml(g){
  if(!g)return'';
  const out=[];
  if(g.CADASTRADO_BANCO===false) out.push('<span class="data-warning missing-bank">NÃO CADASTRADO NO BANCO</span>');
  else if(g.TEM_FOTO===false) out.push('<span class="data-warning no-photo">SEM FOTO</span>');
  const extras=(g.DADOS_FALTANTES||[]).filter(x=>x!=='FOTO' && x!=='NÃO CADASTRADO EM AUTORIDADES');
  if(extras.length) out.push(`<span class="data-warning">FALTA: ${esc(extras.join(', '))}</span>`);
  return out.length?'<div class="data-warnings">'+out.join('')+'</div>':'';
}

async function reloadBootstrap(options={}){
  if(options.operational!==false)return reloadOperationalSnapshot(options);
  try{
    state.bootstrap=await server('apiBootstrap');cacheSet('bootstrap',state.bootstrap);
  }catch(e){
    const cached=cacheGet('bootstrap',24*60*60*1000);if(!cached)throw e;
    state.bootstrap=cached;if(!options.silent)showToast('Sem resposta do backend. Exibindo última sincronização.');
  }
  updateHeader();return state.bootstrap;
}
function updateHeader(){
  const a=activeCeremony(), h=$('#headerContext'), b=$('#contextBanner');
  h.textContent=a ? `${a.NOME_EVENTO}${a.DATA?' | '+formatDate(a.DATA):''}` : 'Nenhuma cerimônia ativa';
  if(!a){ b.textContent='Nenhuma cerimônia está ATIVA. Ative uma cerimônia antes da operação.'; b.classList.remove('hidden'); }
  else b.classList.add('hidden');
}

async function boot(){
  try{
    apiUrl();
    // Dá uma pequena janela para o bridge ficar pronto. Se Safari/PWA bloquear
    // o iframe, o SGCM segue pela API HTTP antiga sem perder funcionalidade.
    await initBridgeTransport(2400);
    await reloadOperationalSnapshot();
    startOperationRevisionWatch();
    navigate(activeCeremony()?'recepcao':'cerimonias');
  }catch(e){
    $('#main').innerHTML=`<div class="notice danger-notice">${esc(e.message)}</div><div class="card"><p class="small">Confira a URL /exec do Apps Script em <b>config.js</b>.</p></div>`;
  }
}

function navigate(s){
  state.screen=s;
  document.querySelectorAll('[data-nav-screen]').forEach(b=>b.classList.toggle('active',b.dataset.navScreen===s));
  const map={evento:renderEvento,recepcao:renderRecepcao,presentes:renderPresentes,familiares:renderFamiliares,cerimonias:renderCerimonias,autoridades:renderAutoridades,tribuna:renderTribuna,nominata:renderNominata,estatisticas:renderEstatisticas,documentos:renderDocumentos,guia:renderGuia};
  $('#main').innerHTML='<div class="loading">Carregando...</div>';
  Promise.resolve(map[s]?map[s]():renderRecepcao()).catch(e=>$('#main').innerHTML=`<div class="notice danger-notice">${esc(e.message)}</div>`);
  if(typeof OPERATION_SCREENS!=='undefined'&&OPERATION_SCREENS.has(s))setTimeout(checkOperationRevision,80);
}

function refreshCurrent(){ reloadOperationalSnapshot().then(()=>navigate(state.screen)); }

/* -------------------------------------------------------------------------- */
/* CERIMÔNIAS                                                                  */
/* -------------------------------------------------------------------------- */
async function renderCerimonias(){
  const list=(state.bootstrap?.cerimonias||[]);
  let html=`<div class="page-head mobile-inline-head"><div><div class="section-title">CERIMÔNIAS</div><div class="small muted">Prepare várias cerimônias; somente uma pode permanecer ativa.</div></div><div class="page-actions single"><button class="btn primary" onclick="openCeremonyForm()">NOVA CERIMÔNIA</button></div></div>`;
  if(!list.length) html+='<div class="empty">Nenhuma cerimônia cadastrada.</div>';
  else html+=`<div class="ceremony-grid">${list.map(c=>`<div class="card ${c.STATUS==='ATIVA'?'active-card':'standby-card'}"><div class="row between"><div class="grow"><div class="event-name">${esc(c.NOME_EVENTO)}</div><div class="small muted">${esc(formatDate(c.DATA))}${c.LOCAL?' | '+esc(c.LOCAL):''}</div></div><span class="badge ${c.STATUS==='ATIVA'?'active':''}">${esc(c.STATUS)}</span></div><div class="actions compact">${c.STATUS==='ATIVA'?'<span class="small muted">Cerimônia operacional.</span>':`<button class="btn primary sm" onclick="activateCeremony('${c.ID_CERIMONIA}')">ATIVAR</button><button class="btn danger sm" onclick="deleteCeremony('${c.ID_CERIMONIA}')">EXCLUIR</button>`}<button class="btn outline sm" onclick="openCeremonyForm('${c.ID_CERIMONIA}')">EDITAR</button></div></div>`).join('')}</div>`;
  $('#main').innerHTML=html;
}

function openCeremonyForm(id=''){
  const c=(state.bootstrap?.cerimonias||[]).find(x=>x.ID_CERIMONIA===id)||{};
  openModal(`${modalCloseButton()}<h2>${id?'Editar':'Nova'} cerimônia</h2><div class="field"><label>Nome</label><input id="ceName" value="${esc(c.NOME_EVENTO||'')}"></div><div class="grid2"><div class="field"><label>Data</label><input id="ceDate" type="date" value="${esc(c.DATA||'')}"></div><div class="field"><label>Local</label><input id="ceLocal" value="${esc(c.LOCAL||'')}"></div></div><button class="btn primary block" onclick="saveCeremony('${esc(id)}')">SALVAR</button>`);
}
async function saveCeremony(id){ await server('apiSalvarCerimonia',{ID_CERIMONIA:id,NOME_EVENTO:$('#ceName').value,DATA:$('#ceDate').value,LOCAL:$('#ceLocal').value}); closeModal(); await reloadOperationalSnapshot({silent:true}); renderCerimonias(); }
async function activateCeremony(id){ const atual=activeCeremony(); if(atual&&!confirm(`A cerimônia atualmente ativa é "${atual.NOME_EVENTO}". Colocá-la em STANDBY e ativar a selecionada?`))return; await server('apiAtivarCerimonia',id); await reloadOperationalSnapshot({silent:true}); showToast('Cerimônia ativada.'); renderCerimonias(); }
async function deleteCeremony(id){ if(!confirm('Excluir a cerimônia e suas duas abas de planejamento? Esta operação não pode ser desfeita.'))return; await server('apiExcluirCerimonia',id); await reloadOperationalSnapshot({silent:true}); renderCerimonias(); }

/* -------------------------------------------------------------------------- */
/* EVENTO                                                                      */
/* -------------------------------------------------------------------------- */
function eventOrderMap(guests){
  const map={};
  const president=guests.find(g=>g.PODE_PRESIDIR && !String(g.STATUS_CONFIRMACAO||'').includes('NÃO')) || null;
  let n=1;
  guests.forEach(g=>{
    if(president && g.ID_CONVIDADO===president.ID_CONVIDADO) map[g.ID_CONVIDADO]='PRESIDENTE';
    else if(g.ANFITRIAO) map[g.ID_CONVIDADO]='ANFITRIÃO';
    else if(g.COANFITRIAO) map[g.ID_CONVIDADO]='COANFITRIÃO';
    else map[g.ID_CONVIDADO]=String(n++);
  });
  return map;
}

function renderEventoConteudo(c,guests){
  state.eventGuests=guests||[];
  const labels=eventOrderMap(state.eventGuests);
  $('#main').innerHTML=`
    <div class="section-title">EVENTO</div>
    <div class="card active-card event-summary">
      <div><div class="event-name">${esc(c.NOME_EVENTO)}</div><div class="small muted">${esc(formatDate(c.DATA))}${c.LOCAL?' | '+esc(c.LOCAL):''}</div><div class="metric" style="margin-top:8px"><span>Total de convidados</span><strong>${state.eventGuests.length}</strong></div></div>
      <div class="event-actions compact-actions"><button class="btn primary" onclick="openAddGuest()">ADICIONAR CONVIDADO</button><button class="btn outline" onclick="navigate('tribuna')">TRIBUNA</button><button class="btn outline" onclick="navigate('nominata')">NOMINATA</button></div>
    </div>
    <div class="section-title">CONVIDADOS DA CERIMÔNIA</div>
    <div class="event-people">${state.eventGuests.map(g=>eventPersonCard(g,labels[g.ID_CONVIDADO])).join('')}</div>`;
}
async function renderEvento(){
  const c=contextCeremony(); if(!c){$('#main').innerHTML='<div class="empty">Nenhuma cerimônia ativa.</div>';return;}
  if(!operacaoAtual().ready||operacaoAtual().idCer!==String(c.ID_CERIMONIA)) await reloadOperationalSnapshot({silent:true});
  renderEventoConteudo(c,convidadosOperacao());
}

function eventPersonCard(g,label){
  return `<div class="person-card clickable" onclick="openGuestEventDetail('${g.ID_CONVIDADO}')">${photoHtml(g)}<div class="grow"><div class="person-name">${esc((g.POSTO?g.POSTO+' ':'')+(g.NOME_GUERRA||g.NOME_COMPLETO))}</div><div class="person-sub">${esc(g.CARGO_ATUAL||g.NOME_COMPLETO)}</div>${guestWarningsHtml(g)}</div><div class="person-right">${g.PRESENCA?'<span class="badge present">PRESENTE</span>':badgeStatus(g.STATUS_CONFIRMACAO)}<span class="order-label ${/PRESIDENTE|ANFITRIÃO|COANFITRIÃO/.test(label)?'special':''}">${esc(label)}</span></div></div>`;
}

async function openGuestEventDetail(id){
  const c=contextCeremony(), g=convidadoOperacaoPorId(id)||await server('apiObterConvidado',c.ID_CERIMONIA,id); if(!g)return;
  state.currentGuest=g;
  const labels=eventOrderMap(state.eventGuests.length?state.eventGuests:convidadosOperacao());
  const label=labels[id]||'';
  const missing=(g.DADOS_FALTANTES||[]);
  const warning=missing.length?`<div class="notice ${g.CADASTRADO_BANCO?'':'danger-notice'}"><b>Cadastro:</b> ${esc(missing.join(', '))}. Isso não bloqueia a participação na cerimônia.</div>`:'';
  const bankAction=!g.CADASTRADO_BANCO
    ? `<button class="btn warning" onclick="openRegisterGuestAuthority('${id}')">CADASTRAR NO BANCO</button>`
    : (g.ID_AUTORIDADE?`<button class="btn outline" onclick="openAuthorityForm('${g.ID_AUTORIDADE}')">EDITAR CADASTRO</button>`:'');
  openModal(`${modalCloseButton()}${photoHtml(g,'modal-photo')}<h2>${esc((g.POSTO?g.POSTO+' ':'')+(g.NOME_GUERRA||g.NOME_COMPLETO))}</h2>${warning}
  <dl class="detail-grid"><dt>Ordem no evento</dt><dd><span class="order-label special">${esc(label)}</span></dd><dt>Nome completo</dt><dd>${esc(g.NOME_COMPLETO)}</dd><dt>Cargo</dt><dd>${esc(g.CARGO_ATUAL||'—')}</dd><dt>Força / tipo</dt><dd>${esc(g.FORCA||'—')}</dd><dt>Status</dt><dd>${badgeStatus(g.STATUS_CONFIRMACAO)}</dd><dt>Honras</dt><dd>${g.FAZ_JUS_HONRAS?'SIM':'NÃO'}</dd><dt>Pode presidir</dt><dd>${g.PODE_PRESIDIR?'SIM':'NÃO'}</dd></dl>
  <div class="detail-section"><h3>Operação</h3><div class="action-grid">${bankAction}${g.PRESENCA?`<button class="btn danger" onclick="guestPresence('${id}',false)">CANCELAR PRESENÇA</button>`:`<button class="btn ok" onclick="guestPresence('${id}',true)">CONFIRMAR PRESENÇA</button>`}<button class="btn secondary" onclick="changeGuestStatus('${id}')">ALTERAR STATUS</button><button class="btn outline" onclick="setRole('${id}','ANFITRIAO')">ANFITRIÃO</button><button class="btn outline" onclick="setRole('${id}','COANFITRIAO')">COANFITRIÃO</button><button class="btn outline" onclick="setRole('${id}','CORTE')">CORTE DA TRIBUNA</button><button class="btn outline" onclick="toggleExclude('${id}')">${g.EXCLUIR_TRIBUNA?'REINCLUIR NA TRIBUNA':'EXCLUIR DA TRIBUNA'}</button><button class="btn outline" onclick="addGuestToNominata('${id}')">ADICIONAR À NOMINATA</button><button class="btn secondary" onclick="moveGuest('${id}',-1)">SUBIR NA ORDEM</button><button class="btn secondary" onclick="moveGuest('${id}',1)">DESCER NA ORDEM</button></div></div>`,true);
}

async function guestPresence(id,on){
  const c=contextCeremony(); if(!c)return;
  const antigo=convidadoOperacaoPorId(id);if(!antigo)return;
  const anterior=Object.assign({},antigo);
  closeModal();

  atualizarConvidadoLocal(id,{PRESENCA:!!on,PRESENTE_EM:on?new Date().toISOString():''});
  if(state.screen==='recepcao')renderOperationScreen(c,filtroOperacao('RECEPCAO'),'RECEPCAO');
  else if(state.screen==='presentes')renderOperationScreen(c,filtroOperacao('PRESENTES'),'PRESENTES');
  else if(state.screen==='evento')renderEventoConteudo(c,convidadosOperacao());

  showToast(on?'Confirmando presença...':'Cancelando presença...');
  try{
    await server(on?'apiMarcarPresenca':'apiCancelarPresenca',c.ID_CERIMONIA,id);
    showToast(on?'Presença confirmada.':'Presença cancelada.');
  }catch(e){
    atualizarConvidadoLocal(id,anterior);
    if(state.screen==='recepcao')renderOperationScreen(c,filtroOperacao('RECEPCAO'),'RECEPCAO');
    else if(state.screen==='presentes')renderOperationScreen(c,filtroOperacao('PRESENTES'),'PRESENTES');
    else if(state.screen==='evento')renderEventoConteudo(c,convidadosOperacao());
    showToast('Não foi possível confirmar a alteração.');
    throw e;
  }
}
async function changeGuestStatus(id){ const c=contextCeremony(); const g=state.currentGuest||convidadoOperacaoPorId(id)||await server('apiObterConvidado',c.ID_CERIMONIA,id); openModal(`${modalCloseButton()}<h2>Alterar status</h2><div class="field"><label>Status da confirmação</label><select id="statusGuest">${['CONFIRMADO','PENDENTE','NÃO COMPARECERÁ'].map(x=>`<option ${g.STATUS_CONFIRMACAO===x?'selected':''}>${x}</option>`).join('')}</select></div><button class="btn primary block" onclick="saveGuestStatus('${id}')">SALVAR</button>`); }
async function saveGuestStatus(id){ const c=contextCeremony(),status=$('#statusGuest').value; await server('apiAtualizarStatusConvidado',c.ID_CERIMONIA,id,status); atualizarConvidadoLocal(id,{STATUS_CONFIRMACAO:status}); closeModal(); showToast('Status atualizado.'); navigate(state.screen); }
async function setRole(id,role){ const c=contextCeremony(); await server('apiDefinirPapelConvidado',c.ID_CERIMONIA,id,role); await reloadOperationalSnapshot({silent:true}); closeModal(); showToast('Definição atualizada.'); renderEvento(); }
async function toggleExclude(id){ const c=contextCeremony(); await server('apiToggleExcluirTribuna',c.ID_CERIMONIA,id); await reloadOperationalSnapshot({silent:true}); closeModal(); renderEvento(); }
async function addGuestToNominata(id){ const c=contextCeremony(); await server('apiAdicionarItemNominata',{ID_CERIMONIA:c.ID_CERIMONIA,TIPO_ITEM:'AUTORIDADE',REFERENCIA_ID:id}); closeModal(); showToast('Autoridade adicionada à nominata.'); }
async function moveGuest(id,d){ const c=contextCeremony(); await server('apiMoverConvidado',c.ID_CERIMONIA,id,d); await reloadOperationalSnapshot({silent:true}); closeModal(); renderEvento(); }

/* -------------------------------------------------------------------------- */
/* RECEPÇÃO / PRESENTES                                                        */
/* -------------------------------------------------------------------------- */
function operationPersonList(list,showStatus){
  if(!list.length)return'<div class="empty">Nenhum registro.</div>';
  return `<div class="person-list two-col">${list.map(g=>`<div class="person-card clickable" onclick="openGuestOperationDetail('${g.ID_CONVIDADO}')">${photoHtml(g)}<div class="grow"><div class="person-name">${esc((g.POSTO?g.POSTO+' ':'')+(g.NOME_GUERRA||g.NOME_COMPLETO))}</div><div class="person-sub">${esc(g.CARGO_ATUAL||g.NOME_COMPLETO)}</div></div><div class="person-right">${g.PRESENCA?'<span class="badge present">PRESENTE</span>':(showStatus?badgeStatus(g.STATUS_CONFIRMACAO):'')}</div></div>`).join('')}</div>`;
}

function renderOperationScreen(c,list,tipo){
  const recepcao=tipo==='RECEPCAO';
  state.visiblePeople=list||[];
  $('#main').innerHTML=`<div class="page-head"><div><div class="section-title">${recepcao?'RECEPÇÃO':'PRESENTES'}</div><div class="small muted">${esc(c.NOME_EVENTO)} | ${state.visiblePeople.length} ${recepcao?'aguardando chegada':'presentes'}</div></div></div><div class="searchbar"><input placeholder="Pesquisar por nome, posto ou cargo" oninput="filterVisiblePeople(this.value,${recepcao?'true':'false'})"></div><div id="peopleArea">${operationPersonList(state.visiblePeople,recepcao)}</div>`;
}
async function renderRecepcao(){
  const c=contextCeremony(); if(!c){$('#main').innerHTML='<div class="empty">Nenhuma cerimônia ativa.</div>';return;}
  if(!operacaoAtual().ready||operacaoAtual().idCer!==String(c.ID_CERIMONIA))await reloadOperationalSnapshot({silent:true});
  renderOperationScreen(c,filtroOperacao('RECEPCAO'),'RECEPCAO');
}
async function renderPresentes(){
  const c=contextCeremony(); if(!c){$('#main').innerHTML='<div class="empty">Nenhuma cerimônia ativa.</div>';return;}
  if(!operacaoAtual().ready||operacaoAtual().idCer!==String(c.ID_CERIMONIA))await reloadOperationalSnapshot({silent:true});
  renderOperationScreen(c,filtroOperacao('PRESENTES'),'PRESENTES');
}

function filterVisiblePeople(q,showStatus){
  const key=String(q||'').trim().toUpperCase();
  const list=(state.visiblePeople||[]).filter(g=>!key || [g.POSTO,g.NOME_COMPLETO,g.NOME_GUERRA,g.CARGO_ATUAL,g.FORCA].some(v=>String(v||'').toUpperCase().includes(key)));
  $('#peopleArea').innerHTML=operationPersonList(list,showStatus);
}

async function openGuestOperationDetail(id){
  const c=contextCeremony(), g=convidadoOperacaoPorId(id)||await server('apiObterConvidadoResumo',c.ID_CERIMONIA,id); if(!g)return;
  const isPresent=state.screen==='presentes' || g.PRESENCA;
  openModal(`${modalCloseButton()}${photoHtml(g,'modal-photo')}<h2>${esc((g.POSTO?g.POSTO+' ':'')+(g.NOME_GUERRA||g.NOME_COMPLETO))}</h2><dl class="detail-grid compact"><dt>Posto</dt><dd>${esc(g.POSTO||'—')}</dd><dt>Nome de guerra</dt><dd>${esc(g.NOME_GUERRA||'—')}</dd><dt>Nome completo</dt><dd>${esc(g.NOME_COMPLETO||'—')}</dd><dt>Cargo</dt><dd>${esc(g.CARGO_ATUAL||'—')}</dd><dt>Força / tipo</dt><dd>${esc(g.FORCA||'—')}</dd></dl><div class="actions">${isPresent?`<button class="btn danger block" onclick="guestPresence('${id}',false)">CANCELAR PRESENÇA</button>`:`<button class="btn ok block" onclick="guestPresence('${id}',true)">CONFIRMAR PRESENÇA</button>`}</div>`);
}

/* -------------------------------------------------------------------------- */
/* ADICIONAR CONVIDADO / CADASTRAR NO BANCO                                   */
/* -------------------------------------------------------------------------- */
async function openAddGuest(preselectId=''){
  const c=contextCeremony(), guests=convidadosOperacao();
  const labels=eventOrderMap(guests);
  state.addGuestSelectedAuthority=preselectId||null;
  openModal(`${modalCloseButton()}<h2>Adicionar convidado</h2><p class="small muted">Selecione a autoridade, escolha onde ela entrará e somente depois confirme em ADICIONAR À CERIMÔNIA.</p><div class="field"><label>Pesquisar no banco de autoridades</label><input id="agSearch" oninput="searchAuthorityForGuest()" placeholder="Nome, posto ou cargo"></div><div id="agSelected" class="selected-guest-box">${preselectId?'<div class="small muted">Carregando autoridade selecionada...</div>':'<div class="small muted">Nenhuma autoridade selecionada.</div>'}</div><div id="agResults" class="person-list add-guest-results"></div><div class="grid2 add-guest-position"><div class="field"><label>Inserir em relação a</label><select id="agRef"><option value="">Final da lista</option>${guests.map(g=>`<option value="${g.ID_CONVIDADO}">${esc(labels[g.ID_CONVIDADO]+' — '+g.POSTO+' '+g.NOME_GUERRA)}</option>`).join('')}</select></div><div class="field"><label>Posição</label><select id="agPos"><option value="DEPOIS">Depois</option><option value="ANTES">Antes</option></select></div></div><div class="modal-action-row"><button class="btn outline" onclick="openAuthorityForm('',true)">NOVA AUTORIDADE</button><button id="agAddBtn" class="btn primary" onclick="confirmAddSelectedAuthority()" ${preselectId?'':'disabled'}>ADICIONAR À CERIMÔNIA</button></div>`,true);
  if(preselectId) await selectAuthorityForGuest(preselectId);
}
async function searchAuthorityForGuest(){
  const q=$('#agSearch').value; if(q.length<2){$('#agResults').innerHTML='';return;}
  const page=await server('apiListarAutoridadesPagina',q,0,30);
  $('#agResults').innerHTML=page.items.map(a=>`<div class="person-card clickable selectable-authority ${state.addGuestSelectedAuthority===a.ID_AUTORIDADE?'selected':''}" onclick="selectAuthorityForGuest('${a.ID_AUTORIDADE}')">${photoHtml(a)}<div class="grow"><div class="person-name">${esc((a.POSTO?a.POSTO+' ':'')+(a.NOME_GUERRA||a.NOME_COMPLETO))}</div><div class="person-sub">${esc(a.CARGO_ATUAL)}</div></div><div class="person-right"><span class="badge ${state.addGuestSelectedAuthority===a.ID_AUTORIDADE?'present':'active'}">${state.addGuestSelectedAuthority===a.ID_AUTORIDADE?'SELECIONADA':'SELECIONAR'}</span></div></div>`).join('')||'<div class="empty">Nenhuma autoridade encontrada.</div>';
}
async function selectAuthorityForGuest(id){
  state.addGuestSelectedAuthority=id;
  const a=await server('apiObterAutoridade',id);
  if($('#agSelected')) $('#agSelected').innerHTML=`<div class="selected-authority">${photoHtml(a)}<div class="grow"><div class="small muted">AUTORIDADE SELECIONADA</div><div class="person-name">${esc((a.POSTO?a.POSTO+' ':'')+(a.NOME_GUERRA||a.NOME_COMPLETO))}</div><div class="person-sub">${esc(a.CARGO_ATUAL||a.NOME_COMPLETO)}</div></div></div>`;
  if($('#agAddBtn')) $('#agAddBtn').disabled=false;
  if($('#agSearch') && $('#agSearch').value.length>=2) await searchAuthorityForGuest();
}
async function confirmAddSelectedAuthority(){
  const id=state.addGuestSelectedAuthority; if(!id){showToast('Selecione uma autoridade.');return;}
  const c=contextCeremony();
  await server('apiAdicionarConvidado',c.ID_CERIMONIA,{ID_AUTORIDADE:id,REFERENCIA_ID:$('#agRef').value,POSICAO:$('#agPos').value,STATUS_CONFIRMACAO:'PENDENTE'});
  await reloadOperationalSnapshot({silent:true}); closeModal(); state.addGuestSelectedAuthority=null; showToast('Convidado adicionado.'); renderEvento();
}

async function openRegisterGuestAuthority(id){
  const c=contextCeremony(),g=convidadoOperacaoPorId(id)||await server('apiObterConvidado',c.ID_CERIMONIA,id); if(!g)return;
  openModal(`${modalCloseButton()}<h2>Cadastrar convidado no banco</h2><p class="small muted">A autoridade será inserida fisicamente em AUTORIDADES na mesma posição relativa da cerimônia. Nenhum campo abaixo é requisito para manter o convidado na formatura.</p><div class="grid2"><div class="field"><label>Posto / tratamento</label><input id="rgPosto" value="${esc(g.POSTO||'')}"></div><div class="field"><label>Nome de guerra</label><input id="rgGuerra" value="${esc(g.NOME_GUERRA||'')}"></div></div><div class="field"><label>Nome completo</label><input id="rgNome" value="${esc(g.NOME_COMPLETO||'')}"></div><div class="field"><label>Cargo atual</label><input id="rgCargo" value="${esc(g.CARGO_ATUAL||'')}"></div><div class="grid2"><div class="field"><label>Força / tipo</label><select id="rgForca"><option value="">Selecione</option>${authorityForceOptions('')}</select></div><div class="field"><label>Situação</label><select id="rgSit"><option value="">Selecione</option><option>ATIVA</option><option>RESERVA</option></select></div></div><div class="grid2"><div class="field"><label>Sexo</label><select id="rgSexo"><option value=""></option><option>MASCULINO</option><option>FEMININO</option></select></div><div class="field"><label>Foto</label><input id="rgFoto" type="file" accept="image/*" capture="environment"></div></div><button class="btn primary block" onclick="saveGuestToBank('${id}')">SALVAR EM AUTORIDADES</button>`,true);
}
async function saveGuestToBank(id){
  const c=contextCeremony(),f=$('#rgFoto').files[0],payload={POSTO:$('#rgPosto').value,NOME_COMPLETO:$('#rgNome').value,NOME_GUERRA:$('#rgGuerra').value,CARGO_ATUAL:$('#rgCargo').value,FORCA:$('#rgForca').value,SITUACAO:$('#rgSit').value,SEXO:$('#rgSexo').value,HONRAS_OVERRIDE:'AUTO',PRESIDIR_OVERRIDE:'AUTO'};
  if(f){const img=await readImageForUpload(f);payload.FOTO_NOME=img.name;payload.FOTO_MIME=img.mime;payload.FOTO_BASE64=img.data;}
  await server('apiCadastrarConvidadoNoBanco',c.ID_CERIMONIA,id,payload);
  await reloadOperationalSnapshot({silent:true});
  closeModal(); showToast('Autoridade cadastrada no banco.');
  navigate(state.screen);
}

/* -------------------------------------------------------------------------- */
/* AUTORIDADES                                                                 */
/* -------------------------------------------------------------------------- */
function authorityForceOptions(selected){
  const base=['Presidente da República','Vice-Presidente da República','Presidente do Senado Federal','Presidente da Câmara dos Deputados','Presidente do Supremo Tribunal Federal','Ministro de Estado da Defesa','Autoridade Civil','Aeronáutica','Exército','Marinha'];
  const list=selected&&!base.includes(selected)?[selected].concat(base):base;
  return list.map(x=>`<option ${selected===x?'selected':''}>${x}</option>`).join('');
}
function overrideOptions(selected){ return ['AUTO','SIM','NÃO'].map(x=>`<option ${selected===x?'selected':''}>${x}</option>`).join(''); }

function renderAuthorityPage(page){
  state.authorityPage={query:page.query||'',items:page.items||[],nextOffset:page.proximoOffset,total:page.total||0};
  $('#main').innerHTML=`<div class="page-head mobile-inline-head"><div><div class="section-title">AUTORIDADES</div><div class="small muted"><strong>${state.authorityPage.total}</strong> autoridades no banco, na mesma ordem da planilha.</div></div><div class="page-actions single"><button class="btn primary" onclick="openAuthorityForm()">NOVA AUTORIDADE</button></div></div><div class="searchbar"><input id="autSearch" placeholder="Pesquisar por nome, posto, cargo ou força" oninput="scheduleAuthoritySearch(this.value)"></div><div id="autArea">${authorityList(state.authorityPage.items)}</div><div id="autMore" class="load-more-wrap">${state.authorityPage.nextOffset!==null?'<button class="btn outline" onclick="loadMoreAuthorities()">CARREGAR MAIS</button>':''}</div>`;
}
async function renderAutoridades(){
  const cached=cacheGet('authority_first_page',24*60*60*1000);
  if(cached) renderAuthorityPage(cached);
  try{
    const page=await server('apiListarAutoridadesPagina','',0,40);
    page.query=''; cacheSet('authority_first_page',page); renderAuthorityPage(page);
  }catch(e){if(!cached)throw e;showToast('Modo contingência: exibindo banco em cache.');}
}

function authorityList(list){
  if(!list.length)return'<div class="empty">Nenhuma autoridade encontrada.</div>';
  return `<div class="authority-grid">${list.map(a=>`<div class="person-card clickable" onclick="openAuthorityDetail('${a.ID_AUTORIDADE}')">${photoHtml(a)}<div class="grow"><div class="person-name">${esc((a.POSTO?a.POSTO+' ':'')+(a.NOME_GUERRA||a.NOME_COMPLETO))}</div><div class="person-sub">${esc(a.CARGO_ATUAL)}</div></div><div class="person-right">${esc(a.FORCA)}</div></div>`).join('')}</div>`;
}

function scheduleAuthoritySearch(q){ clearTimeout(state.authoritySearchTimer); state.authoritySearchTimer=setTimeout(()=>searchAuthorities(q),420); }
async function searchAuthorities(q){ const query=String(q||'').trim(); const page=await server('apiListarAutoridadesPagina',query,0,40); state.authorityPage={query,items:page.items,nextOffset:page.proximoOffset,total:page.total}; $('#autArea').innerHTML=authorityList(page.items); $('#autMore').innerHTML=page.proximoOffset!==null?'<button class="btn outline" onclick="loadMoreAuthorities()">CARREGAR MAIS</button>':''; }
async function loadMoreAuthorities(){ const p=state.authorityPage; if(p.nextOffset===null)return; const page=await server('apiListarAutoridadesPagina',p.query,p.nextOffset,40); p.items=p.items.concat(page.items); p.nextOffset=page.proximoOffset; p.total=page.total; $('#autArea').innerHTML=authorityList(p.items); $('#autMore').innerHTML=p.nextOffset!==null?'<button class="btn outline" onclick="loadMoreAuthorities()">CARREGAR MAIS</button>':''; }

async function openAuthorityDetail(id){
  const a=await server('apiObterAutoridade',id); if(!a)return;
  openModal(`${modalCloseButton()}${photoHtml(a,'modal-photo')}<h2>${esc((a.POSTO?a.POSTO+' ':'')+(a.NOME_GUERRA||a.NOME_COMPLETO))}</h2><dl class="detail-grid"><dt>Nome completo</dt><dd>${esc(a.NOME_COMPLETO||'—')}</dd><dt>Posto / tratamento</dt><dd>${esc(a.POSTO||'—')}</dd><dt>Posto por extenso</dt><dd>${esc(a.POSTO_EXTENSO||'—')}</dd><dt>Cargo atual</dt><dd>${esc(a.CARGO_ATUAL||'—')}</dd><dt>Força / tipo</dt><dd>${esc(a.FORCA||'—')}</dd><dt>Situação</dt><dd>${esc(a.SITUACAO||'—')}</dd><dt>Sexo</dt><dd>${esc(a.SEXO||'—')}</dd><dt>Vocativo</dt><dd>${esc(a.VOCATIVO||'—')}</dd><dt>Faz jus a honras</dt><dd>${a.FAZ_JUS_HONRAS?'SIM':'NÃO'} <span class="small muted">(controle: ${esc(a.HONRAS_OVERRIDE||'AUTO')})</span></dd><dt>Pode presidir</dt><dd>${a.PODE_PRESIDIR?'SIM':'NÃO'} <span class="small muted">(controle: ${esc(a.PRESIDIR_OVERRIDE||'AUTO')})</span></dd></dl><div class="actions"><button class="btn primary" onclick="openAuthorityForm('${id}')">EDITAR AUTORIDADE</button></div>`,true);
}

async function openAuthorityForm(id='',addAfter=false){
  const a=id?await server('apiObterAutoridade',id):{};
  openModal(`${modalCloseButton()}<h2>${id?'Editar':'Nova'} autoridade</h2>${a&&a.FOTO_FILE_ID?photoHtml(a,'modal-photo'):''}${id?`<div class="record-id">ID: ${esc(a.ID_AUTORIDADE||id)}</div>`:''}<div class="grid2"><div class="field"><label>Posto / tratamento</label><input id="aPosto" value="${esc(a?.POSTO||'')}"></div><div class="field"><label>Nome de guerra</label><input id="aGuerra" value="${esc(a?.NOME_GUERRA||'')}"></div></div><div class="field"><label>Nome completo</label><input id="aNome" value="${esc(a?.NOME_COMPLETO||'')}"></div><div class="grid2"><div class="field"><label>Posto / tratamento por extenso</label><input id="aPostoExt" value="${esc(a?.POSTO_EXTENSO||'')}" readonly><div class="small muted" style="margin-top:4px">Calculado automaticamente pela aba POSTOS.</div></div><div class="field"><label>Vocativo</label><input id="aVoc" value="${esc(a?.VOCATIVO||'')}"></div></div><div class="field"><label>Cargo atual</label><input id="aCargo" value="${esc(a?.CARGO_ATUAL||'')}"></div><div class="grid2"><div class="field"><label>Força / tipo</label><select id="aForca"><option value="">Selecione</option>${authorityForceOptions(a?.FORCA||'')}</select></div><div class="field"><label>Situação</label><select id="aSit"><option value="">Selecione</option><option ${a?.SITUACAO==='ATIVA'?'selected':''}>ATIVA</option><option ${a?.SITUACAO==='RESERVA'?'selected':''}>RESERVA</option></select></div></div><div class="grid2"><div class="field"><label>Sexo</label><select id="aSexo"><option value=""></option><option ${a?.SEXO==='MASCULINO'?'selected':''}>MASCULINO</option><option ${a?.SEXO==='FEMININO'?'selected':''}>FEMININO</option></select></div><div class="field"><label>Foto</label><input id="aFoto" type="file" accept="image/*" capture="environment"></div></div><div class="grid2"><div class="field"><label>Faz jus a honras</label><select id="aHonras">${overrideOptions(a?.HONRAS_OVERRIDE||'AUTO')}</select><div class="small muted" style="margin-top:4px">AUTO aplica a regra; SIM/NÃO força a correção imediata.</div></div><div class="field"><label>Pode presidir</label><select id="aPresidir">${overrideOptions(a?.PRESIDIR_OVERRIDE||'AUTO')}</select><div class="small muted" style="margin-top:4px">AUTO aplica a regra; SIM/NÃO força a correção imediata.</div></div></div><div class="notice">Alterações feitas aqui são gravadas diretamente no banco AUTORIDADES e passam a valer para a cerimônia.</div><button class="btn primary block" onclick="saveAuthority('${esc(id)}',${addAfter?'true':'false'})">SALVAR ALTERAÇÕES</button>`,true);
}

async function saveAuthority(id,addAfter){
  const f=$('#aFoto').files[0];
  const payload={ID_AUTORIDADE:id,POSTO:$('#aPosto').value,NOME_COMPLETO:$('#aNome').value,NOME_GUERRA:$('#aGuerra').value,CARGO_ATUAL:$('#aCargo').value,FORCA:$('#aForca').value,SITUACAO:$('#aSit').value,SEXO:$('#aSexo').value,VOCATIVO:$('#aVoc').value,HONRAS_OVERRIDE:$('#aHonras').value,PRESIDIR_OVERRIDE:$('#aPresidir').value};
  if(f){const img=await readImageForUpload(f);payload.FOTO_NOME=img.name;payload.FOTO_MIME=img.mime;payload.FOTO_BASE64=img.data;}
  const a=await server('apiSalvarAutoridade',payload); closeModal(); showToast('Autoridade salva.');
  cacheRemove('authority_first_page');
  if(activeCeremony())try{await reloadOperationalSnapshot({silent:true});}catch(e){}
  if(addAfter){ await openAddGuest(a.ID_AUTORIDADE); $('#agSearch').value=a.NOME_COMPLETO; await searchAuthorityForGuest(); }
  else if(state.screen==='autoridades') renderAutoridades();
  else if(state.screen==='evento') renderEvento();
}
function readImageForUpload(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=reject;
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>resolve({data:reader.result,name:file.name,mime:file.type||'image/jpeg'});
      img.onload=()=>{
        const max=1000,scale=Math.min(1,max/Math.max(img.width,img.height));
        const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
        canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
        resolve({data:canvas.toDataURL('image/jpeg',.82),name:(file.name.replace(/\.[^.]+$/,'')||'foto')+'.jpg',mime:'image/jpeg'});
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* -------------------------------------------------------------------------- */
/* FAMILIARES                                                                  */
/* -------------------------------------------------------------------------- */
async function renderFamiliares(){
  const c=contextCeremony();if(!c){$('#main').innerHTML='<div class="empty">Nenhuma cerimônia ativa.</div>';return;}
  if(!operacaoAtual().ready||operacaoAtual().idCer!==String(c.ID_CERIMONIA))await reloadOperationalSnapshot({silent:true});
  const list=familiaresOperacao();
  $('#main').innerHTML=`<div class="page-head mobile-inline-head"><div><div class="section-title">FAMILIARES</div><div class="small muted">${esc(c.NOME_EVENTO)} | ${list.length} cadastrados</div></div><div class="page-actions single"><button class="btn primary" onclick="openFamilyForm()">ADICIONAR</button></div></div>${familyList(list)}`;
}
function familyList(list){ if(!list.length)return'<div class="empty">Nenhum familiar cadastrado.</div>'; return`<div class="person-list two-col">${list.map(f=>`<div class="person-card clickable" onclick="openFamilyDetail('${f.ID_FAMILIAR}')"><div class="avatar placeholder">FAM.</div><div class="grow"><div class="person-name">${esc(f.NOME)}</div><div class="person-sub">${esc(f.VINCULO+' de '+f.AUTORIDADE)}</div></div><div class="person-right">${f.PRESENCA?'<span class="badge present">PRESENTE</span>':badgeStatus(f.STATUS_CONFIRMACAO)}</div></div>`).join('')}</div>`; }
async function openFamilyForm(id=''){
  const c=contextCeremony();if(!c)return;
  if(!operacaoAtual().ready)await reloadOperationalSnapshot({silent:true});
  const fams=familiaresOperacao(),guests=convidadosOperacao(),f=fams.find(x=>x.ID_FAMILIAR===id)||{};
  openModal(`${modalCloseButton()}<h2>${id?'Editar':'Adicionar'} familiar</h2><div class="field"><label>Nome</label><input id="fNome" value="${esc(f.NOME||'')}"></div><div class="grid2"><div class="field"><label>Vínculo</label><select id="fVinc">${['ESPOSA','ESPOSO','FILHO','FILHA','PAI','MÃE','OUTRO'].map(x=>`<option ${f.VINCULO===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Status</label><select id="fStatus">${['CONFIRMADO','PENDENTE','NÃO COMPARECERÁ'].map(x=>`<option ${f.STATUS_CONFIRMACAO===x?'selected':''}>${x}</option>`).join('')}</select></div></div><div class="field"><label>Autoridade vinculada</label><select id="fAut">${guests.map(g=>`<option value="${esc(g.NOME_COMPLETO)}" ${f.AUTORIDADE===g.NOME_COMPLETO?'selected':''}>${esc(g.POSTO+' '+g.NOME_GUERRA)}</option>`).join('')}</select></div><button class="btn primary block" onclick="saveFamily('${id}',${Number.isFinite(Number(f.PRECEDENCIA))?Number(f.PRECEDENCIA):''})">SALVAR</button>`);
}
async function saveFamily(id,prec){
  const c=contextCeremony();await server('apiSalvarFamiliar',c.ID_CERIMONIA,{ID_FAMILIAR:id,NOME:$('#fNome').value,VINCULO:$('#fVinc').value,AUTORIDADE:$('#fAut').value,PRECEDENCIA:prec||'',STATUS_CONFIRMACAO:$('#fStatus').value});
  await reloadOperationalSnapshot({silent:true});closeModal();renderFamiliares();
}
async function openFamilyDetail(id){
  const f=familiarOperacaoPorId(id);if(!f)return;
  openModal(`${modalCloseButton()}<h2>${esc(f.NOME)}</h2><p class="muted">${esc(f.VINCULO)} de ${esc(f.AUTORIDADE)}</p><dl class="detail-grid compact"><dt>Status</dt><dd>${badgeStatus(f.STATUS_CONFIRMACAO)}</dd></dl><div class="actions">${f.PRESENCA?`<button class="btn danger" onclick="familyPresence('${id}',false)">CANCELAR PRESENÇA</button>`:`<button class="btn ok" onclick="familyPresence('${id}',true)">CONFIRMAR PRESENÇA</button>`}<button class="btn outline" onclick="addFamilyToNominata('${id}')">ADICIONAR À NOMINATA</button><button class="btn outline" onclick="openFamilyForm('${id}')">EDITAR</button><button class="btn danger" onclick="deleteFamily('${id}')">EXCLUIR</button></div>`);
}
async function familyPresence(id,on){
  const c=contextCeremony(),old=familiarOperacaoPorId(id);if(!c||!old)return;
  const anterior=Object.assign({},old);atualizarFamiliarLocal(id,{PRESENCA:!!on,PRESENTE_EM:on?new Date().toISOString():''});closeModal();renderFamiliares();
  try{await server(on?'apiMarcarPresencaFamiliar':'apiCancelarPresencaFamiliar',c.ID_CERIMONIA,id);showToast(on?'Presença do familiar confirmada.':'Presença do familiar cancelada.');}
  catch(e){atualizarFamiliarLocal(id,anterior);renderFamiliares();showToast('Não foi possível confirmar a alteração.');throw e;}
}
async function addFamilyToNominata(id){ const c=contextCeremony(); await server('apiAdicionarItemNominata',{ID_CERIMONIA:c.ID_CERIMONIA,TIPO_ITEM:'FAMILIAR',REFERENCIA_ID:id}); closeModal(); showToast('Familiar adicionado à nominata.'); }
async function deleteFamily(id){ if(!confirm('Excluir este familiar?'))return; const c=contextCeremony(); await server('apiExcluirFamiliar',c.ID_CERIMONIA,id); await reloadOperationalSnapshot({silent:true}); closeModal(); renderFamiliares(); }
function fitTribunaStage(){
  const vp=$('.tribuna-viewport'),stage=$('.tribuna-stage');if(!vp||!stage)return;
  const base=Number(stage.dataset.baseWidth)||stage.scrollWidth||1;
  const isMobile=window.matchMedia('(pointer: coarse)').matches||window.innerWidth<=900;

  stage.style.transform='none';
  stage.style.left='auto';
  stage.style.position='relative';
  stage.style.transformOrigin='top center';

  if(isMobile){
    // Em celular, não reduzimos os círculos a ponto de ficarem ilegíveis.
    // A composição permanece em tamanho útil e o usuário desloca horizontalmente.
    vp.style.overflowX='auto';
    vp.style.overflowY='hidden';
    vp.style.height='auto';
    stage.style.width=base+'px';
    stage.style.margin='0 auto';
    return;
  }

  // Desktop: centraliza o palco e reduz somente o necessário para caber integralmente.
  vp.style.overflow='hidden';
  const avail=Math.max(1,vp.clientWidth-24);
  const scale=Math.min(1,avail/base);
  stage.style.width=base+'px';
  stage.style.left='50%';
  stage.style.margin='0';
  stage.style.transform=`translateX(-50%) scale(${scale})`;
  vp.style.height=Math.ceil(stage.scrollHeight*scale+16)+'px';
}
async function renderTribuna(){
  const c=contextCeremony();if(!c){$('#main').innerHTML='<div class="empty">Nenhuma cerimônia ativa.</div>';return;}
  const data=await server('apiObterTribuna',c.ID_CERIMONIA);
  let html=`<div class="page-head"><div><div class="section-title">TRIBUNA</div><div class="small muted">${esc(c.NOME_EVENTO)}</div></div></div><div class="card"><div class="grid3"><div class="field"><label>Lógica</label><select id="tLogic"><option value="IMPAR" ${data.config.LOGICA_TRIBUNA==='IMPAR'?'selected':''}>ÍMPAR</option><option value="PAR" ${data.config.LOGICA_TRIBUNA==='PAR'?'selected':''}>PAR</option></select></div><div class="field"><label>Fileiras</label><input id="tRows" type="number" min="1" max="3" value="${data.config.NUM_FILEIRAS}"></div><div class="field"><label>Pessoas por fileira</label><input id="tSeats" type="number" min="1" max="25" value="${data.config.QTD_POR_FILEIRA}"></div></div><button class="btn primary" onclick="saveTribunaConfig()">ATUALIZAR COMPOSIÇÃO</button></div>`;
  if(data.avisos?.length)html+=data.avisos.map(a=>`<div class="notice">${esc(a)}</div>`).join('');
  if(data.fileiras?.length){
    const maxSeats=Math.max(...data.fileiras.map(fr=>fr.posicoes.length),1),baseWidth=Math.max(360,maxSeats*96);
    html+=`<div class="tribuna-wrap"><div class="tropa">FRENTE DA TROPA</div><div class="tribuna-viewport"><div class="tribuna-stage" data-base-width="${baseWidth}" style="width:${baseWidth}px">${data.fileiras.map(fr=>`<div class="fileira-label">FILEIRA ${fr.numero}</div><div class="tribuna-row" style="--seat-count:${fr.posicoes.length}">${fr.posicoes.map(tribunaCircleHtml).join('')}</div>`).join('')}</div></div></div>`;
  } else html+='<div class="empty">A composição ainda não pode ser exibida.</div>';
  $('#main').innerHTML=html;requestAnimationFrame(fitTribunaStage);
}
async function saveTribunaConfig(){const c=contextCeremony();await server('apiSalvarConfigTribuna',c.ID_CERIMONIA,{LOGICA_TRIBUNA:$('#tLogic').value,NUM_FILEIRAS:$('#tRows').value,QTD_POR_FILEIRA:$('#tSeats').value});renderTribuna();}

/* -------------------------------------------------------------------------- */
/* NOMINATA                                                                    */
/* -------------------------------------------------------------------------- */
function nominataItemCard(i){
  const isAut=i.TIPO_ITEM==='AUTORIDADE';
  const isFam=i.TIPO_ITEM==='FAMILIAR';
  const isMsg=i.TIPO_ITEM==='MENSAGEM'||i.TIPO_ITEM==='TEXTO';
  const avatar=isAut?photoHtml(i):`<div class="avatar placeholder">${isMsg?'MSG':esc(i.ORDEM)}</div>`;

  let click='';
  if(isAut)click=`onclick="openGuestOperationDetail('${i.REF}')"`;
  else if(isFam)click=`onclick="openNominataFamilyDetail('${i.REF}')"`;
  else if(isMsg)click=`onclick="openNominataMessage('${i.ID_ITEM}')"`;

  let pres='';
  if(isAut||isFam){
    pres=i.PRESENTE
      ? '<span class="badge present">PRESENTE</span>'
      : '<span class="badge pending">SEM PRESENÇA</span>';
  }

  return `<div class="person-card ${isAut||isFam||isMsg?'clickable':''} nominata-card ${isFam?'sgcm-family-card':''}" ${click}>${avatar}<div class="grow"><div class="person-name">${esc(i.TITULO)}</div><div class="person-meta-line"><span class="badge">${esc(i.TIPO_ITEM)}</span>${pres}</div></div><div class="order-controls"><button onclick="event.stopPropagation();removeNom('${i.ID_ITEM}')">REMOVER</button></div></div>`;
}

async function renderNominata(){
  const c=contextCeremony();if(!c){$('#main').innerHTML='<div class="empty">Nenhuma cerimônia ativa.</div>';return;}
  const data=await server('apiNominataPainel',c.ID_CERIMONIA),items=data.items||[],guests=data.guests||[],fams=data.fams||[],msgs=data.msgs||[];
  state.nomData={items,guests,fams,msgs};state.nomItems=items;
  let html=`<div class="page-head"><div><div class="section-title">NOMINATA</div><div class="small muted">${esc(c.NOME_EVENTO)} | ${items.length} itens</div></div></div><div class="page-actions nominata-actions"><button class="btn primary" onclick="openBulkNominata()">ADICIONAR AUTORIDADES</button><button class="btn outline" onclick="openAddNominataItem()">OUTRO ITEM</button><button class="btn outline" onclick="openMessageBank()">MENSAGENS</button></div><div class="notice">As autoridades permanecem sempre na ordem de precedência da cerimônia. Clique em uma autoridade ou familiar para confirmar/cancelar presença. Clique em uma mensagem para editar ou reposicionar.</div>`;
  html+=items.length?`<div class="person-list nominata-list">${items.map(nominataItemCard).join('')}</div>`:'<div class="empty">A nominata está vazia.</div>';
  $('#main').innerHTML=html;
}


function openNominataFamilyDetail(id){
  const d=state.nomData||{};
  const f=(d.fams||[]).find(x=>String(x.ID_FAMILIAR)===String(id));
  const it=(state.nomItems||[]).find(x=>x.TIPO_ITEM==='FAMILIAR'&&String(x.REF)===String(id));
  if(!f)return;

  const presente=!!(it?it.PRESENTE:f.PRESENCA);
  const rel=String(f.AUTORIDADE_RESUMO||f.AUTORIDADE||'').toUpperCase();
  const nome=String(f.NOME||'').toUpperCase();
  const vinculo=String(f.VINCULO||'').toUpperCase();
  const titulo=[nome,vinculo].filter(Boolean).join(' — ');

  openModal(`${modalCloseButton()}<h2 class="sgcm-family-modal-title">${esc(titulo)}</h2>
    ${rel?`<div class="sgcm-family-related"><span class="sgcm-family-related-label">Relacionado a</span><span class="sgcm-family-related-value">${esc(rel)}</span></div>`:''}
    <div class="sgcm-family-modal-fields">
      <div class="sgcm-family-field"><span class="sgcm-family-field-label">Nome</span><span class="sgcm-family-field-value">${esc(nome)}</span></div>
      <div class="sgcm-family-field"><span class="sgcm-family-field-label">Vínculo</span><span class="sgcm-family-field-value">${esc(vinculo)}</span></div>
      <div class="sgcm-family-field"><span class="sgcm-family-field-label">Presença</span><span class="sgcm-family-field-value">${presente?'PRESENTE':'SEM PRESENÇA'}</span></div>
    </div>
    <button class="btn ${presente?'danger':'ok'} block sgcm-family-modal-action" onclick="toggleNominataFamilyPresence('${esc(id)}',${presente?'false':'true'})">${presente?'CANCELAR PRESENÇA':'CONFIRMAR PRESENÇA'}</button>`,true);
}

async function toggleNominataFamilyPresence(id,on){
  const c=contextCeremony();if(!c)return;
  closeModal();
  showToast(on?'Confirmando presença...':'Cancelando presença...');
  try{
    await server(on?'apiMarcarPresencaFamiliar':'apiCancelarPresencaFamiliar',c.ID_CERIMONIA,id);
    atualizarFamiliarLocal(id,{PRESENCA:!!on,PRESENTE_EM:on?new Date().toISOString():''});
    showToast(on?'Presença do familiar confirmada.':'Presença do familiar cancelada.');
    await renderNominata();
  }catch(e){
    showToast('Não foi possível confirmar a alteração.');
    throw e;
  }
}

function openBulkNominata(){
  const d=state.nomData||{guests:[]},usados=new Set((state.nomItems||[]).filter(i=>i.TIPO_ITEM==='AUTORIDADE').map(i=>i.REF));
  const guests=(d.guests||[]).filter(g=>!usados.has(g.ID_CONVIDADO)&&(g.STATUS_CONFIRMACAO==='CONFIRMADO'||g.STATUS_CONFIRMACAO==='PENDENTE'));
  openModal(`${modalCloseButton()}<h2>Adicionar várias autoridades</h2><p class="small muted">Apenas PENDENTES e CONFIRMADAS são exibidas. Independentemente da ordem de seleção, elas entram sempre na ordem de precedência da cerimônia.</p><div class="actions compact"><button class="btn outline sm" onclick="bulkNomSelect('CONFIRMADOS')">MARCAR CONFIRMADOS</button><button class="btn outline sm" onclick="bulkNomSelect('PENDENTES')">MARCAR PENDENTES</button><button class="btn outline sm" onclick="bulkNomSelect('TODOS')">MARCAR TODOS</button><button class="btn outline sm" onclick="bulkNomSelect('NENHUM')">LIMPAR</button></div><div class="bulk-list">${guests.map(g=>`<label class="bulk-row"><input type="checkbox" class="nom-bulk" value="${esc(g.ID_CONVIDADO)}" data-status="${esc(g.STATUS_CONFIRMACAO)}"><span><strong>${esc((g.POSTO?g.POSTO+' ':'')+(g.NOME_GUERRA||g.NOME_COMPLETO))}</strong><small>${esc(g.CARGO_ATUAL||g.NOME_COMPLETO)}</small></span>${badgeStatus(g.STATUS_CONFIRMACAO)}</label>`).join('')||'<div class="empty">Não há autoridades pendentes ou confirmadas disponíveis para inclusão.</div>'}</div><button class="btn primary block" onclick="submitBulkNominata()">ADICIONAR SELECIONADAS</button>`,true);
}
function bulkNomSelect(mode){document.querySelectorAll('.nom-bulk').forEach(cb=>{if(mode==='TODOS')cb.checked=true;else if(mode==='NENHUM')cb.checked=false;else if(mode==='CONFIRMADOS')cb.checked=String(cb.dataset.status)==='CONFIRMADO';else if(mode==='PENDENTES')cb.checked=String(cb.dataset.status)==='PENDENTE';});}
async function submitBulkNominata(){const ids=[...document.querySelectorAll('.nom-bulk:checked')].map(x=>x.value);if(!ids.length){showToast('Selecione ao menos uma autoridade.');return;}const c=contextCeremony();await server('apiAdicionarItensNominataLote',c.ID_CERIMONIA,ids);closeModal();showToast(ids.length+' autoridade(s) adicionada(s).');renderNominata();}

function nominataAuthorityOptions(selected=''){
  const auts=(state.nomItems||[]).filter(i=>i.TIPO_ITEM==='AUTORIDADE');
  return auts.map(a=>`<option value="${esc(a.REF)}" ${a.REF===selected?'selected':''}>${esc(a.REF_NOME||a.TITULO)}</option>`).join('');
}
function anchorFieldsHtml(anchorRef='',anchorSide='ANTES'){
  const opts=nominataAuthorityOptions(anchorRef);
  if(!opts)return '<div class="notice">Adicione pelo menos uma autoridade à nominata antes de posicionar mensagens.</div>';
  return `<div class="grid2"><div class="field"><label>Posição</label><select id="nAnchorSide"><option value="ANTES" ${anchorSide==='ANTES'?'selected':''}>ANTES DE</option><option value="DEPOIS" ${anchorSide==='DEPOIS'?'selected':''}>DEPOIS DE</option></select></div><div class="field"><label>Autoridade de referência</label><select id="nAnchorRef">${opts}</select></div></div>`;
}
function openAddNominataItem(){
  const d=state.nomData||{guests:[],fams:[],msgs:[]};
  openModal(`${modalCloseButton()}<h2>Adicionar item à nominata</h2><div class="field"><label>Tipo</label><select id="nType" onchange="updateNomRef()"><option value="AUTORIDADE">Uma autoridade</option><option value="FAMILIAR">Familiar</option><option value="MENSAGEM">Mensagem predefinida</option><option value="TEXTO">Texto livre</option></select></div><div class="field" id="nRefWrap"><label>Referência</label><select id="nRef"></select></div><div class="field" id="nTextWrap"><label>Texto / edição</label><textarea id="nText" style="text-transform:uppercase"></textarea></div><div id="nAnchorWrap"></div><button class="btn primary block" onclick="submitNomItem()">ADICIONAR</button>`);updateNomRef();
}
function updateNomRef(){
  const type=$('#nType').value,d=state.nomData||{};let opts='';
  if(type==='AUTORIDADE')opts=(d.guests||[]).filter(g=>g.STATUS_CONFIRMACAO==='CONFIRMADO'||g.STATUS_CONFIRMACAO==='PENDENTE').map(g=>`<option value="${g.ID_CONVIDADO}">${esc(g.POSTO+' '+g.NOME_GUERRA)}</option>`).join('');
  if(type==='FAMILIAR')opts=(d.fams||[]).map(f=>`<option value="${f.ID_FAMILIAR}">${esc((f.ROTULO_REFERENCIA||[f.NOME,'—',f.VINCULO,'DE',(f.AUTORIDADE_RESUMO||f.AUTORIDADE||'')].filter(Boolean).join(' ')).toUpperCase())}</option>`).join('');
  if(type==='MENSAGEM')opts=(d.msgs||[]).map(m=>`<option value="${m.ID_MENSAGEM}">${esc(m.TEXTO)}</option>`).join('');
  $('#nRef').innerHTML=opts;$('#nRefWrap').classList.toggle('hidden',type==='TEXTO');
  const msg=type==='MENSAGEM'||type==='TEXTO';$('#nTextWrap').classList.toggle('hidden',type==='AUTORIDADE'||type==='FAMILIAR');$('#nAnchorWrap').innerHTML=msg?anchorFieldsHtml() : '';
}
async function submitNomItem(){
  const c=contextCeremony(),type=$('#nType').value,msg=type==='MENSAGEM'||type==='TEXTO';
  await server('apiAdicionarItemNominata',{ID_CERIMONIA:c.ID_CERIMONIA,TIPO_ITEM:type,REFERENCIA_ID:$('#nRef')?.value||'',TEXTO_CUSTOMIZADO:($('#nText')?.value||'').toUpperCase(),ANCHOR_REF:msg?($('#nAnchorRef')?.value||''):'',ANCHOR_SIDE:msg?($('#nAnchorSide')?.value||'ANTES'):''});
  closeModal();renderNominata();
}
async function removeNom(id){const c=contextCeremony();await server('apiRemoverItemNominata',c.ID_CERIMONIA,id);renderNominata();}

function openNominataMessage(id){
  const it=(state.nomItems||[]).find(x=>x.ID_ITEM===id);if(!it)return;
  openModal(`${modalCloseButton()}<h2>Editar mensagem</h2><div class="field"><label>Texto</label><textarea id="editNomText" style="text-transform:uppercase">${esc(it.TITULO)}</textarea></div>${anchorFieldsHtml(it.ANCHOR_REF,it.ANCHOR_SIDE||'ANTES')}<div class="actions"><button class="btn outline" onclick="moveNomMessage('${id}',-1)">SUBIR MENSAGEM</button><button class="btn outline" onclick="moveNomMessage('${id}',1)">DESCER MENSAGEM</button><button class="btn primary" onclick="saveNomMessage('${id}')">SALVAR</button></div>`);
}
async function saveNomMessage(id){const c=contextCeremony();await server('apiEditarItemNominata',c.ID_CERIMONIA,id,{TEXTO:($('#editNomText').value||'').toUpperCase(),ANCHOR_REF:$('#nAnchorRef')?.value||'',ANCHOR_SIDE:$('#nAnchorSide')?.value||'ANTES'});closeModal();renderNominata();}
async function moveNomMessage(id,d){const c=contextCeremony();await server('apiMoverItemNominata',c.ID_CERIMONIA,id,d);closeModal();renderNominata();}

async function openMessageBank(){
  const msgs=await server('apiListarMensagensNominata');
  openModal(`${modalCloseButton()}<h2>Mensagens predefinidas</h2><div class="field"><label>Nova mensagem</label><textarea id="mbText" style="text-transform:uppercase"></textarea></div><button class="btn primary" onclick="addMessageBank()">ADICIONAR</button><div class="section-title">CADASTRADAS</div>${msgs.map(m=>`<div class="row between card"><div class="small nominata-uppercase">${esc(m.TEXTO)}</div><button class="btn danger sm" onclick="deleteMessageBank('${m.ID_MENSAGEM}')">EXCLUIR</button></div>`).join('')}`);
}
async function addMessageBank(){await server('apiAdicionarMensagemPadrao',($('#mbText').value||'').toUpperCase());closeModal();await renderNominata();showToast('Mensagem adicionada.');}
async function deleteMessageBank(id){await server('apiExcluirMensagemPadrao',id);closeModal();await renderNominata();showToast('Mensagem removida.');}

/* -------------------------------------------------------------------------- */
/* ESTATÍSTICAS                                                                */
/* -------------------------------------------------------------------------- */
async function renderEstatisticas(){ const c=contextCeremony(); if(!c){$('#main').innerHTML='<div class="empty">Nenhuma cerimônia ativa.</div>';return;} const rows=await server('apiEstatisticas',c.ID_CERIMONIA); $('#main').innerHTML=`<div class="page-head"><div><div class="section-title">ESTATÍSTICAS POR CÍRCULO</div><div class="small muted">${esc(c.NOME_EVENTO)}</div></div><div class="page-actions single"><button class="btn outline" onclick="openStatsConfig()">CONFIGURAR CÍRCULOS</button></div></div><div class="stats-wrap"><table class="stats"><thead><tr><th>GRUPO</th><th>CONF.</th><th>PRES.</th><th>PEND.</th><th>NÃO VIRÁ</th><th>TOTAL</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.GRUPO)}</td><td>${r.CONFIRMADOS}</td><td><strong>${r.PRESENTES}</strong></td><td>${r.PENDENTES}</td><td>${r.NAO_COMPARECERA}</td><td><strong>${r.TOTAL}</strong></td></tr>`).join('')}</tbody></table></div>`; }
async function openStatsConfig(){ const c=contextCeremony(),[groups,opts]=await Promise.all([server('apiListarGruposEstatistica'),server('apiOpcoesEstatistica',c.ID_CERIMONIA)]); state.statsConfig={groups,opts}; openModal(`${modalCloseButton()}<h2>Configurar círculos estatísticos</h2><p class="small muted">Acrescente postos e autoridades específicas conforme surgirem. A classificação nominal prevalece sobre a automática.</p>${groups.filter(g=>g.tipo==='CONVIDADOS').map(g=>statsGroupHtml(g,opts)).join('')}`,true); }
function statsGroupHtml(g,opts){ return `<div class="circle-card"><div class="title">${esc(g.nome)}</div><div class="small muted">Postos cadastrados</div><div class="chips">${(g.postos||[]).map(p=>`<span class="chip">${esc(p)}<button onclick="removePostFromGroup('${g.id}','${esc(p)}')">X</button></span>`).join('')||'<span class="small muted">Nenhum posto específico.</span>'}</div><div class="row"><select id="posto_${g.id}" class="grow">${opts.postos.map(p=>`<option>${esc(p)}</option>`).join('')}</select><button class="btn outline sm" onclick="addPostToGroup('${g.id}')">ADICIONAR POSTO</button></div><div class="small muted" style="margin-top:10px">Autoridades específicas</div><div class="chips">${(g.autoridades||[]).map(id=>{const a=opts.autoridades.find(x=>x.ID_AUTORIDADE===id);return`<span class="chip">${esc(a?a.NOME:id)}<button onclick="removeAuthorityFromGroup('${g.id}','${id}')">X</button></span>`}).join('')||'<span class="small muted">Nenhuma autoridade específica.</span>'}</div><div class="row"><select id="aut_${g.id}" class="grow">${opts.autoridades.map(a=>`<option value="${a.ID_AUTORIDADE}">${esc(a.NOME)}</option>`).join('')}</select><button class="btn outline sm" onclick="addAuthorityToGroup('${g.id}')">ADICIONAR AUTORIDADE</button></div></div>`; }
async function addPostToGroup(id){ const p=$('#posto_'+id).value; if(p)await server('apiAdicionarPostoGrupo',id,p); openStatsConfig(); }
async function removePostFromGroup(id,p){ await server('apiRemoverPostoGrupo',id,p); openStatsConfig(); }
async function addAuthorityToGroup(id){ const a=$('#aut_'+id).value; if(a)await server('apiAdicionarAutoridadeGrupo',id,a); openStatsConfig(); }
async function removeAuthorityFromGroup(id,a){ await server('apiRemoverAutoridadeGrupo',id,a); openStatsConfig(); }

/* -------------------------------------------------------------------------- */
/* DOCUMENTOS / GUIA                                                           */
/* -------------------------------------------------------------------------- */
async function renderDocumentos(){ const c=contextCeremony(); if(!c){$('#main').innerHTML='<div class="empty">Nenhuma cerimônia ativa.</div>';return;} $('#main').innerHTML=`<div class="page-head"><div><div class="section-title">GERAR ARQUIVOS</div><div class="small muted">${esc(c.NOME_EVENTO)}</div></div></div><div class="card"><p class="small muted">O Anexo à Locução e a Tribuna de Honra são gerados com base na situação atual da cerimônia. Na emissão, o sistema considera os convidados que estiverem PRESENTES naquele momento; na Tribuna, os presentes são reorganizados automaticamente conforme a lógica selecionada.</p><div class="actions"><button class="btn primary" onclick="genDoc('nominata')">GERAR ANEXO À LOCUÇÃO</button><button class="btn primary" onclick="gerarNominataFamiliares()">GERAR NOMINATA COM FAMILIARES</button><button class="btn primary" onclick="genDoc('tribuna')">GERAR TRIBUNA DE HONRA</button></div><div id="docResult"></div></div>`; }

async function gerarNominataFamiliares(){
  const c=contextCeremony();if(!c)return;
  $('#docResult').innerHTML='<p class="small muted">Gerando nominata com familiares...</p>';
  try{
    const r=await server('apiGerarNominataComFamiliares',c.ID_CERIMONIA);
    $('#docResult').innerHTML=`<p><a class="btn outline" href="${esc(r.url)}" target="_blank">ABRIR DOCUMENTO GERADO</a></p><p class="small muted">${esc(r.nome)}</p>`;
  }catch(e){
    $('#docResult').innerHTML=`<div class="notice danger-notice">${esc(e.message||e)}</div>`;
  }
}

async function genDoc(type){ const c=contextCeremony(); $('#docResult').innerHTML='<p class="small muted">Gerando documento...</p>'; try{ const r=await server(type==='tribuna'?'apiGerarTribunaDocumento':'apiGerarNominata',c.ID_CERIMONIA); $('#docResult').innerHTML=`<p><a class="btn outline" href="${esc(r.url)}" target="_blank">ABRIR DOCUMENTO GERADO</a></p><p class="small muted">${esc(r.nome)}</p>`; }catch(e){ $('#docResult').innerHTML=`<div class="notice danger-notice">${esc(e.message)}</div>`; } }
function renderGuia(){ const transporte=bridgeReady()?'BRIDGE DIRETO APPS SCRIPT':'HTTP DE CONTINGÊNCIA'; $('#main').innerHTML=`<div class="section-title">GUIA RÁPIDO</div><div class="card"><p><b>Planejamento:</b> use as abas Cxxx_CONVIDADOS e Cxxx_FAMILIARES para importar e organizar convidados, familiares e status de confirmação.</p><p><b>Operação:</b> Evento, Recepção, Presentes e Familiares compartilham um único snapshot local da cerimônia ativa para navegação imediata. Ajustes de honras, presidência, anfitrião, tribuna e nominata ficam em Evento/Cerimonial.</p><p><b>Banco:</b> AUTORIDADES é exibida no aplicativo na mesma ordem física da planilha. O cadastro pode ser corrigido pelo aplicativo durante a cerimônia.</p><p><b>Fotos:</b> ausência de fotografia ou outro dado nunca bloqueia o convidado. Fotos de contingência já carregadas são reaproveitadas neste aparelho.</p><p><b>Comunicação:</b> ${esc(transporte)}. O bridge usa uma página Apps Script invisível; se ela não estiver disponível, o SGCM mantém o transporte HTTP anterior como contingência.</p></div>`; }


let __operationWatchTimer=null,__operationWatchBusy=false;
const OPERATION_SCREENS=new Set(['evento','recepcao','presentes','familiares']);
function startOperationRevisionWatch(){
  clearTimeout(__operationWatchTimer);
  __operationWatchTimer=setTimeout(checkOperationRevision,7000);
}
async function checkOperationRevision(){
  clearTimeout(__operationWatchTimer);
  try{
    if(document.hidden||__operationWatchBusy||!activeCeremony()||!OPERATION_SCREENS.has(state.screen)){startOperationRevisionWatch();return;}
    __operationWatchBusy=true;
    const v=await server('apiDashboardVersao');
    const o=operacaoAtual();
    if(String(v.idCer||'')!==String(o.idCer||'')||String(v.versao||'0')!==String(o.versao||'0')){
      await reloadOperationalSnapshot({silent:true});
      if(OPERATION_SCREENS.has(state.screen)){
        const map={evento:renderEvento,recepcao:renderRecepcao,presentes:renderPresentes,familiares:renderFamiliares};
        if(map[state.screen])await map[state.screen]();
      }
    }
  }catch(e){console.warn('SGCM sincronização operacional:',e.message||e);}
  finally{__operationWatchBusy=false;startOperationRevisionWatch();}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(checkOperationRevision,300);});
window.addEventListener('focus',()=>setTimeout(checkOperationRevision,250));

window.addEventListener('resize',()=>{if(state.screen==='tribuna')fitTribunaStage();});


/* ========================================================================== */
/* SGCM 2.2 — desempenho e resiliência do cliente                             */
/* ========================================================================== */
(function(){
  'use strict';
  if(typeof window.server!=='function'||window.__SGCM_CLIENT_22__)return;
  window.__SGCM_CLIENT_22__=true;

  const baseServer=window.server;
  const cache=new Map();
  const inflight=new Map();
  const READS=new Set([
    'apiBootstrap','apiOperacaoSnapshot','apiListarCerimonias','apiListarConvidados','apiListarConvidadosResumo',
    'apiObterConvidado','apiObterConvidadoResumo','apiListarAutoridades','apiListarAutoridadesPagina',
    'apiObterAutoridade','apiListarFamiliares','apiObterTribuna','apiListarNominata','apiNominataPainel',
    'apiListarMensagensNominata','apiEstatisticas','apiListarGruposEstatistica','apiOpcoesEstatistica',
    'apiDashboard','apiDashboardVersao','apiFotoBase64','apiFotosBase64Lote','apiResultadoComando'
  ]);
  const TTL={
    apiBootstrap:2500,apiListarCerimonias:3000,
    apiListarConvidados:1000,apiListarConvidadosResumo:1000,
    apiObterConvidado:1000,apiObterConvidadoResumo:1000,
    apiListarAutoridades:10000,apiListarAutoridadesPagina:10000,
    apiObterAutoridade:5000,apiListarFamiliares:1000,
    apiObterTribuna:1000,apiListarNominata:1000,apiNominataPainel:1000,
    apiListarMensagensNominata:30000,apiEstatisticas:1200,
    apiListarGruposEstatistica:30000,apiOpcoesEstatistica:5000
  };

  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const key=(action,args)=>{
    try{return action+'|'+JSON.stringify(args||[]);}
    catch(e){return action+'|'+String(args||'');}
  };
  function transient(e){
    const m=String((e&&e.message)||e||'').toLowerCase();
    return /(backend|indispon|tempor|timeout|tempo excedido|network|failed|conex|acessar|servidor|429|502|503|504)/i.test(m);
  }
  function clear(){cache.clear();}
  window.sgcmLimparCacheLocal=clear;

  async function readWithRetry(action,args){
    let last;
    for(const delay of [0,450,1100]){
      if(delay)await wait(delay);
      try{return await baseServer(action,...args);}
      catch(e){
        last=e;
        if(!transient(e))throw e;
      }
    }
    throw last;
  }

  window.server=function(action,...args){
    if(!READS.has(action)){
      return Promise.resolve(baseServer(action,...args)).then(value=>{clear();return value;});
    }

    const ttl=TTL[action]||0;
    const k=key(action,args);
    const now=Date.now();

    if(ttl){
      const hit=cache.get(k);
      if(hit&&now-hit.at<ttl)return Promise.resolve(hit.value);
      if(inflight.has(k))return inflight.get(k);

      const p=readWithRetry(action,args)
        .then(value=>{cache.set(k,{at:Date.now(),value});return value;})
        .finally(()=>inflight.delete(k));
      inflight.set(k,p);
      return p;
    }

    return readWithRetry(action,args);
  };
})();

// Inicia somente depois de instalar a camada de desempenho/resiliência.
boot();
