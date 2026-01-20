(() => {
  'use strict';

  /* ===========================
     Configurazione ID Fogli
  =========================== */
  const CFG = {
    TESTO_SHEET_ID: '1Pc4MJeW-uoku27QoG6F3OavLU9PiVesGGBr1fMux_EU',
    TESTO_GID: '1919851796',
    FOTO_SHEET_ID: '1h_GjGsAIm51xnDmn9o0nOyGexCDhXt0BjOy0XgfQz0o',
    FOTO_GID: '389351937',
    JSONP_TIMEOUT: 8000
  };

  const els = {
    pill: document.getElementById('countPill'),
    wall: document.getElementById('wall'),
    empty: document.getElementById('empty'),
    debug: document.getElementById('debug')
  };

  /* ===========================
     Stato Applicazione
  =========================== */
  let testoRows = null;
  let fotoMap = new Map();
  let fotoLoaded = false;
  let wallHandlerAttached = false;

  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const val = c => (!c ? '' : (c.v != null ? c.v : (c.f != null ? c.f : '')));
  const safeKey = x => (x || '').trim().toUpperCase();

  /* ===========================
     Mappatura Colonne (Sincronizzata col nuovo Form)
  =========================== */
  function mapColumnsTesto(headers) {
    const find = re => headers.findIndex(h => re.test(h));
    return {
      ts: find(/time|data|timestamp/i),
      nome: find(/^Nome$/i),
      ricordo: find(/ricordo|messaggio/i),
      codice: find(/codice.*rispost|codice/i)
    };
  }

  function mapColumnsFotoAll(headers) {
    const linkCols = [];
    headers.forEach((h, i) => {
      if (/(file|foto|immagine|image|link|url)/i.test(h)) linkCols.push(i);
    });
    let codiceIdx = headers.findIndex(h => /codice.*rispost|^codice$/i.test(h));
    return { codiceIdx: codiceIdx < 0 ? 0 : codiceIdx, linkCols };
  }

  /* ===========================
     Renderizzazione
  =========================== */
  function tryRender() {
    if (!testoRows) return;

    // Ordina per data decrescente (più recenti in alto)
    const rows = testoRows
      .filter(x => x.nome || x.ricordo)
      .sort((a, b) => (b.ts?.getTime() || 0) - (a.ts?.getTime() || 0));

    els.pill.textContent = `${rows.length} ricordi`;
    els.wall.innerHTML = '';
    els.empty.style.display = rows.length ? 'none' : 'block';

    const frag = document.createDocumentFragment();
    
    rows.forEach(item => {
      const firma = esc(item.nome || 'Anonimo');
      const codice = safeKey(item.codice);
      const imgs = (fotoMap.get(codice) || []).slice(0, 12);

      const galleryHtml = imgs.length ? `
        <div class="gallery">
          ${imgs.map(u => `
            <figure class="ph">
              <img src="${esc(u)}" alt="Foto di ${firma}" loading="lazy">
            </figure>
          `).join('')}
        </div>` : '';

      const dateHtml = item.ts ? `<div class="when">${item.ts.toLocaleString('it-IT')}</div>` : '';

      const card = document.createElement('div');
      card.className = 'postcard';
      card.innerHTML = `
        ${galleryHtml}
        <div class="msg">${esc(item.ricordo || '—')}</div>
        ${dateHtml}
        <div class="sig">— ${firma}</div>
      `;
      
      if (imgs.length) card.dataset.photos = JSON.stringify(imgs);
      frag.appendChild(card);
    });

    els.wall.appendChild(frag);

    // Attacca gestore Lightbox se non presente
    if (!wallHandlerAttached) {
      els.wall.addEventListener('click', handleGalleryClick);
      wallHandlerAttached = true;
    }
  }

  function handleGalleryClick(e) {
    const imgEl = e.target.closest('.gallery .ph img');
    if (!imgEl) return;
    const cardEl = e.target.closest('.postcard');
    const photos = JSON.parse(cardEl.dataset.photos || '[]');
    const idx = Array.from(cardEl.querySelectorAll('.gallery .ph img')).indexOf(imgEl);
    if (window.openLightbox) window.openLightbox(photos, idx);
  }

  /* ===========================
     Drive & JSONP Logic
  =========================== */
  function normalizeDrive(url) {
    if (!url) return null;
    const raw = String(url).trim();
    if (/folders/.test(raw) || /photos\.google/.test(raw)) return null;
    const idMatch = raw.match(/(?:\/d\/|id=)([A-Za-z0-9_-]{20,})/);
    if (idMatch) {
      return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w1200&authuser=0`;
    }
    return null;
  }

  function loadJSONP(handlerName, sheetId, gid) {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json;responseHandler:${handlerName}&gid=${gid}&_=${Date.now()}`;
    const s = document.createElement('script');
    s.src = url;
    s.id = `gviz_${handlerName}`;
    document.body.appendChild(s);
  }

  /* ===========================
     Callback Globali
  =========================== */
  window.onGVizTesto = function(json) {
    const table = json.table;
    const headers = table.cols.map(c => (c.label || '').trim());
    const idx = mapColumnsTesto(headers);

    testoRows = table.rows.map(r => ({
      ts: r.c[idx.ts]?.v ? new Date(r.c[idx.ts].v) : null,
      nome: val(r.c[idx.nome]),
      ricordo: val(r.c[idx.ricordo]),
      codice: val(r.c[idx.codice])
    }));
    tryRender();
  };

  window.onGVizFoto = function(json) {
    const table = json.table;
    const headers = table.cols.map(c => (c.label || '').trim());
    const { codiceIdx, linkCols } = mapColumnsFotoAll(headers);

    table.rows.forEach(r => {
      const codice = safeKey(val(r.c[codiceIdx]));
      if (!codice) return;
      
      const urls = [];
      linkCols.forEach(ci => {
        const raw = val(r.c[ci]);
        String(raw).split(/[\n,; ]+/).forEach(p => {
          const u = normalizeDrive(p);
          if (u) urls.push(u);
        });
      });

      if (urls.length) {
        const existing = fotoMap.get(codice) || [];
        fotoMap.set(codice, [...existing, ...urls]);
      }
    });

    fotoLoaded = true;
    tryRender();
  };

  // Avvio
  loadJSONP('onGVizTesto', CFG.TESTO_SHEET_ID, CFG.TESTO_GID);
  loadJSONP('onGVizFoto', CFG.FOTO_SHEET_ID, CFG.FOTO_GID);

})();



