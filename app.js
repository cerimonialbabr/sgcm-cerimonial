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
  statsConfig: null
};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

const CACHE_PREFIX='SGCM20_';
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
  'apiBootstrap','apiListarCerimonias','apiListarConvidados','apiListarConvidadosResumo',
  'apiObterConvidado','apiObterConvidadoResumo','apiListarAutoridades','apiListarAutoridadesPagina',
  'apiObterAutoridade','apiListarFamiliares','apiObterTribuna','apiListarNominata','apiNominataPainel',
  'apiListarMensagensNominata','apiEstatisticas','apiListarGruposEstatistica',
  'apiOpcoesEstatistica','apiFotoBase64','apiResultadoComando'
]);

function apiUrl(){
  const u = String(window.SGCM_CONFIG?.API_URL || '').trim();
  if(!u || u.includes('COLE_AQUI')) throw new Error('Configure a URL do Apps Script em config.js.');
  return u;
}

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
    const timer=setTimeout(()=>{cleanup();reject(new Error('Tempo excedido ao consultar o backend do SGCM.'));},30000);
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

function server(fn,...args){ return SGCM_READ_ACTIONS.has(fn) ? jsonp(fn,args) : writeCommand(fn,args); }
function showToast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),2600); }
function openModal(html,wide=false){ $('#modal').classList.toggle('modal-wide',!!wide); $('#modal').innerHTML=html; $('#modalBackdrop').classList.remove('hidden'); }
function closeModal(e){ if(e && e.target!==$('#modalBackdrop'))return; $('#modalBackdrop').classList.add('hidden'); $('#modal').classList.remove('modal-wide'); $('#modal').innerHTML=''; }
function modalCloseButton(){ return '<button class="modal-close" onclick="closeModal()">FECHAR</button>'; }
function toggleDrawer(on){ $('#drawer').classList.toggle('open',on); $('#drawerBackdrop').classList.toggle('hidden',!on); }
function sideNavigate(s){ toggleDrawer(false); navigate(s); }
function activeCeremony(){ return state.bootstrap && state.bootstrap.ativa; }
function contextCeremony(){ return activeCeremony(); }
function formatDate(s){ if(!s)return''; const p=String(s).split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:s; }
function badgeStatus(s){ const u=String(s||'').toUpperCase(); if(u.includes('NÃO'))return '<span class="badge no">NÃO COMPARECERÁ</span>'; if(u.includes('CONFIRM'))return '<span class="badge active">CONFIRMADO</span>'; return '<span class="badge pending">PENDENTE</span>'; }

function photoHtml(p,cls='avatar'){
  if(!p || !p.FOTO_FILE_ID) return `<div class="${cls} placeholder">SEM<br>FOTO</div>`;
  const url=p.FOTO_URL||'';
  return `<img class="${cls}" src="${esc(url)}" data-file-id="${esc(p.FOTO_FILE_ID)}" loading="lazy" decoding="async" onerror="fallbackPhoto(this)" alt="Foto">`;
}

async function fallbackPhoto(img){
  if(img.dataset.fallback==='1')return;
  img.dataset.fallback='1';
  try{ const d=await server('apiFotoBase64',img.dataset.fileId); if(d)img.src=d; else img.replaceWith(placeholderNode(img.className)); }
  catch(e){ img.replaceWith(placeholderNode(img.className)); }
}
function placeholderNode(className){ const d=document.createElement('div'); d.className=className+' placeholder'; d.innerHTML='SEM<br>FOTO'; return d; }

function guestWarningsHtml(g){
  if(!g)return'';
  const out=[];
  if(g.CADASTRADO_BANCO===false) out.push('<span class="data-warning missing-bank">NÃO CADASTRADO NO BANCO</span>');
  else if(g.TEM_FOTO===false) out.push('<span class="data-warning no-photo">SEM FOTO</span>');
  const extras=(g.DADOS_FALTANTES||[]).filter(x=>x!=='FOTO' && x!=='NÃO CADASTRADO EM AUTORIDADES');
  if(extras.length) out.push(`<span class="data-warning">FALTA: ${esc(extras.join(', '))}</span>`);
  return out.length?'<div class="data-warnings">'+out.join('')+'</div>':'';
}

async function reloadBootstrap(){
  try{
    state.bootstrap=await server('apiBootstrap');
    cacheSet('bootstrap',state.bootstrap);
  }catch(e){
    const cached=cacheGet('bootstrap',24*60*60*1000);
    if(!cached)throw e;
    state.bootstrap=cached;
    showToast('Sem resposta do backend. Exibindo última sincronização.');
  }
  updateHeader();
}
function updateHeader(){
  const a=activeCeremony(), h=$('#headerContext'), b=$('#contextBanner');
  h.textContent=a ? `${a.NOME_EVENTO}${a.DATA?' | '+formatDate(a.DATA):''}` : 'Nenhuma cerimônia ativa';
  if(!a){ b.textContent='Nenhuma cerimônia está ATIVA. Ative uma cerimônia antes da operação.'; b.classList.remove('hidden'); }
  else b.classList.add('hidden');
}

