/* SGCM 2.0 - Patch Familiares/Nominata 2026-08-10
 * Carregar DEPOIS de app.js.
 * Não substitui app.js; apenas complementa a interface atual.
 */
(function(){
  'use strict';

  function familyLabel(f){
    if(!f) return '';
    return String(f.ROTULO_REFERENCIA || [f.NOME, '—', f.VINCULO, 'DE', (f.AUTORIDADE_RESUMO || f.AUTORIDADE || '')].filter(Boolean).join(' ')).toUpperCase();
  }

  // Mantém todo o comportamento atual do modal de Nominata e melhora apenas
  // a identificação dos familiares na lista suspensa.
  if(typeof updateNomRef === 'function'){
    const originalUpdateNomRef = updateNomRef;
    updateNomRef = function(){
      originalUpdateNomRef.apply(this, arguments);
      try{
        const typeEl = document.querySelector('#nType');
        const refEl = document.querySelector('#nRef');
        if(!typeEl || !refEl || String(typeEl.value).toUpperCase() !== 'FAMILIAR') return;
        const d = (typeof state !== 'undefined' && state.nomData) ? state.nomData : {};
        const fams = d.fams || [];
        refEl.innerHTML = fams.map(f => `<option value="${esc(f.ID_FAMILIAR)}">${esc(familyLabel(f))}</option>`).join('');
      }catch(e){ console.warn('SGCM familiar label:', e); }
    };
  }

  // Troca CÔNJUGE por ESPOSA/ESPOSO nas novas inclusões. Registros antigos
  // continuam editáveis e são preservados até o usuário alterar manualmente.
  if(typeof openFamilyForm === 'function'){
    const originalOpenFamilyForm = openFamilyForm;
    openFamilyForm = async function(id){
      const r = await originalOpenFamilyForm.apply(this, arguments);
      try{
        const sel = document.querySelector('#fVinc');
        if(!sel) return r;
        const atual = String(sel.value || '').toUpperCase();
        const opcoes = ['ESPOSA','ESPOSO','FILHO','FILHA','PAI','MÃE','OUTRO'];
        if(atual && !opcoes.includes(atual)) opcoes.unshift(atual);
        sel.innerHTML = opcoes.map(x => `<option ${x===atual?'selected':''}>${x}</option>`).join('');
      }catch(e){ console.warn('SGCM vínculo familiar:', e); }
      return r;
    };
  }

  async function gerarNominataFamiliares(){
    const c = contextCeremony();
    if(!c) return;
    const area = document.querySelector('#docResult');
    if(area) area.innerHTML = '<p class="small muted">Gerando nominata com familiares...</p>';
    try{
      const r = await server('apiGerarNominataComFamiliares', c.ID_CERIMONIA);
      if(area) area.innerHTML = `<p><a class="btn outline" href="${esc(r.url)}" target="_blank">ABRIR DOCUMENTO GERADO</a></p><p class="small muted">${esc(r.nome)}</p>`;
    }catch(e){
      if(area) area.innerHTML = `<div class="notice danger-notice">${esc(e.message || e)}</div>`;
      else if(typeof showToast === 'function') showToast(e.message || String(e));
    }
  }
  window.gerarNominataFamiliares = gerarNominataFamiliares;

  function ensureFamilyDocButton(){
    try{
      const main = document.querySelector('#main');
      if(!main || !/GERAR\s+ARQUIVOS/i.test(main.textContent || '')) return;
      if(document.querySelector('#btnNomFamiliares')) return;
      const actions = main.querySelector('.actions');
      if(!actions) return;
      const b = document.createElement('button');
      b.id = 'btnNomFamiliares';
      b.className = 'btn primary';
      b.textContent = 'GERAR NOMINATA COM FAMILIARES';
      b.addEventListener('click', gerarNominataFamiliares);
      actions.appendChild(b);
    }catch(e){ console.warn('SGCM botão nominata familiares:', e); }
  }

  const main = document.querySelector('#main');
  if(main){
    new MutationObserver(ensureFamilyDocButton).observe(main,{childList:true,subtree:true});
    ensureFamilyDocButton();
  } else {
    document.addEventListener('DOMContentLoaded', ()=>{
      const m = document.querySelector('#main');
      if(m){new MutationObserver(ensureFamilyDocButton).observe(m,{childList:true,subtree:true});ensureFamilyDocButton();}
    });
  }
})();

/* ===== Presença do familiar diretamente na NOMINATA =====
 * Autoridades já usam o detalhe operacional do app principal. Este complemento
 * dá ao familiar o mesmo comportamento: clicar no cartão abre confirmação/
 * cancelamento de presença, sem alterar sua posição na nominata.
 */
