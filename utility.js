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
  let elapsed = 0;

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
  
  // Elementi UI Foto
  const loadingSpinner = qs('#loadingSpinner');
  const openUploadBtn = qs('#openUpload');
  const nextStepBtn = qs('#next3');
  const skipPhotosBtn = qs('#skipPhotos'); // Assicurati che questo ID esista nell'HTML

  // ====== NAV ======
  function showStep(idx){
    steps.forEach((s,i)=>s.classList.toggle('active', i===idx));
    const pct = idx === 0 ? 0 : Math.round((idx / (steps.length-1)) * 100);
    if (progress) progress.style.width = pct + '%';
  }

  function updateSummary(){
    if (confirmMsg) {
       const nomeVal = nome.value.trim();
       confirmMsg.textContent = nomeVal 
         ? `Ok ${nomeVal}, premi "Invia" per salvare il tuo ricordo.`
         : `Premi "Invia" per salvare il tuo ricordo.`;
    }
  }

  // ====== FLOW ======
  
  // Step 1 -> 2 (Nome non più obbligatorio)
  qs('#next1')?.addEventListener('click', ()=>{ 
    err1?.classList.remove('show');
    current=1; showStep(current); 
  });

  // Step 2 -> 3
  qs('#next2')?.addEventListener('click', ()=>{ 
    current=2; showStep(current); 
  });
  qs('#back2')?.addEventListener('click', ()=>{ current=0; showStep(current); });

  // GESTIONE FOTO (Sì, carica)
  openUploadBtn?.addEventListener('click', () => {
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

    // UI Feedback: Nascondi tasti scelta, mostra caricamento
    openUploadBtn.classList.add('hidden');
    skipPhotosBtn?.classList.add('hidden');
    loadingSpinner?.classList.remove('hidden');
    if (fotoNotice) fotoNotice.textContent = 'In attesa del caricamento...';
    
    startPolling();
    startPopupWatcher();
  });

  // GESTIONE FOTO (No, salta)
  skipPhotosBtn?.addEventListener('click', () => {
    // Generiamo un codice "vuoto" per coerenza ma andiamo avanti
    if (!codiceInput.value) codiceInput.value = "SKIP-" + Date.now().toString(36).toUpperCase();
    updateSummary();
    current = 3; 
    showStep(current);
  });

  nextStepBtn?.addEventListener('click', ()=>{ 
    updateSummary(); 
    current=3; showStep(current); 
  });
  
  qs('#back3')?.addEventListener('click', ()=>{ 
    // Ripristiniamo la visibilità se l'utente torna indietro
    openUploadBtn?.classList.remove('hidden');
    skipPhotosBtn?.classList.remove('hidden');
    loadingSpinner?.classList.add('hidden');
    current=1; showStep(current); 
  });

  qs('#back4')?.addEventListener('click', ()=>{ current=2; showStep(current); });

  qs('#backToStart')?.addEventListener('click', ()=>{ 
    form.reset();
    codiceInput.value = '';
    openUploadBtn?.classList.remove('hidden');
    skipPhotosBtn?.classList.remove('hidden');
    loadingSpinner?.classList.add('hidden');
    nextStepBtn?.classList.add('hidden');
    current=0; showStep(current); 
  });

  // ====== INVIO FORM ======
  let submitted=false;
  form?.addEventListener('submit', (e)=>{
    if (submitted) return; 
    submitted = true;
    const btn = qs('#btnSubmit');
    if (btn){ btn.disabled = true; btn.textContent = 'Invio…'; }
    
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
        try { if (popupWin && !popupWin.closed) popupWin.close(); } catch(_) {}
        
        loadingSpinner?.classList.add('hidden');
        if (fotoNotice) {
            fotoNotice.style.color = "#2ecc71";
            fotoNotice.textContent = '✅ Foto ricevute correttamente!';
        }
        
        nextStepBtn?.classList.remove('hidden');
        stopPopupWatcher();
        stopPolling();

        // Auto-avanzamento
        setTimeout(() => {
            if (current === 2) { 
               updateSummary(); 
               current = 3; 
               showStep(current); 
            }
        }, 1500);
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
      if (elapsed >= MAX_MS) {
          loadingSpinner?.classList.add('hidden');
          nextStepBtn?.classList.remove('hidden');
          stopPolling();
      }
      if (current >= 3) stopPolling();
    }, STEP_MS);
  }

  function stopPolling(){ if (pollId){ clearInterval(pollId); pollId=null; } }

  function startPopupWatcher(){
    stopPopupWatcher();
    popupWatchId = setInterval(async ()=>{
      if (popupWin && popupWin.closed){
        stopPopupWatcher();
        setTimeout(() => {
            if (current === 2 && loadingSpinner && !loadingSpinner.classList.contains('hidden')) {
                loadingSpinner.classList.add('hidden');
                nextStepBtn?.classList.remove('hidden');
                if (fotoNotice) fotoNotice.textContent = 'Caricamento terminato.';
            }
        }, 3000);
      }
    }, 500);
  }

  // --- Funzioni GViz ---
  function normalizeDrive(url){
    if(!url) return null;
    const raw = String(url).trim();
    const rx = /(?:\/d\/|[\?\&]id=|uc\?id=|open\?id=)([A-Za-z0-9_-]{20,})/;
    const m = raw.match(rx);
    if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w2000`;
    return null;
  }

  function loadJSONP(handlerName, sheetId, gid){
    return new Promise((resolve, reject)=>{
      const cbName = `__${handlerName}_${Date.now()}`;
      window[cbName] = (json)=>{ resolve(json); delete window[cbName]; };
      const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?gid=${gid}&tqx=out:json;responseHandler:${cbName}`;
      const s = document.createElement('script');
      s.src = url;
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 1000);
    });
  }

  // MODIFICA la funzione gvizCheckPhotosByCode dentro lo script
async function gvizCheckPhotosByCode(code) {
    const cbName = `__cb_${Date.now()}`;
    return new Promise((resolve) => {
        window[cbName] = (json) => {
            if (!json.table || !json.table.rows) { resolve({ count: 0 }); return; }
            
            // Cerca l'indice della colonna che si chiama "Codice Risposta"
            const colIdx = json.table.cols.findIndex(c => /codice/i.test(c.label));
            
            const rows = json.table.rows.filter(r => {
                // Se non trova l'indice, cerca in tutte le celle (più sicuro)
                if (colIdx === -1) {
                    return r.c.some(cell => String(cell?.v || '').trim().toUpperCase() === code.toUpperCase());
                }
                const val = r.c[colIdx] ? (r.c[colIdx].v || '') : '';
                return String(val).trim().toUpperCase() === code.toUpperCase();
            });
            resolve({ count: rows.length });
            delete window[cbName];
        };

})();

