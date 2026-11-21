const CACHE = 'wizard-arcana-v3-2026-11-21';
const suits = ['red','blue','green','yellow'];
const cards = suits.flatMap(s => Array.from({length:13},(_,i)=>`/assets/cards/${s}-${i+1}.webp`))
  .concat(Array.from({length:4},(_,i)=>`/assets/cards/wizard-${i}.webp`))
  .concat(Array.from({length:4},(_,i)=>`/assets/cards/jester-${i}.webp`));
const CORE = ['/','/index.html','/app.js','/style.css','/engine.js','/manifest.webmanifest','/icon.svg',...cards];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(async c => {
  await c.addAll(CORE); await self.skipWaiting();
})));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k!==CACHE).map(k => caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if(e.request.method!=='GET' || url.origin!==self.location.origin || url.pathname.startsWith('/socket.io/'))return;
  if(url.pathname.startsWith('/assets/')){
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
      if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return res;
    })));return;
  }
  e.respondWith(fetch(e.request).then(res=>{
    if(res.ok && CORE.includes(url.pathname)){const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}
    return res;
  }).catch(()=>caches.match(e.request).then(res=>res||caches.match('/index.html'))));
});
