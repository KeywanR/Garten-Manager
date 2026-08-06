/* Photo identity: one image, one Drive file.  Run with `node test-photo-identity.js`.

   The app stores the same image under several keys on purpose — filing an inbox
   photo under a plant copies it to the cover key, a restored cover is written
   again as a timeline entry. Each copy used to get its own Drive file, and since
   the diagnosis run remembers what it has assessed as a list of FILENAMES, each
   copy read as a photo it had never seen. On 6 Aug that re-diagnosed nine July
   photos in one run. These cases pin the fix: identical bytes share one file,
   different bytes never do, and an aliased key that later changes takes a file
   of its own instead of overwriting the one it was borrowing.

   Stub environment — no Drive, no DOM. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, 'cloud-sync.js');

function makeEnv(photoIndex, photoCache) {
  const store = { gm_drive_photo_index: JSON.stringify(photoIndex) };
  const ctx = {
    console,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    sessionStorage: {
      getItem: () => null, setItem: () => {}, removeItem: () => {},
    },
    atob: s => Buffer.from(String(s), 'base64').toString('binary'),
    Blob: class { constructor(parts, opts) { this.type = (opts || {}).type || ''; } },
    Uint8Array,
    document: {
      getElementById: () => null,
      addEventListener: () => {},
      readyState: 'complete',
    },
    location: { hash: '', href: 'https://example.invalid/', origin: 'https://example.invalid' },
    navigator: { onLine: true },
    setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: async () => { throw new Error('no network in test'); },
    // app.js globals cloud-sync depends on
    state: { photoMeta: {} },
    photoCache,
    normalizeState: s => s, restorePhotos: async () => 0, putPhoto: async () => {},
    cleanupV12: () => {}, save: () => {}, renderAll: () => {}, toast: () => {},
    loadPhotos: async () => {},
    gmPhotoFileName: (key, date, dataUrl) =>
      String(key).replace(/[^a-zA-Z0-9_-]+/g, '_') + (date ? '_' + date : '') + '.jpg',
    plant: () => null, plants: [], today: () => '2026-08-06',
    applyKiDiagnosis: async () => false, removePhoto: async () => {},
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx, { filename: 'cloud-sync.js' });
  return { ctx, store };
}

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('  PASS  ' + name); }
  else { failures++; console.log('  FAIL  ' + name + (detail ? '\n        ' + detail : '')); }
}

/* ---- Case 1: the actual 6 Aug bug ------------------------------------------
   An inbox photo was assessed as inbox_..._2026-08-04.jpg. Filing it under a
   plant copied the same bytes to the cover key, which got its own Drive file
   and was re-diagnosed. After the fix the cover key must report the filename
   that was already assessed. */
{
  console.log('\nCase 1: cover copy of an assessed inbox photo');
  const bytes = 'data:image/jpeg;base64,' + 'A'.repeat(536276 - 23);
  const photoCache = {
    'inbox|1785818847843|bdcvy': bytes,
    'hortensie-terracotta-kuebel': bytes,     // byte-identical cover copy
  };
  const index = {
    'inbox|1785818847843|bdcvy': { id: 'drive-1', fp: bytes.length, name: 'inbox_1785818847843_bdcvy_2026-08-04.jpg' },
    'hortensie-terracotta-kuebel': { id: 'drive-2', fp: bytes.length, name: 'hortensie-terracotta-kuebel_2026-08-04.jpg' },
  };
  const { ctx } = makeEnv(index, photoCache);
  const n = ctx.window.CloudSync._dedupePhotoIndex();
  const idx = ctx.window.CloudSync._photoIndex();
  check('one entry collapsed', n === 1, 'got ' + n);
  check('both keys now name one file',
    idx['inbox|1785818847843|bdcvy'].name === idx['hortensie-terracotta-kuebel'].name,
    JSON.stringify(idx, null, 1));
  check('both keys point at one Drive id',
    idx['inbox|1785818847843|bdcvy'].id === idx['hortensie-terracotta-kuebel'].id);
  check('canon is deterministic (smallest name wins)',
    idx['hortensie-terracotta-kuebel'].name === 'hortensie-terracotta-kuebel_2026-08-04.jpg');
  check('the alias is flagged', idx['inbox|1785818847843|bdcvy'].alias === true);
  check('neither key is left needing upload',
    ctx.window.CloudSync._photoUploadQueue().length === 0,
    JSON.stringify(ctx.window.CloudSync._photoUploadQueue()));
}

/* ---- Case 2: the 3 Aug rename ---------------------------------------------
   Same key, undated legacy file plus dated re-upload. */
{
  console.log('\nCase 2: legacy undated file and its dated twin');
  const bytes = 'data:image/jpeg;base64,' + 'B'.repeat(651552 - 23);
  const photoCache = { 'timeline|karfiol|1784395830971': bytes, 'karfiol': bytes };
  const index = {
    'timeline|karfiol|1784395830971': { id: 'd-old', fp: bytes.length, name: 'timeline_karfiol_1784395830971.jpg' },
    'karfiol': { id: 'd-new', fp: bytes.length, name: 'timeline_karfiol_1784395830971_2026-07-18.jpg' },
  };
  const { ctx } = makeEnv(index, photoCache);
  ctx.window.CloudSync._dedupePhotoIndex();
  const idx = ctx.window.CloudSync._photoIndex();
  check('collapsed onto the undated original',
    idx['karfiol'].name === 'timeline_karfiol_1784395830971.jpg', JSON.stringify(idx));
}

