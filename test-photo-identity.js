/* Photo identity and payload split.  Run with `node test-photo-identity.js`.

   Two related invariants are pinned here.

   ONE IMAGE, ONE DRIVE FILE. The app stores the same image under several keys on
   purpose - filing an inbox photo copies it to the cover key, a restored cover is
   written again as a timeline entry. Each copy used to get its own Drive file,
   and since the diagnosis run remembers what it has assessed as a list of
   FILENAMES, each copy read as a photo it had never seen. On 6 Aug that
   re-diagnosed nine July photos in one run.

   EVERY PHOTO IS IN DRIVE OR IN THE PAYLOAD, NEVER NEITHER. The cloud payload no
   longer carries base64 images for photos confirmed present in Drive. "Confirmed"
   has to mean something exact, or a photo can be dropped from the payload while
   not actually being anywhere. The predicate tests below are the ones that matter
   most in this file: if they pass wrongly, data is lost silently.

   Stub environment - no Drive, no DOM. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CLOUD_SRC = path.join(__dirname, 'cloud-sync.js');
const APP_SRC = path.join(__dirname, 'app.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('  PASS  ' + name); }
  else { failures++; console.log('  FAIL  ' + name + (detail ? '\n        ' + detail : '')); }
}
function section(t) { console.log('\n' + t); }

/* ---------------------------------------------------------------- harness --- */
function makeEnv(photoIndex, photoCache, photoMeta, fetchImpl) {
  const store = { gm_drive_photo_index: JSON.stringify(photoIndex) };
  const ctx = {
    console,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    atob: s => Buffer.from(String(s), 'base64').toString('binary'),
    Blob: class { constructor(parts, opts) { this.type = (opts || {}).type || ''; } },
    Uint8Array,
    FileReader: class {
      readAsDataURL(blob) { setTimeout(() => { this.result = blob.__dataUrl; this.onload(); }, 0); }
    },
    document: { getElementById: () => null, addEventListener: () => {}, readyState: 'complete' },
    location: { hash: '', href: 'https://example.invalid/', origin: 'https://example.invalid' },
    navigator: { onLine: true },
    setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: fetchImpl || (async () => { throw new Error('no network in test'); }),
    // app.js globals cloud-sync leans on
    state: { photoMeta: photoMeta || {} },
    photoCache,
    normalizeState: s => s, restorePhotos: async () => 0,
    putPhoto: async (k, d) => { photoCache[k] = d; },
    removePhoto: async k => { delete photoCache[k]; },
    cleanupV12: () => {}, save: () => {}, renderAll: () => {}, toast: () => {},
    loadPhotos: async () => {},
    gmPhotoFileName: (key, date, dataUrl) =>
      String(key).replace(/[^a-zA-Z0-9_-]+/g, '_') + (date ? '_' + date : '') + '.jpg',
    plant: () => null, plants: [], today: () => '2026-08-07',
    applyKiDiagnosis: async () => false,
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(CLOUD_SRC, 'utf8'), ctx, { filename: 'cloud-sync.js' });
  return { ctx, store };
}

/* The payload predicate lives in app.js, which is far too DOM-bound to load
   whole. Pull the two functions that decide omission out of the real source and
   run those - the point is to test the shipped text, not a paraphrase of it. */
