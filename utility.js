(function () {
  // ====== CONFIG ======
  const SHEET_FOTO_ID = '1ED2xiPv_JhCs33ylJNoAPOb6d2o88ddGJl-zp9am2II'; 
  const GID_FOTO      = '1627790501'; 
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
  let pollId = null;
  let popupWin = null;
  let popupWatchId = null;
  let elapsed = 0; // Fix: dichiarata qui

  // ====== DOM ======
  const steps = Array.from(document.querySelectorAll('.step'));
  const progress = qs('#progress');
  const form = qs('#gform');
  const iFrame = qs('#hidden_iframe');
  const nome = qs('#nome');
  const ricordo = qs('#ricordo');
  const err1 = qs('#err-step1');
  const btnUpload = qs('#btnUpload'); 
  const codiceInput = qs('#codiceRisposta');
  const fotoNotice = qs('#fotoNotice');
  const confirmMsg = qs('#confirmMsg');

  // ====== NAV ======
  function showStep(idx){
    steps.forEach((s,i)=>s.classList.toggle('active', i===idx));
    const pct = idx === 0 ? 0 : Math.round((idx / (steps.length-1)) * 100);
    if (progress) progress.style.width = pct + '%';
  }

  function updateSummary(){
    if (confirmMsg) {
       confirmMsg.textContent = `Ok ${nome.value.trim()}, premi "Invia" per salvare il tuo ricordo.`;
    }
  }

  // ====== FLOW (Sincronizzato con HTML) ======
  
  // Da Nome a Ricordo
  qs('#next1')?.addEventListener('click', ()=>{ 
    if (!nome.value.trim()) { err1?.classList.add('show'); return; }
    err1?.classList.remove('show');
    current=1; showStep(current); 
  });

  // Da Ricordo a Foto
  qs('#next2')?.addEventListener('click', ()=>{ 
    current=2; showStep(current); 
  });
  qs('#back2')?.addEventListener('click', ()=>{ current=0; showStep(current); });

  // Da Foto (apertura popup) a Riepilogo
  qs('#openUpload')?.addEventListener('click', () => {
    if (!codiceInput.value) codiceInput.value = makeCode();
    const url = buildFotoUrl(codiceInput.value);

    if (popupWin && !popupWin.closed) {
      popupWin.focus();
    } else {
      popupWin = window.open(url, 'upload_foto', 'width=520,height=760');
      if (!popupWin && btnUpload) {
          btnUpload.href = url;
          btnUpload.classList.remove('hidden');
      }
    }
    if (fotoNotice) fotoNotice.textContent = 'Finestra aperta. Ti avviso qui quando ricevo le foto...';
    startPolling();
    startPopupWatcher();
  });

  qs('#next3')?.addEventListener('click', ()=>{ 
    updateSummary(); 
    current=3; showStep(current); 
  });
  qs('#back3')?.addEventListener('click', ()=>{ current=1; showStep(current); });

  qs('#back4')?.addEventListener('click', ()=>{ current=2; showStep(current); });

  qs('#backToStart')?.addEventListener('click', ()=>{ 
    form.reset();
    codiceInput.value = '';
    current=0; showStep(current); 
  });

  // ====== INVIO FORM ======
  let submitted=false;
  form?.addEventListener('submit', (e)=>{
    if (submitted) return; 
    submitted = true;
    const btn = qs('#btnSubmit');
    if (btn){ btn.disabled = true; btn.textContent = 'Invio…'; }
    
    // L'iframe gestisce la risposta
    iFrame?.addEventListener('load', ()=>{
        current=4; showStep(current);
        submitted=false;
        if (btn){ btn.disabled=false; btn.textContent='Invia'; }
    }, { once:true });
  });

  // ====== CHECKER LOGIC (GViz) ======
  async function checkPhotosOnce() {
    const code = (codiceInput.value || '').trim();
    if (!code) return;

    try {
      const res = await gvizCheckPhotosByCode(code);
      if (res.count > 0) {
        if (fotoNotice) fotoNotice.textContent = '✅ Foto caricate! Puoi procedere.';
        try { if (popupWin && !popupWin.closed) popupWin.close(); } catch(_) {}
        stopPopupWatcher();
        // Avanza automaticamente al riepilogo se l'utente è ancora nello step foto
        if (current === 2) { 
           updateSummary(); 
           current = 3; 
           showStep(current); 
        }
        stopPolling();
      }
    } catch (e) { console.error("Errore check:", e); }
  }

  function startPolling(){
    stopPolling();
    elapsed = 0;
    const STEP_MS=4000, MAX_MS=300000;
    pollId = setInterval(async ()=>{
      elapsed += STEP_MS;
      await checkPhotosOnce();
      if (current >= 3 || elapsed >= MAX_MS) stopPolling();
    }, STEP_MS);
  }

  function stopPolling(){ if (pollId){ clearInterval(pollId); pollId=null; } }

  function startPopupWatcher(){
    stopPopupWatcher();
    popupWatchId = setInterval(async ()=>{
      if (popupWin && popupWin.closed){
        stopPopupWatcher();
        if (fotoNotice) fotoNotice.textContent = 'Sto verificando l’upload…';
        // Tenta un check finale dopo la chiusura
        setTimeout(checkPhotosOnce, 2000);
      }
    }, 500);
  }

  // --- Funzioni GViz (Non modificate, vanno bene) ---
  function normalizeDrive(url){
    if(!url) return null;
    const raw = String(url).trim();
    if (/drive\.google\.com\/drive\/folders\//.test(raw)) return null;
    try {
      const rx = /(?:\/d\/|[\?\&]id=|uc\?id=|open\?id=)([A-Za-z0-9_-]{20,})/;
      const m = raw.match(rx);
      if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w2000`;
    } catch {}
    return null;
  }

  function loadJSONP(handlerName, sheetId, gid){
    return new Promise((resolve, reject)=>{
      const cbName = `__${handlerName}_${Date.now()}`;
      window[cbName] = (json)=>{ resolve(json); delete window[cbName]; };
      const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?gid=${gid}&tqx=out:json;responseHandler:${cbName}`;
      const s = document.createElement('script');
      s.src = url;
      s.onerror = () => reject();
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 1000);
    });
  }

  async function gvizCheckPhotosByCode(code){
    try {
      const json = await loadJSONP('onGVizFotoCheck', SHEET_FOTO_ID, GID_FOTO);
      if (!json || !json.table) return { count: 0 };
      const table = json.table;
      const codeIdx = table.cols.findIndex(c => /codice/i.test(c.label));
      if (codeIdx < 0) return { count: 0 };
      
      const rows = table.rows.filter(r => {
        const val = r.c[codeIdx]?.v || '';
        return String(val).trim().toUpperCase() === code.toUpperCase();
      });
      return { count: rows.length };
    } catch(e) { return { count: 0 }; }
  }

})();
