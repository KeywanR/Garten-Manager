/* ============================================================================
   Mein Garten – Google Drive Cloud-Sync
   Optional, offline-first. Stores the full backup payload (state + photos)
   as a single JSON file in a visible "Garten-Manager" folder in the user's
   Google Drive, so the data is reachable from any device and from the PC.

   Auth: Google Identity Services token flow (no backend, no client secret).
   Scope: drive.file — the app can only see files it created itself.
   Sync model: iPad is the source of truth. On change → debounced upload.
   On startup → pull; adopt the cloud copy if it is newer or this device is
   empty (e.g. Safari cleared its storage). Single editor → no merge needed.

   Depends on app.js globals: state, buildPayload, migrateState,
   restorePhotos, cleanupV12, save, renderAll, toast, photoCache.
   ========================================================================== */
(function () {
  const CLIENT_ID = '1025384887951-8ckp0ehbqj6v9e6u6n0nrl9m4sult7ts.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const FOLDER_NAME = 'Garten-Manager';
  const FILE_NAME = 'gartenmanager-data.json';
  const LS_ENABLED = 'gm_cloud_enabled';
  const LS_FOLDER = 'gm_drive_folder_id';
  const LS_FILE = 'gm_drive_file_id';
  const UPLOAD_DEBOUNCE = 4000;

  let tokenClient = null;
  let accessToken = '';
  let tokenExpiry = 0;
  let pendingToken = null;          // {resolve,reject} for an in-flight token request
  let folderId = localStorage.getItem(LS_FOLDER) || '';
  let fileId = localStorage.getItem(LS_FILE) || '';
  let uploadTimer = null;
  let initialSyncDone = false;
  let applyingRemote = false;       // suppress push while adopting a remote copy
  let statusText = 'Nicht verbunden';
  let statusKind = 'idle';          // idle | ok | busy | warn | error

  const enabled = () => localStorage.getItem(LS_ENABLED) === '1';

  /* ------------------------------------------------------------- GIS load --- */
  function waitForGis(timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      (function poll() {
        if (window.google && google.accounts && google.accounts.oauth2) return resolve();
        if (Date.now() - t0 > timeoutMs) return reject(new Error('Google-Anmeldedienst nicht geladen'));
        setTimeout(poll, 150);
      })();
    });
  }

  function ensureTokenClient() {
    if (tokenClient) return;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp && resp.access_token) {
          accessToken = resp.access_token;
          tokenExpiry = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
          if (pendingToken) pendingToken.resolve(accessToken);
        } else if (pendingToken) {
          pendingToken.reject(new Error(resp && resp.error ? resp.error : 'Kein Zugriffstoken erhalten'));
        }
        pendingToken = null;
      },
      error_callback: (err) => {
        if (pendingToken) pendingToken.reject(new Error(err && err.type ? err.type : 'Anmeldung abgebrochen'));
        pendingToken = null;
      }
    });
  }

  // interactive=false → silent renewal (only works with a live Google session)
  function requestToken(interactive) {
    return new Promise((resolve, reject) => {
      ensureTokenClient();
      pendingToken = { resolve, reject };
      try {
        tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
      } catch (e) {
        pendingToken = null;
        reject(e);
      }
    });
  }

  async function getToken(interactive) {
    if (accessToken && Date.now() < tokenExpiry) return accessToken;
    await waitForGis();
    return requestToken(interactive);
  }

  /* ------------------------------------------------------------- Drive API -- */
  async function apiFetch(url, opts = {}, interactive = false) {
    const token = await getToken(interactive);
    const headers = Object.assign({}, opts.headers, { Authorization: 'Bearer ' + token });
    let res = await fetch(url, Object.assign({}, opts, { headers }));
    if (res.status === 401) {                 // token rejected → refresh once
      accessToken = ''; tokenExpiry = 0;
      const fresh = await getToken(interactive);
      headers.Authorization = 'Bearer ' + fresh;
      res = await fetch(url, Object.assign({}, opts, { headers }));
    }
    if (!res.ok) throw new Error('Drive API ' + res.status + ': ' + (await res.text().catch(() => '')));
    return res;
  }

  async function driveList(query) {
    const url = 'https://www.googleapis.com/drive/v3/files'
      + '?q=' + encodeURIComponent(query)
      + '&fields=' + encodeURIComponent('files(id,name,modifiedTime)')
      + '&spaces=drive&pageSize=10';
    const res = await apiFetch(url);
    return (await res.json()).files || [];
  }

  async function ensureFolder() {
    if (folderId) return folderId;
    const found = await driveList(
      "name='" + FOLDER_NAME + "' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    if (found.length) { folderId = found[0].id; }
    else {
      const res = await apiFetch('https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
      });
      folderId = (await res.json()).id;
    }
    localStorage.setItem(LS_FOLDER, folderId);
    return folderId;
  }

  // Resolve the data file id (may stay '' if it does not exist yet).
  async function ensureFileRef() {
    await ensureFolder();
    if (fileId) {
      // verify it still exists (not trashed / deleted on the web)
      try { await apiFetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?fields=id,trashed'); return fileId; }
      catch (e) { fileId = ''; localStorage.removeItem(LS_FILE); }
    }
    const found = await driveList(
      "name='" + FILE_NAME + "' and '" + folderId + "' in parents and trashed=false");
    if (found.length) { fileId = found[0].id; localStorage.setItem(LS_FILE, fileId); }
    return fileId;
  }

  async function uploadContent(content) {
    await ensureFolder();
    const boundary = 'gm_boundary_' + Math.random().toString(36).slice(2);
    const meta = fileId
      ? { name: FILE_NAME, mimeType: 'application/json' }
      : { name: FILE_NAME, mimeType: 'application/json', parents: [folderId] };
    const body =
      '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(meta) +
      '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' +
      content +
      '\r\n--' + boundary + '--';
    const url = fileId
      ? 'https://www.googleapis.com/upload/drive/v3/files/' + fileId + '?uploadType=multipart&fields=id'
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
    const res = await apiFetch(url, {
      method: fileId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body
    });
    const out = await res.json();
    if (out.id) { fileId = out.id; localStorage.setItem(LS_FILE, fileId); }
  }

  async function downloadRemote() {
    if (!(await ensureFileRef())) return null;
    const res = await apiFetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media');
    const text = await res.text();
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  /* --------------------------------------------------------- sync actions --- */
  function localIsEmpty() {
    const s = state || {};
    const noHist = !Array.isArray(s.history) || s.history.length === 0;
    const noObs = !Array.isArray(s.observations) || s.observations.length === 0;
    const noProf = !s.profiles || Object.keys(s.profiles).length === 0;
    const noPhotos = !photoCache || Object.keys(photoCache).length === 0;
    return noHist && noObs && noProf && noPhotos;
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
    const payload = await buildPayload();               // {state, photos, checksum, ...}
    await uploadContent(JSON.stringify(payload));
    state.meta.lastCloudPush = Date.now();
    save(false);
  }

  async function adoptRemote(remote) {
    applyingRemote = true;
    try {
      const st = remote.state || remote;
      state = migrateState(st);
      await restorePhotos(remote.photos || {});
      cleanupV12(true);
      state.meta.lastCloudPull = Date.now();
      save(false);
      renderAll();
    } finally { applyingRemote = false; }
  }

  // Startup reconciliation. Single-editor model: this device (iPad) is the
  // source of truth. Only ever PULL when this device has no real data of its
  // own (fresh install or Safari cleared its storage) — recency alone must
  // never let an emptier cloud copy overwrite real local data.
  async function reconcile() {
    await loadPhotos();                     // make sure photoCache reflects IndexedDB
    const remote = await downloadRemote();
    if (localIsEmpty()) {
      if (remoteHasData(remote)) { await adoptRemote(remote); setStatus('Aus Cloud geladen', 'ok'); }
      else { setStatus('Verbunden – noch keine Daten', 'ok'); }   // both empty → never push empty
    } else {
      await pushLocal();                    // local has data → update the cloud, never pull over it
      setStatus('Gesichert', 'ok');
    }
    initialSyncDone = true;
  }

  /* ------------------------------------------------------------- status UI -- */
  function setStatus(text, kind) { statusText = text; statusKind = kind || 'idle'; renderStatus(); }

  function renderStatus() {
    const info = document.getElementById('cloudInfo');
    const btn = document.getElementById('cloudConnectBtn');
    const actions = document.getElementById('cloudActions');
    if (!info) return;
    const last = state.meta && state.meta.lastCloudPush
      ? ' · zuletzt ' + new Date(state.meta.lastCloudPush).toLocaleString('de-AT') : '';
    const icon = statusKind === 'ok' ? '✅' : statusKind === 'busy' ? '⏳'
      : statusKind === 'warn' ? '⚠️' : statusKind === 'error' ? '⛔' : '☁️';
    info.textContent = icon + ' ' + statusText + (enabled() ? last : '');
    if (btn) btn.textContent = enabled() ? 'Google Drive trennen' : 'Mit Google Drive verbinden';
    if (actions) actions.style.display = enabled() ? '' : 'none';
  }

  /* ------------------------------------------------------------- controls --- */
  async function connect() {
    try {
      setStatus('Verbinde …', 'busy');
      await getToken(true);                 // interactive consent
      localStorage.setItem(LS_ENABLED, '1');
      setStatus('Erste Synchronisierung …', 'busy');
      await reconcile();
      toast('Google Drive verbunden');
    } catch (e) {
      console.error(e);
      setStatus('Verbindung fehlgeschlagen', 'error');
      alert('Die Verbindung zu Google Drive ist fehlgeschlagen:\n' + (e.message || e));
    }
  }

  function disconnect() {
    if (accessToken && window.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(accessToken, () => {}); } catch (e) {}
    }
    accessToken = ''; tokenExpiry = 0; initialSyncDone = false;
    localStorage.removeItem(LS_ENABLED);
    setStatus('Nicht verbunden', 'idle');
    toast('Google Drive getrennt');
  }

  async function syncNow() {
    if (!enabled()) return connect();
    try { setStatus('Sichere …', 'busy'); await pushLocal(); setStatus('Gesichert', 'ok'); toast('In Google Drive gesichert'); }
    catch (e) { console.error(e); setStatus('Sicherung fehlgeschlagen', 'error'); alert('Sicherung fehlgeschlagen:\n' + (e.message || e)); }
  }

  async function pullNow() {
    if (!enabled()) return;
    if (!confirm('Daten aus Google Drive laden? Die lokalen Daten werden dabei durch die Cloud-Version ersetzt.')) return;
    try {
      setStatus('Lade …', 'busy');
      const remote = await downloadRemote();
      if (!remote) { setStatus('Keine Cloud-Daten gefunden', 'warn'); return alert('In Google Drive wurde noch keine Sicherung gefunden.'); }
      await adoptRemote(remote);
      setStatus('Aus Cloud geladen', 'ok'); toast('Daten aus Google Drive geladen');
    } catch (e) { console.error(e); setStatus('Laden fehlgeschlagen', 'error'); alert('Laden fehlgeschlagen:\n' + (e.message || e)); }
  }

  /* ------------------------------------------------- change hook (from save) */
  function onLocalChange() {
    if (!enabled() || !initialSyncDone || applyingRemote) return;
    clearTimeout(uploadTimer);
    setStatus('Änderung erkannt …', 'busy');
    uploadTimer = setTimeout(async () => {
      try { await pushLocal(); setStatus('Gesichert', 'ok'); }
      catch (e) { console.error(e); setStatus('Sicherung wartet (offline?)', 'warn'); }
    }, UPLOAD_DEBOUNCE);
  }

  /* -------------------------------------------------------------- startup --- */
  async function init() {
    renderStatus();
    if (!enabled()) return;
    try {
      setStatus('Verbinde …', 'busy');
      await getToken(false);                // silent renewal
      setStatus('Synchronisiere …', 'busy');
      await reconcile();
    } catch (e) {
      console.warn('Cloud-Sync: stille Anmeldung nicht möglich', e);
      setStatus('Zum Fortsetzen erneut verbinden', 'warn');
    }
  }

  window.CloudSync = { init, onLocalChange, renderStatus };
  window.cloudConnect = connect;
  window.cloudDisconnect = () => (enabled() ? disconnect() : connect());
  window.cloudSyncNow = syncNow;
  window.cloudPullNow = pullNow;
})();
