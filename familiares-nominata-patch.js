/* SGCM 2.0 - Familiares/Nominata - revisão 2026-08-10-03
 * Carregar DEPOIS de app.js.
 *
 * Ajustes desta revisão:
 * 1) identificação completa do familiar na seleção;
 * 2) ESPOSA/ESPOSO nas novas inclusões;
 * 3) clique confiável no CARTÃO do familiar na Nominata para
 *    confirmar/cancelar presença;
 * 4) mantém o botão GERAR NOMINATA COM FAMILIARES;
 * 5) padroniza visualmente o cartão e o modal do familiar na Nominata.
 */
(function(){
  'use strict';


  /* ---------- Ajuste visual do familiar na Nominata ---------- */
  function injectFamilyStyles(){
    if(document.querySelector('#sgcm-family-style'))return;
    const st=document.createElement('style');
    st.id='sgcm-family-style';
    st.textContent=`
      .sgcm-family-card{cursor:pointer}
      .sgcm-family-card .sgcm-family-title{
        font-weight:800!important;
        line-height:1.22!important;
        color:var(--text,#17243a)!important;
        letter-spacing:0!important;
      }
      .sgcm-family-card .sgcm-family-meta-row{
        display:flex!important;
        align-items:center!important;
        gap:7px!important;
        flex-wrap:nowrap!important;
        margin-top:4px!important;
      }
      .sgcm-family-card .sgcm-family-presence-badge{
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        margin:0!important;
        padding:3px 8px!important;
        border-radius:999px!important;
        font-size:10px!important;
        font-weight:800!important;
        line-height:1!important;
        white-space:nowrap!important;
        letter-spacing:0!important;
      }
      .sgcm-family-modal-title{
        margin:0 72px 16px 0!important;
        font-size:22px!important;
        line-height:1.2!important;
        color:var(--text,#17243a)!important;
      }
      .sgcm-family-related{
        margin:0 0 14px!important;
        padding:11px 13px!important;
        border:1px solid #ead48c!important;
        border-radius:10px!important;
        background:#fff8df!important;
      }
      .sgcm-family-related-label{
        display:block!important;
        margin-bottom:3px!important;
        font-size:11px!important;
        font-weight:700!important;
        color:#7a5a00!important;
      }
      .sgcm-family-related-value{
        display:block!important;
        font-size:13px!important;
        font-weight:700!important;
        line-height:1.3!important;
        color:#493900!important;
      }
      .sgcm-family-modal-fields{
        display:grid!important;
        grid-template-columns:repeat(3,minmax(0,1fr))!important;
        gap:10px!important;
        margin:0 0 16px!important;
      }
      .sgcm-family-field{
        min-width:0!important;
        padding:10px 12px!important;
        border:1px solid var(--line,#d5deea)!important;
        border-radius:9px!important;
        background:#f8fafc!important;
      }
      .sgcm-family-field-label{
        display:block!important;
        margin-bottom:4px!important;
        font-size:10px!important;
        font-weight:700!important;
        color:var(--muted,#68758a)!important;
        text-transform:uppercase!important;
        letter-spacing:.03em!important;
      }
      .sgcm-family-field-value{
        display:block!important;
        font-size:13px!important;
        font-weight:800!important;
        line-height:1.25!important;
        color:var(--text,#17243a)!important;
        overflow-wrap:anywhere!important;
      }
      .sgcm-family-modal-action{
        width:100%!important;
        min-height:42px!important;
        margin-top:2px!important;
      }
      @media(max-width:700px){
        .sgcm-family-modal-title{
          margin-right:58px!important;
          font-size:18px!important;
          line-height:1.25!important;
        }
        .sgcm-family-modal-fields{
          grid-template-columns:1fr!important;
          gap:7px!important;
        }
        .sgcm-family-field{
          display:grid!important;
          grid-template-columns:88px minmax(0,1fr)!important;
          align-items:center!important;
          gap:8px!important;
          padding:9px 10px!important;
        }
        .sgcm-family-field-label{margin:0!important}
        .sgcm-family-field-value{text-align:left!important}
        .sgcm-family-card .sgcm-family-meta-row{gap:5px!important}
        .sgcm-family-card .sgcm-family-presence-badge{font-size:9px!important;padding:3px 7px!important}
      }
      @media(max-width:390px){
        .sgcm-family-field{grid-template-columns:76px minmax(0,1fr)!important}
        .sgcm-family-modal-title{font-size:17px!important}
      }
    `;
    document.head.appendChild(st);
  }

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

  /* ---------- Presença do familiar na Nominata ----------
   * Revisão final: não depende mais de "achar" previamente um cartão e
   * instalar onclick nele. O clique é tratado por delegação no documento,
   * então continua funcionando mesmo quando a Nominata é redesenhada.
   */
  function painel(){
    return (typeof state!=='undefined'&&state.nomData)?state.nomData:{};
  }

  function familyByIdLocal(id){
    return (painel().fams||[]).find(f=>String(f.ID_FAMILIAR)===String(id))||null;
  }

  function itemFamilyById(id){
    return (painel().items||[]).find(it=>norm(it.TIPO_ITEM)==='FAMILIAR'&&String(it.REF)===String(id))||null;
  }

  async function carregarPainelNominata(){
    const c=(typeof contextCeremony==='function')?contextCeremony():null;
    if(!c)return null;
    try{
      const d=await server('apiNominataPainel',c.ID_CERIMONIA);
      if(typeof state!=='undefined')state.nomData=d;
      return d;
    }catch(e){
      console.warn('SGCM painel nominata:',e);
      return null;
    }
  }

  async function familyById(id){
    let f=familyByIdLocal(id);
    if(f)return f;
    const d=await carregarPainelNominata();
    return d?(d.fams||[]).find(x=>String(x.ID_FAMILIAR)===String(id))||null:null;
  }

  function familyItemForCard(card,d){
    d=d||painel();
    const txt=norm(card&&card.innerText);
    const famItems=(d.items||[]).filter(it=>norm(it.TIPO_ITEM)==='FAMILIAR');
    const fams=d.fams||[];

    // Primeiro pelo nome do familiar mostrado no cartão.
    let achados=famItems.filter(it=>{
      const f=fams.find(x=>String(x.ID_FAMILIAR)===String(it.REF));
      return f&&norm(f.NOME)&&txt.includes(norm(f.NOME));
    });
    if(achados.length===1)return achados[0];

    // Depois pelo título que o backend já montou para o item da Nominata.
    achados=famItems.filter(it=>norm(it.TITULO)&&txt.includes(norm(it.TITULO)));
    if(achados.length===1)return achados[0];

    // Se houver apenas um familiar na Nominata, não há ambiguidade.
    return famItems.length===1?famItems[0]:null;
  }

  function removeButtonsCount(el){
    return [...el.querySelectorAll('button')].filter(b=>norm(b.textContent)==='REMOVER').length;
  }

  function closestFamilyCard(target){
    const main=document.querySelector('#main');
    if(!main||!target)return null;
    let el=target.nodeType===1?target:target.parentElement;
    while(el&&el!==main){
      const txt=norm(el.innerText||'');
      // O cartão é o primeiro ancestral que contém exatamente um REMOVER e
      // a etiqueta FAMILIAR. Isso evita selecionar o painel inteiro.
      if(txt.includes('FAMILIAR')&&removeButtonsCount(el)===1)return el;
      el=el.parentElement;
    }
    return null;
  }

  function marcarTituloFamiliar_(card,f){
    if(!card||!f)return;
    card.classList.add('sgcm-family-card');
    const alvo=norm(f.NOME||'');
    if(alvo){
      const candidatos=[...card.querySelectorAll('div,span,strong,p')]
        .filter(el=>!el.children.length&&norm(el.textContent).includes(alvo));
      if(candidatos.length){
        candidatos.sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length);
        candidatos[0].classList.add('sgcm-family-title');
      }
    }
  }

  function badgePresenca(card,presente,f){
    if(!card)return;
    marcarTituloFamiliar_(card,f);
    let badge=card.querySelector('.sgcm-family-presence-badge');
    const candidates=[...card.querySelectorAll('span,div')];
    const famTag=candidates.find(x=>norm(x.textContent)==='FAMILIAR');
    if(famTag&&famTag.parentElement)famTag.parentElement.classList.add('sgcm-family-meta-row');
    if(!badge){
      badge=document.createElement('span');
      badge.className='sgcm-family-presence-badge';
      if(famTag&&famTag.parentElement)famTag.insertAdjacentElement('afterend',badge);
      else{
        const rem=[...card.querySelectorAll('button')].find(b=>norm(b.textContent)==='REMOVER');
        if(rem&&rem.parentElement)rem.parentElement.insertBefore(badge,rem);
        else card.appendChild(badge);
      }
    }
    badge.textContent=presente?'PRESENTE':'PENDENTE';
    badge.style.background=presente?'#dff4e8':'#fff1c9';
    badge.style.color=presente?'#176b45':'#8a5b00';
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
    const nome=String(f.NOME||'').toUpperCase();
    const vinculo=String(f.VINCULO||'').toUpperCase();
    const titulo=[nome,vinculo].filter(Boolean).join(' — ');
    const acao=presente?'CANCELAR PRESENÇA':'CONFIRMAR PRESENÇA';
    const cls=presente?'danger':'success';
    const fechar=(typeof modalCloseButton==='function')?modalCloseButton():'<button class="btn outline" onclick="closeModal()">FECHAR</button>';
    const html=`${fechar}<h2 class="sgcm-family-modal-title">${esc(titulo)}</h2>
      ${rel?`<div class="sgcm-family-related"><span class="sgcm-family-related-label">Relacionado a</span><span class="sgcm-family-related-value">${esc(rel)}</span></div>`:''}
      <div class="sgcm-family-modal-fields">
        <div class="sgcm-family-field"><span class="sgcm-family-field-label">Nome</span><span class="sgcm-family-field-value">${esc(nome)}</span></div>
        <div class="sgcm-family-field"><span class="sgcm-family-field-label">Vínculo</span><span class="sgcm-family-field-value">${esc(vinculo)}</span></div>
        <div class="sgcm-family-field"><span class="sgcm-family-field-label">Presença</span><span class="sgcm-family-field-value">${presente?'PRESENTE':'PENDENTE'}</span></div>
      </div>
      <button class="btn ${cls} block sgcm-family-modal-action" onclick="toggleNomFamilyPresence('${esc(id)}',${presente?'true':'false'})">${acao}</button>`;
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

      // Atualiza o painel a partir do backend e redesenha a Nominata.
      await carregarPainelNominata();
      if(typeof renderNominata==='function')await renderNominata();
      setTimeout(refreshFamilyCards,80);
    }catch(e){
      if(typeof showToast==='function')showToast(e.message||String(e));
      else alert(e.message||String(e));
    }
  }
  window.toggleNomFamilyPresence=toggleNomFamilyPresence;

  async function resolveItemForCard(card){
    let d=painel();
    let it=familyItemForCard(card,d);
    if(it)return it;
    d=await carregarPainelNominata()||{};
    return familyItemForCard(card,d);
  }

  async function refreshFamilyCards(){
    try{
      const main=document.querySelector('#main');
      if(!main||!/NOMINATA/i.test(main.textContent||''))return;
      let d=painel();
      if(!(d.items||[]).length)d=await carregarPainelNominata()||{};

      const removeBtns=[...main.querySelectorAll('button')].filter(b=>norm(b.textContent)==='REMOVER');
      const cards=[];
      removeBtns.forEach(btn=>{
        const c=closestFamilyCard(btn.parentElement||btn);
        if(c&&!cards.includes(c))cards.push(c);
      });

      cards.forEach(card=>{
        const it=familyItemForCard(card,d);
        if(!it)return;
        const f=(d.fams||[]).find(x=>String(x.ID_FAMILIAR)===String(it.REF));
        const presente=!!(typeof it.PRESENTE==='boolean'?it.PRESENTE:(f&&f.PRESENCA));
        card.dataset.sgcmFamilyId=String(it.REF);
        card.style.cursor='pointer';
        card.setAttribute('role','button');
        card.setAttribute('tabindex','0');
        card.setAttribute('title','Clique para confirmar ou cancelar a presença do familiar');
        badgePresenca(card,presente,f);
      });
    }catch(e){console.warn('SGCM cartões familiares:',e);}
  }

  // Delegação global: funciona mesmo depois que renderNominata substitui todo
  // o HTML dos cartões. O botão REMOVER continua independente.
  document.addEventListener('click',async ev=>{
    if(ev.target&&ev.target.closest&&ev.target.closest('button,a,input,select,textarea,label'))return;
    const card=closestFamilyCard(ev.target);
    if(!card)return;
    const it=card.dataset.sgcmFamilyId?{REF:card.dataset.sgcmFamilyId}:await resolveItemForCard(card);
    if(!it||!it.REF)return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    familyPresenceModal(it.REF);
  },true);

  document.addEventListener('keydown',async ev=>{
    if(ev.key!=='Enter'&&ev.key!==' ')return;
    const card=closestFamilyCard(ev.target);
    if(!card)return;
    const it=card.dataset.sgcmFamilyId?{REF:card.dataset.sgcmFamilyId}:await resolveItemForCard(card);
    if(!it||!it.REF)return;
    ev.preventDefault();
    familyPresenceModal(it.REF);
  },true);

  function boot(){
    injectFamilyStyles();
    const main=document.querySelector('#main');
    if(main){
      new MutationObserver(()=>setTimeout(refreshFamilyCards,20)).observe(main,{childList:true,subtree:true});
      setTimeout(refreshFamilyCards,120);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
