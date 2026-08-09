const CACHE_NAME='sgcm-shell-20260809-08';
const SHELL=[
  './','./index.html','./styles.css','./app.js','./config.js','./dashboard.html','./dashboard.css','./dashboard.js',
  './manifest.webmanifest','./assets/logo.png','./assets/logo.svg','./assets/favicon.svg',
  './assets/icon-192.png','./assets/icon-512.png'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.endsWith('/config.js')){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(r=>{
      const copy=r.clone();caches.open(CACHE_NAME).then(c=>c.put(event.request,copy));return r;
    }).catch(()=>caches.match(event.request)));
    return;
  }
  // Shell estático: cache-first para abrir rápido e continuar acessível em sinal fraco.
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(r=>{
    const copy=r.clone();caches.open(CACHE_NAME).then(c=>c.put(event.request,copy));return r;
  })));
});