/* ---- Case 3: genuinely different images must NOT be merged ---------------- */
{
  console.log('\nCase 3: two different photos of the same byte length');
  const a = 'data:image/jpeg;base64,' + 'A'.repeat(500);
  const b = 'data:image/jpeg;base64,' + 'C'.repeat(500);   // same length, different bytes
  const photoCache = { 'k1': a, 'k2': b };
  const index = {
    'k1': { id: 'd1', fp: a.length, name: 'k1_2026-08-01.jpg' },
    'k2': { id: 'd2', fp: b.length, name: 'k2_2026-08-01.jpg' },
  };
  const { ctx } = makeEnv(index, photoCache);
  const n = ctx.window.CloudSync._dedupePhotoIndex();
  const idx = ctx.window.CloudSync._photoIndex();
  check('nothing merged', n === 0, 'got ' + n);
  check('k1 keeps its own file', idx['k1'].id === 'd1' && idx['k2'].id === 'd2');
}

/* ---- Case 4: idempotence — a second device must not fight the first ------- */
{
  console.log('\nCase 4: repeated runs converge');
  const bytes = 'data:image/jpeg;base64,' + 'D'.repeat(1000);
  const photoCache = { 'zzz': bytes, 'aaa': bytes, 'mmm': bytes };
  const index = {
    'zzz': { id: 'd3', fp: bytes.length, name: 'zzz.jpg' },
    'aaa': { id: 'd1', fp: bytes.length, name: 'aaa.jpg' },
    'mmm': { id: 'd2', fp: bytes.length, name: 'mmm.jpg' },
  };
  const { ctx } = makeEnv(index, photoCache);
  const first = ctx.window.CloudSync._dedupePhotoIndex();
  const second = ctx.window.CloudSync._dedupePhotoIndex();
  const idx = ctx.window.CloudSync._photoIndex();
  check('first run collapses the other two', first === 2, 'got ' + first);
  check('second run is a no-op', second === 0, 'got ' + second);
  check('all three share the canon',
    idx.zzz.name === 'aaa.jpg' && idx.mmm.name === 'aaa.jpg' && idx.aaa.name === 'aaa.jpg',
    JSON.stringify(idx));
}

/* ---- Case 5: a replaced cover must never PATCH the file it aliases -------- */
{
  console.log('\nCase 5: changed bytes under an aliased key');
  const bytes = 'data:image/jpeg;base64,' + 'E'.repeat(1000);
  const replaced = 'data:image/jpeg;base64,' + 'F'.repeat(2000);
  const photoCache = { 'orig': bytes, 'cover': replaced };
  const index = {
    'orig': { id: 'shared', fp: bytes.length, name: 'orig.jpg' },
    'cover': { id: 'shared', fp: bytes.length, name: 'orig.jpg', alias: true },
  };
  const { ctx } = makeEnv(index, photoCache);
  const q = ctx.window.CloudSync._photoUploadQueue();
  check('the replaced cover is queued for its own upload',
    q.includes('cover') && !q.includes('orig'), JSON.stringify(q));

  // Drive calls are stubbed out; we only care that it does not reuse 'shared'.
  let created = 0, patched = [];
  ctx.window.CloudSync._setTestSession('tok', 'photos-folder');
  ctx.fetch = async (url, opts) => {
    if (String(url).includes('/upload/drive/v3/files/')) {
      patched.push(String(url).split('/files/')[1].split('?')[0]);
      return { ok: true, status: 200, json: async () => ({ id: 'x' }), text: async () => '' };
    }
    if (opts && opts.method === 'POST') {
      created++;
      return { ok: true, status: 200, json: async () => ({ id: 'fresh-file' }), text: async () => '' };
    }
    return { ok: true, status: 200, json: async () => ({ files: [] }), text: async () => '' };
  };
  return ctx.window.CloudSync._uploadPhotoFile('cover', replaced).then(() => {
    const idx = ctx.window.CloudSync._photoIndex();
    check('a fresh file was created, not the shared one reused', created === 1, 'created=' + created);
    check('the shared file was never patched', !patched.includes('shared'), JSON.stringify(patched));
    check('the alias flag is gone', !idx.cover.alias, JSON.stringify(idx.cover));
    check("the original key still owns its file", idx.orig.id === 'shared');
    finish();
  }).catch(e => { failures++; console.log('  FAIL  case 5 threw: ' + e.message); finish(); });
}

function finish() {
  console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all checks passed'));
  process.exit(failures ? 1 : 0);
}
