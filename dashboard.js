const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>\'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function apiUrl(){
  const u=String(window.SGCM_CONFIG?.API_URL||'').trim();
  if(!u||u.includes('COLE_AQUI'))throw new Error('Configure API_URL em config.js.');
  return u;
}

function jsonp(fn,args=[]){
  return new Promise((resolve,reject)=>{
    const cb='__dash_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const s=document.createElement('script');
    let done=false;
    const end=()=>{if(done)return;done=true;try{delete window[cb]}catch(e){};s.remove()};
    const timer=setTimeout(()=>{end();reject(new Error('Tempo excedido.'));},25000);
    window[cb]=p=>{clearTimeout(timer);end();p&&p.ok!==false?resolve(p.data):reject(new Error(p?.error||'Erro no dashboard.'))};
    s.onerror=()=>{clearTimeout(timer);end();reject(new Error('Backend indisponível.'))};
    s.src=apiUrl()+'?'+new URLSearchParams({action:fn,args:JSON.stringify(args),prefix:cb,_:Date.now()});
    document.head.appendChild(s);
  });
}

function clock(){
  const d=new Date();
  $('#tvTime').textContent=d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}
setInterval(clock,1000);
clock();

function seatHtml(p){
  const g=p.autoridade||{};
  const nome=((g.POSTO?g.POSTO+' ':'')+(g.NOME_GUERRA||g.NOME_COMPLETO||'')).trim();
  return `<div class="tv-seat ${g.PRESENCA?'present':''}">
    <span class="num">${esc(p.rotulo||'')}</span>
    <span class="name">${esc(nome)}</span>
    ${p.funcao?`<span class="role">${esc(p.funcao)}</span>`:''}
  </div>`;
}

function renderTribuna(t){
  const wrap=document.querySelector('.tv-tribuna');
  if(!t?.fileiras?.length){
    if(wrap)wrap.style.height='18vh';
    $('#tvTribuna').innerHTML='<div class="empty">Tribuna ainda sem composição.</div>';
    return;
  }

  const fileiras=Math.max(1,t.fileiras.length);
  const total=t.fileiras.reduce((s,f)=>s+(f.posicoes?.length||0),0);

  // A caixa começa compacta e cresce apenas quando novas fileiras são usadas.
  if(wrap){
    const altura=fileiras===1?20:(fileiras===2?28:36);
    wrap.style.height=altura+'vh';
    wrap.style.minHeight=altura+'vh';
    wrap.style.maxHeight=altura+'vh';
  }

  $('#tvTribuna').innerHTML=
    `<div class="tv-tropa">FRENTE DA TROPA</div>`+
    t.fileiras.map(fr=>
      `<div class="tv-fileira-label">FILEIRA ${fr.numero}</div>
       <div class="tv-tribuna-row seats-${total>12?'tight':'normal'}">
         ${fr.posicoes.map(seatHtml).join('')}
       </div>`
    ).join('');
}

function renderNominata(list){
  const total=list.length;
  const pres=list.filter(x=>x.PRESENTE).length;
  const aus=total-pres;

  $('#tvNomTotals').innerHTML=
    `<span class="mini-pill">TOTAL ${total}</span>
     <span class="mini-pill ok">PRESENTES ${pres}</span>
     <span class="mini-pill wait">AUSENTES ${aus}</span>`;

  $('#tvNominata').classList.toggle('three-cols',list.length>24);
  $('#tvNominata').innerHTML=list.length
    ? list.map(i=>
      `<div class="tv-nom-row">
        <div class="tv-nom-name">${esc(i.NOME_RESUMIDO||([i.POSTO,i.NOME_GUERRA].filter(Boolean).join(' '))||'AUTORIDADE')}</div>
        <span class="tv-status ${i.PRESENTE?'present':'pending'}">${i.PRESENTE?'PRESENTE':'PENDENTE'}</span>
      </div>`
    ).join('')
    : '<div class="empty">Nominata vazia.</div>';
}

function renderStats(rows){
  $('#tvStats').innerHTML=rows.map(r=>
    `<div class="tv-stat">
      <div class="tv-stat-name">${esc(r.GRUPO)}</div>
      <div class="tv-stat-values">
        <span>Pres. <strong>${r.PRESENTES}</strong></span>
        <span>Pend. <strong>${r.PENDENTES}</strong></span>
        <span>Total <strong>${r.TOTAL}</strong></span>
      </div>
    </div>`
  ).join('')||'<div class="empty">Sem estatísticas.</div>';
}

async function refresh(){
  try{
    const d=await jsonp('apiDashboard');
    if(!d.cerimonia){
      $('#tvEvent').textContent='Nenhuma cerimônia ativa';
      return;
    }
    $('#tvEvent').textContent=`${d.cerimonia.NOME_EVENTO} | ${d.cerimonia.DATA||''} | ${d.cerimonia.LOCAL||''}`;
    $('#tvUpdated').textContent='Atualizado '+(d.atualizadoEm||'');
    renderTribuna(d.tribuna);
    renderNominata(d.nominata||[]);
    renderStats(d.estatisticas||[]);
  }catch(e){
    $('#tvUpdated').textContent='Sem atualização — '+e.message;
  }
}

refresh();
setInterval(refresh,10000);
