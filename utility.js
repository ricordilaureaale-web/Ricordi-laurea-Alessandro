// utility.js — SOLO POPUP + CHECKER + POPUP WATCHER

(function () {
  // ====== CONFIG ======
  const CHECK_API = 'https://script.google.com/macros/s/AKfycbx8ADst-84gLSWDFg3TFXsOQHC_cIDqnKAuqVtgv_SvPtrlz_5bUqEu0Wjw0p5EDXs/exec';
  const FORM_FOTO_BASE = "https://docs.google.com/forms/d/1ogcXWlD7glhcYIX1KIxoPAGZkByk2bG_c9s-KnfnM4E/viewform";
  const ENTRY_CODE_FOTO = "entry.496785438";

  // ====== UTILS ======
  const qs = s => document.querySelector(s);
  function makeCode() {
    return 'R' + Date.now().toString(36) + Math.random().toString(36).slice(2,8).toUpperCase();
  }
  function buildFotoUrl(codice){
    const p = new URLSearchParams();
    p.set(ENTRY_CODE_FOTO, codice);
    return `${FORM_FOTO_BASE}?usp=pp_url&${p.toString()}`;
  }

  // ====== STATE ======
  let current = 0;
  let openedAtISO = null;
  let pollId = null;
  let popupWin = null;
  let popupWatchId = null; // NEW: watcher popup

  // ====== DOM ======
  const steps = Array.from(document.querySelectorAll('.step'));
  const progress = qs('#progress');
  const form = qs('#gform');
  const iFrame = qs('#hidden_iframe');

  const nome = qs('#nome');
  const cognome = qs('#cognome');
  const ricordo = qs('#ricordo');

  const err1 = qs('#err-step1');
  const err2 = qs('#err-step2');
  const optAltro = qs('#optAltro');
  const altroTxt = qs('#altroTxt');

  const summaryBox = qs('#summaryBox');
  const greeting = qs('#greeting');
  const summary = qs('#summary');

  const btnUpload = qs('#btnUpload'); // fallback link
  const codiceInput = qs('#codiceRisposta');
  const fotoNotice = qs('#fotoNotice');
  // === GViz (come la bacheca) ===
    const SHEET_FOTO_ID = '1ED2xiPv_JhCs33ylJNoAPOb6d2o88ddGJl-zp9am2II'; // ID foglio FOTO
    const GID_FOTO      = '1627790501';                                   // gid tab "Form_Responses"


  // ====== NAV ======
  function showStep(idx){
    steps.forEach((s,i)=>s.classList.toggle('active', i===idx));
    const pct = idx === 0 ? 0 : Math.round((idx / (steps.length-1)) * 100);
    if (progress) progress.style.width = pct + '%';
  }
  showStep(current);

  // ====== VALIDAZIONI ======
  function refreshAltro(){
    const isAltro = optAltro && optAltro.checked;
    if (altroTxt){
      altroTxt.classList.toggle('hidden', !isAltro);
      if (!isAltro) altroTxt.value = '';
    }
  }
  document.querySelectorAll('input[name="entry.896447326"]').forEach(r=>{
    r.addEventListener('change', refreshAltro);
  });
  refreshAltro();

  function validateStep1(){
    const ok = nome.value.trim() && cognome.value.trim();
    err1?.classList.toggle('show', !ok);
    return ok;
  }
  function validateStep2(){
    const sel = document.querySelector('input[name="entry.896447326"]:checked');
    if (!sel){ err2?.classList.add('show'); return false; }
    if (sel.value === '__other_option__' && !altroTxt.value.trim()){
      if (err2){ err2.textContent = 'Specifica il campo “Altro”.'; err2.classList.add('show'); }
      return false;
    }
    if (err2){ err2.textContent = 'Scegli un’opzione (specifica “Altro” se selezionato).'; err2.classList.remove('show'); }
    return true;
  }
  function updateSummary(){
    greeting.textContent = nome.value.trim()
      ? `Grazie ${nome.value.trim()} per avermi dedicato il tuo tempo 💙`
      : '';
  }

  // ====== FLOW ======
  qs('#next1')?.addEventListener('click', ()=>{ if (!validateStep1()) return; current=1; showStep(current); });
  qs('#back2')?.addEventListener('click', ()=>{ current=0; showStep(current); });
  qs('#next2')?.addEventListener('click', ()=>{ if (!validateStep2()) return; current=2; showStep(current); });
  qs('#back3')?.addEventListener('click', ()=>{ current=1; showStep(current); });

  // STEP 4 — SOLO POPUP
  qs('#next3')?.addEventListener('click', ()=>{
    if (!codiceInput.value) codiceInput.value = makeCode();

    const url = buildFotoUrl(codiceInput.value);

    // evita doppie aperture
    if (popupWin && !popupWin.closed) {
      try { popupWin.focus(); } catch(_) {}
    } else {
      popupWin = window.open(url, 'upload_foto', 'width=520,height=760,noopener,noreferrer');
      if (!popupWin) {
        // popup bloccata → mostra fallback (link manuale)
        if (btnUpload) {
          btnUpload.href = url;
          btnUpload.classList.remove('hidden');
        }
        // NON forzare window.location qui (così eviti aperture indesiderate)
      }
    }

    if (fotoNotice) fotoNotice.textContent = 'Carica le foto nella finestra che si è aperta. Ti avviso qui appena arrivano ✅';

    openedAtISO = new Date(Date.now() - 2 * 60 * 1000).toISOString(); // -2 minuti
    startPolling();
    startPopupWatcher();
    checkPhotosOnce();
    current = 3; showStep(current);
  });

  qs('#next4')?.addEventListener('click', async ()=>{
    await checkPhotosOnce();
    if (current !== 4) { updateSummary(); current=4; showStep(current); }
  });
  qs('#back4')?.addEventListener('click', ()=>{ current=2; showStep(current); });
  qs('#back5')?.addEventListener('click', ()=>{ current=3; showStep(current); });
  qs('#backToStart')?.addEventListener('click', ()=>{ current=0; showStep(current); });

  // ====== INVIO FORM PRINCIPALE ======
  let submitted=false, iframeLoads=0;
  form?.addEventListener('submit', (e)=>{
    e.preventDefault();
    if (!validateStep1()){ current=0; showStep(current); return; }
    if (!validateStep2()){ current=1; showStep(current); return; }
    if (submitted) return; submitted = true;

    const btn = qs('#btnSubmit');
    if (btn){ btn.disabled = true; btn.textContent = 'Invio…'; }
    const t = setTimeout(()=>{ if (submitted){ submitted=false; if (btn){ btn.disabled=false; btn.textContent='Invia'; } } }, 10000);

    form.submit();

    function onIframeLoad(){
      iframeLoads++;
      if (iframeLoads >= 1 && submitted){
        clearTimeout(t); submitted=false;
        if (btn){ btn.disabled=false; btn.textContent='Invia'; }
        if (greeting) greeting.textContent='';
        current=5; showStep(current);
      }
    }
    iFrame?.addEventListener('load', onIframeLoad, { once:true });
  });

  [nome, cognome, ricordo, altroTxt].forEach(el=>{
    el?.addEventListener('input', ()=>{ if (current>=4) updateSummary(); });
  });

  // ====== CHECKER ======
    async function checkPhotosOnce() {
    const code = (codiceInput.value || '').trim();
    if (!code) return;

    // 1) Prova via GViz (come bacheca)
    try {
        const res = await gvizCheckPhotosByCode(code);
        // console.debug('[gviz-check]', res);
        if (res.count > 0) {
        if (fotoNotice) fotoNotice.textContent = '✅ Foto caricate! Puoi procedere.';
        try { if (popupWin && !popupWin.closed) popupWin.close(); } catch(_) {}
        stopPopupWatcher();
        if (current !== 4) { updateSummary(); current = 4; showStep(current); }
        stopPolling();
        return;
        }
    } catch (e) {
    }
    }


  function startPolling(){
    stopPolling();
    // in startPolling()
     elapsed=0, STEP_MS=4000, MAX_MS=300000; // ogni 4s per 5min
    pollId = setInterval(async ()=>{
      elapsed += STEP_MS;
      await checkPhotosOnce();
      if (current===4 || elapsed>=MAX_MS) stopPolling();
    }, STEP_MS);
  }
  function stopPolling(){ if (pollId){ clearInterval(pollId); pollId=null; } }

  // ====== POPUP WATCHER ======
  function stopPopupWatcher(){
    if (popupWatchId){ clearInterval(popupWatchId); popupWatchId = null; }
  }
  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
  function startPopupWatcher(){
    stopPopupWatcher();
    popupWatchId = setInterval(async ()=>{
      if (popupWin && popupWin.closed){
        stopPopupWatcher();

        // Grace period post-chiusura: tenta più volte
        if (fotoNotice) fotoNotice.textContent = 'Sto verificando l’upload…';
        let tries = 0;
        const MAX_TRIES = 8;     // ~16s (8 * 2s)
        const TRY_EVERY = 2000;

        while (tries < MAX_TRIES){
        await checkPhotosOnce();
        if (current === 4) return;   // trovato → già avanzato
        await sleep(TRY_EVERY);
        tries++;
        }

        // Ultimo tentativo “best effort” prima di skippare
        await checkPhotosOnce();
        if (current !== 4) {
        if (fotoNotice) fotoNotice.textContent = 'Non ho ricevuto conferma, ma puoi proseguire.';
        updateSummary();
        current = 4; showStep(current);
        stopPolling();
        }
      }
    }, 500); // controlla 2 volte al secondo
  }

  // Riprova se l’utente torna sulla tab
  document.addEventListener('visibilitychange', ()=>{ if (document.visibilityState==='visible') checkPhotosOnce(); });
  window.addEventListener('focus', checkPhotosOnce);

  // --- Helpers (riuso “bacheca”) ---
function normalizeDrive(url){
  if(!url) return null;
  const raw = String(url).trim();
  if (/drive\.google\.com\/drive\/folders\//.test(raw)) return null;
  if (/photos\.google\.com/.test(raw)) return null;
  try {
    const u = new URL(raw);
    let id = null;
    const m = u.pathname.match(/\/d\/([A-Za-z0-9_-]{20,})/);
    if (m) id = m[1];
    if (!id) id = u.searchParams.get('id');
    const rk = u.searchParams.get('resourcekey');
    if (id) {
      const rkParam = rk ? `&resourcekey=${encodeURIComponent(rk)}` : '';
      return `https://drive.google.com/thumbnail?id=${id}${rkParam}&sz=w2000`;
    }
  } catch {}
  const rx = /(?:\/d\/|[\?\&]id=|uc\?id=|open\?id=)([A-Za-z0-9_-]{20,})/;
  const m2 = raw.match(rx);
  if (m2 && m2[1]) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w2000`;
  return null;
}

function loadJSONP(handlerName, sheetId, gid){
  return new Promise((resolve, reject)=>{
    const id = `gviz_${handlerName}`;
    document.getElementById(id)?.remove();
    const cbName = `__${handlerName}_${Date.now()}_${Math.floor(Math.random()*1e6)}`;
    window[cbName] = (json)=>{ try { resolve(json); } finally { cleanup(); } };
    const tqx = `out:json;responseHandler:${cbName}`;
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?gid=${encodeURIComponent(gid)}&tqx=${encodeURIComponent(tqx)}&_=${Date.now()}`;
    const s = document.createElement('script');
    s.id = id; s.src = url;
    const to = setTimeout(()=>{ cleanup(); reject(new Error('GViz timeout')); }, 10000);
    s.onerror = ()=>{ cleanup(); reject(new Error('GViz onerror')); };
    function cleanup(){ clearTimeout(to); delete window[cbName]; s.remove(); }
    document.body.appendChild(s);
  });
}

// Cerca nel tab FOTO le righe con quel codice; restituisce {count, urls[]}
async function gvizCheckPhotosByCode(code){
  const json = await loadJSONP('onGVizFotoCheck', SHEET_FOTO_ID, GID_FOTO);
  if (!json || !json.table) return { count: 0, urls: [] };
  const table = json.table;
  const headers = (table.cols || []).map(c => (c.label || '').trim());
  const codeIdx = headers.findIndex(h => /codice.*rispost|^codice$/i.test(h));
  if (codeIdx < 0) return { count: 0, urls: [] };

  // colonne candidate che contengono URL/immagini
  const linkCols = [];
  headers.forEach((h,i)=>{ if (/(file|foto|immagine|image|link|url)/i.test(h)) linkCols.push(i); });
  if (linkCols.length === 0) linkCols.push(Math.max(0, headers.length-1)); // extrema ratio

  // filtra righe col codice
  const safe = (x)=> String(x||'').trim().toUpperCase();
  const target = safe(code);
  let count = 0; const urls = [];
  (table.rows||[]).forEach(r=>{
    const rowCode = safe((r.c?.[codeIdx]?.v ?? r.c?.[codeIdx]?.f ?? ''));
    if (rowCode !== target) return;
    count++;
    linkCols.forEach(ci=>{
      const raw = (r.c?.[ci]?.v ?? r.c?.[ci]?.f ?? '');
      if (!raw) return;
      String(raw).split(/[\n,; ]+/).map(s=>s.trim()).filter(Boolean).forEach(p=>{
        const u = normalizeDrive(p);
        if (u) urls.push(u);
      });
    });
  });

  return { count, urls };
}


})();

