import { escape,icon } from './ui-utils.js';

export function renderShell({state,user,view,toolbox,dirty,conflicted,offline,types,sidebarHidden=false}) {
  const count=state.widgets.filter(w=>w.type==='tasks').flatMap(w=>w.tasks).filter(t=>!t.done).length;
  const viewName=view==='board'?'Masam':view==='tasks'?'Görevler':'Takvim';
  return `<div class="shell ${sidebarHidden?'sidebar-collapsed':''}">
    <aside id="workspace-sidebar" class="sidebar" aria-label="Çalışma alanı paneli" ${sidebarHidden?'hidden':''}>
      <div class="brand"><img src="/favicon.svg" alt="">MONO</div>
      <div class="desk-picker">
        <label class="sr-only" for="desk-select">Masa seç</label>
        <select id="desk-select" aria-label="Masa seç">${state.desks.map(desk=>`<option value="${escape(desk.id)}" ${desk.id===state.activeDeskId?'selected':''}>${escape(desk.name)}</option>`).join('')}</select>
        <div class="desk-actions"><button id="desk-list" aria-label="Masa listesi ve silme">☷</button><button id="desk-add" aria-label="Yeni masa ekle">+ Yeni masa</button><button id="desk-rename" aria-label="Masa adını değiştir">✎</button></div>
      </div>
      <span class="eyebrow">ÇALIŞMA ALANI</span>
      <nav class="nav" aria-label="Ana menü">
        ${[['board','Masam'],['tasks','Tüm görevler'],['calendar','Takvim']].map(([id,title])=>`<button data-view="${id}" class="${view===id?'active':''}" ${view===id?'aria-current="page"':''}>${icon(id)}${title}${id==='tasks'?`<span style="margin-left:auto;font-size:12px">${count}</span>`:''}</button>`).join('')}
      </nav>
      <section class="sidebar-settings" aria-label="Görünüm ayarları">
        <h2 class="eyebrow">GÖRÜNÜM</h2>
        ${view==='board'?`<label class="theme-picker">Grid düzeni
          <select id="grid-select" aria-label="Grid düzeni">
            <option value="2" ${state.gridColumns===2?'selected':''}>2 × 2</option>
            <option value="3" ${state.gridColumns===3?'selected':''}>3 × 3</option>${[4,5,6].map(n=>`<option value="${n}" ${state.gridColumns===n?'selected':''}>${n} sütun</option>`).join('')}
          </select>
        </label>
        <label class="auto-layout"><input id="auto-arrange" type="checkbox" ${state.autoArrange?'checked':''}> Otomatik düzen</label>
        <span id="grid-count" class="grid-count"></span>`:''}
        <label class="theme-picker">Tema
          <select id="theme-select" aria-label="Renk teması"><option value="graphite">Grafit</option><option value="navy">Koyu lacivert</option></select>
        </label>
      </section>
      <div class="sidebar-bottom">
        <div class="sidebar-note">Kendi düzenin.<br>Kendi ritmin.</div>
        <button id="desktop-update" hidden class="wide" aria-live="polite">Güncellemeleri kontrol et</button>
        <button id="install" hidden class="wide">Masaüstüne yükle</button>
        <button type="button" id="profile-menu" class="profile" aria-haspopup="dialog" aria-label="Hesap ve ayarlar"><div class="avatar">${user?escape(user.email.slice(0,2).toUpperCase()):'M'}</div><div><span>${user?'Kişisel hesap':'Misafir alanı'}</span><small>${user?escape(user.email):'Önizleme modu'}</small></div></button>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="topbar-start">
          <button id="sidebar-toggle" aria-controls="workspace-sidebar" aria-expanded="${!sidebarHidden}" aria-label="${sidebarHidden?'Sol paneli göster':'Sol paneli gizle'}" title="${sidebarHidden?'Sol paneli göster':'Sol paneli gizle'}">☰</button>
          <div class="breadcrumbs">Çalışma alanı <span>/</span> <strong>${viewName}</strong></div>
        </div>
        <div class="topbar-date"><button id="weather" type="button" aria-label="Hava durumu şehrini seç">Hava durumu</button><span data-live-date></span><time data-live-clock aria-label="Saat"></time></div>
        <div class="toolbar"><button id="quick-capture-open" title="Ctrl+Shift+Space">Hızlı yakala</button><button id="reminders-open">Hatırlatmalar</button><button id="zone-open">Zone</button>
          <button id="save-status" class="icon save-status" title="Kaydı yeniden dene">${user?(conflicted?'Kayıt çakışması':dirty?(offline?'Çevrimdışı · Bu cihazda saklandı':'Kaydediliyor…'):'✓ Kaydedildi'):'Geçici önizleme'}</button>
          <button id="account" class="icon" style="font-size:14px">${user?'Çıkış yap':'Giriş yap'}</button>
          <button id="widget-search-open" aria-label="Widget ara" title="Shift + < + Z">⌕ <span>Widget ara</span></button>
          <button class="primary" id="tool-toggle">+ ToolBox</button>
        </div>
      </header>
      ${!user?'<div class="demo-banner"><span>Önizleme alanı · Değişiklikler bu oturumda geçicidir.</span><button id="banner-login">Kaydetmek için giriş yap</button></div>':''}
      <section class="content">
        <div id="desk" class="${view==='board'?'desk':view==='tasks'?'task-view':'calendar-view'}"></div>
        <footer class="canvas-footer"><span>MONO / KİŞİSEL ÇALIŞMA ALANIN</span><span class="hint">${user?'Sana ait bir alan.':'Bağlantı kurulunca hesabına kaydedilir.'}</span></footer>
      </section>
    </main>
  </div>
  <aside id="toolbox" class="toolbox" ${toolbox?'':'hidden'}>
    <div style="display:flex;justify-content:space-between;align-items:center"><h2>ToolBox</h2><button class="icon" id="tool-close" aria-label="ToolBox kapat">×</button></div>
    <p>Bir widget seç veya masanın üzerine sürükle.</p>
    ${Object.entries(types).map(([type,[title,description]])=>`<button class="tool" draggable="true" data-add="${type}">${icon(type)}<span><strong>${title}</strong><small>${description}</small></span><span class="plus">+</span></button>`).join('')}
    <p style="margin-bottom:0;font-size:12px">Widget ara: Shift + &lt; + Z · Alt+1–9 ile widget seç; Alt+0 ile 10. widget. Dar ekranda widgetlar alt alta yerleşir.</p>
  </aside>`;
}
