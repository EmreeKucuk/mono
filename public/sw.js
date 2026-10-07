const CACHE='mono-shell-v30';
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/','/style.css','/app.js','/settings.js','/preferences.js','/clipboard-model.js','/confirm-dialog.js','/recycle-bin.js','/drawing.js','/overlay.js','/desktop-updates.js','/dashboard-features.js','/weather.js','/capture-parser.js','/note-vault.js','/clipboard-widget.js','/styles/dashboard.css','/styles/settings.css','/cloud.js','/draft-store.js','/state-schema.js','/task-groups.js','/notebook.js','/extra-widgets.js','/grid-layout.js','/widget-search.js','/widget-shortcuts.js','/name-dialog.js','/ui-utils.js','/focus-state.js','/workspace-model.js','/desks.js','/shell-view.js','/calendar-view.js','/editor-input.js','/grid-view.js','/styles/base.css','/styles/tasks-themes.css','/styles/notebooks-widgets.css','/styles/grid.css','/styles/interactions.css','/styles/overrides.css','/styles/workspace-shell.css','/spotify-url.js','/spotify-widget.js','/spotify-account.js','/spotify-media.js','/spotify-tracks.js','/spotify-stages.js','/styles/spotify.css','/favicon.svg','/manifest.webmanifest'])));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||event.request.method!=='GET'||url.pathname.startsWith('/api/'))return;
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