(function(){
  'use strict';

  function normalText(s){
    return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ').trim().toUpperCase();
  }

  function familyById(id){
    const d=(typeof state!=='undefined'&&state.nomData)?state.nomData:{};
    return (d.fams||[]).find(f=>String(f.ID_FAMILIAR)===String(id))||null;
  }

  function itemFamilyById(id){
    const d=(typeof state!=='undefined'&&state.nomData)?state.nomData:{};
    return (d.items||[]).find(it=>it.TIPO_ITEM==='FAMILIAR'&&String(it.REF)===String(id))||null;
  }

  function familyAuthorityLabel(f){
    if(!f)return '';
    return String(f.AUTORIDADE_RESUMO||f.AUTORIDADE||'').toUpperCase();
  }

  function familyPresenceModal(id){
    const f=familyById(id),it=itemFamilyById(id);
    if(!f)return;
    const presente=!!(it?it.PRESENTE:f.PRESENCA);
    const rel=familyAuthorityLabel(f);
    const titulo=[String(f.NOME||'').toUpperCase(),String(f.VINCULO||'').toUpperCase()].filter(Boolean).join(' — ');
    const acao=presente?'CANCELAR PRESENÇA':'CONFIRMAR PRESENÇA';
    const cls=presente?'danger':'success';
    const fechar=(typeof modalCloseButton==='function')?modalCloseButton():'<button class="btn outline" onclick="closeModal()">FECHAR</button>';
    const html=`${fechar}<h2>${esc(titulo)}</h2>
      ${rel?`<div class="notice"><strong>Relacionado a:</strong><br>${esc(rel)}</div>`:''}
      <div class="detail-grid" style="margin-top:12px">
        <div><span class="muted small">Nome</span><strong>${esc(String(f.NOME||'').toUpperCase())}</strong></div>
        <div><span class="muted small">Vínculo</span><strong>${esc(String(f.VINCULO||'').toUpperCase())}</strong></div>
        <div><span class="muted small">Status</span><strong>${presente?'PRESENTE':'SEM PRESENÇA'}</strong></div>
      </div>
      <button class="btn ${cls} block" style="margin-top:16px" onclick="toggleNomFamilyPresence('${esc(id)}',${presente?'true':'false'})">${acao}</button>`;
    if(typeof openModal==='function')openModal(html,true);
  }
  window.openNomFamilyPresence=familyPresenceModal;

  async function toggleNomFamilyPresence(id,presente){
    const c=(typeof contextCeremony==='function')?contextCeremony():null;
    if(!c)return;
    try{
      if(presente) await server('apiCancelarPresencaFamiliar',c.ID_CERIMONIA,id);
      else await server('apiMarcarPresencaFamiliar',c.ID_CERIMONIA,id);
      if(typeof closeModal==='function')closeModal();
      if(typeof showToast==='function')showToast(presente?'Presença do familiar cancelada.':'Presença do familiar confirmada.');
      // Reabre a Nominata para buscar estado atualizado do backend.
      if(typeof renderNominata==='function')await renderNominata();
      setTimeout(enhanceFamilyCards,80);
    }catch(e){
      if(typeof showToast==='function')showToast(e.message||String(e));
      else alert(e.message||String(e));
    }
  }
  window.toggleNomFamilyPresence=toggleNomFamilyPresence;

  function smallestCardForTitle(root,title){
    const alvo=normalText(title);
    if(!alvo)return null;
    const els=[...root.querySelectorAll('article,li,div')].filter(el=>{
      const txt=normalText(el.innerText||'');
      if(!txt.includes(alvo))return false;
      const rem=[...el.querySelectorAll('button')].some(b=>normalText(b.textContent)==='REMOVER');
      return rem;
    });
    els.sort((a,b)=>(a.innerText||'').length-(b.innerText||'').length);
    return els[0]||null;
  }

  function enhanceFamilyCards(){
    try{
      const main=document.querySelector('#main');
      if(!main||!/NOMINATA/i.test(main.textContent||''))return;
      const d=(typeof state!=='undefined'&&state.nomData)?state.nomData:{};
      const famItems=(d.items||[]).filter(it=>it.TIPO_ITEM==='FAMILIAR');
      famItems.forEach(it=>{
        const card=smallestCardForTitle(main,it.TITULO);
        if(!card||card.dataset.sgcmFamilyPresence==='1')return;
        card.dataset.sgcmFamilyPresence='1';
        card.style.cursor='pointer';
        card.setAttribute('title','Clique para confirmar ou cancelar a presença do familiar');
        card.addEventListener('click',ev=>{
          if(ev.target.closest('button,a,input,select,textarea,label'))return;
          familyPresenceModal(it.REF);
        });
      });
    }catch(e){console.warn('SGCM presença familiar na nominata:',e);}
  }

  // Sempre que a Nominata for redesenhada, reaplica o comportamento aos
  // cartões de familiares sem interferir nos cartões de autoridades.
  const main=document.querySelector('#main');
  if(main){
    new MutationObserver(()=>setTimeout(enhanceFamilyCards,30)).observe(main,{childList:true,subtree:true});
    setTimeout(enhanceFamilyCards,100);
  }else{
    document.addEventListener('DOMContentLoaded',()=>{
      const m=document.querySelector('#main');
      if(m)new MutationObserver(()=>setTimeout(enhanceFamilyCards,30)).observe(m,{childList:true,subtree:true});
      setTimeout(enhanceFamilyCards,100);
    });
  }
})();
