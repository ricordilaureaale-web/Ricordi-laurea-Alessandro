(()=>{'use strict';

/* ===========================
   Elementi & Config
=========================== */
const CFG = {
  TESTO_SHEET_ID : '1Pc4MJeW-uoku27QoG6F3OavLU9PiVesGGBr1fMux_EU',
  TESTO_GID      : '1919851796',
  FOTO_SHEET_ID  : '1h_GjGsAIm51xnDmn9o0nOyGexCDhXt0BjOy0XgfQz0o',
  FOTO_GID       : '389351937',
  JSONP_TIMEOUT  : 8000
};

const els = {
  pill : document.getElementById('countPill'),
  wall : document.getElementById('wall'),
  empty: document.getElementById('empty'),
  debug: document.getElementById('debug')
};

window.addEventListener('error', e=>{
  const d = els.debug;
  d.innerHTML += `\n[window.error] ${e.message||''} @ ${e.filename||''}:${e.lineno||''}:${e.colno||''}`;
  d.classList.add('err');
});

/* ===========================
   Stato
=========================== */
let testoRows  = null;
let fotoMap    = new Map();
let fotoLoaded = false;
let wallHandlerAttached = false;

/* ===========================
   Utils generali
=========================== */
const esc = s => String(s ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

const val = c => (!c ? '' : (c.v != null ? c.v : (c.f != null ? c.f : '')));

const safeKey = x => (x||'').trim().toUpperCase();

function setScrollLocked(locked){
  document.documentElement.style.overflow = locked ? 'hidden' : '';
}

/* ===========================
   Lightbox
=========================== */
function ensureLightbox(){
  let lb = document.getElementById('lb');
  if (lb) return lb;

  lb = document.createElement('div');
  lb.id = 'lb';
  lb.innerHTML = `
    <div class="frame">
      <button class="close" aria-label="Chiudi" title="Chiudi">✕</button>
      <button class="ctrl prev" aria-label="Precedente" title="Precedente">‹</button>

      <!-- Viewer: foto OPPURE player Drive (iframe). Mostro uno alla volta -->
      <img class="photo" alt=""
           style="grid-column:1/-1;grid-row:2;max-height:80vh;width:auto;height:auto;border-radius:10px;box-shadow:0 18px 40px rgba(0,0,0,.45);margin-inline:auto;display:none;">
      <iframe class="gpreview" allow="autoplay; fullscreen" allowfullscreen
              style="grid-column:1/-1;grid-row:2;max-height:80vh;width:min(92vw,1400px);height:80vh;border:0;border-radius:10px;box-shadow:0 18px 40px rgba(0,0,0,.45);margin-inline:auto;display:none;background:#000"></iframe>

      <button class="ctrl next" aria-label="Successiva" title="Successiva">›</button>
      <div class="counter">1/1</div>
      <a class="open" target="_blank" rel="noopener"/>
    </div>
  `;
  document.body.appendChild(lb);

  // Interazioni base
  lb.addEventListener('click', e=>{ if (e.target.id === 'lb') closeLightbox(); });
  lb.querySelector('.close').addEventListener('click', closeLightbox);
  lb.querySelector('.prev').addEventListener('click', ()=> shiftLightbox(-1));
  lb.querySelector('.next').addEventListener('click', ()=> shiftLightbox(+1));

  // Tap sui lati per next/prev
  lb.querySelector('.frame').addEventListener('click', (e)=>{
    const ph = lb.querySelector('.photo');
    const fv = lb.querySelector('.gpreview');
    const el = (fv.style.display !== 'none') ? fv : ph;
    if (e.target !== ph && e.target !== fv) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX;
    if (x < r.left + r.width*0.3) shiftLightbox(-1);
    else if (x > r.right - r.width*0.3) shiftLightbox(+1);
  });

  // Tastiera
  window.addEventListener('keydown', e=>{
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') shiftLightbox(-1);
    if (e.key === 'ArrowRight') shiftLightbox(+1);
  });

  // Swipe touch
  let touchX = null;
  lb.addEventListener('touchstart', e=>{ touchX = e.touches[0].clientX; }, {passive:true});
  lb.addEventListener('touchend', e=>{
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) shiftLightbox(dx>0 ? -1 : +1);
    touchX = null;
  });

  // Stato interno
  lb._photos = [];
  lb._idx = 0;

  return lb;
}

function openLightbox(photos, startIdx=0){
  const lb = ensureLightbox();
  lb._photos = photos.map(u => upscaleThumb(u, 3000));
  lb._idx = Math.max(0, Math.min(startIdx, lb._photos.length-1));
  renderLightboxMedia();
  setScrollLocked(true);
  lb.classList.add('open');
}

function closeLightbox(){
  const lb = ensureLightbox();
  // pulizia player iframe
  const fv = lb.querySelector('.gpreview');
  if (fv){ fv.src = 'about:blank'; }
  lb.classList.remove('open');
  setScrollLocked(false);
}

function shiftLightbox(delta){
  const lb = ensureLightbox();
  if (!lb._photos.length) return;
  // pulizia player corrente prima di cambiare
  const fv = lb.querySelector('.gpreview');
  if (fv && fv.style.display !== 'none'){ fv.src = 'about:blank'; }
  lb._idx = (lb._idx + delta + lb._photos.length) % lb._photos.length;
  renderLightboxMedia();
}

function renderLightboxMedia(){
  const lb = ensureLightbox();
  const imgEl = lb.querySelector('.photo');
  const ifrEl = lb.querySelector('.gpreview');
  const hrefEl = lb.querySelector('a.open');

  const current = lb._photos[lb._idx];

  // Link "Apri su Drive"
  const preview = drivePreviewFromThumb(current);
  hrefEl.href = preview || current;
  hrefEl.title = "Apri in una nuova scheda";

  // Reset visibilità
  imgEl.style.display = 'none';
  ifrEl.style.display = 'none';

  // Se riconosco un id Drive → player ufficiale in iframe
  const { id } = parseDriveThumb(current);
  if (id && preview){
    ifrEl.src = preview;
    ifrEl.style.display = 'block';
  } else {
    imgEl.src = current;
    imgEl.style.display = 'block';
  }

  lb.querySelector('.counter').textContent = `${lb._idx+1}/${lb._photos.length}`;
}

/* ===========================
   Drive helpers
=========================== */
function upscaleThumb(u, w=3000){
  try {
    const url = new URL(u);
    if (url.hostname.includes('drive.google.com') && url.pathname.includes('/thumbnail')) {
      url.searchParams.set('sz', `w${w}`);
      return url.toString();
    }
  } catch {}
  return u;
}

// /file/ID/preview (+resourcekey se presente)
function drivePreviewFromThumb(u){
  try{
    const url = new URL(u);
    const id = url.searchParams.get('id');
    const rk = url.searchParams.get('resourcekey');
    if (id){
      return `https://drive.google.com/file/d/${id}/preview${rk ? `?resourcekey=${encodeURIComponent(rk)}` : ''}`;
    }
  }catch{}
  return null;
}

function parseDriveThumb(u){
  try{
    const url = new URL(u);
    if (url.hostname.includes('drive.google.com') && url.pathname.includes('/thumbnail')){
      return { id: url.searchParams.get('id'), rk: url.searchParams.get('resourcekey') };
    }
  }catch{}
  const m = String(u).match(/[?&]id=([A-Za-z0-9_-]{20,})/);
  return { id: m ? m[1] : null, rk: null };
}

// Filtra/normalizza URL da foglio FOTO → sempre thumbnail grande
function normalizeDrive(url){
  if(!url) return null;
  const raw = String(url).trim();

  // Scarta cartelle e Google Photos
  if (/drive\.google\.com\/drive\/folders\//.test(raw)) return null;
  if (/photos\.google\.com/.test(raw)) return null;

  try {
    const u = new URL(raw);
    let id = u.pathname.match(/\/d\/([A-Za-z0-9_-]{20,})/)?.[1] || u.searchParams.get('id');
    const rk = u.searchParams.get('resourcekey');
    if (id){
      const rkParam = rk ? `&resourcekey=${encodeURIComponent(rk)}` : '';
      return `https://drive.google.com/thumbnail?id=${id}${rkParam}&sz=w2000`;
    }
  } catch {/* regex di riserva sotto */}

  const rx = /(?:\/d\/|[\?\&]id=|uc\?id=|open\?id=)([A-Za-z0-9_-]{20,})/;
  const m2 = raw.match(rx);
  if (m2 && m2[1]) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w2000`;
  return null;
}

/* ===========================
   Date & Mapping colonne
=========================== */
function parseItalianDate(s){
  if (s instanceof Date) return s;
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m){
    const [, dd, mm, yyyy, hh='0', mi='0', ss='0'] = m;
    const d = new Date(Number(yyyy), Number(mm)-1, Number(dd), Number(hh), Number(mi), Number(ss));
    return isNaN(d.getTime()) ? null : d;
  }
  const t = Date.parse(s);
  return isNaN(t) ? null : new Date(t);
}

function fmtDate(d){
  if (!d) return '';
  const pad = n => String(n).padStart(2,'0');
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mapColumnsTesto(headers){
  const find = re => headers.findIndex(h => re.test(h));
  const idx = {
    ts:      find(/time|data|timestamp|ora|cronolog/i),
    nome:    find(/qual.*nome/i),
    cognome: find(/qual.*cognome/i),
    conosci: find(/come.*conosci/i),
    ricordo: find(/ricordo/i),
    codice:  find(/codice.*rispost|codice/i)
  };
  ['ts','nome','cognome','conosci','ricordo','codice'].forEach((k,i)=>{ if(idx[k] < 0) idx[k] = i; });
  return idx;
}

function mapColumnsFotoAll(headers){
  const linkCols = [];
  headers.forEach((h, i) => {
    if (/(file|foto|immagine|image|link|url)/i.test(h)) linkCols.push(i);
  });
  let codiceIdx = headers.findIndex(h => /codice.*rispost|^codice$/i.test(h));
  if (codiceIdx < 0) codiceIdx = 0;
  return { codiceIdx, linkCols };
}

/* ===========================
   Render bacheca
=========================== */
function tryRender(){
  if (!testoRows) return;

  const rows = testoRows
    .filter(x => (x.nome || x.cognome || x.ricordo))
    .sort((a,b)=>{
      const ta = a.ts ? a.ts.getTime() : 0;
      const tb = b.ts ? b.ts.getTime() : 0;
      return tb - ta;
    });

  els.pill.textContent = `${rows.length} messaggi`;
  els.wall.innerHTML = '';
  els.empty.style.display = rows.length ? 'none' : 'block';

  const frag = document.createDocumentFragment();
  rows.forEach(item=>{
    const firma   = [item.nome, item.cognome].filter(Boolean).join(' ') || 'Anonimo';
    const conosci = item.conosci ? ` <span style="opacity:.7">(${esc(item.conosci)})</span>` : '';

    const imgs = (fotoMap.get(safeKey(item.codice)) || []).slice(0,12);
    const gallery = imgs.length ? `
      <div class="gallery">
        ${imgs.map(u=>`
          <figure class="ph">
            <img src="${esc(u)}" alt="" loading="lazy">
          </figure>
        `).join('')}
      </div>` : '';

    const when = item.ts ? `<div class="when" style="opacity:.6">${fmtDate(item.ts)}</div>` : '';

    const card = document.createElement('div');
    card.className = 'postcard';
    card.innerHTML = `
      ${gallery}
      <div class="msg">${esc(item.ricordo || '—')}</div>
      ${when}
      <div class="sig">— ${esc(firma)}${conosci}</div>
    `;
    if (imgs.length) card.dataset.photos = JSON.stringify(imgs);
    frag.appendChild(card);
  });
  els.wall.appendChild(frag);

  // Delegation (una sola volta)
  if (!wallHandlerAttached){
    els.wall.addEventListener('click', e=>{
      const imgEl = e.target.closest('.gallery .ph img');
      if (!imgEl) return;
      const cardEl = e.target.closest('.postcard');
      if (!cardEl) return;

      try {
        const photos = JSON.parse(cardEl.dataset.photos || '[]');
        if (!photos.length) return;
        const figures = Array.from(cardEl.querySelectorAll('.gallery .ph img'));
        const idx = Math.max(0, figures.indexOf(imgEl));
        openLightbox(photos, idx);
      } catch (err) {
        console.warn('Lightbox error', err);
      }
    });
    wallHandlerAttached = true;
  }

  if (!fotoLoaded){
    els.debug.innerHTML += `\n[info] Foglio FOTO non disponibile o vuoto: mostro solo i messaggi di testo.`;
  }
}

/* ===========================
   JSONP Loader
=========================== */
function loadJSONP(handlerName, sheetId, gid){
  const id = `gviz_${handlerName}`;
  document.getElementById(id)?.remove();

  // NOTA: responseHandler usa i due punti (:) e NON l'uguale (=)
  const tqx = `out:json;responseHandler:${handlerName}`;
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq` +
              `?gid=${encodeURIComponent(gid)}&tqx=${encodeURIComponent(tqx)}&_=${Date.now()}`;

  const s = document.createElement('script');
  s.id = id;
  s.src = url;

  let timedOut = false;
  const to = setTimeout(()=>{
    timedOut = true;
    els.debug.innerHTML += `\n[timeout] Nessuna risposta da JSONP (${handlerName}). URL:\n${url}\nControlla permessi del foglio o ad-blocker.`;
    if (handlerName === 'onGVizFoto'){ fotoLoaded = false; tryRender(); }
  }, CFG.JSONP_TIMEOUT);

  s.onload  = () => { if (!timedOut) clearTimeout(to); };
  s.onerror = () => {
    if (!timedOut) clearTimeout(to);
    els.debug.innerHTML += `\n[onerror] Impossibile caricare JSONP (${handlerName}):\n${url}\nVerifica condivisione o ad-blocker.`;
    if (handlerName === 'onGVizFoto'){ fotoLoaded = false; tryRender(); }
  };

  document.body.appendChild(s);
}

/* ===========================
   Callback JSONP (uniche globali)
=========================== */
window.onGVizTesto = function(json){
  try{
    const table   = json.table;
    const headers = table.cols.map(c => (c.label || '').trim());
    els.debug.innerHTML = `TESTO headers: ${headers.join(' | ')}`;
    const idx = mapColumnsTesto(headers);

    testoRows = (table.rows || []).map(r => {
      const rawTs = val(r.c[idx.ts]);
      const d     = parseItalianDate(rawTs);
      return {
        ts: d,
        nome:    val(r.c[idx.nome]),
        cognome: val(r.c[idx.cognome]),
        conosci: val(r.c[idx.conosci]),
        ricordo: val(r.c[idx.ricordo]),
        codice:  val(r.c[idx.codice])
      };
    });

    tryRender();
  }catch(e){
    console.error(e);
    els.pill.textContent = 'Errore';
    els.empty.textContent = 'Impossibile leggere il foglio TESTO.';
    els.empty.style.display = 'block';
  }
};

window.onGVizFoto = function(json){
  try{
    if (!json.table || !json.table.cols) {
      els.debug.innerHTML += `\n[onGVizFoto] Nessuna tabella ricevuta. Controlla gid o permessi del foglio FOTO.`;
      fotoLoaded = false;
      tryRender();
      return;
    }

    const table   = json.table;
    const headers = table.cols.map(c => (c.label || '').trim());
    els.debug.innerHTML += `\nFOTO headers: ${headers.join(' | ')}`;

    const map = mapColumnsFotoAll(headers);
    if (map.linkCols.length === 0) {
      els.debug.innerHTML += `\n[onGVizFoto] Nessuna colonna link trovata (cerco parole: file/foto/immagine/image/link/url).`;
    } else {
      els.debug.innerHTML += `\n[onGVizFoto] Colonne link usate: ${map.linkCols.map(i=>`#${i}:${headers[i]}`).join(', ')}`;
    }

    fotoMap = new Map();
    let totalUrls = 0;

    (table.rows || []).forEach((r, rowIdx)=>{
      const codeRaw = val(r.c[map.codiceIdx]);
      const codice = safeKey(codeRaw);
      if (!codice) return;

      const bucket = fotoMap.get(codice) || [];
      map.linkCols.forEach(ci=>{
        const raw = val(r.c[ci]);
        if (!raw) return;

        const parts = String(raw).split(/[\n,; ]+/).map(s=>s.trim()).filter(Boolean);
        parts.forEach(p=>{
          const u = normalizeDrive(p);
          if (u) {
            bucket.push(u);
            totalUrls++;
          } else {
            els.debug.innerHTML += `\n[row ${rowIdx}] URL scartato: ${p}`;
          }
        });
      });

      if (bucket.length) fotoMap.set(codice, bucket);
    });

    fotoLoaded = true;
    els.debug.innerHTML += `\n[onGVizFoto] Mappati ${fotoMap.size} codici con ${totalUrls} URL totali.`;
    const first = fotoMap.keys().next();
    if (!first.done) {
      const k = first.value;
      els.debug.innerHTML += `\nEsempio codice "${k}": ${ (fotoMap.get(k)||[]).slice(0,3).join(' | ') }`;
    }

    tryRender();
  }catch(e){
    console.error(e);
    els.debug.innerHTML += `\n[error] Lettura FOTO fallita: ${e.message||e}`;
    fotoLoaded = false;
    tryRender();
  }
};

/* ===========================
   Avvio
=========================== */
loadJSONP('onGVizTesto', CFG.TESTO_SHEET_ID, CFG.TESTO_GID);
loadJSONP('onGVizFoto',  CFG.FOTO_SHEET_ID,  CFG.FOTO_GID);

})(); // IIFE
