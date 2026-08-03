/* ============================================================================
   Mein Garten – Google Drive Cloud-Sync (redirect auth)
   Optional, offline-first. Stores the full backup payload (state + photos)
   as a single JSON file in a visible "Garten-Manager" folder in the user's
   Google Drive, reachable from the iPad and the PC.

   Auth: OAuth 2.0 implicit flow via full-page REDIRECT (no popup, no backend).
   Popups do not work inside a home-screen–installed iOS PWA, so we bounce the
   whole page to Google and read the access token back from the URL hash.
   Requires the app URL to be registered as an Authorised redirect URI on the
   OAuth client. Scope: drive.file — the app only sees files it created.

   Sync model: multi-device. On change → debounced upload, but never a blind
   overwrite: before every push we compare Drive's modifiedTime against the last
   copy this device saw, and merge anything newer in first (mergeStates). The
   merge is per record, not per file, and resolves by ONE rule: the side whose
   `ts` is later wins. Deletions carry tombstones so a removal is not undone by
   the other device's surviving copy. On startup a device with no local data
   adopts the cloud copy wholesale; any other device merges and pushes the
   union. An emptier copy can never overwrite real data, in either direction.

   Alongside the data file, every push also regenerates and uploads the
   KI-Akte (gartenmanager-ki-akte.json, photo data excluded — it lives in the
   data file) so the AI dossier in Drive is always current without manual
   export. When the app goes to background, a pending debounced upload is
   flushed immediately — the closest iOS lets a PWA get to "save on exit".

   Photo history: every push also uploads new/changed photos as individual
   image files into a "photos" subfolder (name via gmPhotoFileName). Files are
   never deleted from Drive, so the folder accumulates the full photo history
   in a form external AI tooling can fetch one image at a time.

   KI diagnosis inbox: Claude writes gartenmanager-ki-diagnose.json into the
   app folder (via the claude.ai Drive connector); on each reconcile the app
   merges unapplied entries into local state (applyKiDiagnosis) and the normal
   push carries them back to Drive. Schema: KI-DIAGNOSE.md in the repo.

   Depends on app.js globals: state, buildPayload, buildDossierPayload,
   gmPhotoFileName, applyKiDiagnosis, importKiPhoto, slugify, migrateState,
   normalizeState, restorePhotos, putPhoto, cleanupV12, save, renderAll, toast,
   photoCache, loadPhotos.
   ========================================================================== */