function loadOmissionPredicate(state, photoIndex) {
  const src = fs.readFileSync(APP_SRC, 'utf8');
  const grab = name => {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('not found in app.js: ' + name);
    let depth = 0, started = false;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') { depth++; started = true; }
      else if (src[j] === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
    }
    throw new Error('unbalanced: ' + name);
  };
  const ctx = {
    state,
    localStorage: { getItem: () => JSON.stringify(photoIndex) },
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(grab('gmPhotoInDrive') + '\n' + grab('gmPhotoSafeToOmit'), ctx);
  return ctx.gmPhotoSafeToOmit;
}

const img = (ch, n) => 'data:image/jpeg;base64,' + ch.repeat(n);

(async function main() {

  /* ============================ payload omission ========================== */
  section('Omission predicate: a photo may leave the payload only if Drive has it');
  {
    const bytes = img('A', 500);
    const state = { photoMeta: {
      confirmed:  { plantId: 'p', file: 'confirmed_2026-08-01.jpg' },
      unstamped:  { plantId: 'p' },                                  // no .file
      changed:    { plantId: 'p', file: 'changed_2026-08-01.jpg' },
      nevershipped: { plantId: 'p', file: 'ghost.jpg' },
    } };
    const index = {
      confirmed: { id: 'd1', fp: bytes.length, name: 'confirmed_2026-08-01.jpg' },
      unstamped: { id: 'd2', fp: bytes.length, name: 'unstamped_2026-08-01.jpg' },
      changed:   { id: 'd3', fp: 999999,       name: 'changed_2026-08-01.jpg' },
      // nevershipped: deliberately absent from the index
    };
    const safe = loadOmissionPredicate(state, index);

    check('confirmed in Drive AND stamped -> omit', safe('confirmed', bytes) === true);
    check('uploaded but photoMeta.file missing -> keep in payload',
      safe('unstamped', bytes) === false,
      'without .file another device cannot name the file, so the bytes must travel');
    check('bytes changed since upload -> keep in payload',
      safe('changed', bytes) === false,
      'fingerprint mismatch means Drive holds a DIFFERENT image under that name');
    check('stamped but never actually uploaded -> keep in payload',
      safe('nevershipped', bytes) === false,
      'no index record means no proof it ever reached Drive');
    check('unknown key -> keep in payload', safe('mystery', bytes) === false);
  }

  /* ======================= stamping the drive filename ==================== */
  section('uploadPhotoFile records the Drive filename in synced state');
  {
    const bytes = img('B', 800);
    const photoCache = { 'inbox|1|x': bytes };
    const photoMeta = { 'inbox|1|x': { plantId: '', date: '2026-08-07' } };
    let created = 0;
    const fetchImpl = async (url, opts) => {
      if (String(url).includes('/upload/drive/v3/files/'))
        return { ok: true, status: 200, json: async () => ({ id: 'x' }), text: async () => '' };
      if (opts && opts.method === 'POST') { created++;
        return { ok: true, status: 200, json: async () => ({ id: 'newfile' }), text: async () => '' }; }
      return { ok: true, status: 200, json: async () => ({ files: [] }), text: async () => '' };
    };
    const { ctx } = makeEnv({}, photoCache, photoMeta, fetchImpl);
    ctx.window.CloudSync._setTestSession('tok', 'photos-folder');
    await ctx.window.CloudSync._uploadPhotoFile('inbox|1|x', bytes);
    const m = ctx.state.photoMeta['inbox|1|x'];
    check('photoMeta.file set to the uploaded name', m.file === 'inbox_1_x_2026-08-07.jpg',
      JSON.stringify(m));
    check('photoMeta.driveId recorded', m.driveId === 'newfile', JSON.stringify(m));
    check('a file was actually created', created === 1);
  }

  section('An aliased key is stamped with the file it shares, not one of its own');
  {
    const bytes = img('C', 900);
    const photoCache = { orig: bytes, cover: bytes };   // byte-identical
    const photoMeta = { orig: { date: '2026-08-01' }, cover: { date: '2026-08-07' } };
    const index = { orig: { id: 'shared', fp: bytes.length, name: 'orig_2026-08-01.jpg' } };
    const { ctx } = makeEnv(index, photoCache, photoMeta);
    ctx.window.CloudSync._setTestSession('tok', 'photos-folder');
    await ctx.window.CloudSync._uploadPhotoFile('cover', bytes);
    const m = ctx.state.photoMeta.cover;
    check('alias stamped with the twin file name', m.file === 'orig_2026-08-01.jpg', JSON.stringify(m));
    check('alias stamped with the twin drive id', m.driveId === 'shared', JSON.stringify(m));
    check('no upload attempted for the alias',
      ctx.window.CloudSync._photoIndex().cover.alias === true);
  }

  section('Backfill stamps photos uploaded before the name was recorded');
  {
    const bytes = img('D', 400);
    const photoCache = { old1: bytes, old2: bytes };
    const photoMeta = { old1: {}, old2: { file: 'already.jpg', driveId: 'zz' } };
    const index = {
      old1: { id: 'a1', fp: bytes.length, name: 'old1_2026-07-01.jpg' },
      old2: { id: 'zz', fp: bytes.length, name: 'already.jpg' },
    };
    const { ctx } = makeEnv(index, photoCache, photoMeta);
    const n1 = ctx.window.CloudSync._backfillPhotoFiles();
    const n2 = ctx.window.CloudSync._backfillPhotoFiles();
    check('one entry backfilled', n1 === 1, 'got ' + n1);
    check('old1 got its name', ctx.state.photoMeta.old1.file === 'old1_2026-07-01.jpg');
    check('already-stamped entry untouched', ctx.state.photoMeta.old2.file === 'already.jpg');
    check('second run is a no-op', n2 === 0, 'got ' + n2);
  }

  /* ====================== fetching what the payload omits ================= */
  section('A device without the bytes fetches them from photos/');
  {
    const have = img('E', 300);
    const photoCache = { present: have };
    const photoMeta = {
      present: { file: 'present.jpg' },
      missing: { file: 'missing.jpg' },
      nofile:  { plantId: 'p' },              // nothing to fetch by
    };
    const wantUrl = 'data:image/jpeg;base64,' + 'F'.repeat(700);
    let listed = [], downloaded = 0;
    const fetchImpl = async (url) => {
      const u = String(url);
      if (u.includes('/drive/v3/files?q=')) {
        listed.push(decodeURIComponent(u));
        return { ok: true, status: 200, json: async () => ({ files: [{ id: 'remote1', name: 'missing.jpg' }] }) };
      }
      if (u.includes('alt=media')) {
        downloaded++;
        const b = new (class {})(); b.__dataUrl = wantUrl;
        return { ok: true, status: 200, blob: async () => b };
      }
      return { ok: true, status: 200, json: async () => ({ files: [] }), text: async () => '' };
    };
    const { ctx } = makeEnv({}, photoCache, photoMeta, fetchImpl);
    ctx.window.CloudSync._setTestSession('tok', 'photos-folder');
    const n = await ctx.window.CloudSync._fetchMissingPhotos();
    check('one photo fetched', n === 1, 'got ' + n);
    check('the missing image is now local', photoCache.missing === wantUrl);
    check('the photo already held was not re-fetched', downloaded === 1, 'downloads=' + downloaded);
    check('a key with no .file is skipped', !('nofile' in photoCache));
    check('index updated so it is not fetched again',
      ctx.window.CloudSync._photoIndex().missing.name === 'missing.jpg');
  }

  section('One unreachable file does not cost the rest of the batch');
  {
    const photoMeta = { bad: { file: 'bad.jpg' }, good: { file: 'good.jpg' } };
    const photoCache = {};
    const wantUrl = 'data:image/jpeg;base64,' + 'G'.repeat(200);
    const fetchImpl = async (url) => {
      const u = String(url);
      if (u.includes('/drive/v3/files?q=')) {
        if (u.includes('bad.jpg')) throw new Error('network go boom');
        return { ok: true, status: 200, json: async () => ({ files: [{ id: 'g1', name: 'good.jpg' }] }) };
      }
      if (u.includes('alt=media')) {
        const b = new (class {})(); b.__dataUrl = wantUrl;
        return { ok: true, status: 200, blob: async () => b };
      }
      return { ok: true, status: 200, json: async () => ({ files: [] }) };
    };
    const { ctx } = makeEnv({}, photoCache, photoMeta, fetchImpl);
    ctx.window.CloudSync._setTestSession('tok', 'photos-folder');
    let threw = false;
    let n = 0;
    try { n = await ctx.window.CloudSync._fetchMissingPhotos(); } catch (e) { threw = true; }
    check('does not throw', !threw);
    check('the reachable photo still landed', photoCache.good === wantUrl);
    check('the failure is not counted as a success', n === 1, 'got ' + n);
  }

  /* ==================== original photo-identity invariants ================ */
  section('Identity: the 6 Aug case - a cover copy of an assessed inbox photo');
  {
    const bytes = img('A', 536276 - 23);
    const photoCache = {
      'inbox|1785818847843|bdcvy': bytes,
      'hortensie-terracotta-kuebel': bytes,
    };
    const index = {
      'inbox|1785818847843|bdcvy': { id: 'drive-1', fp: bytes.length, name: 'inbox_1785818847843_bdcvy_2026-08-04.jpg' },
      'hortensie-terracotta-kuebel': { id: 'drive-2', fp: bytes.length, name: 'hortensie-terracotta-kuebel_2026-08-04.jpg' },
    };
    const { ctx } = makeEnv(index, photoCache, {});
    const n = ctx.window.CloudSync._dedupePhotoIndex();
    const idx = ctx.window.CloudSync._photoIndex();
    check('one entry collapsed', n === 1, 'got ' + n);
    check('both keys name one file',
      idx['inbox|1785818847843|bdcvy'].name === idx['hortensie-terracotta-kuebel'].name);
    check('both keys point at one Drive id',
      idx['inbox|1785818847843|bdcvy'].id === idx['hortensie-terracotta-kuebel'].id);
    check('canon is deterministic (smallest name wins)',
      idx['hortensie-terracotta-kuebel'].name === 'hortensie-terracotta-kuebel_2026-08-04.jpg');
    check('neither key still needs upload',
      ctx.window.CloudSync._photoUploadQueue().length === 0);
  }

  section('Identity: two different images of the same byte length must not merge');
  {
    const a = img('A', 500), b = img('C', 500);
    const photoCache = { k1: a, k2: b };
    const index = { k1: { id: 'd1', fp: a.length, name: 'k1.jpg' },
                    k2: { id: 'd2', fp: b.length, name: 'k2.jpg' } };
    const { ctx } = makeEnv(index, photoCache, {});
    const n = ctx.window.CloudSync._dedupePhotoIndex();
    check('nothing merged', n === 0, 'got ' + n);
    check('each keeps its own file',
      ctx.window.CloudSync._photoIndex().k1.id === 'd1' &&
      ctx.window.CloudSync._photoIndex().k2.id === 'd2');
  }

  section('Identity: repeated runs converge (two devices must not fight)');
  {
    const bytes = img('D', 1000);
    const photoCache = { zzz: bytes, aaa: bytes, mmm: bytes };
    const index = { zzz: { id: 'd3', fp: bytes.length, name: 'zzz.jpg' },
                    aaa: { id: 'd1', fp: bytes.length, name: 'aaa.jpg' },
                    mmm: { id: 'd2', fp: bytes.length, name: 'mmm.jpg' } };
    const { ctx } = makeEnv(index, photoCache, {});
    const first = ctx.window.CloudSync._dedupePhotoIndex();
    const second = ctx.window.CloudSync._dedupePhotoIndex();
    const idx = ctx.window.CloudSync._photoIndex();
    check('first run collapses the other two', first === 2, 'got ' + first);
    check('second run is a no-op', second === 0, 'got ' + second);
    check('all three share the canon',
      idx.zzz.name === 'aaa.jpg' && idx.mmm.name === 'aaa.jpg' && idx.aaa.name === 'aaa.jpg');
  }

  section('Identity: a replaced cover must never overwrite the file it aliases');
  {
    const bytes = img('E', 1000), replaced = img('F', 2000);
    const photoCache = { orig: bytes, cover: replaced };
    const index = { orig: { id: 'shared', fp: bytes.length, name: 'orig.jpg' },
                    cover: { id: 'shared', fp: bytes.length, name: 'orig.jpg', alias: true } };
    let created = 0, patched = [];
    const fetchImpl = async (url, opts) => {
      if (String(url).includes('/upload/drive/v3/files/')) {
        patched.push(String(url).split('/files/')[1].split('?')[0]);
        return { ok: true, status: 200, json: async () => ({ id: 'x' }), text: async () => '' };
      }
      if (opts && opts.method === 'POST') { created++;
        return { ok: true, status: 200, json: async () => ({ id: 'fresh' }), text: async () => '' }; }
      return { ok: true, status: 200, json: async () => ({ files: [] }), text: async () => '' };
    };
    const { ctx } = makeEnv(index, photoCache, {}, fetchImpl);
    const q = ctx.window.CloudSync._photoUploadQueue();
    check('the replaced cover is queued, the original is not',
      q.includes('cover') && !q.includes('orig'), JSON.stringify(q));
    ctx.window.CloudSync._setTestSession('tok', 'photos-folder');
    await ctx.window.CloudSync._uploadPhotoFile('cover', replaced);
    check('a fresh file was created rather than the shared one reused', created === 1);
    check('the shared file was never patched', !patched.includes('shared'), JSON.stringify(patched));
    check('the alias flag is gone', !ctx.window.CloudSync._photoIndex().cover.alias);
    check('the original key still owns its file',
      ctx.window.CloudSync._photoIndex().orig.id === 'shared');
  }

  /* ================== build label matches the cache name ================== */
  section('APP_BUILD and the service worker CACHE agree');
  {
    /* renderBuildInfo compares these two at runtime and tells the user to close
       and reopen the app when they differ. Bumping CACHE without APP_BUILD does
       not merely mislabel the build - it pins that warning on permanently,
       because the two can then never converge. That happened on v49 and again
       on v50. A wrong version label is cosmetic; a stuck "your app is stale"
       banner teaches the user to ignore the one signal that matters when it is
       finally true. */
    const appSrc = fs.readFileSync(APP_SRC, 'utf8');
    const swSrc = fs.readFileSync(path.join(__dirname, 'service-worker.js'), 'utf8');
    const app = appSrc.match(/APP_BUILD\s*=\s*'([^']+)'/);
    const sw = swSrc.match(/CACHE\s*=\s*'mein-garten-([^']+)'/);
    check('APP_BUILD found in app.js', !!app);
    check('CACHE found in service-worker.js', !!sw);
    check('they name the same version', !!app && !!sw && app[1] === sw[1],
      'APP_BUILD=' + (app && app[1]) + ' vs CACHE=' + (sw && sw[1]));
  }

  /* ============ the skill documents the protocol the app implements ======= */
  section('SKILL.md keeps step with the inbox protocol in app.js');
  {
    /* The app, the claude.ai skill and the cloud routine prompt all describe the
       same inbox contract, and only the app is executable. The routine runs in a
       sandbox with no checkout, so it cannot read the skill: the three are kept
       in step by hand, and by hand means eventually not at all.

       This asserts the weaker but checkable half - every entry field
       applyKiDiagnosis reads must be mentioned in SKILL.md. Add a field to the
       app and forget the skill, and this fails. It cannot see the routine
       prompt; updating that stays a discipline, which is why the skill's
       Wartung section names it.

       A field may be left undocumented only by listing it here WITH a reason. */
    const EXEMPT = {
      proposeTasks: 'legacy additions-only alias, still honoured for old inbox ' +
        'files but deliberately not offered to the routine, which must use ' +
        'proposePlan so add, change and remove arrive as one decision',
    };

    const appSrc = fs.readFileSync(APP_SRC, 'utf8');
    const skill = fs.readFileSync(path.join(__dirname, 'skills', 'garten', 'SKILL.md'), 'utf8');

    const i = appSrc.indexOf('async function applyKiDiagnosis');
    check('applyKiDiagnosis located in app.js', i >= 0);
    let depth = 0, started = false, body = '';
    for (let j = i; j >= 0 && j < appSrc.length; j++) {
      if (appSrc[j] === '{') { depth++; started = true; }
      else if (appSrc[j] === '}') { depth--; if (started && depth === 0) { body = appSrc.slice(i, j + 1); break; } }
    }
    // Strip comments first, or prose like "e.g." is read as a protocol field.
    const code = body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    const fields = [...new Set([...code.matchAll(/\be\.([a-zA-Z][a-zA-Z0-9]*)/g)].map(m => m[1]))].sort();

    check('protocol fields extracted', fields.length > 5, fields.join(','));
    const undocumented = fields.filter(f => !skill.includes(f) && !(f in EXEMPT));
    check('every entry field the app reads is documented in SKILL.md',
      undocumented.length === 0,
      undocumented.length
        ? 'undocumented: ' + undocumented.join(', ') +
          '\n        Add them to SKILL.md (and to the routine prompt at ' +
          'claude.ai/code/routines), or list them in EXEMPT with a reason.'
        : '');

    // An exemption for a field the app no longer reads is stale bookkeeping.
    const staleExempt = Object.keys(EXEMPT).filter(f => !fields.includes(f));
    check('no stale exemptions', staleExempt.length === 0,
      staleExempt.length ? 'no longer read by the app: ' + staleExempt.join(', ') : '');
  }

  /* ------------------------------------------------------------------------
     A care plan survives rebuildCatalog.

     Tasks carry the product they are meant to be done with (`fertId`, `dose`)
     and the plan they belong to (`planId`, `planTitle`). rebuildCatalog does not
     mutate tasks - it RECONSTRUCTS every one of them from a fixed field list,
     and it runs on nearly every state change. Anything the reconstruction
     forgets to name is destroyed within seconds of being written, so a care plan
     the user confirmed would lose its fertilizers before it was ever acted on.
     Exactly the class of silent loss this file exists for. */
  section('A confirmed care plan survives rebuildCatalog');
  {
    const src = fs.readFileSync(APP_SRC, 'utf8');
    const i = src.indexOf('function rebuildCatalog(');
    let depth = 0, started = false, end = -1;
    for (let j = i; j < src.length && i >= 0; j++) {
      if (src[j] === '{') { depth++; started = true; }
      else if (src[j] === '}') { depth--; if (started && depth === 0) { end = j + 1; break; } }
    }
    check('rebuildCatalog located in app.js', i >= 0 && end > i);

    const ctx = {
      console,
      basePlants: [{ id: 'tomaten', name: 'Tomaten', cat: 'Gemüse' }],
      baseDefs: [{ id: 'tomaten:duengen', plantId: 'tomaten', title: 'Düngen', interval: 14, months: [5, 6], note: '' }],
      ALL_MONTHS: [1,2,3,4,5,6,7,8,9,10,11,12],
      plants: [], defs: [],
      refreshCatFilter() {},
      state: {
        customPlants: [],
        suppressedTasks: {},
        customTasks: [{
          id: 'tomaten:duengen-fluessig', plantId: 'tomaten', title: 'Flüssig düngen',
          interval: 7, months: [6, 7, 8, 9], note: '',
          fertId: 'f-naturen-1', dose: '14 ml auf 2 l Wasser',
          planId: 'plan-tomaten-2026', planTitle: 'Düngeplan Tomaten (Sommer 2026)',
        }],
      },
    };
    vm.createContext(ctx);
    vm.runInContext(src.slice(i, end) + '\nrebuildCatalog();', ctx);

    const t = ctx.defs.find(d => d.id === 'tomaten:duengen-fluessig');
    check('the planned task survives the rebuild', !!t);
    const lost = t ? ['fertId', 'dose', 'planId', 'planTitle'].filter(f => !t[f]) : ['(task missing)'];
    check('product and plan grouping survive the rebuild', lost.length === 0,
      lost.length
        ? 'dropped by rebuildCatalog: ' + lost.join(', ') +
          '\n        rebuildCatalog rebuilds tasks field by field - add them there too.'
        : '');
  }

  console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all checks passed'));
  process.exit(failures ? 1 : 0);
})();
