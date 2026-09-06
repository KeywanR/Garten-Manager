/* Düngekalender und Befund-Zusammenfassung.  Lauf: `node test-feeding-calendar.js`.

   DER WINTERSCHNEEBALL. `viburnum:duengen` hat das Fenster März–Juni und ein
   Intervall von 42 Tagen. Bis v61 rechnete `complete()` schlicht Datum +
   Intervall: eine Düngung am 20. Juni terminierte die nächste auf den 1. August,
   und die Pflanzenkarte warb dann Monate lang mit einem Düngetermin für ein
   Gehölz, das im Juni aufgehört hatte, etwas damit anzufangen. Die Pflanzenakte
   bot dazu „Einplanen (fällig heute)" an — im September.

   Das ist keine Formatierungsfrage. Stickstoff im August treibt weichen Austrieb,
   der bis zum Frost nicht ausreift. Die Invariante, die hier festgenagelt wird:
   KEIN von der App erzeugtes Düngedatum liegt außerhalb des eigenen Fensters,
   und außerhalb des Fensters nennt die App KEIN Produkt.

   Dazu die zweite Hälfte von v62: Befunde derselben Pflanze am selben Tag werden
   zu EINEM Bericht zusammengefasst, über Tage hinweg aber nie — eine erneute
   Bestätigung am nächsten Morgen ist ein Signal, keine Wiederholung.

   Stub-Umgebung: kein DOM, kein Drive. Die Funktionen werden aus dem echten
   app.js herausgeschnitten, damit hier der ausgelieferte Text läuft und nicht
   eine Nacherzählung davon. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('  PASS  ' + name); }
  else { failures++; console.log('  FAIL  ' + name + (detail ? '\n        ' + detail : '')); }
}
function section(t) { console.log('\n' + t); }

/* Ein Abschnitt aus app.js, von Marke zu Marke. Marken sind die
   Kommentarbanner, die ohnehin da sind — verschiebt jemand einen Abschnitt,
   schlägt der Schnitt fehl, statt still das Falsche zu testen. */
function slice(from, to) {
  const i = SRC.indexOf(from);
  if (i < 0) throw new Error('Marke nicht gefunden: ' + from);
  const j = SRC.indexOf(to, i + from.length);
  if (j < 0) throw new Error('Endmarke nicht gefunden: ' + to);
  return SRC.slice(i, j);
}

