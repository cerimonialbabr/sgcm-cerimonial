/* SGCM 2.0 - Familiares/Nominata - revisão 2026-08-10-02
 * Carregar DEPOIS de app.js.
 *
 * Ajustes desta revisão:
 * 1) identificação completa do familiar na seleção;
 * 2) ESPOSA/ESPOSO nas novas inclusões;
 * 3) clique confiável no CARTÃO do familiar na Nominata para
 *    confirmar/cancelar presença;
 * 4) mantém o botão GERAR NOMINATA COM FAMILIARES.
 */
(function(){
  'use strict';

  function norm(s){
    return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ').trim().toUpperCase();
  }

  function familyLabel(f){
    if(!f) return '';
    return String(f.ROTULO_REFERENCIA || [f.NOME,'—',f.VINCULO,'DE',(f.AUTORIDADE_RESUMO||f.AUTORIDADE||'')].filter(Boolean).join(' ')).toUpperCase();
  }

  /* ---------- Lista suspensa do familiar ---------- */
  if(typeof updateNomRef === 'function'){
    const originalUpdateNomRef=updateNomRef;
    updateNomRef=function(){
      originalUpdateNomRef.apply(this,arguments);
      try{
        const typeEl=document.querySelector('#nType');
        const refEl=document.querySelector('#nRef');
        if(!typeEl||!refEl||norm(typeEl.value)!=='FAMILIAR')return;
        const d=(typeof state!=='undefined'&&state.nomData)?state.nomData:{};
        const fams=d.fams||[];
        refEl.innerHTML=fams.map(f=>`<option value="${esc(f.ID_FAMILIAR)}">${esc(familyLabel(f))}</option>`).join('');
      }catch(e){console.warn('SGCM familiar label:',e);}
    };
  }

  /* ---------- Vínculos das novas inclusões ---------- */
  if(typeof openFamilyForm === 'function'){
    const originalOpenFamilyForm=openFamilyForm;
    openFamilyForm=async function(id){
      const r=await originalOpenFamilyForm.apply(this,arguments);
      try{
        const sel=document.querySelector('#fVinc');
        if(!sel)return r;
        const atual=String(sel.value||'').toUpperCase();
        const opcoes=['ESPOSA','ESPOSO','FILHO','FILHA','PAI','MÃE','OUTRO'];
        if(atual&&!opcoes.includes(atual))opcoes.unshift(atual); // preserva CÔNJUGE antigo etc.
        sel.innerHTML=opcoes.map(x=>`<option ${x===atual?'selected':''}>${x}</option>`).join('');
      }catch(e){console.warn('SGCM vínculo familiar:',e);}
      return r;
    };
  }

  /* ---------- Documento Nominata com Familiares ---------- */
  async function gerarNominataFamiliares(){
    const c=(typeof contextCeremony==='function')?contextCeremony():null;
    if(!c)return;
    const area=document.querySelector('#docResult');
    if(area)area.innerHTML='<p class="small muted">Gerando nominata com familiares...</p>';
    try{
      const r=await server('apiGerarNominataComFamiliares',c.ID_CERIMONIA);
      if(area)area.innerHTML=`<p><a class="btn outline" href="${esc(r.url)}" target="_blank">ABRIR DOCUMENTO GERADO</a></p><p class="small muted">${esc(r.nome)}</p>`;
    }catch(e){
      if(area)area.innerHTML=`<div class="notice danger-notice">${esc(e.message||e)}</div>`;
      else if(typeof showToast==='function')showToast(e.message||String(e));
    }
  }
  window.gerarNominataFamiliares=gerarNominataFamiliares;

  function ensureFamilyDocButton(){
    try{
      const main=document.querySelector('#main');
      if(!main||!/GERAR\s+ARQUIVOS/i.test(main.textContent||''))return;
      if(document.querySelector('#btnNomFamiliares'))return;
      const actions=main.querySelector('.actions');
      if(!actions)return;
      const b=document.createElement('button');
      b.id='btnNomFamiliares';b.className='btn primary';b.textContent='GERAR NOMINATA COM FAMILIARES';
      b.addEventListener('click',gerarNominataFamiliares);actions.appendChild(b);
    }catch(e){console.warn('SGCM botão nominata familiares:',e);}
  }

  /* ---------- Presença do familiar na Nominata ---------- */
  function painel(){
    return (typeof state!=='undefined'&&state.nomData)?state.nomData:{};
  }

  function familyByIdLocal(id){
    return (painel().fams||[]).find(f=>String(f.ID_FAMILIAR)===String(id))||null;
  }

  function itemFamilyById(id){
    return (painel().items||[]).find(it=>norm(it.TIPO_ITEM)==='FAMILIAR'&&String(it.REF)===String(id))||null;
  }

  async function familyById(id){
    let f=familyByIdLocal(id);
    if(f)return f;
    try{
      const c=(typeof contextCeremony==='function')?contextCeremony():null;
      if(!c)return null;
      const fams=await server('apiListarFamiliares',c.ID_CERIMONIA,'TODOS');
      f=(fams||[]).find(x=>String(x.ID_FAMILIAR)===String(id))||null;
      if(typeof state!=='undefined'&&state.nomData&&Array.isArray(fams))state.nomData.fams=fams;
      return f;
    }catch(e){console.warn('SGCM carregar familiar:',e);return null;}
  }

  async function familyPresenceModal(id){
    const f=await familyById(id);
    const it=itemFamilyById(id);
    if(!f){
      if(typeof showToast==='function')showToast('Familiar não encontrado.');
      return;
    }
    const presente=!!(it&&typeof it.PRESENTE==='boolean'?it.PRESENTE:f.PRESENCA);
    const rel=String(f.AUTORIDADE_RESUMO||f.AUTORIDADE||'').toUpperCase();
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
      if(presente)await server('apiCancelarPresencaFamiliar',c.ID_CERIMONIA,id);
      else await server('apiMarcarPresencaFamiliar',c.ID_CERIMONIA,id);
      if(typeof closeModal==='function')closeModal();
      if(typeof showToast==='function')showToast(presente?'Presença do familiar cancelada.':'Presença do familiar confirmada.');
      if(typeof renderNominata==='function')await renderNominata();
      setTimeout(enhanceFamilyCards,80);
    }catch(e){
      if(typeof showToast==='function')showToast(e.message||String(e));
      else alert(e.message||String(e));
    }
  }
  window.toggleNomFamilyPresence=toggleNomFamilyPresence;

  function candidateCards(main){
    // Cada cartão da Nominata possui o botão REMOVER. Usar esse botão como
    // âncora é mais confiável do que depender de nomes de classes do app.
    const buttons=[...main.querySelectorAll('button')].filter(b=>norm(b.textContent)==='REMOVER');
    const cards=[];
    buttons.forEach(btn=>{
      let el=btn.parentElement,best=null;
      for(let i=0;el&&el!==main&&i<7;i++,el=el.parentElement){
        const t=norm(el.innerText||'');
        if(t&&t.includes('REMOVER'))best=el;
      }
      if(best&&!cards.includes(best))cards.push(best);
    });
    return cards;
  }

  function matchFamilyCard(cards,it,f){
    const titulo=norm(it&&it.TITULO);
    const nome=norm(f&&f.NOME);
    let candidates=cards.filter(c=>{
      const t=norm(c.innerText||'');
      return (titulo&&t.includes(titulo)) || (nome&&t.includes(nome)&&t.includes('FAMILIAR'));
    });
    if(!candidates.length&&nome)candidates=cards.filter(c=>norm(c.innerText||'').includes(nome));
    candidates.sort((a,b)=>(a.innerText||'').length-(b.innerText||'').length);
    return candidates[0]||null;
  }

  function enhanceFamilyCards(){
    try{
      const main=document.querySelector('#main');
      if(!main||!/NOMINATA/i.test(main.textContent||''))return;
      const d=painel();
      const famItems=(d.items||[]).filter(it=>norm(it.TIPO_ITEM)==='FAMILIAR');
      if(!famItems.length)return;
      const cards=candidateCards(main);
      famItems.forEach(it=>{
        const f=(d.fams||[]).find(x=>String(x.ID_FAMILIAR)===String(it.REF))||null;
        const card=matchFamilyCard(cards,it,f);
        if(!card||card.dataset.sgcmFamilyPresence===String(it.REF))return;
        card.dataset.sgcmFamilyPresence=String(it.REF);
        card.style.cursor='pointer';
        card.setAttribute('role','button');
        card.setAttribute('tabindex','0');
        card.setAttribute('title','Clique para confirmar ou cancelar a presença do familiar');

        const handler=ev=>{
          // REMOVER e demais controles do cartão continuam funcionando.
          if(ev.target&&ev.target.closest&&ev.target.closest('button,a,input,select,textarea,label'))return;
          ev.preventDefault();
          ev.stopPropagation();
          familyPresenceModal(it.REF);
        };
        // Capture=true evita que algum onclick do cartão/pai impeça o clique.
        card.addEventListener('click',handler,true);
        card.addEventListener('keydown',ev=>{
          if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();familyPresenceModal(it.REF);}
        });
      });
    }catch(e){console.warn('SGCM presença familiar na nominata:',e);}
  }

  // Reaplica após toda renderização da Nominata.
  if(typeof renderNominata==='function'){
    const originalRenderNominata=renderNominata;
    renderNominata=async function(){
      const r=await originalRenderNominata.apply(this,arguments);
      setTimeout(enhanceFamilyCards,40);
      return r;
    };
    window.renderNominata=renderNominata;
  }

  function boot(){
    const main=document.querySelector('#main');
    if(main){
      new MutationObserver(()=>{
        ensureFamilyDocButton();
        setTimeout(enhanceFamilyCards,20);
      }).observe(main,{childList:true,subtree:true});
      ensureFamilyDocButton();
      setTimeout(enhanceFamilyCards,100);
      // Fallback leve: cobre navegadores que não disparam mutação na troca de tela.
      setInterval(enhanceFamilyCards,1200);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
