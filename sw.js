const CACHE_NAME='sgcm-shell-20260812-01';
const SHELL=[
  './','./index.html','./styles.css','./app.js','./config.js','./dashboard.html',
  './manifest.webmanifest','./assets/logo.png','./assets/icon-192.png','./assets/icon-512.png'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(c=>c.addAll(SHELL))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

async function networkFirst(request){
  const cache=await caches.open(CACHE_NAME);
  try{
    const response=await fetch(request,{cache:'no-store'});
    if(response&&response.ok)cache.put(request,response.clone());
    return response;
  }catch(e){
    return (await caches.match(request)) || (await caches.match('./index.html'));
  }
}

async function staleWhileRevalidate(request){
  const cache=await caches.open(CACHE_NAME);
  const cached=await caches.match(request);
  const network=fetch(request).then(response=>{
    if(response&&response.ok)cache.put(request,response.clone());
    return response;
  }).catch(()=>null);
  return cached || network || Response.error();
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;

  const isNavigation=event.request.mode==='navigate';
  const path=url.pathname;

  // HTML e configuração: sempre tenta a versão mais nova primeiro.
  if(isNavigation || path.endsWith('/index.html') || path.endsWith('/dashboard.html') || path.endsWith('/config.js')){
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Código/estilo: abre rápido pelo cache e atualiza em segundo plano.
  if(path.endsWith('.js') || path.endsWith('.css') || path.endsWith('.webmanifest')){
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Imagens estáticas: cache-first.
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(r=>{
    const copy=r.clone();caches.open(CACHE_NAME).then(c=>c.put(event.request,copy));return r;
  })));
});