async function boot(){
  try{
    apiUrl(); await reloadBootstrap(); navigate(activeCeremony()?'recepcao':'cerimonias');
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
}

function refreshCurrent(){ reloadBootstrap().then(()=>navigate(state.screen)); }

/* -------------------------------------------------------------------------- */
/* CERIMÔNIAS                                                                  */
/* -------------------------------------------------------------------------- */
async function renderCerimonias(){
  const list=await server('apiListarCerimonias');
  let html=`<div class="page-head"><div><div class="section-title">CERIMÔNIAS</div><div class="small muted">Prepare várias cerimônias; somente uma pode permanecer ativa.</div></div><div class="page-actions"><button class="btn primary" onclick="openCeremonyForm()">NOVA CERIMÔNIA</button></div></div>`;
  if(!list.length) html+='<div class="empty">Nenhuma cerimônia cadastrada.</div>';
  else html+=`<div class="ceremony-grid">${list.map(c=>`<div class="card ${c.STATUS==='ATIVA'?'active-card':'standby-card'}"><div class="row between"><div class="grow"><div class="event-name">${esc(c.NOME_EVENTO)}</div><div class="small muted">${esc(formatDate(c.DATA))}${c.LOCAL?' | '+esc(c.LOCAL):''}</div></div><span class="badge ${c.STATUS==='ATIVA'?'active':''}">${esc(c.STATUS)}</span></div><div class="actions compact">${c.STATUS==='ATIVA'?'<span class="small muted">Cerimônia operacional.</span>':`<button class="btn primary sm" onclick="activateCeremony('${c.ID_CERIMONIA}')">ATIVAR</button><button class="btn danger sm" onclick="deleteCeremony('${c.ID_CERIMONIA}')">EXCLUIR</button>`}<button class="btn outline sm" onclick="openCeremonyForm('${c.ID_CERIMONIA}')">EDITAR</button></div></div>`).join('')}</div>`;
  $('#main').innerHTML=html;
}

function openCeremonyForm(id=''){
  const c=(state.bootstrap?.cerimonias||[]).find(x=>x.ID_CERIMONIA===id)||{};
  openModal(`${modalCloseButton()}<h2>${id?'Editar':'Nova'} cerimônia</h2><div class="field"><label>Nome</label><input id="ceName" value="${esc(c.NOME_EVENTO||'')}"></div><div class="grid2"><div class="field"><label>Data</label><input id="ceDate" type="date" value="${esc(c.DATA||'')}"></div><div class="field"><label>Local</label><input id="ceLocal" value="${esc(c.LOCAL||'')}"></div></div><button class="btn primary block" onclick="saveCeremony('${esc(id)}')">SALVAR</button>`);
}
async function saveCeremony(id){ await server('apiSalvarCerimonia',{ID_CERIMONIA:id,NOME_EVENTO:$('#ceName').value,DATA:$('#ceDate').value,LOCAL:$('#ceLocal').value}); closeModal(); await reloadBootstrap(); renderCerimonias(); }
async function activateCeremony(id){ const atual=activeCeremony(); if(atual&&!confirm(`A cerimônia atualmente ativa é "${atual.NOME_EVENTO}". Colocá-la em STANDBY e ativar a selecionada?`))return; await server('apiAtivarCerimonia',id); await reloadBootstrap(); showToast('Cerimônia ativada.'); renderCerimonias(); }
async function deleteCeremony(id){ if(!confirm('Excluir a cerimônia e suas duas abas de planejamento? Esta operação não pode ser desfeita.'))return; await server('apiExcluirCerimonia',id); await reloadBootstrap(); renderCerimonias(); }

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
      <div class="event-actions"><button class="btn primary" onclick="openAddGuest()">ADICIONAR CONVIDADO</button><button class="btn outline" onclick="navigate('tribuna')">TRIBUNA</button><button class="btn outline" onclick="navigate('nominata')">NOMINATA</button></div>
    </div>
    <div class="section-title">CONVIDADOS DA CERIMÔNIA</div>
    <div class="event-people">${state.eventGuests.map(g=>eventPersonCard(g,labels[g.ID_CONVIDADO])).join('')}</div>`;
}
async function renderEvento(){
  const c=contextCeremony(); if(!c){$('#main').innerHTML='<div class="empty">Nenhuma cerimônia ativa.</div>';return;}
  const key=ceremonyCacheKey('evento',c.ID_CERIMONIA), cached=cacheGet(key,24*60*60*1000);
  if(cached) renderEventoConteudo(c,cached);
  try{
    const guests=await server('apiListarConvidados',c.ID_CERIMONIA,'TODOS');
    cacheSet(key,guests); renderEventoConteudo(c,guests);
  }catch(e){if(!cached)throw e;showToast('Modo contingência: exibindo o último Evento sincronizado.');}
}

function eventPersonCard(g,label){
  return `<div class="person-card clickable" onclick="openGuestEventDetail('${g.ID_CONVIDADO}')">${photoHtml(g)}<div class="grow"><div class="person-name">${esc((g.POSTO?g.POSTO+' ':'')+(g.NOME_GUERRA||g.NOME_COMPLETO))}</div><div class="person-sub">${esc(g.CARGO_ATUAL||g.NOME_COMPLETO)}</div>${guestWarningsHtml(g)}</div><div class="person-right">${g.PRESENCA?'<span class="badge present">PRESENTE</span>':badgeStatus(g.STATUS_CONFIRMACAO)}<span class="order-label ${/PRESIDENTE|ANFITRIÃO|COANFITRIÃO/.test(label)?'special':''}">${esc(label)}</span></div></div>`;
}

async function openGuestEventDetail(id){
  const c=contextCeremony(), g=await server('apiObterConvidado',c.ID_CERIMONIA,id); if(!g)return;
  state.currentGuest=g;
  const labels=eventOrderMap(state.eventGuests.length?state.eventGuests:await server('apiListarConvidados',c.ID_CERIMONIA,'TODOS'));
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
  const anterior=(state.visiblePeople||[]).slice();
  closeModal();

  // Atualização otimista: a equipe percebe a ação imediatamente, mesmo em 4G
  // instável. O backend é confirmado em seguida.
  if(state.screen==='recepcao' && on){
    state.visiblePeople=(state.visiblePeople||[]).filter(g=>g.ID_CONVIDADO!==id);
    $('#peopleArea').innerHTML=operationPersonList(state.visiblePeople,true);
  }else if(state.screen==='presentes' && !on){
    state.visiblePeople=(state.visiblePeople||[]).filter(g=>g.ID_CONVIDADO!==id);
    $('#peopleArea').innerHTML=operationPersonList(state.visiblePeople,false);
  }
  showToast(on?'Confirmando presença...':'Cancelando presença...');
  try{
    await server(on?'apiMarcarPresenca':'apiCancelarPresenca',c.ID_CERIMONIA,id);
    cacheRemove(ceremonyCacheKey('recepcao',c.ID_CERIMONIA));
    cacheRemove(ceremonyCacheKey('presentes',c.ID_CERIMONIA));
    cacheRemove(ceremonyCacheKey('evento',c.ID_CERIMONIA));
    showToast(on?'Presença confirmada.':'Presença cancelada.');
    if(state.screen!=='recepcao' && state.screen!=='presentes') navigate(state.screen);
  }catch(e){
    state.visiblePeople=anterior;
    if($('#peopleArea')) $('#peopleArea').innerHTML=operationPersonList(anterior,state.screen==='recepcao');
    showToast('Não foi possível confirmar a alteração.');
    throw e;
  }
}
async function changeGuestStatus(id){ const c=contextCeremony(); const g=state.currentGuest||await server('apiObterConvidado',c.ID_CERIMONIA,id); openModal(`${modalCloseButton()}<h2>Alterar status</h2><div class="field"><label>Status da confirmação</label><select id="statusGuest">${['CONFIRMADO','PENDENTE','NÃO COMPARECERÁ'].map(x=>`<option ${g.STATUS_CONFIRMACAO===x?'selected':''}>${x}</option>`).join('')}</select></div><button class="btn primary block" onclick="saveGuestStatus('${id}')">SALVAR</button>`); }
async function saveGuestStatus(id){ const c=contextCeremony(); await server('apiAtualizarStatusConvidado',c.ID_CERIMONIA,id,$('#statusGuest').value); cacheRemove(ceremonyCacheKey('evento',c.ID_CERIMONIA)); cacheRemove(ceremonyCacheKey('recepcao',c.ID_CERIMONIA)); closeModal(); showToast('Status atualizado.'); navigate(state.screen); }
async function setRole(id,role){ const c=contextCeremony(); await server('apiDefinirPapelConvidado',c.ID_CERIMONIA,id,role); cacheRemove(ceremonyCacheKey('evento',c.ID_CERIMONIA)); closeModal(); showToast('Definição atualizada.'); renderEvento(); }
async function toggleExclude(id){ const c=contextCeremony(); await server('apiToggleExcluirTribuna',c.ID_CERIMONIA,id); cacheRemove(ceremonyCacheKey('evento',c.ID_CERIMONIA)); closeModal(); renderEvento(); }
async function addGuestToNominata(id){ const c=contextCeremony(); await server('apiAdicionarItemNominata',{ID_CERIMONIA:c.ID_CERIMONIA,TIPO_ITEM:'AUTORIDADE',REFERENCIA_ID:id}); closeModal(); showToast('Autoridade adicionada à nominata.'); }
async function moveGuest(id,d){ const c=contextCeremony(); await server('apiMoverConvidado',c.ID_CERIMONIA,id,d); cacheRemove(ceremonyCacheKey('evento',c.ID_CERIMONIA)); closeModal(); renderEvento(); }

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
  const key=ceremonyCacheKey('recepcao',c.ID_CERIMONIA), cached=cacheGet(key,24*60*60*1000);
  if(cached) renderOperationScreen(c,cached,'RECEPCAO');
  try{
    const list=await server('apiListarConvidadosResumo',c.ID_CERIMONIA,'RECEPCAO');
    cacheSet(key,list); renderOperationScreen(c,list,'RECEPCAO');
  }catch(e){ if(!cached)throw e; showToast('Modo contingência: usando a última lista sincronizada.'); }
}
async function renderPresentes(){
  const c=contextCeremony(); if(!c){$('#main').innerHTML='<div class="empty">Nenhuma cerimônia ativa.</div>';return;}
  const key=ceremonyCacheKey('presentes',c.ID_CERIMONIA), cached=cacheGet(key,24*60*60*1000);
  if(cached) renderOperationScreen(c,cached,'PRESENTES');
  try{
    const list=await server('apiListarConvidadosResumo',c.ID_CERIMONIA,'PRESENTES');
    cacheSet(key,list); renderOperationScreen(c,list,'PRESENTES');
  }catch(e){ if(!cached)throw e; showToast('Modo contingência: usando a última lista sincronizada.'); }
}

function filterVisiblePeople(q,showStatus){
  const key=String(q||'').trim().toUpperCase();
  const list=(state.visiblePeople||[]).filter(g=>!key || [g.POSTO,g.NOME_COMPLETO,g.NOME_GUERRA,g.CARGO_ATUAL,g.FORCA].some(v=>String(v||'').toUpperCase().includes(key)));
  $('#peopleArea').innerHTML=operationPersonList(list,showStatus);
}

async function openGuestOperationDetail(id){
  const c=contextCeremony(), g=await server('apiObterConvidadoResumo',c.ID_CERIMONIA,id); if(!g)return;
  const isPresent=state.screen==='presentes' || g.PRESENCA;
  openModal(`${modalCloseButton()}${photoHtml(g,'modal-photo')}<h2>${esc((g.POSTO?g.POSTO+' ':'')+(g.NOME_GUERRA||g.NOME_COMPLETO))}</h2><dl class="detail-grid compact"><dt>Posto</dt><dd>${esc(g.POSTO||'—')}</dd><dt>Nome de guerra</dt><dd>${esc(g.NOME_GUERRA||'—')}</dd><dt>Nome completo</dt><dd>${esc(g.NOME_COMPLETO||'—')}</dd><dt>Cargo</dt><dd>${esc(g.CARGO_ATUAL||'—')}</dd><dt>Força / tipo</dt><dd>${esc(g.FORCA||'—')}</dd></dl><div class="actions">${isPresent?`<button class="btn danger block" onclick="guestPresence('${id}',false)">CANCELAR PRESENÇA</button>`:`<button class="btn ok block" onclick="guestPresence('${id}',true)">CONFIRMAR PRESENÇA</button>`}</div>`);
}

/* -------------------------------------------------------------------------- */
/* ADICIONAR CONVIDADO / CADASTRAR NO BANCO                                   */
/* -------------------------------------------------------------------------- */
async function openAddGuest(){
  const c=contextCeremony(), guests=await server('apiListarConvidados',c.ID_CERIMONIA,'TODOS');
  const labels=eventOrderMap(guests);
  openModal(`${modalCloseButton()}<h2>Adicionar convidado</h2><div class="field"><label>Pesquisar no banco de autoridades</label><input id="agSearch" oninput="searchAuthorityForGuest()" placeholder="Nome, posto ou cargo"></div><div id="agResults" class="person-list"></div><div class="grid2"><div class="field"><label>Inserir em relação a</label><select id="agRef"><option value="">Final da lista</option>${guests.map(g=>`<option value="${g.ID_CONVIDADO}">${esc(labels[g.ID_CONVIDADO]+' — '+g.POSTO+' '+g.NOME_GUERRA)}</option>`).join('')}</select></div><div class="field"><label>Posição</label><select id="agPos"><option value="DEPOIS">Depois</option><option value="ANTES">Antes</option></select></div></div><div class="actions"><button class="btn outline" onclick="openAuthorityForm('',true)">NOVA AUTORIDADE</button></div>`,true);
}
async function searchAuthorityForGuest(){ const q=$('#agSearch').value; if(q.length<2){$('#agResults').innerHTML='';return;} const page=await server('apiListarAutoridadesPagina',q,0,30); $('#agResults').innerHTML=page.items.map(a=>`<div class="person-card clickable" onclick="addSelectedAuthority('${a.ID_AUTORIDADE}')">${photoHtml(a)}<div class="grow"><div class="person-name">${esc((a.POSTO?a.POSTO+' ':'')+(a.NOME_GUERRA||a.NOME_COMPLETO))}</div><div class="person-sub">${esc(a.CARGO_ATUAL)}</div></div><div class="person-right"><span class="badge active">ADICIONAR</span></div></div>`).join('')||'<div class="empty">Nenhuma autoridade encontrada.</div>'; }
async function addSelectedAuthority(id){ const c=contextCeremony(); await server('apiAdicionarConvidado',c.ID_CERIMONIA,{ID_AUTORIDADE:id,REFERENCIA_ID:$('#agRef').value,POSICAO:$('#agPos').value,STATUS_CONFIRMACAO:'PENDENTE'}); cacheRemove(ceremonyCacheKey('evento',c.ID_CERIMONIA)); closeModal(); showToast('Convidado adicionado.'); renderEvento(); }

async function openRegisterGuestAuthority(id){
  const c=contextCeremony(),g=await server('apiObterConvidado',c.ID_CERIMONIA,id); if(!g)return;
  openModal(`${modalCloseButton()}<h2>Cadastrar convidado no banco</h2><p class="small muted">A autoridade será inserida fisicamente em AUTORIDADES na mesma posição relativa da cerimônia. Nenhum campo abaixo é requisito para manter o convidado na formatura.</p><div class="grid2"><div class="field"><label>Posto / tratamento</label><input id="rgPosto" value="${esc(g.POSTO||'')}"></div><div class="field"><label>Nome de guerra</label><input id="rgGuerra" value="${esc(g.NOME_GUERRA||'')}"></div></div><div class="field"><label>Nome completo</label><input id="rgNome" value="${esc(g.NOME_COMPLETO||'')}"></div><div class="field"><label>Cargo atual</label><input id="rgCargo" value="${esc(g.CARGO_ATUAL||'')}"></div><div class="grid2"><div class="field"><label>Força / tipo</label><select id="rgForca"><option value="">Selecione</option>${authorityForceOptions('')}</select></div><div class="field"><label>Situação</label><select id="rgSit"><option value="">Selecione</option><option>ATIVA</option><option>RESERVA</option></select></div></div><div class="grid2"><div class="field"><label>Sexo</label><select id="rgSexo"><option value=""></option><option>MASCULINO</option><option>FEMININO</option></select></div><div class="field"><label>Foto</label><input id="rgFoto" type="file" accept="image/*" capture="environment"></div></div><button class="btn primary block" onclick="saveGuestToBank('${id}')">SALVAR EM AUTORIDADES</button>`,true);
}
async function saveGuestToBank(id){
  const c=contextCeremony(),f=$('#rgFoto').files[0],payload={POSTO:$('#rgPosto').value,NOME_COMPLETO:$('#rgNome').value,NOME_GUERRA:$('#rgGuerra').value,CARGO_ATUAL:$('#rgCargo').value,FORCA:$('#rgForca').value,SITUACAO:$('#rgSit').value,SEXO:$('#rgSexo').value,HONRAS_OVERRIDE:'AUTO',PRESIDIR_OVERRIDE:'AUTO'};
  if(f){const img=await readImageForUpload(f);payload.FOTO_NOME=img.name;payload.FOTO_MIME=img.mime;payload.FOTO_BASE64=img.data;}
  await server('apiCadastrarConvidadoNoBanco',c.ID_CERIMONIA,id,payload);
  closeModal(); showToast('Autoridade cadastrada no banco.');
  cacheRemove(ceremonyCacheKey('recepcao',c.ID_CERIMONIA));
  cacheRemove(ceremonyCacheKey('presentes',c.ID_CERIMONIA));
  cacheRemove(ceremonyCacheKey('evento',c.ID_CERIMONIA));
  navigate(state.screen);
}

/* -------------------------------------------------------------------------- */
/* AUTORIDADES                                                                 */
/* -------------------------------------------------------------------------- */
function authorityForceOptions(selected){ return ['Aeronáutica','Marinha','Exército','Ministro da Defesa','Autoridade Civil','Militar Estrangeiro'].map(x=>`<option ${selected===x?'selected':''}>${x}</option>`).join(''); }
function overrideOptions(selected){ return ['AUTO','SIM','NÃO'].map(x=>`<option ${selected===x?'selected':''}>${x}</option>`).join(''); }

function renderAuthorityPage(page){
  state.authorityPage={query:page.query||'',items:page.items||[],nextOffset:page.proximoOffset,total:page.total||0};
  $('#main').innerHTML=`<div class="page-head"><div><div class="section-title">AUTORIDADES</div><div class="small muted"><strong>${state.authorityPage.total}</strong> autoridades no banco, na mesma ordem da planilha.</div></div><div class="page-actions"><button class="btn primary" onclick="openAuthorityForm()">NOVA AUTORIDADE</button></div></div><div class="searchbar"><input id="autSearch" placeholder="Pesquisar por nome, posto, cargo ou força" oninput="scheduleAuthoritySearch(this.value)"></div><div id="autArea">${authorityList(state.authorityPage.items)}</div><div id="autMore" class="load-more-wrap">${state.authorityPage.nextOffset!==null?'<button class="btn outline" onclick="loadMoreAuthorities()">CARREGAR MAIS</button>':''}</div>`;
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
  openModal(`${modalCloseButton()}<h2>${id?'Editar':'Nova'} autoridade</h2>${a&&a.FOTO_FILE_ID?photoHtml(a,'modal-photo'):''}${id?`<div class="record-id">ID: ${esc(a.ID_AUTORIDADE||id)}</div>`:''}<div class="grid2"><div class="field"><label>Posto / tratamento</label><input id="aPosto" value="${esc(a?.POSTO||'')}"></div><div class="field"><label>Nome de guerra</label><input id="aGuerra" value="${esc(a?.NOME_GUERRA||'')}"></div></div><div class="field"><label>Nome completo</label><input id="aNome" value="${esc(a?.NOME_COMPLETO||'')}"></div><div class="grid2"><div class="field"><label>Posto / tratamento por extenso</label><input id="aPostoExt" data-original="${esc(a?.POSTO_EXTENSO||'')}" value="${esc(a?.POSTO_EXTENSO||'')}"></div><div class="field"><label>Vocativo</label><input id="aVoc" value="${esc(a?.VOCATIVO||'')}"></div></div><div class="field"><label>Cargo atual</label><input id="aCargo" value="${esc(a?.CARGO_ATUAL||'')}"></div><div class="grid2"><div class="field"><label>Força / tipo</label><select id="aForca"><option value="">Selecione</option>${authorityForceOptions(a?.FORCA||'')}</select></div><div class="field"><label>Situação</label><select id="aSit"><option value="">Selecione</option><option ${a?.SITUACAO==='ATIVA'?'selected':''}>ATIVA</option><option ${a?.SITUACAO==='RESERVA'?'selected':''}>RESERVA</option></select></div></div><div class="grid2"><div class="field"><label>Sexo</label><select id="aSexo"><option value=""></option><option ${a?.SEXO==='MASCULINO'?'selected':''}>MASCULINO</option><option ${a?.SEXO==='FEMININO'?'selected':''}>FEMININO</option></select></div><div class="field"><label>Foto</label><input id="aFoto" type="file" accept="image/*" capture="environment"></div></div><div class="grid2"><div class="field"><label>Faz jus a honras</label><select id="aHonras">${overrideOptions(a?.HONRAS_OVERRIDE||'AUTO')}</select><div class="small muted" style="margin-top:4px">AUTO aplica a regra; SIM/NÃO força a correção imediata.</div></div><div class="field"><label>Pode presidir</label><select id="aPresidir">${overrideOptions(a?.PRESIDIR_OVERRIDE||'AUTO')}</select><div class="small muted" style="margin-top:4px">AUTO aplica a regra; SIM/NÃO força a correção imediata.</div></div></div><div class="notice">Alterações feitas aqui são gravadas diretamente no banco AUTORIDADES e passam a valer para a cerimônia.</div><button class="btn primary block" onclick="saveAuthority('${esc(id)}',${addAfter?'true':'false'})">SALVAR ALTERAÇÕES</button>`,true);
}

async function saveAuthority(id,addAfter){
  const f=$('#aFoto').files[0], postoExt=$('#aPostoExt');
  const payload={ID_AUTORIDADE:id,POSTO:$('#aPosto').value,NOME_COMPLETO:$('#aNome').value,NOME_GUERRA:$('#aGuerra').value,POSTO_EXTENSO:postoExt.value,POSTO_EXTENSO_EDITADO:postoExt.value!==postoExt.dataset.original,CARGO_ATUAL:$('#aCargo').value,FORCA:$('#aForca').value,SITUACAO:$('#aSit').value,SEXO:$('#aSexo').value,VOCATIVO:$('#aVoc').value,HONRAS_OVERRIDE:$('#aHonras').value,PRESIDIR_OVERRIDE:$('#aPresidir').value};
  if(f){const img=await readImageForUpload(f);payload.FOTO_NOME=img.name;payload.FOTO_MIME=img.mime;payload.FOTO_BASE64=img.data;}
  const a=await server('apiSalvarAutoridade',payload); closeModal(); showToast('Autoridade salva.');
  cacheRemove('authority_first_page');
  if(addAfter){ await openAddGuest(); $('#agSearch').value=a.NOME_COMPLETO; await searchAuthorityForGuest(); }
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
async function renderFamiliares(){ const c=contextCeremony(); if(!c){$('#main').innerHTML='<div class="empty">Nenhuma cerimônia ativa.</div>';return;} const list=await server('apiListarFamiliares',c.ID_CERIMONIA,'TODOS'); $('#main').innerHTML=`<div class="page-head"><div><div class="section-title">FAMILIARES</div><div class="small muted">${esc(c.NOME_EVENTO)} | ${list.length} cadastrados</div></div><div class="page-actions"><button class="btn primary" onclick="openFamilyForm()">ADICIONAR</button></div></div>${familyList(list)}`; }
function familyList(list){ if(!list.length)return'<div class="empty">Nenhum familiar cadastrado.</div>'; return`<div class="person-list two-col">${list.map(f=>`<div class="person-card clickable" onclick="openFamilyDetail('${f.ID_FAMILIAR}')"><div class="avatar placeholder">FAM.</div><div class="grow"><div class="person-name">${esc(f.NOME)}</div><div class="person-sub">${esc(f.VINCULO+' de '+f.AUTORIDADE)}</div></div><div class="person-right">${f.PRESENCA?'<span class="badge present">PRESENTE</span>':badgeStatus(f.STATUS_CONFIRMACAO)}</div></div>`).join('')}</div>`; }
async function openFamilyForm(id=''){ const c=contextCeremony(),[fams,guests]=await Promise.all([server('apiListarFamiliares',c.ID_CERIMONIA,'TODOS'),server('apiListarConvidadosResumo',c.ID_CERIMONIA,'TODOS')]); const f=fams.find(x=>x.ID_FAMILIAR===id)||{}; openModal(`${modalCloseButton()}<h2>${id?'Editar':'Adicionar'} familiar</h2><div class="field"><label>Nome</label><input id="fNome" value="${esc(f.NOME||'')}"></div><div class="grid2"><div class="field"><label>Vínculo</label><select id="fVinc">${['CÔNJUGE','FILHO','FILHA','PAI','MÃE','OUTRO'].map(x=>`<option ${f.VINCULO===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Status</label><select id="fStatus">${['CONFIRMADO','PENDENTE','NÃO COMPARECERÁ'].map(x=>`<option ${f.STATUS_CONFIRMACAO===x?'selected':''}>${x}</option>`).join('')}</select></div></div><div class="field"><label>Autoridade vinculada</label><select id="fAut">${guests.map(g=>`<option value="${esc(g.NOME_COMPLETO)}" ${f.AUTORIDADE===g.NOME_COMPLETO?'selected':''}>${esc(g.POSTO+' '+g.NOME_GUERRA)}</option>`).join('')}</select></div><button class="btn primary block" onclick="saveFamily('${id}',${Number.isFinite(Number(f.PRECEDENCIA))?Number(f.PRECEDENCIA):''})">SALVAR</button>`); }
async function saveFamily(id,prec){ const c=contextCeremony(); await server('apiSalvarFamiliar',c.ID_CERIMONIA,{ID_FAMILIAR:id,NOME:$('#fNome').value,VINCULO:$('#fVinc').value,AUTORIDADE:$('#fAut').value,PRECEDENCIA:prec||'',STATUS_CONFIRMACAO:$('#fStatus').value}); closeModal(); renderFamiliares(); }
async function openFamilyDetail(id){ const c=contextCeremony(),f=(await server('apiListarFamiliares',c.ID_CERIMONIA,'TODOS')).find(x=>x.ID_FAMILIAR===id); if(!f)return; openModal(`${modalCloseButton()}<h2>${esc(f.NOME)}</h2><p class="muted">${esc(f.VINCULO)} de ${esc(f.AUTORIDADE)}</p><dl class="detail-grid compact"><dt>Status</dt><dd>${badgeStatus(f.STATUS_CONFIRMACAO)}</dd></dl><div class="actions">${f.PRESENCA?`<button class="btn danger" onclick="familyPresence('${id}',false)">CANCELAR PRESENÇA</button>`:`<button class="btn ok" onclick="familyPresence('${id}',true)">CONFIRMAR PRESENÇA</button>`}<button class="btn outline" onclick="addFamilyToNominata('${id}')">ADICIONAR À NOMINATA</button><button class="btn outline" onclick="openFamilyForm('${id}')">EDITAR</button><button class="btn danger" onclick="deleteFamily('${id}')">EXCLUIR</button></div>`); }
async function familyPresence(id,on){ const c=contextCeremony(); await server(on?'apiMarcarPresencaFamiliar':'apiCancelarPresencaFamiliar',c.ID_CERIMONIA,id); closeModal(); renderFamiliares(); }
async function addFamilyToNominata(id){ const c=contextCeremony(); await server('apiAdicionarItemNominata',{ID_CERIMONIA:c.ID_CERIMONIA,TIPO_ITEM:'FAMILIAR',REFERENCIA_ID:id}); closeModal(); showToast('Familiar adicionado à nominata.'); }
async function deleteFamily(id){ if(!confirm('Excluir este familiar?'))return; const c=contextCeremony(); await server('apiExcluirFamiliar',c.ID_CERIMONIA,id); closeModal(); renderFamiliares(); }

/* -------------------------------------------------------------------------- */
/* TRIBUNA                                                                     */
/* -------------------------------------------------------------------------- */
function tribunaCircleHtml(p){
  const g=p.autoridade||{},nome=(g.POSTO?g.POSTO+' ':'')+(g.NOME_GUERRA||g.NOME_COMPLETO||'');
  return `<button class="seat-circle ${g.PRESENCA?'arrived':''}" title="${esc(nome)}" onclick="openGuestEventDetail('${esc(g.ID_CONVIDADO||'')}')"><span class="order">${esc(p.rotulo)}</span><span class="seat-name">${esc(nome)}</span>${p.funcao?`<span class="seat-role">${esc(p.funcao)}</span>`:''}</button>`;
}
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
  const isAut=i.TIPO_ITEM==='AUTORIDADE',isMsg=i.TIPO_ITEM==='MENSAGEM'||i.TIPO_ITEM==='TEXTO';
  const avatar=isAut?photoHtml(i):`<div class="avatar placeholder">${isMsg?'MSG':esc(i.ORDEM)}</div>`;
  const click=isAut?`onclick="openGuestOperationDetail('${i.REF}')"`:(isMsg?`onclick="openNominataMessage('${i.ID_ITEM}')"`:'');
  const pres=isAut&&i.PRESENTE===false?'<span class="badge pending">SEM PRESENÇA</span>':(isAut&&i.PRESENTE?'<span class="badge present">PRESENTE</span>':'');
  return `<div class="person-card ${isAut||isMsg?'clickable':''} nominata-card" ${click}>${avatar}<div class="grow"><div class="person-name">${esc(i.TITULO)}</div><div class="person-meta-line"><span class="badge">${esc(i.TIPO_ITEM)}</span>${pres}</div></div><div class="order-controls"><button onclick="event.stopPropagation();removeNom('${i.ID_ITEM}')">REMOVER</button></div></div>`;
}

