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
