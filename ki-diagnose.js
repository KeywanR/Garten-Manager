/* ============================================================================
   Mein Garten – KI-Diagnose auf dem Gerät

   Ruft die Claude-API direkt aus der App auf, sobald ein Foto entsteht. Kein
   Server, kein Laptop, kein Zeitplan: Foto → Diagnose in Sekunden.

   Auth: der API-Schlüssel liegt ausschliesslich in localStorage dieses Geräts
   und wird nie ins Repository geschrieben. Browseraufrufe brauchen zusätzlich
   den Header 'anthropic-dangerous-direct-browser-access' – genau dafür ist er
   gedacht (ein Nutzer, ein eigener Schlüssel).

   Ergebnisse laufen durch applyKiDiagnosis() in app.js, also über denselben
   geprüften Pfad wie Diagnosen aus der Drive-Inbox. Das Antwortschema spiegelt
   HEALTH_STATUSES als enum, damit gar kein unbekannter Status entstehen kann.

   Abhängigkeiten (app.js): state, save, renderAll, toast, photoCache, plant,
   plants, applyKiDiagnosis, HEALTH_STATUSES, today, isDateString, esc, fmt,
   buildPlantDossier, openPlantFile, slugify, putPhoto, profileFor, healthFor.
   ========================================================================== */
