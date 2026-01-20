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
  const codiceInput = qs('#codiceRisposta');
  const confirmMsg = qs('#confirmMsg');
  const fotoNotice = qs('#fotoNotice');
  const loadingSpinner = qs('#loadingSpinner');
  const openUploadBtn = qs('#openUpload');
  const skipPhotosBtn = qs('#skipPhotos');
  const nextStepBtn = qs('#next3');

  // ====== NAV ======
  function showStep(idx){
    steps.forEach((s,i)=>s.classList.toggle('active', i===idx));
    const pct = idx === 0 ? 0 : Math.round((idx / (steps.length-1)) * 100);
    if (progress) progress.style.width = pct + '%';
  }

  function updateSummary(){
    const valNome = nome.value.trim();
    confirmMsg.textContent = valNome 
      ? `Ok ${valNome}, premi "Invia" per salvare il tuo ricordo.` 
      : `Premi "Invia" per salvare il tuo ricordo.`;
  }

  // ====== FLOW ======
  qs('#next1')?.addEventListener('click', () => { current=1; showStep(current); });
  qs('#next2')?.addEventListener('click', () => { 
    if (!codiceInput.value) codiceInput.value = makeCode();
    current=2; showStep(current); 
  });
  qs('#back2')?.addEventListener('click', () => { current=0; showStep(current); });

  openUploadBtn?.addEventListener('click', () => {
    if (!codiceInput.value) codiceInput.value = makeCode();
    const url = buildFotoUrl(codiceInput.value);
    popupWin = window.open(url, 'upload_foto', 'width=520,height=760');

    openUploadBtn.classList.add('hidden');
    skipPhotosBtn?.classList.add('hidden');
    loadingSpinner?.classList.remove('hidden');
    fotoNotice.textContent = 'In attesa del caricamento...';
    
    startPolling();
    startPopupWatcher();
  });

  skipPhotosBtn?.addEventListener('click', () => {
    if (!codiceInput.value) codiceInput.value = "SKIP-" + Date.now().toString(36).toUpperCase();
    updateSummary();
    current = 3; showStep(current);
  });

  nextStepBtn?.addEventListener('click', () => {
    updateSummary();
    current = 3; showStep(current);
  });

  qs('#back3')?.addEventListener('click', () => {
    // Reset se si torna indietro
    openUploadBtn.classList.remove('hidden');
    skipPhotosBtn?.classList.remove('hidden');
    loadingSpinner?.classList.add('hidden');
    stopPolling();
    stopPopupWatcher();
    current=1; showStep(current);
  });

  // ====== INVIO FORM ======
  let submitted=false;
  form?.addEventListener('submit', (e) => {
    submitted = true;
    const btn = qs('#btnSubmit');
    if (btn){ btn.disabled = true; btn.textContent = 'Invio…'; }
  });

  iFrame?.addEventListener('load', () => {
    if (submitted) {
      current = 4; showStep(current);
      submitted = false;
    }
  });

  // ====== CHECKER & POLLING ======
  async function checkPhotosOnce() {
    const code = (codiceInput.value || '').trim().toUpperCase();
    try {
      const res = await gvizCheckPhotosByCode(code);
      if (res && res.count > 0) {
        if (popupWin && !popupWin.closed) popupWin.close();
        
        loadingSpinner?.classList.add('hidden');
        fotoNotice.style.color = "#2ecc71";
        fotoNotice.textContent = '✅ Foto ricevute!';
        nextStepBtn?.classList.remove('hidden');

        stopPolling();
        stopPopupWatcher();

        setTimeout(() => {
          if (current === 2) { updateSummary(); current = 3; showStep(current); }
        }, 1500);
      }
    } catch (e) { console.error("Errore nel controllo foto:", e); }
  }

  function startPolling() {
    stopPolling();
    elapsed = 0;
    const STEP_MS = 4000;
    const MAX_WAIT_AUTO = 28000; // 28 secondi per sblocco manuale

    pollId = setInterval(async () => {
      elapsed += STEP_MS;
      await checkPhotosOnce();

      // Sblocco manuale se il sistema è lento o Google Sheets non risponde
      if (elapsed >= MAX_WAIT_AUTO) {
        loadingSpinner?.classList.add('hidden');
        nextStepBtn?.classList.remove('hidden');
        fotoNotice.style.color = "#f39c12";
        fotoNotice.textContent = "Caricamento lento? Puoi procedere manualmente.";
      }

      if (current >= 3 || elapsed >= 300000) stopPolling();
    }, STEP_MS);
  }

  function stopPolling() { if (pollId) { clearInterval(pollId); pollId = null; } }

  function startPopupWatcher() {
    stopPopupWatcher();
    popupWatchId = setInterval(() => {
      if (popupWin && popupWin.closed) {
        stopPopupWatcher();
        // Se l'utente chiude la finestra, diamo 2 secondi per l'ultimo check, poi sblocchiamo
        setTimeout(() => {
          if (current === 2 && !nextStepBtn.classList.contains('hidden') === false) {
            loadingSpinner?.classList.add('hidden');
            nextStepBtn?.classList.remove('hidden');
            fotoNotice.textContent = "Caricamento terminato. Puoi procedere.";
          }
        }, 2000);
      }
    }, 500);
  }

  function stopPopupWatcher() { if (popupWatchId) { clearInterval(popupWatchId); popupWatchId = null; } }

  // ====== GVIZ (Migliorata con gestione errori) ======
  async function gvizCheckPhotosByCode(code) {
    const cbName = `__cb_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        delete window[cbName];
        resolve({ count: 0 });
      }, 3500);

      window[cbName] = (json) => {
        clearTimeout(timeout);
        if (!json.table || !json.table.rows) { resolve({ count: 0 }); return; }
        
        const rows = json.table.rows.filter(r => {
          return r.c.some(cell => {
            const val = cell ? (cell.v || cell.f || '') : '';
            return String(val).trim().toUpperCase() === code;
          });
        });
        resolve({ count: rows.length });
        delete window[cbName];
      };
      
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_FOTO_ID}/gviz/tq?gid=${GID_FOTO}&tqx=out:json;responseHandler:${cbName}`;
      const s = document.createElement('script');
      s.src = url;
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 2000);
    });
  }
})();