(function () {
  const CLIENT_ID = '1025384887951-8ckp0ehbqj6v9e6u6n0nrl9m4sult7ts.apps.googleusercontent.com';
  const REDIRECT_URI = 'https://keywanr.github.io/Garten-Manager/';
  // drive.file: write own files. drive.readonly: additionally READ files created
  // by others — needed for the KI diagnosis inbox, which Claude's Drive
  // connector writes (files from other apps are invisible under drive.file).
  const SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly';
  const FOLDER_NAME = 'Garten-Manager';
  /* The data folder is pinned by ID, not found by name. There is more than one
     folder called "Garten-Manager" in this Drive — the other holds the app's
     source code — and searching by name let one device latch onto the wrong
     one. It then synced perfectly, to a folder the other device never reads:
     both reported "Gesichert", neither ever saw the other's data, and no amount
     of fixing the merge could help because they were not sharing a file at all.
     A name is not an identity; the id is. */
  const FOLDER_ID = '1gf3X6Ia1iVLBYoOfm94S37DioQ67Mby8';
  const FILE_NAME = 'gartenmanager-data.json';
  const KI_FILE_NAME = 'gartenmanager-ki-akte.json';
  const PHOTOS_FOLDER_NAME = 'photos';
  const LS_ENABLED = 'gm_cloud_enabled';
  const LS_FOLDER = 'gm_drive_folder_id';
  const LS_FILE = 'gm_drive_file_id';
  const LS_KI_FILE = 'gm_drive_ki_file_id';
  const LS_PHOTOS_FOLDER = 'gm_drive_photos_folder_id';
  const LS_PHOTO_INDEX = 'gm_drive_photo_index';
  const DIAG_FILE_NAME = 'gartenmanager-ki-diagnose.json';
  const LS_DIAG_APPLIED = 'gm_ki_diag_applied';
  const LS_REMOTE_TIME = 'gm_drive_remote_time';   // modifiedTime of the last copy we saw
  const SS_TOKEN = 'gm_at', SS_TOKEN_EXP = 'gm_at_exp';
  const SS_STATE = 'gm_oauth_state', SS_RESUME = 'gm_oauth_resume';
  const UPLOAD_DEBOUNCE = 4000;

  let accessToken = '';
  let tokenExpiry = 0;
  let pendingResume = '';           // action to finish after returning from Google
  let folderId = localStorage.getItem(LS_FOLDER) || '';
  let fileId = localStorage.getItem(LS_FILE) || '';
  let kiFileId = localStorage.getItem(LS_KI_FILE) || '';
  let photosFolderId = localStorage.getItem(LS_PHOTOS_FOLDER) || '';
  let photoIndex = {};   // key -> {id, fp}: Drive file id + fingerprint of last upload
  try { photoIndex = JSON.parse(localStorage.getItem(LS_PHOTO_INDEX) || '{}') || {}; } catch (e) { photoIndex = {}; }
  let uploadTimer = null;
  let initialSyncDone = false;
  let applyingRemote = false;
  let statusText = 'Nicht verbunden';
  let statusKind = 'idle';

  const enabled = () => localStorage.getItem(LS_ENABLED) === '1';
  const tokenValid = () => accessToken && Date.now() < tokenExpiry;

  /* ---------------------------------------------------- redirect auth ------- */
  // On load: capture a token returned in the URL hash, or restore one kept in
  // sessionStorage from earlier this app session.
  (function captureAuth() {
    try {
      if (location.hash && location.hash.indexOf('access_token=') !== -1) {
        const h = new URLSearchParams(location.hash.slice(1));
        const at = h.get('access_token');
        const returnedState = h.get('state');
        const savedState = sessionStorage.getItem(SS_STATE);
        // strip the token from the visible URL immediately
        history.replaceState(null, '', location.pathname + location.search);
        if (at && (!savedState || returnedState === savedState)) {
          accessToken = at;
          tokenExpiry = Date.now() + (Number(h.get('expires_in') || 3600) - 60) * 1000;
          sessionStorage.setItem(SS_TOKEN, accessToken);
          sessionStorage.setItem(SS_TOKEN_EXP, String(tokenExpiry));
          pendingResume = sessionStorage.getItem(SS_RESUME) || '';
        }
        sessionStorage.removeItem(SS_STATE);
        sessionStorage.removeItem(SS_RESUME);
      }
      if (!accessToken) {
        const s = sessionStorage.getItem(SS_TOKEN), e = Number(sessionStorage.getItem(SS_TOKEN_EXP) || 0);
        if (s && Date.now() < e) { accessToken = s; tokenExpiry = e; }
      }
    } catch (e) { console.warn('captureAuth', e); }
  })();

  // Navigate the whole page to Google's sign-in; we return here with a token.
  function beginRedirect(action) {
    const st = 'gm_' + Math.random().toString(36).slice(2) + Date.now();
    sessionStorage.setItem(SS_STATE, st);
    sessionStorage.setItem(SS_RESUME, action || '');
    const p = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'token',
      scope: SCOPE,
      include_granted_scopes: 'true',
      state: st
    });
    location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString();
  }

  // interactive=true may navigate away (never resolves). false → throw if no token.
  async function getToken(interactive) {
    if (tokenValid()) return accessToken;
    if (interactive) { beginRedirect('sync'); return new Promise(() => {}); }
    throw new Error('Keine gültige Anmeldung');
  }

  /* ------------------------------------------------------------- Drive API -- */
  async function apiFetch(url, opts = {}) {
    const token = await getToken(false);
    const headers = Object.assign({}, opts.headers, { Authorization: 'Bearer ' + token });
    let res = await fetch(url, Object.assign({}, opts, { headers }));
    if (res.status === 401) { accessToken = ''; tokenExpiry = 0; throw new Error('Anmeldung abgelaufen'); }
    if (!res.ok) throw new Error('Drive API ' + res.status + ': ' + (await res.text().catch(() => '')));
    return res;
  }

  async function driveList(query) {
    const url = 'https://www.googleapis.com/drive/v3/files'
      + '?q=' + encodeURIComponent(query)
      + '&fields=' + encodeURIComponent('files(id,name,modifiedTime)')
      + '&spaces=drive&pageSize=10';
    return (await (await apiFetch(url)).json()).files || [];
  }

  async function ensureFolder() {
    if (folderId === FOLDER_ID) return folderId;
    // A device that previously latched onto a different folder of the same name
    // has cached ids pointing INTO that folder — the data file, the dossier, the
    // photos subfolder and the upload index. Every one of them is wrong and must
    // go, or the device keeps writing to the wrong place under a corrected
    // folder id. Dropping the remote-time marker too forces a fresh merge.
    if (folderId && folderId !== FOLDER_ID) {
      console.warn('Falscher Drive-Ordner erkannt, wird korrigiert:', folderId, '->', FOLDER_ID);
      fileId = ''; kiFileId = ''; photosFolderId = ''; photoIndex = {};
      [LS_FILE, LS_KI_FILE, LS_PHOTOS_FOLDER, LS_PHOTO_INDEX, LS_REMOTE_TIME]
        .forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
    }
    folderId = FOLDER_ID;
    localStorage.setItem(LS_FOLDER, folderId);
    return folderId;
  }

  async function ensureFileRef() {
    await ensureFolder();
    if (fileId) {
      try { await apiFetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?fields=id,trashed'); return fileId; }
      catch (e) { if (String(e.message).indexOf('404') !== -1) { fileId = ''; localStorage.removeItem(LS_FILE); } else throw e; }
    }
    const found = await driveList(
      "name='" + FILE_NAME + "' and '" + folderId + "' in parents and trashed=false");
    if (found.length) { fileId = found[0].id; localStorage.setItem(LS_FILE, fileId); }
    return fileId;
  }

  // Generic create-or-update of a JSON file in the app folder; returns the id.
  async function uploadJson(name, content, existingId) {
    await ensureFolder();
    const boundary = 'gm_boundary_' + Math.random().toString(36).slice(2);
    const meta = existingId
      ? { name: name, mimeType: 'application/json' }
      : { name: name, mimeType: 'application/json', parents: [folderId] };
    const body =
      '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(meta) +
      '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' +
      content +
      '\r\n--' + boundary + '--';
    const url = existingId
      ? 'https://www.googleapis.com/upload/drive/v3/files/' + existingId + '?uploadType=multipart&fields=id'
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
    const res = await apiFetch(url, {
      method: existingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body
    });
    return (await res.json()).id || existingId;
  }

  async function uploadContent(content) {
    fileId = await uploadJson(FILE_NAME, content, fileId);
    if (fileId) localStorage.setItem(LS_FILE, fileId);
  }

  // KI-Akte: adopt an existing Drive file of the same name before creating one.
  async function uploadKiAkte(content) {
    if (!kiFileId) {
      await ensureFolder();
      const found = await driveList(
        "name='" + KI_FILE_NAME + "' and '" + folderId + "' in parents and trashed=false");
      if (found.length) kiFileId = found[0].id;
    }
    try {
      kiFileId = await uploadJson(KI_FILE_NAME, content, kiFileId);
    } catch (e) {
      if (String(e.message).indexOf('404') !== -1) {   // stale id: file was deleted in Drive
        kiFileId = '';
        kiFileId = await uploadJson(KI_FILE_NAME, content, '');
      } else throw e;
    }
    if (kiFileId) localStorage.setItem(LS_KI_FILE, kiFileId);
  }

  /* ------------------------------------------------- photo history upload --- */
  async function ensurePhotosFolder() {
    if (photosFolderId) return photosFolderId;
    await ensureFolder();
    const found = await driveList(
      "name='" + PHOTOS_FOLDER_NAME + "' and mimeType='application/vnd.google-apps.folder' and '"
      + folderId + "' in parents and trashed=false");
    if (found.length) { photosFolderId = found[0].id; }
    else {
      const res = await apiFetch('https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: PHOTOS_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', parents: [folderId] })
      });
      photosFolderId = (await res.json()).id;
    }
    localStorage.setItem(LS_PHOTOS_FOLDER, photosFolderId);
    return photosFolderId;
  }

  function dataUrlToBlob(dataUrl) {
    const i = dataUrl.indexOf(','), mime = (dataUrl.slice(5, i).split(';')[0]) || 'image/jpeg';
    const bin = atob(dataUrl.slice(i + 1)), arr = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
    return new Blob([arr], { type: mime });
  }

  async function createPhotoFile(name) {
    const res = await apiFetch('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, parents: [photosFolderId] })
    });
    return (await res.json()).id;
  }

  // Append-only: a changed image under a known key (e.g. a replaced cover)
  // gets a NEW date-stamped file; the previous one stays in Drive as history.
  async function writePhotoBytes(id, blob) {
    const url = 'https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=media&fields=id';
    await apiFetch(url, { method: 'PATCH', headers: { 'Content-Type': blob.type }, body: blob });
  }

  async function uploadPhotoFile(key, dataUrl) {
    await ensurePhotosFolder();
    const metaDate = ((state.photoMeta || {})[key] || {}).date || '';
    const name = gmPhotoFileName(key, metaDate, dataUrl);
    const blob = dataUrlToBlob(dataUrl);
    let id = '', adopted = false;
    if (!photoIndex[key]) {   // first sight of this key: adopt a same-name Drive file
      const found = await driveList(
        "name='" + name + "' and '" + photosFolderId + "' in parents and trashed=false");
      if (found.length) { id = found[0].id; adopted = true; }
    }
    if (!id) id = await createPhotoFile(name);
    try {
      await writePhotoBytes(id, blob);
    } catch (e) {
      // We can SEE more of Drive than we may WRITE: the readonly scope makes
      // every old file visible to the name search, but write access under
      // drive.file is per-file and is lost when the OAuth grant is revoked —
      // which is exactly what "Trennen" used to do. Adopting such a file then
      // fails with 403 forever, and the photo can never be uploaded again.
      // Our own fresh copy always works, so fall back to one. A duplicate name
      // in the photos archive is harmless: the diagnosis run skips by filename,
      // so the image is not assessed twice.
      if (!adopted || !/Drive API 403/.test(String((e && e.message) || e))) throw e;
      console.warn('Kein Schreibzugriff auf vorhandene Datei, lege neue an:', name);
      id = await createPhotoFile(name);
      await writePhotoBytes(id, blob);
    }
    photoIndex[key] = { id: id, fp: dataUrl.length, name: name };
    localStorage.setItem(LS_PHOTO_INDEX, JSON.stringify(photoIndex));
  }

  // A photo is "in Drive" only once an upload of exactly this image data has
  // been confirmed. The fingerprint comparison matters: a replaced cover keeps
  // its key but is a different image, and must not count as already uploaded.
  function photoNeedsUpload(k) {
    const du = (photoCache || {})[k];
    if (typeof du !== 'string' || !du.startsWith('data:image/')) return false;
    const rec = photoIndex[k];
    return !(rec && rec.fp === du.length && rec.name);
  }
  function pendingPhotoCount() {
    return Object.keys(photoCache || {}).filter(photoNeedsUpload).length;
  }
  // Without a valid token every further request fails identically, so there is
  // nothing to be gained by walking the rest of the queue.
  function isAuthError(e) { return /Anmeldung abgelaufen/.test(String((e && e.message) || e)); }

  // Never-uploaded photos first, newest first inside each group. A photo taken
  // this morning must not queue behind forty historical re-uploads — that is
  // precisely how the 06:20 diagnosis run came up empty on 3 Aug: correcting a
  // device's folder clears the upload index, which puts every old photo back in
  // the queue ahead of the new ones.
  function photoUploadQueue() {
    const meta = state.photoMeta || {};
    const dateOf = k => (meta[k] && meta[k].date) || '';
    const isNew = k => (photoIndex[k] ? 0 : 1);
    return Object.keys(photoCache || {}).filter(photoNeedsUpload).sort((a, b) =>
      (isNew(b) - isNew(a))
      || dateOf(b).localeCompare(dateOf(a))
      || String(a).localeCompare(String(b)));
  }

  // Upload photos that are new or changed since the last sync. Photos deleted
  // in the app are deliberately left in Drive — they are the history. The
  // in-flight guard keeps overlapping pushes from double-creating files.
  let photoSyncRunning = false;
  let photosPending = 0;          // shown in the status line, never only logged
  let lastPhotoError = '';        // why the last upload failed, for the same reason
  // uploadFn is a test seam (see _syncPhotos): this loop's give-up behaviour is
  // what silently cost a day of diagnoses, so it is worth testing without Drive.
  async function syncPhotos(uploadFn) {
    if (photoSyncRunning) return;
    const upload = uploadFn || uploadPhotoFile;
    photoSyncRunning = true;
    lastPhotoError = '';   // a reason from a previous run must not outlive it
    try {
      await loadPhotos();
      for (const k of photoUploadQueue()) {
        try { await upload(k, photoCache[k]); }
        catch (e) {
          // One bad photo must not cost the whole queue. It stays unindexed,
          // so the next sync retries it; everything behind it still gets up.
          console.warn('Foto-Upload übersprungen:', k, e);
          lastPhotoError = errText(e);
          if (isAuthError(e)) break;
        }
      }
    } finally {
      photosPending = pendingPhotoCount();
      photoSyncRunning = false;
      try { renderStatus(); } catch (e) {}
    }
  }

  async function downloadRemote() {
    if (!(await ensureFileRef())) return null;
    const res = await apiFetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media');
    try { return JSON.parse(await res.text()); } catch (e) { return null; }
  }

  /* ------------------------------------------------- multi-device merge ----- */
  // Drive's modifiedTime for the data file, or '' if there is no file yet.
  async function remoteModified() {
    if (!(await ensureFileRef())) return '';
    try {
      const res = await apiFetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?fields=modifiedTime');
      return (await res.json()).modifiedTime || '';
    } catch (e) { return ''; }
  }
  const lastRemoteTime = () => localStorage.getItem(LS_REMOTE_TIME) || '';
  const setLastRemoteTime = t => { if (t) localStorage.setItem(LS_REMOTE_TIME, t); };

  const laterOf = (a, b) => ((a || '') >= (b || '') ? a : b);

  // Union two append-only text fields line by line, preserving local order and
  // adding any line only the other side has. Profile texts grow by dated
  // [KI …] lines, so a line-wise union never loses either device's additions.
  function mergeText(a, b) {
    if (!a) return b || ''; if (!b) return a;
    if (a === b) return a;
    const seen = new Set(a.split('\n'));
    const extra = b.split('\n').filter(l => l.trim() && !seen.has(l));
    return extra.length ? a + '\n' + extra.join('\n') : a;
  }

  function mergeById(localArr, remoteArr, key) {
    const out = [], seen = new Set();
    for (const x of [...(localArr || []), ...(remoteArr || [])]) {
      if (!x) continue;
      const k = typeof key === 'function' ? key(x) : x[key];
      if (k === undefined || seen.has(k)) continue;
      seen.add(k); out.push(x);
    }
    return out;
  }

  /* Field-level merge of a remote state into the local one. Replaces the old
     whole-file overwrite, which made whichever device synced last win outright
     and silently discard the other device's work. Every record type here is
     either dated (take the newer) or uniquely keyed (union). */
  /* Timestamp-based merge: for every record, the side that changed it later
     wins. Records carry `ts` (see stampChanges in app.js); a record with no `ts`
     predates the change and counts as oldest. Tombstones record deletions, so a
     record deleted on one device is not resurrected by the other's copy — and a
     later edit still beats an earlier deletion.

     This replaces a per-type heuristic scheme where recency was inferred from
     whatever field happened to be present, and where an undecidable comparison
     let the local side win — which is how two devices ended up holding
     different state indefinitely, each convinced it was right. */
  const TS_MAPS = ['tasks', 'health', 'photoMeta', 'suppressedTasks', 'plantEdits', 'kiReviewed'];
  const TS_LISTS = ['customPlants', 'customTasks', 'kiProposals', 'observations'];
  const tsOf = r => (r && r.ts) || '';

  function mergeStates(local, remote) {
    const out = local;
    out.tombstones = out.tombstones || {};
    for (const [k, v] of Object.entries(remote.tombstones || {}))
      if (!out.tombstones[k] || v > out.tombstones[k]) out.tombstones[k] = v;

    for (const g of TS_MAPS) {
      const l = out[g] || {};
      for (const [k, rv] of Object.entries(remote[g] || {}))
        if (!l[k] || tsOf(rv) > tsOf(l[k])) l[k] = rv;
      for (const k of Object.keys(l)) {
        const t = out.tombstones[`${g}:${k}`];
        if (t && t > tsOf(l[k])) delete l[k];       // deleted after its last edit
      }
      out[g] = l;
    }

    for (const g of TS_LISTS) {
      const byId = new Map((out[g] || []).filter(x => x && x.id).map(x => [x.id, x]));
      for (const rv of remote[g] || []) {
        if (!rv || !rv.id) continue;
        const lv = byId.get(rv.id);
        if (!lv || tsOf(rv) > tsOf(lv)) byId.set(rv.id, rv);
      }
      for (const k of [...byId.keys()]) {
        const t = out.tombstones[`${g}:${k}`];
        if (t && t > tsOf(byId.get(k))) byId.delete(k);
      }
      out[g] = [...byId.values()];
    }
    if (Array.isArray(out.observations))
      out.observations.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // Read markers hold the moment they were read. Union, keeping the earliest —
    // once read on any device it stays read everywhere.
    const kr = { ...(remote.kiRead || {}) };
    for (const [k, v] of Object.entries(out.kiRead || {}))
      if (!kr[k] || String(v) < String(kr[k])) kr[k] = v;
    out.kiRead = kr;
    out.kiApplied = { ...(remote.kiApplied || {}), ...(out.kiApplied || {}) };

    // Care-profile text is append-only and dated in place; a line-wise union
    // cannot lose either side's additions, which whole-record replacement would.
    for (const [id, rp] of Object.entries(remote.profiles || {})) {
      const lp = out.profiles[id];
      if (!lp) { out.profiles[id] = rp; continue; }
      const m = { ...lp };
      for (const f of Object.keys(rp)) if (f !== 'ts') m[f] = mergeText(lp[f], rp[f]);
      m.ts = tsOf(rp) > tsOf(lp) ? tsOf(rp) : tsOf(lp);
      out.profiles[id] = m;
    }

    out.history = mergeById(out.history, remote.history,
      h => `${h.date}|${h.taskId}|${h.plantId}|${h.title}`)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    out.meta = out.meta || {};
    out.meta.lastCloudMerge = new Date().toISOString();
    return out;
  }


  // Merge the remote copy (state + any photos we don't have) into local state.
  async function mergeRemote(remote) {
    applyingRemote = true;
    try {
      const rs = migrateState(remote.state || remote);
      state = normalizeState(mergeStates(normalizeState(state), rs));
      const photos = remote.photos || {};
      for (const [k, data] of Object.entries(photos)) {
        if (photoCache[k]) continue;
        if (typeof data !== 'string' || !data.startsWith('data:image/')) continue;
        try { await putPhoto(k, data); } catch (e) { console.warn('Foto-Merge übersprungen', k, e); }
      }
      // rebuildCatalog FIRST. cleanupV12 deletes every task whose id is not in
      // `defs`, and `defs` is only rebuilt inside renderAll — so running the
      // cleanup here used to compare incoming data against the OLD catalogue and
      // silently delete the task state of every custom plant it had not seen
      // yet. With tombstones recording deletions, that damage then propagated
      // back to the other device: pulling the good copy destroyed task history
      // and exported the destruction. Not forced either — the incoming state
      // carries its own cleanup marker and does not need redoing on every sync.
      rebuildCatalog();
      cleanupV12(false);
      resetTsBaseline();
      save(false);
      dedupeKiFindings();
      renderAll();
    } finally { applyingRemote = false; }
  }

  // Pull-and-merge when Drive holds changes this device has not seen yet.
  // Returns true if anything was merged.
  async function mergeIfRemoteNewer() {
    const rt = await remoteModified();
    if (!rt) return false;
    const seen = lastRemoteTime();
    if (seen && rt <= seen) return false;
    const remote = await downloadRemote();
    if (!remote || !remoteHasData(remote)) { setLastRemoteTime(rt); return false; }
    if (!seen) {
      // First run on this device with a populated Drive: merge rather than
      // assume either side is authoritative.
      await mergeRemote(remote); setLastRemoteTime(rt); return true;
    }
    await mergeRemote(remote); setLastRemoteTime(rt); return true;
  }

  /* --------------------------------------------------------- sync actions --- */
  function localIsEmpty() {
    const s = state || {};
    return (!Array.isArray(s.history) || s.history.length === 0)
      && (!Array.isArray(s.observations) || s.observations.length === 0)
      && (!s.profiles || Object.keys(s.profiles).length === 0)
      && (!photoCache || Object.keys(photoCache).length === 0);
  }

  function remoteHasData(remote) {
    if (!remote) return false;
    const s = remote.state || {};
    return (Array.isArray(s.history) && s.history.length > 0)
      || (Array.isArray(s.observations) && s.observations.length > 0)
      || (s.profiles && Object.keys(s.profiles).length > 0)
      || (remote.photos && Object.keys(remote.photos).length > 0);
  }

  async function pushLocal() {
    await loadPhotos();
    if (localIsEmpty()) return;                          // never overwrite the cloud with an empty copy
    // Never blind-overwrite. If the other device has pushed since we last
    // looked, merge that work in first and upload the union — otherwise
    // whichever device syncs last would silently discard the other's changes.
    try { await mergeIfRemoteNewer(); }
    catch (e) { console.warn('Zusammenführen vor dem Hochladen übersprungen:', e); }
    // Photos go up BEFORE the data blob. The blob is tens of megabytes and can
    // take minutes on a phone; running the image uploads after it meant they
    // met the oldest possible access token and the flakiest part of the sync.
    // The images are also what the daily diagnosis routine actually opens — the
    // blob is useless to it — so they are the part that must not be starved.
    try { await syncPhotos(); } catch (e) { console.warn('Foto-Sync übersprungen:', e); }
    const payload = await buildPayload();
    await uploadContent(JSON.stringify(payload));
    try { setLastRemoteTime(await remoteModified()); } catch (e) {}
    state.meta.lastCloudPush = Date.now();
    save(false);
    // The dossier stays last: it names the photo files the routine will open,
    // so it must describe what actually landed in Drive a moment ago.
    try {
      const ki = await buildDossierPayload(false);
      await uploadKiAkte(JSON.stringify(ki, null, 2));
      state.meta.lastDossierAt = ki.generated;
      save(false);
    } catch (e) { console.warn('KI-Akte-Upload übersprungen:', e); }
  }

  async function adoptRemote(remote) {
    applyingRemote = true;
    try {
      const st = remote.state || remote;
      state = migrateState(st);
      await restorePhotos(remote.photos || {});
      // Same ordering trap as in mergeRemote, and this is the path behind
      // "Aus Cloud laden": the catalogue must be rebuilt from the data we just
      // adopted before cleanupV12 judges which task ids are valid, or it
      // deletes the task history of every custom plant in the incoming copy.
      rebuildCatalog();
      cleanupV12(false);
      resetTsBaseline();
      state.meta.lastCloudPull = Date.now();
      save(false);
      renderAll();
    } finally { applyingRemote = false; }
  }

  // Multi-device reconciliation: a device with no local data adopts the cloud
  // copy wholesale (fresh install); a device that already holds data merges the
  // cloud copy in and pushes the union (pushLocal does the merge).
  async function reconcile() {
    await loadPhotos();
    if (localIsEmpty()) {
      const remote = await downloadRemote();
      if (remoteHasData(remote)) {
        await adoptRemote(remote);
        try { setLastRemoteTime(await remoteModified()); } catch (e) {}
        setStatus('Aus Cloud geladen', 'ok');
      } else { setStatus('Verbunden – noch keine Daten', 'ok'); }
    } else {
      await pushLocal();
      setStatus('Gesichert', 'ok');
    }
    initialSyncDone = true;
    // After the data sync: pick up any AI diagnoses waiting in the inbox.
    // Changes trigger the normal debounced push, so they reach Drive too.
    try { await applyDiagnoses(); } catch (e) { console.warn('KI-Diagnose-Import übersprungen:', e); }
  }

  /* ------------------------------------------------ KI diagnosis inbox ------ */
  // Fetch an image Claude placed in the photos/ folder and return it as a
  // data URL plus its Drive id, or null if it isn't there.
  async function fetchPhotoAsDataUrl(name) {
    await ensurePhotosFolder();
    const found = await driveList(
      "name='" + name + "' and '" + photosFolderId + "' in parents and trashed=false");
    if (!found.length) return null;
    const blob = await (await apiFetch('https://www.googleapis.com/drive/v3/files/' + found[0].id + '?alt=media')).blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result); r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    return { dataUrl: dataUrl, id: found[0].id };
  }

  // Read diagnosis files Claude wrote to Drive and merge unapplied entries into
  // local state via applyKiDiagnosis (app.js). Entry ids are tracked locally so
  // each diagnosis is applied exactly once; duplicate inbox files are harmless.
  async function applyDiagnoses() {
    if (!enabled()) return;
    await ensureFolder();
    const found = await driveList(
      "name='" + DIAG_FILE_NAME + "' and '" + folderId + "' in parents and trashed=false");
    if (!found.length) return;
    // Which inbox entries are already applied is part of the shared state, not
    // this device's localStorage. Kept per-device, each device re-applied every
    // entry the other had already handled, creating a second copy of every
    // finding and orphaning the read markers.
    state.kiApplied = state.kiApplied || {};
    const applied = state.kiApplied;
    try { Object.assign(applied, JSON.parse(localStorage.getItem(LS_DIAG_APPLIED) || '{}') || {}); } catch (e) {}
    let changed = 0;
    found.sort((a, b) => (b.modifiedTime || '').localeCompare(a.modifiedTime || ''));
    for (const f of found) {
      let doc = null;
      try { doc = JSON.parse(await (await apiFetch('https://www.googleapis.com/drive/v3/files/' + f.id + '?alt=media')).text()); }
      catch (e) { console.warn('KI-Diagnose-Datei unlesbar:', e); continue; }
      if (!doc || !Array.isArray(doc.entries)) continue;
      for (const e of doc.entries) {
        if (!e || !e.id || applied[e.id]) continue;
        try { if (await applyKiDiagnosis(e)) changed++; } catch (err) { console.warn('KI-Diagnose übersprungen:', e.id, err); }
        // photo: {file, caption?, cover?} — image Claude uploaded to photos/.
        if (e.photo && e.photo.file) {
          const pid = e.plantId || (e.addPlant && (e.addPlant.id || slugify(e.addPlant.name))) || '';
          try {
            const got = pid ? await fetchPhotoAsDataUrl(e.photo.file) : null;
            if (got) {
              const key = await importKiPhoto(pid, got.dataUrl, e.photo.caption || '', e.photo.cover !== false, e.date);
              if (key) {
                photoIndex[key] = { id: got.id, fp: got.dataUrl.length, name: e.photo.file };
                localStorage.setItem(LS_PHOTO_INDEX, JSON.stringify(photoIndex));
                changed++;
              }
            }
          } catch (err) { console.warn('KI-Foto übersprungen:', e.id, err); }
        }
        applied[e.id] = Date.now();
      }
    }
    localStorage.setItem(LS_DIAG_APPLIED, JSON.stringify(applied));
    state.kiApplied = applied;
    if (changed) { save(false); renderAll(); toast('KI-Diagnose übernommen (' + changed + ')'); }
  }

  /* ------------------------------------------------------------- status UI -- */
  function setStatus(text, kind) { statusText = text; statusKind = kind || 'idle'; renderStatus(); }
  // Drive errors carry the HTTP status and Google's own message; both matter
  // when the failure has to be diagnosed from a phone screen.
  function errText(e) {
    const s = String((e && e.message) || e || 'Unbekannter Fehler');
    return s.length > 300 ? s.slice(0, 300) + ' …' : s;
  }

  function renderStatus() {
    const info = document.getElementById('cloudInfo');
    const btn = document.getElementById('cloudConnectBtn');
    const actions = document.getElementById('cloudActions');
    if (!info) return;
    const last = state.meta && state.meta.lastCloudPush
      ? ' · zuletzt ' + new Date(state.meta.lastCloudPush).toLocaleString('de-AT') : '';
    const icon = statusKind === 'ok' ? '✅' : statusKind === 'busy' ? '⏳'
      : statusKind === 'warn' ? '⚠️' : statusKind === 'error' ? '⛔' : '☁️';
    // Three states, not two. Sync being switched ON and the Google session being
    // VALID are different things, and conflating them produced a button reading
    // "trennen" directly above text asking you to connect — where tapping it
    // silently switched sync off, the opposite of what the text said.
    const needsAuth = enabled() && !tokenValid();
    // A photo that never reached Drive cannot be diagnosed, and used to fail in
    // total silence — one console warning, while the app still said "Gesichert".
    // If images are outstanding, that has to be on screen.
    const waiting = enabled() && photosPending
      ? ` · ⏫ ${photosPending} Foto${photosPending === 1 ? '' : 's'} noch nicht hochgeladen`
        + (lastPhotoError ? ` (${lastPhotoError})` : '') : '';
    // Outstanding photos are appended to BOTH branches: "signed out" and
    // "photos stuck" are different facts, and hiding the second behind the
    // first is how a stalled upload stays invisible.
    info.textContent = (needsAuth
      ? '🔑 Nicht bei Google angemeldet – Daten werden gerade nicht synchronisiert'
      : icon + ' ' + statusText + (enabled() ? last : '')) + waiting;
    if (btn) {
      btn.textContent = !enabled() ? 'Mit Google Drive verbinden'
        : needsAuth ? 'Bei Google anmelden'
        : '✅ Verbunden';
      btn.disabled = enabled() && !needsAuth;
      btn.style.opacity = btn.disabled ? '.65' : '';
    }
    if (actions) actions.style.display = enabled() ? '' : 'none';
  }

  /* ------------------------------------------------------------- controls --- */
  function connect() {
    if (tokenValid()) {                    // already signed in this session
      localStorage.setItem(LS_ENABLED, '1');
      setStatus('Synchronisiere …', 'busy');
      reconcile().then(() => toast('Google Drive verbunden'))
        .catch(e => { console.error(e); setStatus('Verbindung fehlgeschlagen', 'error'); });
      return;
    }
    localStorage.setItem(LS_ENABLED, '1');
    setStatus('Weiterleitung zu Google …', 'busy');
    beginRedirect('connect');              // navigates away, returns with a token
  }

  function disconnect() {
    // Deliberately does NOT revoke the OAuth grant. Under drive.file, write
    // access is granted per file, and revoking drops it for every file the app
    // has ever created — so after "Trennen" and a fresh sign-in, the app could
    // still SEE its own photos (readonly scope) but no longer overwrite them,
    // failing with 403 permanently. "Trennen" means "stop syncing on this
    // device", which clearing the local session achieves in full; it should not
    // quietly orphan the whole Drive archive. Revoking properly belongs in
    // Google's own account settings, where the consequence is stated.
    accessToken = ''; tokenExpiry = 0; initialSyncDone = false;
    sessionStorage.removeItem(SS_TOKEN); sessionStorage.removeItem(SS_TOKEN_EXP);
    localStorage.removeItem(LS_ENABLED);
    setStatus('Nicht verbunden', 'idle');
    toast('Google Drive getrennt');
  }

  async function syncNowInternal() {
    setStatus('Sichere …', 'busy');
    await pushLocal();
    setStatus('Gesichert', 'ok');
  }

  function syncNow() {
    if (!enabled()) return connect();
    if (!tokenValid()) { setStatus('Weiterleitung zu Google …', 'busy'); return beginRedirect('sync'); }
    syncNowInternal().then(() => toast('In Google Drive gesichert'))
      .catch(e => { console.error(e); setStatus('Sicherung fehlgeschlagen', 'error'); alert('Sicherung fehlgeschlagen:\n' + (e.message || e)); });
  }

  function pullNow() {
    if (!enabled()) return;
    if (!tokenValid()) { setStatus('Weiterleitung zu Google …', 'busy'); return beginRedirect('pull'); }
    if (!confirm('Daten aus Google Drive laden? Die lokalen Daten werden dabei durch die Cloud-Version ersetzt.')) return;
    (async () => {
      try {
        setStatus('Lade …', 'busy');
        const remote = await downloadRemote();
        if (!remote) { setStatus('Keine Cloud-Daten gefunden', 'warn'); return alert('In Google Drive wurde noch keine Sicherung gefunden.'); }
        await adoptRemote(remote);
        setStatus('Aus Cloud geladen', 'ok'); toast('Daten aus Google Drive geladen');
      } catch (e) { console.error(e); setStatus('Laden fehlgeschlagen', 'error'); alert('Laden fehlgeschlagen:\n' + (e.message || e)); }
    })();
  }

  /* ------------------------------------------------- change hook (from save) */
  function onLocalChange() {
    if (!enabled() || !initialSyncDone || applyingRemote) return;
    if (!tokenValid()) { setStatus('Nicht gesichert – „Sichern & syncen" antippen', 'warn'); return; }
    clearTimeout(uploadTimer);
    setStatus('Änderung erkannt …', 'busy');
    uploadTimer = setTimeout(() => {
      pushLocal().then(() => setStatus('Gesichert', 'ok'))
        .catch(e => { console.error(e); setStatus('Nicht gesichert – „Sichern & syncen" antippen', 'warn'); });
    }, UPLOAD_DEBOUNCE);
  }

  /* ---------------------------------------------- background flush (iOS) ---- */
  // iOS never fires a "terminating" event for PWAs. Going to background is the
  // last reliable moment — if a debounced upload is still pending, fire it now.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    if (!enabled() || !initialSyncDone || applyingRemote || !tokenValid()) return;
    if (!uploadTimer) return;                            // nothing pending
    clearTimeout(uploadTimer); uploadTimer = null;
    pushLocal().then(() => setStatus('Gesichert', 'ok'))
      .catch(e => { console.warn('Hintergrund-Sicherung', e); setStatus('Nicht gesichert – „Sichern & syncen" antippen', 'warn'); });
  });

  /* -------------------------------------------------------------- startup --- */
  async function init() {
    renderStatus();
    // Finish an action that triggered a redirect to Google.
    if (pendingResume) {
      localStorage.setItem(LS_ENABLED, '1');
      const action = pendingResume; pendingResume = '';
      try {
        if (action === 'pull') {
          const remote = await downloadRemote();
          if (remote) { await adoptRemote(remote); setStatus('Aus Cloud geladen', 'ok'); toast('Daten aus Google Drive geladen'); }
          else setStatus('Keine Cloud-Daten gefunden', 'warn');
        } else {
          await reconcile();
          toast(action === 'connect' ? 'Google Drive verbunden' : 'In Google Drive gesichert');
        }
      } catch (e) {
        // Never swallow the reason. This runs on a phone, where the console is
        // unreachable — a bare "fehlgeschlagen" leaves the user with nothing to
        // act on and nobody able to help them from the outside.
        console.error(e);
        setStatus('Synchronisierung fehlgeschlagen: ' + errText(e), 'error');
        alert('Synchronisierung fehlgeschlagen:\n\n' + errText(e));
      }
      return;
    }
    if (!enabled()) return;
    if (tokenValid()) {
      setStatus('Synchronisiere …', 'busy');
      try { await reconcile(); } catch (e) { console.warn(e); setStatus('Zum Fortsetzen „Mit Google Drive verbinden" antippen', 'warn'); }
    } else {
      setStatus('Zum Fortsetzen „Mit Google Drive verbinden" antippen', 'warn');
    }
  }

  // _mergeStates is exported for verification: the merge is the one place where
  // a bug silently destroys data, so it must be testable without a live Drive.
  window.CloudSync = { init, onLocalChange, renderStatus, _mergeStates: mergeStates,
    _syncPhotos: syncPhotos, _photoUploadQueue: photoUploadQueue,
    _photoIndex: () => photoIndex, _photosPending: () => photosPending,
    _uploadPhotoFile: uploadPhotoFile,
    _setTestSession: (tok, photosFolder) => {          // tests only
      accessToken = tok; tokenExpiry = Date.now() + 3600e3; photosFolderId = photosFolder;
    } };
  window.cloudConnect = connect;
  // The primary button now only ever connects or re-authenticates; disconnecting
  // moved to its own button among the sync actions, so it cannot be hit by
  // someone following an instruction to sign in.
  window.cloudDisconnect = () => (enabled() && tokenValid() ? undefined : connect());
  window.cloudForceDisconnect = () => {
    if (confirm('Google Drive trennen? Die Daten auf diesem Gerät bleiben erhalten, werden aber nicht mehr synchronisiert.')) disconnect();
  };
  window.cloudSyncNow = syncNow;
  window.cloudPullNow = pullNow;
})();