(function () {
  const API_URL = 'https://api.anthropic.com/v1/messages';
  const MODEL = 'claude-opus-5';
  const LS_KEY = 'gm_ai_key';
  const LS_QUEUE = 'gm_ai_queue';
  const MAX_TRIES = 4;

  let running = false;

  /* ------------------------------------------------------------- key ------- */
  const getKey = () => { try { return localStorage.getItem(LS_KEY) || ''; } catch (e) { return ''; } };
  const hasKey = () => !!getKey();
  function setKey(k) {
    k = String(k || '').trim();
    if (k) localStorage.setItem(LS_KEY, k); else localStorage.removeItem(LS_KEY);
    renderStatus();
    if (k) { toast('KI-Schlüssel gespeichert'); runQueue(); catchUp(); }
    else toast('KI-Schlüssel entfernt');
  }
  function promptKey() {
    const cur = getKey();
    const k = prompt('Anthropic API-Schlüssel (bleibt nur auf diesem Gerät):', cur ? '' : '');
    if (k === null) return;
    setKey(k);
  }

  /* ---------------------------------------------------------- queue -------- */
  function queue() { try { return JSON.parse(localStorage.getItem(LS_QUEUE) || '[]') || []; } catch (e) { return []; } }
  function setQueue(q) { try { localStorage.setItem(LS_QUEUE, JSON.stringify(q)); } catch (e) {} }
  function enqueue(photoKey, plantId, tries) {
    const q = queue().filter(x => x.photoKey !== photoKey);
    q.push({ photoKey, plantId: plantId || '', tries: tries || 1 });
    setQueue(q);
  }
  function dequeue(photoKey) { setQueue(queue().filter(x => x.photoKey !== photoKey)); }

  /* --------------------------------------------------------- schema -------- */
  /* Flat, strict schema. `status` is an enum of the app's own four values, so a
     status the plant-file dropdown cannot represent is impossible by
     construction. Every field is required; "not applicable" is the empty
     string rather than null, which keeps the schema inside the supported
     subset (no union types). */
  function schema() {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['istPflanze', 'pflanzenId', 'neuePflanze', 'kategorie', 'sicherheit',
                 'status', 'begruendung', 'beobachtung', 'pflegehinweis', 'rueckfrage', 'aufgaben'],
      properties: {
        istPflanze: { type: 'boolean', description: 'Zeigt das Foto eine Pflanze? Bei Personen, Tieren, Screenshots usw. false.' },
        pflanzenId: { type: 'string', description: 'id einer bereits bekannten Pflanze aus der Liste. Leerer String, wenn keine passt.' },
        neuePflanze: { type: 'string', description: 'Vorschlag für den Namen einer neuen, noch unbekannten Pflanze. Sonst leerer String.' },
        kategorie: { type: 'string', description: 'Kategorie für eine neue Pflanze, z. B. Zimmerpflanzen. Sonst leerer String.' },
        sicherheit: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'], description: 'Wie sicher ist die Zuordnung der Pflanze?' },
        status: { type: 'string', enum: HEALTH_STATUSES, description: 'Gesundheitsstatus auf Basis des Fotos.' },
        begruendung: { type: 'string', description: 'Ein kurzer Satz zur Begründung des Status.' },
        beobachtung: { type: 'string', description: 'Was auf dem Foto zu sehen ist, als Eintrag für die Zeitleiste.' },
        pflegehinweis: { type: 'string', description: 'Konkrete Empfehlung. Leerer String, wenn nichts zu tun ist.' },
        rueckfrage: { type: 'string', description: 'Rückfrage an den Nutzer, wenn die Zuordnung unsicher ist. Sonst leerer String.' },
        aufgaben: {
          type: 'array',
          description: 'Neue wiederkehrende Pflegeaufgaben, nur wenn wirklich nötig. Sonst leeres Array.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['typ', 'titel', 'intervall', 'monate', 'notiz'],
            properties: {
              typ: { type: 'string', description: 'Kurzer Schlüssel ohne Leerzeichen, z. B. kalium.' },
              titel: { type: 'string' },
              intervall: { type: 'integer', description: 'Abstand in Tagen.' },
              monate: { type: 'array', items: { type: 'integer' }, description: 'Aktive Monate 1–12.' },
              notiz: { type: 'string' }
            }
          }
        }
      }
    };
  }

  const SYSTEM = [
    'Du bist ein erfahrener Gärtner und beurteilst Pflanzenfotos für einen privaten Gartenmanager in Österreich.',
    'Antworte immer auf Deutsch, sachlich und knapp.',
    'Du triffst eine begründete Einschätzung, keine absolute Diagnose. Wenn du dir unsicher bist, sage das in der Begründung und empfiehl eine konkrete Prüfung.',
    'Setze den Status nur dann schlechter als "🟢 Gesund", wenn auf dem Foto wirklich etwas erkennbar ist.',
    'Schlage neue Pflegeaufgaben nur vor, wenn ein wiederkehrender Handlungsbedarf besteht — nicht für einmalige Massnahmen.',
    'Wenn das Foto keine Pflanze zeigt, setze istPflanze auf false und lasse die übrigen Textfelder leer.'
  ].join(' ');

  /* -------------------------------------------------------- context -------- */
  /* Known plant: send that plant's own record so the assessment is grounded in
     its history. Unknown: send the catalogue so the photo can be matched to an
     existing plant instead of creating a duplicate. */
  function contextFor(plantId) {
    const known = plants.filter(p => p.id !== 'garten').map(p => `${p.id} = ${p.name} (${p.cat})`).join('\n');
    if (plantId && plant(plantId)) {
      let d = {};
      try { d = buildPlantDossier(plantId); } catch (e) { d = {}; }
      const tl = (d.timeline || []).slice(0, 8).map(o => `- ${o.date} ${o.type}: ${o.text}`).join('\n');
      const care = (d.careSchedule || []).map(c => `- ${c.task} (alle ${c.intervalDays} Tage, zuletzt ${c.lastDone || '—'})`).join('\n');
      const prof = Object.entries(d.profile || {}).filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`).join('\n');
      return [
        `Das Foto zeigt diese Pflanze: ${d.plant ? d.plant.name : plantId} (id: ${plantId}).`,
        `Setze pflanzenId auf "${plantId}", neuePflanze und rueckfrage bleiben leer.`,
        d.plant && d.plant.generalNote ? `Allgemeiner Hinweis: ${d.plant.generalNote}` : '',
        d.currentHealth ? `Aktueller Status: ${d.currentHealth.status}${d.currentHealth.reason ? ' – ' + d.currentHealth.reason : ''}` : '',
        prof ? `Stammdaten:\n${prof}` : '',
        care ? `Pflegeplan:\n${care}` : '',
        tl ? `Letzte Einträge:\n${tl}` : '',
        `Heute ist ${today()}.`
      ].filter(Boolean).join('\n\n');
    }
    return [
      'Das Foto wurde aus der Galerie importiert und ist noch keiner Pflanze zugeordnet.',
      'Ordne es einer der bekannten Pflanzen zu (pflanzenId) oder schlage eine neue Pflanze vor (neuePflanze + kategorie).',
      'Wenn du dir nicht sicher bist, setze sicherheit auf "niedrig" und stelle in rueckfrage eine kurze Rückfrage.',
      'Bekannte Pflanzen:\n' + known,
      `Heute ist ${today()}.`
    ].join('\n\n');
  }

  /* ------------------------------------------------------- API call -------- */
  async function callApi(dataUrl, plantId) {
    const key = getKey();
    if (!key) throw Object.assign(new Error('Kein API-Schlüssel hinterlegt'), { permanent: true, needKey: true });
    const comma = dataUrl.indexOf(',');
    const media = dataUrl.slice(5, dataUrl.indexOf(';'));
    const b64 = dataUrl.slice(comma + 1);
    const body = {
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: schema() } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: media, data: b64 } },
          { type: 'text', text: contextFor(plantId) }
        ]
      }]
    };
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      const err = new Error(`API ${res.status}: ${txt.slice(0, 300)}`);
      // 401/403 = bad key, 400 = bad request: retrying cannot help.
      err.permanent = [400, 401, 403].includes(res.status);
      err.needKey = [401, 403].includes(res.status);
      throw err;
    }
    const json = await res.json();
    if (json.stop_reason === 'refusal') throw Object.assign(new Error('Anfrage wurde abgelehnt'), { permanent: true });
    const text = (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    if (!text) throw new Error('Leere Antwort');
    return JSON.parse(text);
  }

  /* --------------------------------------------------------- apply --------- */
  function applyResult(photoKey, r) {
    const meta = state.photoMeta[photoKey];
    if (!meta) return;
    const date = meta.date || today();

    if (!r.istPflanze) {
      meta.diag = 'skipped';
      meta.caption = meta.caption || 'Keine Pflanze erkannt';
      save(); renderAll();
      return;
    }

    let plantId = r.pflanzenId && plant(r.pflanzenId) ? r.pflanzenId : '';

    // Unsure, or nothing matched and no confident suggestion → ask instead of guess.
    if (!plantId && (r.sicherheit === 'niedrig' || !r.neuePflanze)) {
      state.kiQuestions = state.kiQuestions || [];
      state.kiQuestions.push({
        id: `kiq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        date, photoKey,
        text: r.rueckfrage || 'Zu welcher Pflanze gehört dieses Foto?',
        suggestion: r.neuePflanze || '',
        kategorie: r.kategorie || 'Zimmerpflanzen',
        resolved: false
      });
      meta.diag = 'question';
      save(); renderAll();
      return;
    }

    // Build an inbox-shaped entry and reuse the proven merge path in app.js.
    const entry = { id: `ki-${date}-${String(photoKey).replace(/[^a-zA-Z0-9]+/g, '-')}`, date };
    if (plantId) entry.plantId = plantId;
    else {
      const id = slugify(r.neuePflanze);
      entry.addPlant = { id, name: r.neuePflanze, cat: r.kategorie || 'Zimmerpflanzen', note: '' };
      plantId = id;
    }
    if (r.status) entry.status = r.status;
    if (r.begruendung) entry.reason = r.begruendung;
    if (r.beobachtung) entry.observation = r.beobachtung;
    if (r.pflegehinweis) entry.profile = { treatments: r.pflegehinweis };
    if (Array.isArray(r.aufgaben) && r.aufgaben.length) {
      entry.addTasks = r.aufgaben.filter(t => t && t.typ).map(t => ({
        type: String(t.typ).replace(/[^a-z0-9-]+/gi, '-').toLowerCase(),
        title: t.titel || 'Pflege',
        interval: Number(t.intervall) || 14,
        months: Array.isArray(t.monate) && t.monate.length ? t.monate : undefined,
        note: t.notiz || ''
      }));
    }

    try { applyKiDiagnosis(entry); } catch (e) { console.warn('Diagnose konnte nicht angewandt werden', e); }

    // An imported photo starts unassigned — attach it now that the plant is known.
    if (!meta.plantId) {
      meta.plantId = plantId;
      state.observations.unshift({ id: `obs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        plantId, date, type: 'Foto', text: r.beobachtung ? 'Importiertes Foto' : 'Import', photoKey });
    }
    meta.diag = 'done';
    save(); renderAll();
  }

  /* ------------------------------------------------------ diagnose --------- */
  async function diagnosePhoto(photoKey, plantId) {
    const meta = state.photoMeta[photoKey];
    if (!meta) return;
    if (!hasKey()) { meta.diag = 'nokey'; save(); renderStatus(); return; }
    const dataUrl = photoCache[photoKey];
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) { meta.diag = 'failed'; save(); return; }

    meta.diag = 'running'; renderStatus();
    try {
      const r = await callApi(dataUrl, plantId || meta.plantId || '');
      dequeue(photoKey);
      applyResult(photoKey, r);
      toast('KI-Diagnose eingetragen');
    } catch (e) {
      console.warn('KI-Diagnose fehlgeschlagen', e);
      const q = queue().find(x => x.photoKey === photoKey);
      const tries = (q ? q.tries : 0) + 1;
      if (e.permanent || tries >= MAX_TRIES) {
        dequeue(photoKey);
        state.photoMeta[photoKey].diag = e.needKey ? 'nokey' : 'failed';
        save();
        toast(e.needKey ? 'KI-Schlüssel fehlt oder ist ungültig' : 'KI-Diagnose fehlgeschlagen');
      } else {
        // Offline or transient: the photo is safely stored, retry later.
        enqueue(photoKey, plantId, tries);
        state.photoMeta[photoKey].diag = 'pending';
        save();
        toast('Keine Verbindung – Diagnose wird nachgeholt');
      }
      renderAll();
    }
  }

  /* Work through everything waiting: explicit retry queue first, then any photo
     that never got a diagnosis (e.g. it arrived from the other device, or the
     key was only added later). */
  async function runQueue() {
    if (running || !hasKey() || !navigator.onLine) return;
    running = true;
    try {
      for (const item of queue()) {
        if (!state.photoMeta[item.photoKey]) { dequeue(item.photoKey); continue; }
        await diagnosePhoto(item.photoKey, item.plantId);
      }
    } finally { running = false; }
  }

  async function catchUp() {
    if (!hasKey() || !navigator.onLine) return;
    const pending = Object.entries(state.photoMeta || {})
      .filter(([k, m]) => m && (!m.diag || m.diag === 'pending') && photoCache[k])
      .map(([k, m]) => [k, m.plantId || '']);
    for (const [k, pid] of pending) await diagnosePhoto(k, pid);
  }

  /* -------------------------------------------------------- questions ------ */
  function resolveQuestion(qid, plantId) {
    const q = (state.kiQuestions || []).find(x => x.id === qid);
    if (!q) return;
    if (plantId && plant(plantId)) {
      const meta = state.photoMeta[q.photoKey];
      if (meta) {
        meta.plantId = plantId; meta.diag = 'pending';
        state.observations.unshift({ id: `obs-${Date.now()}`, plantId, date: q.date || today(),
          type: 'Foto', text: 'Zugeordnetes Foto', photoKey: q.photoKey });
      }
      q.resolved = true;
      save(); renderAll();
      toast('Foto zugeordnet – Diagnose läuft');
      diagnosePhoto(q.photoKey, plantId);
    }
  }
  function dismissQuestion(qid) {
    const q = (state.kiQuestions || []).find(x => x.id === qid);
    if (!q) return;
    q.resolved = true;
    const meta = state.photoMeta[q.photoKey];
    if (meta) meta.diag = 'skipped';
    save(); renderAll();
  }
  function assignFromQuestion(qid) {
    const q = (state.kiQuestions || []).find(x => x.id === qid);
    if (!q) return;
    const list = plants.filter(p => p.id !== 'garten');
    const pick = prompt('Zu welcher Pflanze gehört das Foto? Nummer eingeben:\n' +
      list.map((p, i) => `${i + 1} ${p.name}`).join('\n'));
    const p = list[Number(pick) - 1];
    if (p) resolveQuestion(qid, p.id);
  }
  function createFromQuestion(qid) {
    const q = (state.kiQuestions || []).find(x => x.id === qid);
    if (!q) return;
    const name = (prompt('Name der neuen Pflanze:', q.suggestion || '') || '').trim();
    if (!name) return;
    let id = slugify(name) || 'pflanze'; let n = 2;
    while (plant(id)) id = `${slugify(name)}-${n++}`;
    state.customPlants = state.customPlants || [];
    state.customPlants.push({ id, name, cat: q.kategorie || 'Zimmerpflanzen', note: '' });
    addDefaultTasksFor(id, q.kategorie || 'Zimmerpflanzen');
    rebuildCatalog(); initializeCareTasks();
    resolveQuestion(qid, id);
  }

  /* ------------------------------------------------------------ read ------- */
  const findings = () => (state.observations || []).filter(o => o.type === 'KI-Diagnose');
  const openQuestions = () => (state.kiQuestions || []).filter(q => !q.resolved);
  const unread = () => findings().filter(o => !(state.kiRead || {})[o.id]);
  function markRead(id) { state.kiRead = state.kiRead || {}; state.kiRead[id] = true; save(); renderAll(); }
  function markAllRead() { state.kiRead = state.kiRead || {}; findings().forEach(o => { state.kiRead[o.id] = true; }); save(); renderAll(); toast('Alle Diagnosen als gelesen markiert'); }
  function openPlant(id, obsId) { if (obsId) { state.kiRead = state.kiRead || {}; state.kiRead[obsId] = true; save(); } renderAll(); openPlantFile(id); }

  /* ---------------------------------------------------------- render ------- */
  function renderStatus() {
    const el = document.getElementById('kiKeyInfo');
    if (el) {
      const pend = Object.values(state.photoMeta || {}).filter(m => m && (m.diag === 'pending' || m.diag === 'running')).length;
      el.textContent = hasKey()
        ? `✓ Schlüssel hinterlegt (nur auf diesem Gerät)${pend ? ` · ${pend} Foto${pend === 1 ? '' : 's'} in der Warteschlange` : ''}`
        : '⚠ Kein Schlüssel – Fotos werden gespeichert, aber nicht diagnostiziert';
    }
    const btn = document.getElementById('kiKeyBtn');
    if (btn) btn.textContent = hasKey() ? 'Schlüssel ändern' : 'Schlüssel hinterlegen';
  }

  function render() {
    renderStatus();
    const n = unread().length + openQuestions().length;
    const badge = document.getElementById('kiBadge');
    if (badge) { badge.textContent = n ? String(n) : ''; badge.style.display = n ? '' : 'none'; }

    const box = document.getElementById('kiContent');
    if (!box) return;
    const qs = openQuestions(), fs = findings().slice(0, 80);
    const qHTML = qs.length ? `<div class="section-title"><h2>Braucht deine Entscheidung</h2><small>${qs.length}</small></div>
      <div class="task-list">${qs.map(q => {
        const img = photoCache[q.photoKey];
        return `<article class="task due"><div>
          <h3>Foto konnte nicht sicher zugeordnet werden</h3>
          <div class="meta">${fmt(q.date)}</div>
          <div class="note">${esc(q.text)}</div>
          ${img ? `<img src="${img}" alt="" style="margin-top:10px;max-width:220px;width:100%;border-radius:12px">` : ''}
        </div><div class="actions">
          <button class="btn primary" onclick="KiDiagnose.assignFromQuestion('${q.id}')">Pflanze wählen</button>
          <button class="btn soft" onclick="KiDiagnose.createFromQuestion('${q.id}')">Neu anlegen${q.suggestion ? ` (${esc(q.suggestion)})` : ''}</button>
          <button class="btn" onclick="KiDiagnose.dismissQuestion('${q.id}')">Verwerfen</button>
        </div></article>`;
      }).join('')}</div>` : '';

    const fHTML = fs.length ? `<div class="task-list">${fs.map(o => {
      const isNew = !(state.kiRead || {})[o.id];
      const p = plant(o.plantId);
      return `<article class="task ${isNew ? 'soon' : ''}"><div>
        <h3>${esc(p ? p.name : o.plantId)} ${isNew ? '<span class="mini">neu</span>' : ''}</h3>
        <div class="meta">${fmt(o.date)} · KI-Diagnose${p ? ` · ${esc(healthFor(o.plantId).status)}` : ''}</div>
        <div class="note">${esc(o.text)}</div>
      </div><div class="actions">
        <button class="btn primary" onclick="KiDiagnose.openPlant('${o.plantId}','${o.id}')">Zur Pflanze</button>
        ${isNew ? `<button class="btn" onclick="KiDiagnose.markRead('${o.id}')">Gelesen</button>` : ''}
      </div></article>`;
    }).join('')}</div>` : '<div class="empty">Noch keine KI-Diagnosen. Fotografiere eine Pflanze in der App.</div>';

    box.innerHTML = qHTML +
      `<div class="section-title"><h2>Diagnosen</h2><small>${unread().length} ungelesen</small>` +
      `</div>${fHTML}`;
  }

  /* ------------------------------------------------------------ init ------- */
  function init() {
    renderStatus();
    window.addEventListener('online', () => { runQueue(); });
    // Give the initial sync a moment before spending anything on the network.
    setTimeout(() => { runQueue().then(catchUp); }, 4000);
  }

  window.KiDiagnose = { init, render, renderStatus, diagnosePhoto, runQueue, catchUp,
    promptKey, hasKey, markRead, markAllRead, openPlant,
    assignFromQuestion, createFromQuestion, dismissQuestion, resolveQuestion };
  window.kiPromptKey = promptKey;
  window.kiMarkAllRead = markAllRead;
})();