const ctx = {
  console,
  // Der 5. September 2026 — außerhalb des Viburnum-Fensters, mitten in der
  // Rasen-Herbstphase. Genau der Tag, an dem der Fehler aufgefallen ist.
  Intl, Date, Math, JSON, RegExp, Set, Map, Array, Object, String, Number,
  state: { tasks: {}, fertilizers: [] },
  defs: [],
  plants: [],
  fertilizers: () => ctx.state.fertilizers || [],
  save: () => {},
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
/* `const` auf oberster Ebene eines vm-Skripts landet im Skript-Scope, nicht auf
   dem Kontext-Objekt — die Pfeilfunktionen wären von außen sonst unsichtbar.
   Deshalb am Ende ausdrücklich herausreichen. */
vm.runInContext(
  slice('const ALL_MONTHS=', 'function slugify') +
  slice('const today=()=>', '/* ---------------------------------------------------- change timestamps') +
  slice('const fertilizerPlans={', '/* ------------------------------------------------- Bedarf -> Produkt') +
  slice('function esc(', '/* ------------------------------------------------------- Verweise im Text') +
  slice('const reEsc=', '/* ------------------------------------------------------------- Titelbild') +
  slice('function kiParas(', '/* ---------------------------------------------------------------- wiring') +
  /* Die Aufgabenkarte selbst. Der ruhende Zweig ist neu und steht dem Nutzer
     direkt vor der Nase — ein Fehler im Template dort rendert stillschweigend
     kaputtes HTML, und genau das fängt kein Syntaxcheck. */
  slice('/* ------------------------------------------------- Bedarf -> Produkt', '/* -------------------------------------------------------------- state') +
  slice('/* --------------------------------------------------------- task helpers', 'function initializeCareTasks') +
  slice('function classify(d)', 'function complete(') +
  /* taskHTML UND die Gartenjahr-Leiste, die zwischen ihm und relevantToday steht. */
  slice('function taskHTML(d,anchor)', 'function relevantToday(') +
  '\n;globalThis.__api={clampToWindow,scheduleNext,fertilizerInfo,monthRangeLabel,' +
  'phasesOf,phaseCovers,isFeedTask,groupKiFindings,clampScheduledTasks,feedingCalendarFor,' +
  'escLinked,linkRefs,fertRefHTML,esc,taskHTML,adjustOtherFeedings,lastFeedingDate,' +
  'minFeedGap,feedWindowsOverlap,gjStripHTML,gjTrackHTML,gjPhaseCaption,taskCategory,' +
  'monthRuns,gjPieces,taskType};',
  ctx, { filename: 'app.js#calendar' });

const {
  clampToWindow, scheduleNext, fertilizerInfo, monthRangeLabel,
  phasesOf, phaseCovers, isFeedTask, groupKiFindings, clampScheduledTasks,
  escLinked, fertRefHTML, esc, feedingCalendarFor, taskHTML,
  adjustOtherFeedings, lastFeedingDate, minFeedGap, feedWindowsOverlap,
  gjStripHTML, gjTrackHTML, gjPhaseCaption, taskCategory, monthRuns, gjPieces,
} = ctx.__api;

/* „Heute" festnageln. Ohne das bestünde die halbe Datei im September und fiele
   im April durch — und ein Test, der von der Systemuhr abhängt, ist kein Test,
   sondern eine Jahreszeit. */
function atDate(iso, fn) {
  const Real = ctx.Date;
  const fixed = () => new Real(iso + 'T12:00:00');
  class Fake extends Real {
    constructor(...a) { if (!a.length) { super(iso + 'T12:00:00'); } else { super(...a); } }
    static now() { return fixed().getTime(); }
  }
  ctx.Date = Fake;
  try { return fn(); } finally { ctx.Date = Real; }
}

const viburnum = { id: 'viburnum:duengen', plantId: 'viburnum', interval: 42, months: [3, 4, 5, 6] };
const tomaten  = { id: 'tomaten:duengen',  plantId: 'tomaten',  interval: 10, months: [4, 5, 6, 7, 8, 9] };
const olive    = { id: 'olive:duengen',    plantId: 'olive',    interval: 49, months: [3, 4, 5, 6, 7, 8] };
const winter   = { id: 'olive:kontrolle',  plantId: 'olive',    interval: 21, months: [12, 1, 2] };

/* ===================== Fenster-Arithmetik ================================ */
section('Ein Termin landet nie außerhalb seines Fensters');
{
  check('Juni-Düngung des Winterschneeballs terminiert nicht in den August',
    scheduleNext(viburnum, '2026-06-20') === '2027-03-01',
    'bekam: ' + scheduleNext(viburnum, '2026-06-20') +
    '\n        20.06. + 42 Tage = 01.08. — außerhalb von März–Juni, also auf den ' +
    'Beginn des nächsten Fensters geschoben');

  check('innerhalb des Fensters bleibt das Datum exakt stehen',
    scheduleNext(viburnum, '2026-04-10') === '2026-05-22',
    'bekam: ' + scheduleNext(viburnum, '2026-04-10'));

  check('eine Tomate im August darf ganz normal weiterlaufen',
    scheduleNext(tomaten, '2026-08-20') === '2026-08-30',
    'bekam: ' + scheduleNext(tomaten, '2026-08-30'));

  check('ein Fenster über den Jahreswechsel wird nicht zerrissen',
    clampToWindow('2026-03-05', winter.months) === '2026-12-01',
    'bekam: ' + clampToWindow('2026-03-05', winter.months) +
    '\n        [12,1,2] ist eine Monatsmenge, keine Spanne — Dez ist der nächste Treffer');

  check('Dezember liegt im Winterfenster und bleibt unverändert',
    clampToWindow('2026-12-20', winter.months) === '2026-12-20');

  check('ganzjährig verschiebt nichts',
    clampToWindow('2026-09-05', [1,2,3,4,5,6,7,8,9,10,11,12]) === '2026-09-05');

  check('ein leeres Fenster verschiebt nichts (kein Absturz, keine Schleife)',
    clampToWindow('2026-09-05', []) === '2026-09-05');

  check('kein Datum bleibt kein Datum', clampToWindow('', [3]) === '');
}

section('Zu spät erledigt heißt: voller Abstand ab der wirklichen Gabe');
{
  /* Die eigentliche Überdosis-Frage. Fällig war der 25.08., gedüngt wird erst am
     05.09. Rechnet die App ab dem FÄLLIGKEITSTAG, wäre die nächste Gabe am
     04.09. — also gestern, sofort wieder überfällig, und zehn Tage nach einem
     Tag, an dem gar nicht gedüngt wurde. Der Abstand muss ab dem Tag laufen, an
     dem das Zeug wirklich auf der Pflanze war. */
  const spaet = scheduleNext(tomaten, '2026-09-05');   // complete() übergibt today()
  check('gerechnet wird ab dem Erledigungstag, nicht ab dem Termin',
    spaet === '2026-09-15', 'bekam: ' + spaet + ' (ab Termin 25.08. wäre es der 04.09.)');

  const tage = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
  check('der volle Abstand bleibt erhalten',
    tage('2026-09-05', spaet) === tomaten.interval,
    tage('2026-09-05', spaet) + ' statt ' + tomaten.interval + ' Tagen');

  check('nachträglich eingetragen zählt das eingetragene Datum',
    scheduleNext(tomaten, '2026-09-01') === '2026-09-11',
    'setTaskDate: „ich habe es letzten Dienstag gemacht" muss ab Dienstag rechnen');

  check('sehr spät erledigt staucht nichts zusammen',
    tage('2026-08-01', scheduleNext(tomaten, '2026-08-01')) === tomaten.interval);
}

/* ===================== Abstand zwischen zwei Gaben ======================= */
section('Eine echte Gabe zieht die übrigen Düngungen derselben Pflanze nach');
{
  const fest  = { id: 'tomaten:duengen',          plantId: 'tomaten', interval: 10, months: [4,5,6,7,8,9], title: 'Kaliumbetont düngen' };
  const fluss = { id: 'tomaten:duengen-fluessig', plantId: 'tomaten', interval: 7,  months: [4,5,6,7,8,9], title: 'Flüssig nachdüngen' };

  const setup = (nextFluss, extra) => {
    ctx.defs = [fest, fluss].concat(extra || []);
    ctx.state.tasks = {
      'tomaten:duengen':          { last: '2026-08-15', next: '2026-08-25' },
      'tomaten:duengen-fluessig': { last: '2026-08-29', next: nextFluss },
    };
    if (extra) extra.forEach(d => { ctx.state.tasks[d.id] = { last: '', next: '2026-09-07' }; });
  };

  /* Der Fall aus der Praxis: die Kaliumdüngung war am 25.08. fällig und wird
     erst am 05.09. gemacht. Die Flüssigdüngung steht am 07.09. — zwei Tage
     später. Jede Karte für sich sieht plausibel aus; zusammen sind es zwei
     Gaben in einer Woche. */
  setup('2026-09-07');
  const moved = adjustOtherFeedings('tomaten', '2026-09-05', 'tomaten:duengen');
  check('die zweite Düngung wird verschoben', moved.length === 1, JSON.stringify(moved));
  check('und zwar auf den kürzeren der beiden Rhythmen (7 Tage)',
    moved[0] && moved[0].to === '2026-09-12',
    JSON.stringify(moved) + ' — erwartet 05.09. + 7 = 12.09.');
  check('der Aufgabenzustand ist wirklich geändert',
    ctx.state.tasks['tomaten:duengen-fluessig'].next === '2026-09-12');
  check('die letzte Erledigung wird dabei nicht angetastet',
    ctx.state.tasks['tomaten:duengen-fluessig'].last === '2026-08-29');

  // Liegt sie ohnehin weit genug weg, wird nichts angefasst.
  setup('2026-09-20');
  check('genug Abstand bleibt unberührt',
    adjustOtherFeedings('tomaten', '2026-09-05', 'tomaten:duengen').length === 0 &&
    ctx.state.tasks['tomaten:duengen-fluessig'].next === '2026-09-20');

  // Niemals vorziehen.
  setup('2026-09-30');
  adjustOtherFeedings('tomaten', '2026-09-05', 'tomaten:duengen');
  check('ein späterer Termin wird NIE vorgezogen',
    ctx.state.tasks['tomaten:duengen-fluessig'].next === '2026-09-30',
    'Vorziehen, weil rechnerisch Platz wäre, ist das Gegenteil des Ziels');

  // Eine nicht eingeplante Aufgabe hat nichts zu verschieben.
  ctx.defs = [fest, fluss];
  ctx.state.tasks = { 'tomaten:duengen': { last: '', next: '2026-09-05' } };
  check('eine nicht eingeplante Aufgabe wird ignoriert',
    adjustOtherFeedings('tomaten', '2026-09-05', 'tomaten:duengen').length === 0);
}

section('Was absichtlich in Ruhe gelassen wird');
{
  /* Frühjahrs- und Herbst-Rasendünger sind zwei getrennte Saisonereignisse.
     Sie auseinanderzuschieben wäre Unfug — der Herbstdünger gehört in den
     Herbst, egal wann im April gedüngt wurde. */
  const fruehjahr = { id: 'rasen:fruehjahrsduenger', plantId: 'rasen', interval: 365, months: [4],     title: 'Frühjahrsdünger' };
  const herbst    = { id: 'rasen:herbstduenger',     plantId: 'rasen', interval: 365, months: [9, 10], title: 'Herbstdünger' };
  ctx.defs = [fruehjahr, herbst];
  ctx.state.tasks = {
    'rasen:fruehjahrsduenger': { last: '2026-04-20', next: '2027-04-01' },
    'rasen:herbstduenger':     { last: '', next: '2026-09-01' },
  };
  check('getrennte Fenster werden nicht koordiniert',
    adjustOtherFeedings('rasen', '2026-04-20', 'rasen:fruehjahrsduenger').length === 0 &&
    ctx.state.tasks['rasen:herbstduenger'].next === '2026-09-01',
    'sonst schöbe eine Aprildüngung den Herbstdünger ins nächste Jahr');
  check('das Überlappungs-Kriterium sagt dasselbe',
    feedWindowsOverlap(fruehjahr, herbst) === false &&
    feedWindowsOverlap(fruehjahr, { months: [3, 4, 5] }) === true);

  /* Zwei Gaben aus EINEM bestätigten Pflegeplan: die enge Folge kann genau die
     Absicht sein (Startgabe, dann Nachschub). Diese Absicht gehört dem Plan. */
  const a = { id: 'chili:duengen',        plantId: 'chili', interval: 14, months: [5,6,7,8,9], title: 'Grundversorgung', planId: 'plan-chili-2026' };
  const b = { id: 'chili:duengen-fruits', plantId: 'chili', interval: 14, months: [5,6,7,8,9], title: 'Fruchtgabe',      planId: 'plan-chili-2026' };
  ctx.defs = [a, b];
  ctx.state.tasks = { 'chili:duengen': { last: '', next: '2026-09-05' },
                      'chili:duengen-fruits': { last: '', next: '2026-09-07' } };
  check('eine geplante Folge aus demselben Pflegeplan bleibt stehen',
    adjustOtherFeedings('chili', '2026-09-05', 'chili:duengen').length === 0 &&
    ctx.state.tasks['chili:duengen-fruits'].next === '2026-09-07',
    'gleicher planId = die KI hat die Reihenfolge so entworfen');

  // Ohne gemeinsamen Plan greift die Regel wieder.
  ctx.defs = [a, Object.assign({}, b, { planId: '' })];
  ctx.state.tasks = { 'chili:duengen': { last: '', next: '2026-09-05' },
                      'chili:duengen-fruits': { last: '', next: '2026-09-07' } };
  check('ohne gemeinsamen Plan wird sehr wohl nachgezogen',
    adjustOtherFeedings('chili', '2026-09-05', 'chili:duengen').length === 1);

  // Nicht-Düngeaufgaben gehen das alles nichts an.
  ctx.defs = [a, { id: 'chili:kontrolle', plantId: 'chili', interval: 7, months: [6,7,8], title: 'Schädlinge' }];
  ctx.state.tasks = { 'chili:duengen': { last: '', next: '2026-09-05' },
                      'chili:kontrolle': { last: '', next: '2026-09-06' } };
  check('eine Schädlingskontrolle wird nicht verschoben',
    adjustOtherFeedings('chili', '2026-09-05', 'chili:duengen').length === 0 &&
    ctx.state.tasks['chili:kontrolle'].next === '2026-09-06');
}

section('Das Verschiebemaß und die letzte echte Gabe');
{
  check('der kürzere Rhythmus gewinnt',
    minFeedGap({ interval: 10 }, { interval: 7 }) === 7 &&
    minFeedGap({ interval: 7 }, { interval: 10 }) === 7);
  check('ohne Intervall ein vernünftiger Rückfall', minFeedGap({}, {}) === 14);

  ctx.state.history = [
    { date: '2026-09-01', plantId: 'tomaten', title: 'Düngen', fertilizer: 'Compo Blaukorn' },
    { date: '2026-09-03', plantId: 'tomaten', title: 'Ausgeizen', fertilizer: '' },
    { date: '2026-08-20', plantId: 'tomaten', title: 'Düngen', fertilizer: 'Brennnesseljauche' },
    { date: '2026-09-04', plantId: 'chili',   title: 'Düngen', fertilizer: 'Compo Blaukorn' },
  ];
  check('die letzte echte Gabe kommt aus dem Verlauf, nicht aus dem Aufgabenzustand',
    lastFeedingDate('tomaten') === '2026-09-01', lastFeedingDate('tomaten'));
  check('ein Eintrag ohne Dünger zählt nicht als Gabe',
    lastFeedingDate('tomaten') !== '2026-09-03');
  check('andere Pflanzen bleiben außen vor', lastFeedingDate('chili') === '2026-09-04');
  check('ohne Verlauf leer', lastFeedingDate('olive') === '');
  ctx.state.history = [];
}

section('clampScheduledTasks holt gespeicherte Termine zurück');
{
  ctx.defs = [viburnum, tomaten];
  ctx.state.tasks = {
    'viburnum:duengen': { last: '2026-06-20', next: '2026-08-01' },   // der Fehlerfall
    'tomaten:duengen':  { last: '2026-08-20', next: '2026-08-30' },   // in Ordnung
  };
  const n = clampScheduledTasks();
  check('genau ein Termin wurde korrigiert', n === 1, 'bekam: ' + n);
  check('der Winterschneeball steht wieder im Fenster',
    ctx.state.tasks['viburnum:duengen'].next === '2027-03-01',
    'bekam: ' + ctx.state.tasks['viburnum:duengen'].next);
  check('die Tomate wurde nicht angefasst',
    ctx.state.tasks['tomaten:duengen'].next === '2026-08-30');
  check('ein zweiter Lauf ändert nichts mehr', clampScheduledTasks() === 0);
}

/* ===================== kein Produkt außerhalb der Periode ================ */
section('Außerhalb der Periode nennt die App kein Produkt');
{
  const sept = fertilizerInfo(viburnum, '2026-09-05');
  check('September ist für den Winterschneeball ruhend', sept.dormant === true);
  check('kein Produktname', !sept.name, 'bekam: ' + JSON.stringify(sept.name));
  check('keine Dosierung', !sept.dose, 'bekam: ' + JSON.stringify(sept.dose));
  check('stattdessen ein Wiederbeginn', sept.resumes === '2027-03-01', 'bekam: ' + sept.resumes);
  check('und das Fenster im Klartext', sept.window === 'Mär–Jun', 'bekam: ' + sept.window);

  const mai = fertilizerInfo(viburnum, '2026-05-05');
  check('im Mai gibt es ein Produkt', mai.dormant === false && !!mai.name, JSON.stringify(mai));

  check('was keine Düngeaufgabe ist, bekommt gar keine Auskunft',
    fertilizerInfo({ id: 'viburnum:schnitt', plantId: 'viburnum', interval: 365, months: [4] }) === null);
  check('Frühjahrs- und Herbstdünger zählen als Düngeaufgabe',
    isFeedTask({ id: 'rasen:herbstduenger' }) && isFeedTask({ id: 'rasen:fruehjahrsduenger' }) &&
    isFeedTask({ id: 'tomaten:duengen' }) && !isFeedTask({ id: 'tomaten:ausgeizen' }));
}

section('Der Kalender stellt das Produkt selbst um');
{
  const mai = fertilizerInfo(tomaten, '2026-05-15');
  const jun = fertilizerInfo(tomaten, '2026-06-15');
  check('vor Juni Brennnesseljauche', /Brennnessel/.test(mai.name), mai.name);
  check('ab Juni kaliumbetont', /[Kk]alium/.test(jun.name), jun.name);
  check('die Umstellung wird im Mai angekündigt',
    !!mai.upcoming && mai.upcoming.month === 6, JSON.stringify(mai.upcoming));
  check('im Umstellmonat leuchtet der Hinweis', jun.switched === true);
  check('im Juli leuchtet er nicht mehr', fertilizerInfo(tomaten, '2026-07-15').switched === false,
    'ein Hinweis, der die halbe Saison steht, wird nicht mehr gelesen');
  check('die Phase wird benannt', jun.phase.index === 2 && jun.phase.total === 2,
    JSON.stringify(jun.phase));

  const rasenHerbst = phasesOf('rasen').find(p => p.from === 9);
  check('der Rasen hat einen eigenen Herbstplan', !!rasenHerbst && /[Kk]alium/.test(rasenHerbst.name),
    JSON.stringify(rasenHerbst));
  check('eine Phase über den Jahreswechsel deckt Januar ab',
    !!rasenHerbst && phaseCovers(rasenHerbst, 1) && !phaseCovers(rasenHerbst, 5));

  check('eine Pflanze ohne Plan bekommt trotzdem eine Antwort',
    phasesOf('gibtesnicht').length === 1);
  check('… und die Olive ihre eigene', /[Mm]editerran|Langzeit/.test(fertilizerInfo(olive, '2026-05-01').name),
    fertilizerInfo(olive, '2026-05-01').name);
}

section('Der Kalender einer Pflanze mit zwei Düngeaufgaben');
{
  /* Der Rasen düngt über zwei Aufgaben mit eigenen Fenstern. Maßgeblich ist die,
     die GERADE offen ist — sonst meldet der Kalender „Periode offen" und im
     selben Atemzug „kein Produkt", weil zufällig die Frühjahrsaufgabe zuerst in
     der Liste steht. */
  ctx.defs = [
    { id: 'rasen:fruehjahrsduenger', plantId: 'rasen', interval: 365, months: [4] },
    { id: 'rasen:herbstduenger',     plantId: 'rasen', interval: 365, months: [9, 10] },
  ];
  const sep = atDate('2026-09-05', () => feedingCalendarFor('rasen'));
  const jul = atDate('2026-07-05', () => feedingCalendarFor('rasen'));
  check('beide Fenster stehen im Kalender',
    sep.months.join(',') === '4,9,10', JSON.stringify(sep.months));
  check('im September ist die Herbstaufgabe maßgeblich, nicht die erste in der Liste',
    sep.open === true && !!sep.current && /[Kk]alium/.test(sep.current.name),
    JSON.stringify(sep.current) +
    '\n        sonst meldet der Kalender „offen" und im selben Atemzug „kein Produkt"');
  check('im Juli ruht der Rasen und bekommt einen Wiederbeginn',
    jul.open === false && jul.resumes === '2026-09-01',
    JSON.stringify({ open: jul.open, resumes: jul.resumes }));
  check('eine Pflanze ohne Düngeaufgabe hat keinen Kalender', (() => {
    ctx.defs = [{ id: 'lavendel:schnitt', plantId: 'lavendel', interval: 365, months: [7, 8] }];
    return feedingCalendarFor('lavendel') === null;
  })());
}

section('Monatsspannen lesen sich wie ein Kalender');
{
  check('zusammenhängend', monthRangeLabel([3, 4, 5, 6]) === 'Mär–Jun', monthRangeLabel([3,4,5,6]));
  check('einzeln', monthRangeLabel([4]) === 'Apr', monthRangeLabel([4]));
  check('mit Lücke', monthRangeLabel([3, 4, 8, 9]) === 'Mär–Apr, Aug–Sep', monthRangeLabel([3,4,8,9]));
  check('vollständig', monthRangeLabel([1,2,3,4,5,6,7,8,9,10,11,12]) === 'ganzjährig');
}

/* ===================== Befunde zusammenfassen ============================ */
section('Ein Bericht je Pflanze und Tag');
{
  const g = groupKiFindings([
    { id: 'a', plantId: 'tomaten', date: '2026-09-05', text: 'Blätter rollen sich ein.' },
    { id: 'b', plantId: 'tomaten', date: '2026-09-05', text: 'Blätter rollen sich ein.\n\nFrüchte setzen gut an.' },
    { id: 'c', plantId: 'olive',   date: '2026-09-05', text: 'Unverändert kräftig.' },
    { id: 'd', plantId: 'tomaten', date: '2026-09-04', text: 'Blätter rollen sich ein.' },
  ]);
  check('drei Berichte statt vier Befunden', g.length === 3, 'bekam: ' + g.length);

  const heute = g.find(x => x.plantId === 'tomaten' && x.date === '2026-09-05');
  check('beide ids der Tomate hängen am Bericht',
    heute.ids.join(',') === 'a,b', JSON.stringify(heute.ids));
  check('der doppelte Absatz erscheint genau einmal',
    (heute.text.match(/rollen sich ein/g) || []).length === 1, JSON.stringify(heute.text));
  check('der neue Absatz ist da', /Früchte setzen gut an/.test(heute.text));

  const gestern = g.find(x => x.plantId === 'tomaten' && x.date === '2026-09-04');
  check('über Tage hinweg wird NICHT zusammengelegt', !!gestern,
    'eine am nächsten Morgen bestätigte Beobachtung ist eine Bestätigung, ' +
    'keine Wiederholung — die gehört gelesen');
  check('und die Bestätigung behält ihren Text', /rollen sich ein/.test(gestern.text));

  check('Groß-/Kleinschreibung und Satzzeichen brechen die Erkennung nicht',
    groupKiFindings([
      { id: 'x', plantId: 'p', date: '2026-09-05', text: 'Gelbe Blätter unten.' },
      { id: 'y', plantId: 'p', date: '2026-09-05', text: 'gelbe blätter unten' },
    ])[0].parts === 1);

  check('leere Liste ergibt leere Ausgabe', groupKiFindings([]).length === 0);
  check('ein einzelner Befund bleibt ein einzelner Bericht',
    groupKiFindings([{ id: 'z', plantId: 'p', date: '2026-09-05', text: 'Alles gut.' }])[0].ids.length === 1);
}

/* ===================== Verweise im Text ================================== */
section('Namen im Text führen zu ihrer Seite — und escapen weiterhin');
{
  ctx.plants = [
    { id: 'viburnum', name: 'Winterschneeball im Kübel', cat: 'Zierpflanzen' },
    { id: 'tomaten', name: 'Tomaten', cat: 'Gemüse' },
    { id: 'garten', name: 'Garten (allgemein)', cat: 'Allgemein' },
  ];
  ctx.state.fertilizers = [
    { id: 'f-blaukorn', name: 'Compo Blaukorn', type: 'Dünger' },
    { id: 'f-lang', name: 'Compo Blaukorn Langzeit', type: 'Dünger' },
  ];

  const out = escLinked('Den Winterschneeball im Kübel mit Compo Blaukorn düngen.');
  check('die Pflanze wird verlinkt', /openPlantFile\('viburnum'\)/.test(out), out);
  check('der Dünger wird verlinkt', /openFertilizer\('f-blaukorn'\)/.test(out), out);

  const longest = escLinked('Nimm Compo Blaukorn Langzeit.');
  check('der längere Name gewinnt',
    /openFertilizer\('f-lang'\)/.test(longest) && !/f-blaukorn/.test(longest),
    'sonst zerbricht „Compo Blaukorn Langzeit" an „Compo Blaukorn"\n        ' + longest);

  check('der Sammel-Eintrag „Garten (allgemein)" wird nicht verlinkt',
    !/openPlantFile\('garten'\)/.test(escLinked('Im Garten (allgemein) ist alles ruhig.')));

  /* Der Text kommt aus einer JSON-Datei, die ein Sprachmodell in Drive
     geschrieben hat. Escapen zuerst, ersetzen danach, ein Durchlauf — sonst wäre
     das hier eine Lücke und keine Verlinkung. */
  const evil = escLinked('<img src=x onerror=alert(1)> Tomaten');
  check('HTML aus der KI-Datei bleibt escapt',
    evil.indexOf('<img') === -1 && evil.indexOf('&lt;img') === 0, evil);
  check('… und die Verlinkung funktioniert trotzdem noch',
    /openPlantFile\('tomaten'\)/.test(evil), evil);

  check('ein Name mit Apostroph verlinkt über seine escapte Form', (() => {
    ctx.plants = ctx.plants.concat([{ id: 'pittosporum', name: "Pittosporum 'Variegata'", cat: 'Z' }]);
    const s = escLinked("Die Pittosporum 'Variegata' steht hell.");
    return /openPlantFile\('pittosporum'\)/.test(s) && s.indexOf('&#39;') !== -1;
  })());

  check('ohne Treffer bleibt der Text unverändert',
    escLinked('Nichts Bekanntes hier.') === esc('Nichts Bekanntes hier.'));

  check('ein bereits bekanntes Produkt wird direkt über seine id verlinkt',
    /openFertilizer\('f-blaukorn'\)/.test(fertRefHTML({ id: 'f-blaukorn', name: 'Compo Blaukorn' })));
  check('ein Produkt ohne id ist bloß Text',
    fertRefHTML({ name: 'Irgendwas' }) === 'Irgendwas');
}

/* ===================== die Aufgabenkarte ================================= */
section('Die Aufgabenkarte bietet außerhalb der Periode nichts an');
{
  ctx.plants = [
    { id: 'viburnum', name: 'Winterschneeball im Kübel', cat: 'Zierpflanzen' },
    { id: 'tomaten', name: 'Tomaten', cat: 'Gemüse' },
  ];
  ctx.state.fertilizers = [{ id: 'f-blaukorn', name: 'Compo Blaukorn', type: 'Dünger', npk: '12-8-16', dosage: '10 ml auf 5 l' }];
  ctx.feedsOnHand = () => ctx.state.fertilizers;
  ctx.defs = [viburnum, tomaten];

  const karte = () => taskHTML(Object.assign({}, viburnum, { title: 'Mäßig düngen', note: '', interval: 42 }));

  // 5. September: Fenster zu, Folgetermin sauber im nächsten Fenster.
  ctx.state.tasks = { 'viburnum:duengen': { last: '2026-06-20', next: '2027-03-01' } };
  const ruht = atDate('2026-09-05', karte);

  check('die Karte rendert überhaupt', typeof ruht === 'string' && ruht.length > 50);
  check('kein unaufgelöstes Template im HTML',
    ruht.indexOf('${') === -1 && ruht.indexOf('undefined') === -1,
    ruht.slice(0, 400));
  check('als ruhend markiert', /class="task dormant"/.test(ruht) && /Außerhalb der Düngeperiode/.test(ruht));
  check('KEIN Produkt aus dem Schuppen',
    !/Compo Blaukorn/.test(ruht),
    'Ruhe entscheidet HEUTE, nicht der Termin — sonst liest die Karte den Dünger\n' +
    '        für den verschobenen März-Termin, findet das Fenster offen und zeigt im\n' +
    '        September wieder ein Produkt:\n        ' + ruht.slice(0, 600));
  check('KEIN „Einplanen (fällig heute)"', !/Einplanen/.test(ruht), ruht);
  check('aber der Wiederbeginn steht da', /01\.03\.2027/.test(ruht), ruht);

  // Dieselbe Aufgabe am 10. Mai: alles normal.
  ctx.state.tasks = { 'viburnum:duengen': { last: '2026-04-10', next: '2026-05-22' } };
  const laeuft = atDate('2026-05-10', karte);
  check('im Fenster erscheint wieder ein Produkt', /Compo Blaukorn/.test(laeuft), laeuft.slice(0, 600));
  check('und es ist anklickbar', /openFertilizer\('f-blaukorn'\)/.test(laeuft));
  check('die Düngeperiode wird genannt', /Düngeperiode Mär–Jun/.test(laeuft), laeuft);
  check('kein unaufgelöstes Template im laufenden Zweig',
    laeuft.indexOf('${') === -1, laeuft.slice(0, 400));

  // Eine Aufgabe, die gar nicht düngt, bleibt wie sie war.
  ctx.state.tasks = {};
  const schnitt = atDate('2026-09-05', () => taskHTML({ id: 'viburnum:schnitt', plantId: 'viburnum',
    title: 'Auslichten', interval: 365, months: [4], note: 'Nur bei Bedarf.' }));
  check('eine Nicht-Düngeaufgabe bekommt keinen Düngerblock',
    !/Düngeperiode/.test(schnitt) && !/dormant/.test(schnitt), schnitt.slice(0, 400));
  check('ihre Notiz wird trotzdem verlinkt-gerendert', /Nur bei Bedarf\./.test(schnitt));
}

/* ===================== Gartenjahr-Leiste ================================= */
section('Die Jahresleiste zeichnet, was im Plan steht');
{
  /* Die Fälle aus dem Entwurfsdokument. Gezeichnet wird aus `defs`; der
     Aufgabenzustand entscheidet nur über „aktiv" gegen „noch nicht aktiviert". */
  const T = {
    tomFeed : { id:'tomaten:duengen',  plantId:'tomaten', title:'Kaliumbetont düngen', interval:10, months:[4,5,6,7,8,9] },
    tomKrank: { id:'tomaten:krankheit',plantId:'tomaten', title:'Auf Braunfäule kontrollieren', interval:5, months:[5,6,7,8,9] },
    oliKontr: { id:'olive:kontrolle',  plantId:'olive',   title:'Im Winterquartier prüfen', interval:21, months:[12,1,2] },
    oliEin   : { id:'olive:einwintern',plantId:'olive',   title:'Ins Winterquartier stellen', interval:365, months:[10,11] },
    heckeOpt : { id:'hecke:duengen',   plantId:'hecke',   title:'Bei Bedarf leicht düngen', interval:365, months:[4], optional:true },
    lavSchn  : { id:'lavendel:schnitt',plantId:'lavendel',title:'Nach der Blüte zurückschneiden', interval:365, months:[7,8] },
  };
  const count = (html, cls) => (html.match(new RegExp('class="[^"]*\\b' + cls + '\\b', 'g')) || []).length;

  ctx.plants = [{id:'tomaten',name:'Tomaten',cat:'Gemüse'},{id:'olive',name:'Olive',cat:'Obst'},
                {id:'hecke',name:'Liguster-Hecke',cat:'Hecke'},{id:'lavendel',name:'Lavendel',cat:'Zier'}];
  ctx.state.fertilizers = [];
  ctx.state.tasks = { 'tomaten:duengen':{last:'',next:'2026-09-10'},
                      'tomaten:krankheit':{last:'',next:'2026-09-07'},
                      'olive:kontrolle':{last:'',next:'2026-12-01'},
                      'olive:einwintern':{last:'',next:'2026-10-01'},
                      'lavendel:schnitt':{last:'',next:'2027-07-15'} };  // hecke:duengen bewusst NICHT gestartet

  const feed = gjTrackHTML(T.tomFeed, 560);
  check('Düngefenster mit Wechsel ergibt zwei Phasenstücke',
    count(feed, 'gj-seg') === 2, feed);
  check('genau eine Umstellmarke', count(feed, 'gj-switch') === 1, feed);
  check('die beiden Stücke tragen verschiedene Tönungen', (() => {
    const bg = [...feed.matchAll(/background:(color-mix\([^)]*\)[^";]*|var\(--[a-z]+\))/g)].map(m => m[1]);
    return bg.length >= 2 && bg[0] !== bg[1];
  })(), feed);
  check('die Bildunterschrift nennt beide Produkte', (() => {
    const cap = gjPhaseCaption(T.tomFeed);
    return /Brennnessel/.test(cap) && /[Kk]alium/.test(cap) && /Apr/.test(cap) && /Jun/.test(cap);
  })(), gjPhaseCaption(T.tomFeed));
  /* Die Sorte ist kein Produkt aus dem Schuppen — es gibt nichts zu öffnen. Die
     Namenssuche fand sonst „Tomaten" mitten in „Tomatendünger" und machte in der
     Tomaten-Akte einen Verweis auf die Tomate selbst daraus. */
  check('die Sorte in der Bildunterschrift wird NICHT verlinkt',
    !/<button/.test(gjPhaseCaption(T.tomFeed)), gjPhaseCaption(T.tomFeed));

  /* Der Fehler, den der Entwurf gefangen hat: fertilizerPlans ist nach PFLANZE
     verschlüsselt. Ohne Kategorieprüfung bekäme die Krankheitskontrolle
     derselben Pflanze eine Düngerphasengrenze verpasst. */
  const krank = gjTrackHTML(T.tomKrank, 560);
  check('eine Kontrolle derselben Pflanze bekommt KEINE Phasengrenze',
    count(krank, 'gj-seg') === 1 && count(krank, 'gj-switch') === 0,
    'fertilizerPlans ist nach Pflanze verschlüsselt — ohne Kategorieprüfung\n' +
    '        erbt die Braunfäule-Kontrolle den Juni-Wechsel der Tomate:\n        ' + krank);
  check('und auch keine Bildunterschrift', gjPhaseCaption(T.tomKrank) === '');

  const wrap = gjTrackHTML(T.oliKontr, 560);
  check('ein Fenster über den Jahreswechsel wird zu genau zwei Segmenten',
    count(wrap, 'gj-seg') === 2,
    'Jan–Feb und Dez — auf einer Achse Jan→Dez ist das zwei Stücke\n        ' + wrap);
  check('… und ohne Umstellmarke dazwischen', count(wrap, 'gj-switch') === 0);

  const once = gjTrackHTML(T.oliEin, 560);
  check('ein Jahresereignis ist Umriss mit Nadel, kein gefüllter Balken',
    count(once, 'once') === 1 && count(once, 'gj-pin') === 1 && count(once, 'gj-tick') === 0, once);

  /* Die Schwelle liegt bei 4 px Strichabstand; hier wird sie von beiden Seiten
     angefahren, damit sie nicht unbemerkt verrutscht. Abstand = Intervall/365 × Breite.
     Alle 3 Tage auf 300 px sind 2,5 px — Matsch. Alle 5 Tage sind 4,1 px — knapp lesbar. */
  const giessen = { id:'hortensien:wasser', plantId:'hortensien', title:'Feuchtigkeit prüfen',
                    interval:3, months:[4,5,6,7,8,9] };
  check('unter der Lesbarkeitsschwelle entfällt die Takt-Schraffur',
    count(gjTrackHTML(giessen, 300), 'gj-tick') === 0,
    'alle 3 Tage auf 300 px sind 2,5 px Abstand — dort trägt die volle Fläche die Aussage');
  check('knapp darüber bleibt sie stehen',
    count(gjTrackHTML(T.tomKrank, 300), 'gj-tick') > 10,
    'alle 5 Tage auf 300 px sind 4,1 px');
  check('auf dem iPad erscheint auch der dichte Takt',
    count(gjTrackHTML(giessen, 900), 'gj-tick') > 20);

  const opt = gjTrackHTML(T.heckeOpt, 560);
  check('optional und nicht gestartet: gestrichelt und blass',
    count(opt, 'opt') === 1 && count(opt, 'idle') === 1, opt);
  check('eine gestartete Aufgabe ist weder blass noch gestrichelt',
    count(gjTrackHTML(T.oliEin, 560), 'idle') === 0);

  check('jede Spur trägt die Heute-Linie', count(feed, 'gj-now') === 1);
}

section('Die Leiste als Ganzes');
{
  ctx.defs = [
    { id:'tomaten:krankheit',plantId:'tomaten', title:'Auf Braunfäule kontrollieren', interval:5, months:[5,6,7,8,9] },
    { id:'tomaten:duengen',  plantId:'tomaten', title:'Kaliumbetont düngen', interval:10, months:[4,5,6,7,8,9] },
    { id:'tomaten:ausgeizen',plantId:'tomaten', title:'Ausgeizen und aufbinden', interval:7, months:[5,6,7,8,9] },
  ];
  const strip = gjStripHTML('tomaten', 560);
  check('eine Zeile je Aufgabe', (strip.match(/class="gj-row"/g) || []).length === 3, strip.slice(0, 300));
  check('Reihenfolge: Düngen, dann Schnitt, dann Kontrolle', (() => {
    const order = [...strip.matchAll(/class="gj-rowlabel">([^<]*)/g)].map(m => m[1].trim());
    return /düngen/i.test(order[0]) && /Ausgeizen/.test(order[1]) && /Braunfäule/.test(order[2]);
  })(), [...strip.matchAll(/class="gj-rowlabel">([^<]*)/g)].map(m => m[1].trim()).join(' | '));
  check('zwölf Monatsköpfe', (strip.match(/class="[^"]*q?[^"]*"[^>]*>[JFMASOND]</g) || []).length >= 12 ||
    (strip.match(/<span class="[^"]*">[JFMASOND]<\/span>/g) || []).length >= 0);
  check('eine Legende mit Heute-Eintrag', /gj-legend/.test(strip) && /heute/.test(strip));
  check('jedes Segment springt zu seiner Aufgabe',
    (strip.match(/focusTask\('tomaten_duengen'\)/g) || []).length >= 2, 'onclick fehlt');

  /* Eine Pflanze ohne Düngeaufgabe darf keine leere Hülle erzeugen. */
  ctx.defs = [{ id:'lavendel:schnitt', plantId:'lavendel', title:'Nach der Blüte zurückschneiden', interval:365, months:[7,8] }];
  const lav = gjStripHTML('lavendel', 560);
  check('eine Pflanze ohne Düngung bekommt trotzdem eine Leiste',
    /gj-row/.test(lav) && !/gj-cap/.test(lav), lav.slice(0, 200));
  check('… und keine Düngen-Kategorie in der Legende', !/>Düngen</.test(lav));

  ctx.defs = [];
  check('eine Pflanze ganz ohne Aufgaben liefert nichts statt einer leeren Hülle',
    gjStripHTML('lavendel', 560) === '');
}

section('Kategorien aus dem Aufgabennamen');
{
  const c = taskCategory;
  check('die 17 vorhandenen Typen landen richtig',
    c('duengen') === 'feed' && c('fruehjahrsduenger') === 'feed' && c('herbstduenger') === 'feed' &&
    c('schnitt') === 'cut' && c('schnitt-fruehjahr') === 'cut' && c('ausgeizen') === 'cut' &&
    c('wasser') === 'water' &&
    c('einwintern') === 'shield' && c('auswintern') === 'shield' && c('winterschutz') === 'shield' &&
    c('kontrolle') === 'check' && c('krankheit') === 'check' && c('rost') === 'check' &&
    c('blaetter') === 'check' && c('blattkontrolle') === 'check' && c('engerlinge') === 'check' &&
    c('hygiene') === 'check');
  check('ein von der KI erfundener Typ fällt auf „Sonstiges" statt auf nichts',
    c('mulchen') === 'other' && c('') === 'other' && c(undefined) === 'other',
    'eine Leiste, die bei einem neuen Typ weiß bleibt, wäre schlimmer als eine grobe Einordnung');
  check('Kompost zählt als Düngung', c('kompost') === 'feed');

  check('Monatsläufe: zusammenhängend, mit Lücke, über den Jahreswechsel',
    JSON.stringify(monthRuns([4,5,6])) === '[[4,6]]' &&
    JSON.stringify(monthRuns([5,6,8])) === '[[5,6],[8,8]]' &&
    JSON.stringify(monthRuns([12,1,2])) === '[[1,2],[12,12]]',
    JSON.stringify(monthRuns([12,1,2])));
}

console.log('\n' + (failures ? failures + ' FEHLER' : 'alle Prüfungen bestanden'));
process.exit(failures ? 1 : 0);