async function renderNominata(){
  const c=contextCeremony();if(!c){$('#main').innerHTML='<div class="empty">Nenhuma cerimônia ativa.</div>';return;}
  const data=await server('apiNominataPainel',c.ID_CERIMONIA),items=data.items||[],guests=data.guests||[],fams=data.fams||[],msgs=data.msgs||[];
  state.nomData={guests,fams,msgs};state.nomItems=items;
  let html=`<div class="page-head"><div><div class="section-title">NOMINATA</div><div class="small muted">${esc(c.NOME_EVENTO)} | ${items.length} itens</div></div><div class="page-actions"><button class="btn primary" onclick="openBulkNominata()">ADICIONAR VÁRIAS AUTORIDADES</button><button class="btn outline" onclick="openAddNominataItem()">OUTRO ITEM</button><button class="btn outline" onclick="openMessageBank()">MENSAGENS</button></div></div><div class="notice">As autoridades permanecem sempre na ordem de precedência da cerimônia. Clique em uma autoridade para confirmar/cancelar presença. Clique em uma mensagem para editar ou reposicionar.</div>`;
  html+=items.length?`<div class="person-list nominata-list">${items.map(nominataItemCard).join('')}</div>`:'<div class="empty">A nominata está vazia.</div>';
  $('#main').innerHTML=html;
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
  if(type==='FAMILIAR')opts=(d.fams||[]).map(f=>`<option value="${f.ID_FAMILIAR}">${esc(f.NOME+' — '+f.VINCULO)}</option>`).join('');
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
async function renderEstatisticas(){ const c=contextCeremony(); if(!c){$('#main').innerHTML='<div class="empty">Nenhuma cerimônia ativa.</div>';return;} const rows=await server('apiEstatisticas',c.ID_CERIMONIA); $('#main').innerHTML=`<div class="page-head"><div><div class="section-title">ESTATÍSTICAS POR CÍRCULO</div><div class="small muted">${esc(c.NOME_EVENTO)}</div></div><div class="page-actions"><button class="btn outline" onclick="openStatsConfig()">CONFIGURAR CÍRCULOS</button></div></div><div class="stats-wrap"><table class="stats"><thead><tr><th>GRUPO</th><th>CONF.</th><th>PRES.</th><th>PEND.</th><th>NÃO VIRÁ</th><th>TOTAL</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.GRUPO)}</td><td>${r.CONFIRMADOS}</td><td><strong>${r.PRESENTES}</strong></td><td>${r.PENDENTES}</td><td>${r.NAO_COMPARECERA}</td><td><strong>${r.TOTAL}</strong></td></tr>`).join('')}</tbody></table></div>`; }
async function openStatsConfig(){ const c=contextCeremony(),[groups,opts]=await Promise.all([server('apiListarGruposEstatistica'),server('apiOpcoesEstatistica',c.ID_CERIMONIA)]); state.statsConfig={groups,opts}; openModal(`${modalCloseButton()}<h2>Configurar círculos estatísticos</h2><p class="small muted">Acrescente postos e autoridades específicas conforme surgirem. A classificação nominal prevalece sobre a automática.</p>${groups.filter(g=>g.tipo==='CONVIDADOS').map(g=>statsGroupHtml(g,opts)).join('')}`,true); }
function statsGroupHtml(g,opts){ return `<div class="circle-card"><div class="title">${esc(g.nome)}</div><div class="small muted">Postos cadastrados</div><div class="chips">${(g.postos||[]).map(p=>`<span class="chip">${esc(p)}<button onclick="removePostFromGroup('${g.id}','${esc(p)}')">X</button></span>`).join('')||'<span class="small muted">Nenhum posto específico.</span>'}</div><div class="row"><select id="posto_${g.id}" class="grow">${opts.postos.map(p=>`<option>${esc(p)}</option>`).join('')}</select><button class="btn outline sm" onclick="addPostToGroup('${g.id}')">ADICIONAR POSTO</button></div><div class="small muted" style="margin-top:10px">Autoridades específicas</div><div class="chips">${(g.autoridades||[]).map(id=>{const a=opts.autoridades.find(x=>x.ID_AUTORIDADE===id);return`<span class="chip">${esc(a?a.NOME:id)}<button onclick="removeAuthorityFromGroup('${g.id}','${id}')">X</button></span>`}).join('')||'<span class="small muted">Nenhuma autoridade específica.</span>'}</div><div class="row"><select id="aut_${g.id}" class="grow">${opts.autoridades.map(a=>`<option value="${a.ID_AUTORIDADE}">${esc(a.NOME)}</option>`).join('')}</select><button class="btn outline sm" onclick="addAuthorityToGroup('${g.id}')">ADICIONAR AUTORIDADE</button></div></div>`; }
async function addPostToGroup(id){ const p=$('#posto_'+id).value; if(p)await server('apiAdicionarPostoGrupo',id,p); openStatsConfig(); }
async function removePostFromGroup(id,p){ await server('apiRemoverPostoGrupo',id,p); openStatsConfig(); }
async function addAuthorityToGroup(id){ const a=$('#aut_'+id).value; if(a)await server('apiAdicionarAutoridadeGrupo',id,a); openStatsConfig(); }
async function removeAuthorityFromGroup(id,a){ await server('apiRemoverAutoridadeGrupo',id,a); openStatsConfig(); }

/* -------------------------------------------------------------------------- */
/* DOCUMENTOS / GUIA                                                           */
/* -------------------------------------------------------------------------- */
async function renderDocumentos(){ const c=contextCeremony(); if(!c){$('#main').innerHTML='<div class="empty">Nenhuma cerimônia ativa.</div>';return;} $('#main').innerHTML=`<div class="page-head"><div><div class="section-title">GERAR ARQUIVOS</div><div class="small muted">${esc(c.NOME_EVENTO)}</div></div></div><div class="card"><p class="small muted">Os arquivos são gerados com os dados atuais da cerimônia e recebem o rodapé do SGCM 2.0.</p><div class="actions"><button class="btn primary" onclick="genDoc('nominata')">GERAR ANEXO À LOCUÇÃO</button><button class="btn primary" onclick="genDoc('tribuna')">GERAR TRIBUNA DE HONRA</button></div><div id="docResult"></div></div>`; }
async function genDoc(type){ const c=contextCeremony(); $('#docResult').innerHTML='<p class="small muted">Gerando documento...</p>'; try{ const r=await server(type==='tribuna'?'apiGerarTribunaDocumento':'apiGerarNominata',c.ID_CERIMONIA); $('#docResult').innerHTML=`<p><a class="btn outline" href="${esc(r.url)}" target="_blank">ABRIR DOCUMENTO GERADO</a></p><p class="small muted">${esc(r.nome)}</p>`; }catch(e){ $('#docResult').innerHTML=`<div class="notice danger-notice">${esc(e.message)}</div>`; } }
function renderGuia(){ $('#main').innerHTML=`<div class="section-title">GUIA RÁPIDO</div><div class="card"><p><b>Planejamento:</b> use as abas Cxxx_CONVIDADOS e Cxxx_FAMILIARES para importar e organizar convidados, familiares e status de confirmação.</p><p><b>Operação:</b> Recepção e Presentes exibem somente os dados necessários à equipe de recepção. Ajustes de honras, presidência, anfitrião, tribuna e nominata ficam em Evento/Cerimonial.</p><p><b>Banco:</b> AUTORIDADES é exibida no aplicativo na mesma ordem física da planilha. O cadastro pode ser corrigido pelo aplicativo durante a cerimônia.</p><p><b>Fotos:</b> ausência de fotografia ou outro dado nunca bloqueia o convidado; o Evento apenas sinaliza o cadastro incompleto.</p><p><b>Instalação:</b> o frontend é publicado no GitHub Pages e o Apps Script atua somente como API.</p></div>`; }

window.addEventListener('resize',()=>{if(state.screen==='tribuna')fitTribunaStage();});

boot();
