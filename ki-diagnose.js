/* ============================================================================
   Mein Garten – KI-Diagnosen: Ansicht und Zuordnung

   Diagnosen entstehen NICHT in der App. Claude wertet die Fotos aus dem
   Drive-Ordner aus und schreibt sie über die Inbox zurück
   (gartenmanager-ki-diagnose.json, siehe KI-DIAGNOSE.md). Die App ruft keine
   API auf, braucht keinen Schlüssel und verursacht keine zusätzlichen Kosten.

   Dieses Modul macht nur zwei Dinge:
   1. Es sammelt die eingegangenen Diagnosen an einer Stelle, mit Zähler für
      Ungelesenes — sonst verteilen sie sich still über die Pflanzenakten und
      werden nie gelesen.
   2. Es lässt importierte Fotos einer Pflanze zuordnen. Aus der Galerie
      importierte Bilder kommen ohne Pflanze an; erst die Zuordnung bringt sie
      in die Akte und damit in die KI-Akte, die Claude auswertet.

   Abhängigkeiten (app.js): state, save, renderAll, toast, photoCache, plant,
   plants, today, esc, fmt, healthFor, openPlantFile.
   ========================================================================== */
(function () {

  /* ----------------------------------------------------------- queries ----- */
  const findings = () => (state.observations || []).filter(o => o.type === 'KI-Diagnose');
  const unread = () => findings().filter(o => !(state.kiRead || {})[o.id]);
  // Photos imported from the gallery arrive without a plant. They stay here
  // until assigned — an unassigned photo is invisible in every plant file.
  const unassigned = () => Object.entries(state.photoMeta || {})
    .filter(([k, m]) => m && !m.plantId && !m.ignored && photoCache[k])
    .sort((a, b) => (b[1].date || '').localeCompare(a[1].date || ''));

  /* -------------------------------------------------------- read state ----- */
  function markRead(id) { state.kiRead = state.kiRead || {}; state.kiRead[id] = true; save(); renderAll(); }
  function markAllRead() {
    state.kiRead = state.kiRead || {};
    findings().forEach(o => { state.kiRead[o.id] = true; });
    save(); renderAll(); toast('Alle Diagnosen als gelesen markiert');
  }
  function openPlant(id, obsId) {
    if (obsId) { state.kiRead = state.kiRead || {}; state.kiRead[obsId] = true; save(); }
    renderAll(); openPlantFile(id);
  }

  /* ------------------------------------------------------- assignment ------ */
  function assignPhoto(photoKey) {
    const meta = state.photoMeta[photoKey];
    if (!meta) return;
    const list = plants.filter(p => p.id !== 'garten');
    const pick = prompt('Zu welcher Pflanze gehört das Foto? Nummer eingeben:\n' +
      list.map((p, i) => `${i + 1} ${p.name}`).join('\n'));
    const p = list[Number(pick) - 1];
    if (!p) return;
    const caption = (prompt('Kurze Notiz zum Foto (optional):') || '').trim();
    meta.plantId = p.id;
    if (caption) meta.caption = caption;
    state.observations.unshift({ id: `obs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      plantId: p.id, date: meta.date || today(), type: 'Foto',
      text: caption || 'Importiertes Foto', photoKey });
    save(); renderAll();
    toast(`Foto ${p.name} zugeordnet`);
  }

  // Not a garden photo (or simply not wanted): hide it from the list without
  // deleting the image, so nothing is lost by a mis-tap.
  function ignorePhoto(photoKey) {
    const meta = state.photoMeta[photoKey];
    if (!meta) return;
    meta.ignored = true;
    save(); renderAll();
  }

  /* ---------------------------------------------------------- render ------- */
  function render() {
    const un = unassigned(), fs = findings().slice(0, 80), nUnread = unread().length;

    const badge = document.getElementById('kiBadge');
    if (badge) {
      const n = nUnread + un.length;
      badge.textContent = n ? String(n) : '';
      badge.style.display = n ? '' : 'none';
    }

    const box = document.getElementById('kiContent');
    if (!box) return;

    const unHTML = un.length ? `<div class="section-title"><h2>Fotos ohne Pflanze</h2><small>${un.length}</small></div>
      <div class="task-list">${un.map(([k, m]) => `<article class="task due"><div>
        <h3>Importiertes Foto</h3>
        <div class="meta">${fmt(m.date)}</div>
        <img src="${photoCache[k]}" alt="" style="margin-top:10px;max-width:220px;width:100%;border-radius:12px">
      </div><div class="actions">
        <button class="btn primary" onclick="KiDiagnose.assignPhoto('${k}')">Pflanze zuordnen</button>
        <button class="btn" onclick="KiDiagnose.ignorePhoto('${k}')">Ausblenden</button>
      </div></article>`).join('')}</div>` : '';

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
    }).join('')}</div>`
      : `<div class="empty">Noch keine Diagnosen. Fotografiere Pflanzen in der App – beim nächsten
         Sync landen sie in Google Drive, und Claude trägt die Auswertung hier ein.</div>`;

    box.innerHTML = unHTML +
      `<div class="section-title"><h2>Diagnosen</h2><small>${nUnread} ungelesen</small></div>` + fHTML;
  }

  /* v24 briefly shipped an on-device API client. It was removed again (API use
     is billed separately from the Claude subscription), so any key that version
     stored is now dead weight — and a credential left in localStorage is worth
     clearing rather than leaving behind. Runs once per device, on upgrade. */
  function purgeLegacyApiKey() {
    try {
      if (localStorage.getItem('gm_ai_key') !== null) {
        localStorage.removeItem('gm_ai_key');
        console.info('Alter KI-Schlüssel aus dem lokalen Speicher entfernt.');
      }
      localStorage.removeItem('gm_ai_queue');
    } catch (e) {}
  }

  function init() { purgeLegacyApiKey(); render(); }

  window.KiDiagnose = { init, render, markRead, markAllRead, openPlant, assignPhoto, ignorePhoto };
  window.kiMarkAllRead = markAllRead;
})();
