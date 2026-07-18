/* ============================================================================
   Mein Garten – Gartenmanager v12
   Offline-first PWA. Data: localStorage (state) + IndexedDB (photos, snapshots).
   Rebuilt from v11 with corrected botany, safer migration, friendlier capture,
   and an AI-ready per-plant dossier export for later MCP analysis.
   ========================================================================== */

const LEGACY_KEY='duengekalender_v1', APP_KEY='gartenmanager_v2';
const DATA_VERSION=12, DB_NAME='gartenmanager_storage', DB_VERSION=2;

/* ---------------------------------------------------------------- plants ---- */
const plants=[
 {id:'tomaten',name:'Tomaten',cat:'Gemüse',note:'Bei Fruchtbildung weniger Stickstoff, stärker kaliumbetont düngen.'},
 {id:'chili',name:'Chili',cat:'Gemüse',note:'Nicht überdüngen – sonst viel Blatt und wenig Frucht.'},
 {id:'sellerie',name:'Sellerie',cat:'Gemüse',note:'Starkzehrer, gleichmäßig feucht halten.'},
 {id:'karfiol',name:'Karfiol',cat:'Gemüse',note:'Bis zur Kopfbildung regelmäßig versorgen.'},
 {id:'brokkoli',name:'Brokkoli',cat:'Gemüse',note:'Regelmäßig düngen und nicht austrocknen lassen.'},
 {id:'porree',name:'Porree',cat:'Gemüse',note:'Leichte, regelmäßige Düngung.'},
 {id:'salate',name:'Salate',cat:'Gemüse',note:'Nur schwach düngen.'},
 {id:'gurken',name:'Gurken im Topf',cat:'Gemüse',note:'Brauchen gleichmäßig Wasser und Nährstoffe.'},
 {id:'basilikum',name:'Basilikum im Topf',cat:'Kräuter',note:'Sparsam düngen, damit das Aroma kräftig bleibt.'},
 {id:'thai-basilikum',name:'Thai-Basilikum',cat:'Kräuter',note:'Warm halten und gleichmäßig feucht versorgen.'},
 {id:'minze',name:'Minze im Topf',cat:'Kräuter',note:'Wenig düngen, sonst werden die Triebe weich.'},
 {id:'oregano',name:'Oregano im Topf',cat:'Kräuter',note:'Mag eher magere Erde.'},
 {id:'estragon',name:'Estragon im Topf',cat:'Kräuter',note:'Mäßig düngen, Staunässe vermeiden.'},
 {id:'majoran',name:'Majoran im Topf',cat:'Kräuter',note:'Nur leicht düngen.'},
 {id:'hortensien',name:'Hortensien im Kübel',cat:'Zierpflanzen',note:'Blüht am alten Holz. Gleichmäßig feucht halten, kalkarmes Wasser bevorzugen.'},
 {id:'olive',name:'Olive im Kübel',cat:'Obst & Kübelgehölze',note:'Nicht winterhart im Topf – frostfrei überwintern. Lieber zu wenig als zu viel düngen.'},
 {id:'feige',name:'Feige im Kübel',cat:'Obst & Kübelgehölze',note:'Im Topf frostempfindlich – kühl frostfrei überwintern. Nicht zu stickstoffreich düngen.'},
 {id:'granatapfel',name:'Granatapfel im Kübel',cat:'Obst & Kübelgehölze',note:'Laubabwerfend, kühl frostfrei überwintern. Ab Herbst nicht mehr düngen.'},
 {id:'ahorn',name:'Japanischer Ahorn im Kübel',cat:'Zierpflanzen',note:'Ab August keine Düngung. Schnitt nur im Sommer/Winter – nicht im Frühjahr (blutet stark).'},
 {id:'viburnum',name:'Winterschneeball im Kübel',cat:'Zierpflanzen',note:'Gleichmäßig feucht halten.'},
 {id:'pittosporum',name:"Pittosporum 'Variegata'",cat:'Zierpflanzen',note:'Frostempfindlich im Topf – hell frostfrei überwintern. Organischer Langzeitdünger ist ideal.'},
 {id:'euonymus',name:'Japanischer Spindelstrauch',cat:'Zierpflanzen',note:'Robust und eher genügsam.'},
 {id:'euonymus-alatus',name:'Korkspindelstrauch (Euonymus alatus)',cat:'Zierpflanzen',note:'Zwei Sträucher vorne am Haus, einer zeigt fortschreitende Welke bzw. Triebsterben. Erkrankte Triebe bis ins gesunde Holz zurückschneiden und tiefgründig bewässern.'},
 {id:'birnenbaum',name:'Birnenbaum im Kübel',cat:'Obst & Kübelgehölze',note:'Kernobst – Schnitt in der Winterruhe. Auf Birnengitterrost achten.'},
 {id:'felsenbirne',name:'Felsenbirne im Kübel',cat:'Obst & Kübelgehölze',note:'Eher genügsam; gelbe Blätter beobachten.'},
 {id:'weichsel',name:'Weichsel im Kübel',cat:'Obst & Kübelgehölze',note:'Steinobst – Schnitt nur im Sommer nach der Ernte, nie im Winter (Silberglanz-/Krankheitsrisiko).'},
 {id:'clematis',name:'Clematis montana',cat:'Zierpflanzen',note:'Schnittgruppe 1: blüht im Mai am vorjährigen Holz. Nur direkt nach der Blüte schneiden, nie im Spätwinter.'},
 {id:'lavendel',name:'Lavendel',cat:'Zierpflanzen',note:'Sparsam düngen, Staunässe vermeiden. Zweimal jährlich schneiden, nie ins alte Holz.'},
 {id:'rasen',name:'Rasenflächen',cat:'Rasen',note:'Tief, aber nicht täglich bewässern; Wurzeldruck der Bäume beachten.'},
 /* NEW in v12 */
 {id:'hecke',name:'Liguster-Hecke',cat:'Hecke',note:'Robust und schnittverträglich. 2–3 Formschnitte pro Saison halten sie dicht. Auf Thripse (silbrige Blätter), Miniermotte und Blattläuse achten.'},
 {id:'garten',name:'Garten (allgemein)',cat:'Allgemein',note:'Gartenweite Erinnerungen, die zu keiner einzelnen Pflanze gehören.'}
];

/* ------------------------------------------------------ default health ------ */
const healthDefaults={
 'euonymus-alatus':{status:'🟠 Behandlung läuft',reason:'Fortschreitende Welke bzw. Triebsterben am erkrankten Strauch wird beobachtet'},
 felsenbirne:{status:'🟡 Beobachten',reason:'Gelbe Blätter beobachten'},
 rasen:{status:'🟡 Beobachten',reason:'Braune Stellen kontrollieren'}
};

/* ------------------------------------------------------------- care tasks --- */
/* [plantId, id, title, intervalDays, months[], note?, optional?] */
const defs=[
 ['tomaten','duengen','Kaliumbetont düngen',10,[4,5,6,7,8,9],'Nach Fruchtansatz kaliumbetonten Tomatendünger verwenden.'],
 ['tomaten','ausgeizen','Ausgeizen und aufbinden',7,[5,6,7,8,9],'Seitentriebe entfernen und Haupttrieb locker anbinden.'],
 ['tomaten','krankheit','Auf Braunfäule kontrollieren',5,[5,6,7,8,9],'Vor allem nach feuchtem Wetter Blätter prüfen.'],
 ['chili','duengen','Düngen',14,[5,6,7,8,9],'Schwach bis mäßig und später kaliumbetont düngen.'],
 ['chili','kontrolle','Auf Blattläuse und Spinnmilben kontrollieren',7,[6,7,8],'Bei warm-trockener Luft Blattunterseiten prüfen.'],
 ['gurken','duengen','Düngen',7,[5,6,7,8,9],'Auf feuchte Erde düngen.'],
 ['gurken','kontrolle','Auf Schädlinge und Welke kontrollieren',5,[5,6,7,8,9],'Besonders Wurzelraum und Blattunterseiten prüfen.'],
 ['sellerie','duengen','Düngen',7,[4,5,6,7,8]],
 ['karfiol','duengen','Düngen',7,[4,5,6,7,8]],
 ['brokkoli','duengen','Düngen',7,[4,5,6,7,8]],
 ['porree','duengen','Düngen',14,[4,5,6,7,8,9]],
 ['salate','duengen','Leicht düngen',14,[3,4,5,6,7,8,9]],
 ['basilikum','duengen','Sehr leicht düngen',21,[5,6,7,8]],
 ['thai-basilikum','duengen','Leicht düngen',21,[5,6,7,8]],
 ['minze','duengen','Leicht düngen',21,[3,4,5,6,7,8]],
 ['oregano','duengen','Sehr sparsam düngen',28,[4,5,6,7]],
 ['estragon','duengen','Leicht düngen',21,[4,5,6,7]],
 ['majoran','duengen','Sehr leicht düngen',21,[5,6,7,8]],
 ['hortensien','duengen','Mit Hortensiendünger düngen',14,[3,4,5,6,7]],
 ['hortensien','wasser','Feuchtigkeit kontrollieren',3,[4,5,6,7,8,9],'Bei Hitze häufiger prüfen; im Topf notfalls täglich gießen.'],
 ['hortensien','schnitt','Verblühtes zurückschneiden',365,[4],'Nur bis zum ersten kräftigen Knospenpaar unter der Blüte. Nicht ins alte Holz. Trockene Blütenstände über Winter als Frostschutz stehen lassen.'],
 ['olive','duengen','Sparsam düngen',49,[3,4,5,6,7,8],'Ab September nicht mehr düngen.'],
 ['olive','einwintern','Ins Winterquartier stellen',365,[10,11],'Vor dem ersten strengen Frost hell und frostfrei (ca. 0–10 °C) aufstellen.'],
 ['olive','auswintern','Nach draußen gewöhnen',365,[4,5],'Nach den letzten Frösten langsam an Sonne gewöhnen (erst schattig).'],
 ['olive','kontrolle','Im Winterquartier auf Schädlinge prüfen',21,[12,1,2],'Auf Schild- und Wollläuse sowie Spinnmilben achten (bei trockener Heizungsluft häufig).'],
 ['feige','duengen','Mäßig düngen',35,[3,4,5,6,7,8]],
 ['feige','schnitt','Frostschäden entfernen, leicht formen',365,[3],'Vor dem Austrieb erfrorenes Holz herausnehmen und leicht auslichten.'],
 ['feige','winterschutz','Kühl frostfrei überwintern',365,[11,12],'Kühl aber frostfrei stellen; Topf einpacken.'],
 ['feige','auswintern','Nach draußen gewöhnen',365,[4],'Nach den letzten Frösten wieder ins Freie.'],
 ['granatapfel','duengen','Mäßig düngen',35,[3,4,5,6,7,8]],
 ['granatapfel','einwintern','Kühl frostfrei überwintern',365,[10,11],'Laubabwerfend – kühl und frostfrei überwintern.'],
 ['granatapfel','auswintern','Nach draußen gewöhnen',365,[4,5],'Nach den letzten Frösten wieder nach draußen.'],
 ['ahorn','duengen','Schwach düngen',49,[3,4,5,6],'Nur bis Ende Juli; ab August keine Düngung.'],
 ['ahorn','schnitt','Nur bei Bedarf leicht schneiden',365,[7,8],'Nie im Frühjahr schneiden (blutet stark). Nur im Sommer oder Hochwinter.',true],
 ['viburnum','duengen','Mäßig düngen',42,[3,4,5,6]],
 ['pittosporum','duengen','Mäßig düngen',35,[3,4,5,6,7]],
 ['pittosporum','einwintern','Hell frostfrei überwintern',365,[10,11],'Hell und frostfrei aufstellen.'],
 ['pittosporum','auswintern','Nach draußen gewöhnen',365,[4,5],'Langsam wieder an Außenlicht gewöhnen.'],
 ['euonymus','duengen','Mäßig düngen',35,[3,4,5,6,7]],
 ['euonymus-alatus','kontrolle','Welke und Triebsterben kontrollieren',7,[4,5,6,7,8,9],'Neu welkende oder absterbende Triebe bis ins gesunde Holz entfernen und das Schnittwerkzeug desinfizieren.'],
 ['euonymus-alatus','wasser','Tiefgründig bewässern',7,[5,6,7,8,9],'Vorher den Boden in 10–15 cm Tiefe prüfen. Bei deutlicher Trockenheit 30–50 Liter langsam versickern lassen. Bei Hitze über 30 °C nach 3–4 Tagen erneut prüfen. Keine täglichen kleinen Mengen.'],
 ['euonymus-alatus','hygiene','Schnittwerkzeug desinfizieren',30,[4,5,6,7,8,9],'Nach jedem Schnitt an erkrankten Trieben gründlich reinigen und desinfizieren.'],
 ['birnenbaum','duengen','Mäßig düngen',35,[3,4,5,6,7]],
 ['birnenbaum','rost','Auf Birnengitterrost kontrollieren',7,[4,5,6,7,8],'Orange Flecken auf Blattoberseiten kontrollieren.'],
 ['birnenbaum','schnitt','Winterschnitt',365,[2,3],'Kernobst in der Winterruhe schneiden: auslichten, Leittriebe fördern.'],
 ['felsenbirne','duengen','Schwach düngen',42,[3,4,5,6]],
 ['felsenbirne','blaetter','Blätter kontrollieren',10,[4,5,6,7,8],'Auf Gelbfärbung, Trockenstress und Staunässe achten.'],
 ['weichsel','duengen','Mäßig düngen',35,[3,4,5,6,7]],
 ['weichsel','blattkontrolle','Blätter kontrollieren',10,[4,5,6,7,8]],
 ['weichsel','schnitt','Sommerschnitt nach der Ernte',365,[7,8],'Steinobst nur bei trockenem Wetter nach der Ernte schneiden – nie im Winter (Silberglanz, Bakterienkrebs).'],
 ['clematis','duengen','Düngen',28,[3,4,5,6]],
 ['clematis','schnitt','Nach der Blüte auslichten',365,[6],'Montana = Gruppe 1. Nur direkt nach der Blüte und nur bei Bedarf schneiden. Nie im Spätwinter – das entfernt die Blütenknospen.'],
 ['lavendel','schnitt','Nach der Blüte zurückschneiden',365,[7,8],'Nicht ins alte Holz schneiden.'],
 ['lavendel','schnitt-fruehjahr','Frühjahrsformschnitt',365,[4],'Leichter Formschnitt, nur ins junge Holz – hält den Lavendel kompakt.'],
 ['rasen','wasser','Bewässerung prüfen',7,[4,5,6,7,8,9],'Nur bei Bedarf tiefgründig wässern.'],
 ['rasen','engerlinge','Auf Engerlinge kontrollieren',30,[4,5,6,7,8,9],'Bei lockerer Grasnarbe oder Vogelfraß kleine Probe ausstechen.'],
 ['rasen','fruehjahrsduenger','Frühjahrsdünger ausbringen',365,[4],'Stickstoffbetonten Frühjahrsrasendünger verwenden; hilft schwachen Stellen.'],
 ['rasen','herbstduenger','Herbstdünger ausbringen',365,[9,10],'Kaliumbetonten Herbstdünger verwenden.'],
 ['hecke','schnitt','Formschnitt der Hecke',45,[5,6,8],'Liguster verträgt 2–3 Schnitte pro Saison (Haupt­schnitte im Juni und August). Bei Überwuchs auch starker Rückschnitt möglich. Keine sehr späten Schnitte, die frostempfindlichen Austrieb erzwingen.'],
 ['hecke','kontrolle','Hecke kontrollieren',14,[4,5,6,7,8,9],'Auf Thripse (silbrige Blätter), Miniermotte, Blattläuse und Blattflecken achten.'],
 ['hecke','duengen','Bei Bedarf leicht düngen',365,[4],'Etablierter Liguster braucht kaum Dünger; nur bei schwachem Wuchs oder nach starkem Rückschnitt eine leichte Frühjahrsgabe.',true],
 ['garten','winterschutz','Kübel winterfest machen',365,[11],'Töpfe der winterharten Kübelgehölze (Hortensie, Ahorn, Viburnum, Spindelstrauch, Birne, Felsenbirne, Weichsel) mit Vlies/Jute umwickeln und geschützt an eine Wand rücken. Die Pflanzen sind hart, die Wurzelballen im Topf nicht.']
].map(([plantId,id,title,interval,months,note='',optional=false])=>({id:`${plantId}:${id}`,plantId,title,interval,months,note,optional}));

/* --------------------------------------------------------- fertilizer plans - */
const fertilizerPlans={
 tomaten:{early:{name:'Brennnesseljauche',dose:'1:15 verdünnt',until:5,note:'Nur auf feuchte Erde geben.'},late:{name:'Kaliumbetonter Tomaten- oder Gemüsedünger',dose:'nach Herstellerangabe; eher untere Dosierung',from:6,note:'Ab Blüte und Fruchtansatz Brennnesseljauche nicht mehr als Hauptdünger. Höchstens jede dritte Düngung schwach ergänzen.'}},
 chili:{early:{name:'Brennnesseljauche',dose:'1:20 verdünnt',until:5,note:'Sehr sparsam einsetzen.'},late:{name:'Kaliumbetonter Tomaten- oder Chilidünger',dose:'nach Herstellerangabe; schwach dosieren',from:6,note:'Ab Blüten- und Fruchtansatz kaliumbetont; zu viel Stickstoff fördert Blatt statt Frucht.'}},
 gurken:{early:{name:'Brennnesseljauche',dose:'1:15 verdünnt',until:5,note:'Auf feuchte Erde geben.'},late:{name:'Kaliumbetonter Gemüse- oder Tomatendünger',dose:'nach Herstellerangabe',from:6,note:'Ab Fruchtbildung überwiegend kaliumbetont; Brennnesseljauche nur noch gelegentlich.'}},
 sellerie:{all:{name:'Brennnesseljauche oder organischer Gemüsedünger',dose:'Brennnesseljauche 1:10 bis 1:15',note:'Starkzehrer; regelmäßig, aber nicht auf trockene Erde düngen.'}},
 karfiol:{all:{name:'Brennnesseljauche oder organischer Gemüsedünger',dose:'1:10 bis 1:15',note:'Bis zur Kopfbildung regelmäßig versorgen; danach zurückhaltender.'}},
 brokkoli:{all:{name:'Brennnesseljauche oder organischer Gemüsedünger',dose:'1:10 bis 1:15',note:'Regelmäßig und gleichmäßig düngen.'}},
 porree:{all:{name:'Brennnesseljauche oder organischer Gemüsedünger',dose:'1:15',note:'Leicht, aber regelmäßig düngen.'}},
 salate:{all:{name:'Sehr schwache Brennnesseljauche',dose:'1:20',note:'Nur bei sichtbarem Bedarf; nicht überdüngen.'}},
 basilikum:{all:{name:'Milder Kräuter- oder organischer Flüssigdünger',dose:'halbe Herstellerdosierung',note:'Brennnesseljauche höchstens sehr schwach 1:25.'}},
 'thai-basilikum':{all:{name:'Milder Kräuter- oder organischer Flüssigdünger',dose:'halbe Herstellerdosierung',note:'Sparsam düngen.'}},
 minze:{all:{name:'Milder Kräuterdünger',dose:'halbe Herstellerdosierung',note:'Brennnesseljauche nur sehr schwach 1:25.'}},
 oregano:{all:{name:'Kein Dünger oder sehr wenig Kräuterdünger',dose:'höchstens Vierteldosierung',note:'Oregano bevorzugt magere Erde.'}},
 estragon:{all:{name:'Milder Kräuterdünger',dose:'halbe Herstellerdosierung',note:'Nur mäßig düngen.'}},
 majoran:{all:{name:'Milder Kräuterdünger',dose:'höchstens halbe Herstellerdosierung',note:'Sehr sparsam düngen.'}},
 hortensien:{all:{name:'Hortensiendünger',dose:'nach Herstellerangabe',note:'Keinen kalkreichen Dünger; auf feuchte Erde geben.'}},
 olive:{all:{name:'Mediterraner Kübelpflanzendünger oder organischer Langzeitdünger',dose:'sparsam nach Herstellerangabe',note:'Ab September nicht mehr düngen.'}},
 feige:{early:{name:'Organischer Langzeitdünger',dose:'mäßige Gabe',until:5,note:'Frühjahrsversorgung.'},late:{name:'Kaliumbetonter Obst- oder Tomatendünger',dose:'schwach nach Herstellerangabe',from:6,note:'Bei Fruchtbildung nicht mehr stark stickstoffbetont; ab September Pause.'}},
 granatapfel:{early:{name:'Organischer Langzeitdünger',dose:'mäßig',until:5,note:'Frühjahrsversorgung.'},late:{name:'Kaliumbetonter Kübelpflanzen- oder Tomatendünger',dose:'schwach nach Herstellerangabe',from:6,note:'Ab September Düngung einstellen.'}},
 ahorn:{all:{name:'Organischer Langzeitdünger für Gehölze',dose:'schwach dosiert',note:'Nur bis Ende Juli; ab August keine Düngung.'}},
 viburnum:{all:{name:'Organischer Langzeitdünger für Gehölze',dose:'mäßig',note:'Nach Juni nur noch bei erkennbarem Bedarf.'}},
 pittosporum:{all:{name:'Organischer Langzeitdünger',dose:'mäßig nach Herstellerangabe',note:'Ab August nur noch schwach.'}},
 euonymus:{all:{name:'Organischer Langzeitdünger',dose:'mäßig bis schwach',note:'Brennnesseljauche meist unnötig.'}},
 'euonymus-alatus':{all:{name:'Organischer Gehölzdünger',dose:'nur schwach und nur bei erkennbarem Bedarf',note:'Den erkrankten Strauch nicht zusätzlich stickstoffreich düngen.'}},
 birnenbaum:{early:{name:'Organischer Obstbaum-Langzeitdünger oder Hornspäne',dose:'Frühjahrsgabe nach Herstellerangabe',until:5,note:'Hornspäne nur im Frühjahr.'},late:{name:'Kaliumbetonter Obstbaumdünger',dose:'schwach nach Herstellerangabe',from:6,note:'Ab August keinen stickstoffreichen Dünger mehr.'}},
 felsenbirne:{all:{name:'Organischer Langzeitdünger für Beeren- oder Obstgehölze',dose:'schwach',note:'Genügsam; nach Juni meist keine weitere Düngung nötig.'}},
 weichsel:{early:{name:'Organischer Obstbaum-Langzeitdünger oder Hornspäne',dose:'Frühjahrsgabe',until:5,note:'Hornspäne nur im Frühjahr.'},late:{name:'Kaliumbetonter Obstbaumdünger',dose:'schwach',from:6,note:'Ab August keine stickstoffreiche Düngung mehr.'}},
 clematis:{all:{name:'Clematis- oder Blühpflanzendünger',dose:'nach Herstellerangabe',note:'Kaliumbetont während der Blüte; auf feuchte Erde geben.'}},
 hecke:{all:{name:'Organischer Langzeitdünger',dose:'nur leicht, bei Bedarf',note:'Etablierter Liguster braucht kaum Dünger.'}}
};
function fertilizerInfo(d,date=today()){
 if(!d.id.endsWith(':duengen')) return null;
 const plan=fertilizerPlans[d.plantId]; if(!plan) return {name:'Passender organischer Dünger',dose:'nach Herstellerangabe',note:'Auf feuchte Erde geben.'};
 const month=parse(date).getMonth()+1;
 if(plan.late && month>=plan.late.from) return {...plan.late,switched:true};
 if(plan.early && month<=plan.early.until) return plan.early;
 return plan.all||plan.late||plan.early;
}

/* -------------------------------------------------------------- state ------- */
let state=defaultState();
let lastIntegrity={ok:true,issues:[]};
let photoCache={};

const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const parse=s=>new Date(s+'T12:00:00');
const add=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
const diff=s=>Math.round((parse(s)-parse(today()))/86400000);
const fmt=s=>s?new Intl.DateTimeFormat('de-AT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(parse(s)):'—';
const isDateString=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(parse(v).getTime());

function defaultState(){return {tasks:{},history:[],health:{},profiles:{},observations:[],photoMeta:{},showAllSeasons:false,migrated:false,dataVersion:DATA_VERSION,meta:{created:new Date().toISOString(),updated:new Date().toISOString()}}}

function normalizeState(raw){
  const base=defaultState(), x=(raw&&typeof raw==='object')?raw:{};
  const out={...base,...x};
  out.tasks=(x.tasks&&typeof x.tasks==='object'&&!Array.isArray(x.tasks))?x.tasks:{};
  out.history=Array.isArray(x.history)?x.history:[];
  out.health=(x.health&&typeof x.health==='object'&&!Array.isArray(x.health))?x.health:{};
  out.profiles=(x.profiles&&typeof x.profiles==='object'&&!Array.isArray(x.profiles))?x.profiles:{};
  out.observations=Array.isArray(x.observations)?x.observations:[];
  out.photoMeta=(x.photoMeta&&typeof x.photoMeta==='object'&&!Array.isArray(x.photoMeta))?x.photoMeta:{};
  out.meta=(x.meta&&typeof x.meta==='object')?x.meta:{};
  out.showAllSeasons=Boolean(x.showAllSeasons); out.migrated=Boolean(x.migrated);
  out.dataVersion=DATA_VERSION;
  Object.entries(healthDefaults).forEach(([id,h])=>{if(!out.health[id])out.health[id]={...h,updated:''}});
  return out;
}

function migrateState(raw){
  let x=normalizeState(raw), from=Number(raw?.dataVersion||raw?.version||1);
  if(from<7){Object.entries(healthDefaults).forEach(([id,h])=>{if(!x.health[id])x.health[id]={...h,updated:''}})}
  if(from<11){x.profiles=x.profiles||{};x.observations=Array.isArray(x.observations)?x.observations:[];x.photoMeta=x.photoMeta||{}}
  if(from<8){x.meta.migratedFrom=from;x.meta.migratedAt=new Date().toISOString()}
  x.dataVersion=DATA_VERSION; return x;
}

/* One-time v12 cleanup: retire phantom Kirschlorbeer tasks (no such plant),
   archive genuinely unknown tasks. Hedge + cork spindle are real and kept. */
function cleanupV12(force=false){
  const CLEANUP=1; state.meta=state.meta||{};
  if(!force && Number(state.meta.v12CleanupVersion||0)>=CLEANUP) return {changed:false,dropped:0,archived:0,skipped:true};
  const validIds=new Set(defs.map(d=>d.id));
  state.meta.archivedTasks=Array.isArray(state.meta.archivedTasks)?state.meta.archivedTasks:[];
  let dropped=0,archived=0,changed=false;
  for(const id of Object.keys(state.tasks||{})){
    if(validIds.has(id)) continue;
    if(/^kirschlorbeer/i.test(id)){ delete state.tasks[id]; dropped++; changed=true; continue; }
    state.meta.archivedTasks.push({id,data:state.tasks[id],archivedAt:new Date().toISOString(),reason:'Aufgabe existiert in v12 nicht mehr'});
    delete state.tasks[id]; archived++; changed=true;
  }
  state.meta.v12CleanupVersion=CLEANUP;
  state.meta.lastCleanup={date:new Date().toISOString(),dropped,archived};
  if(changed) save(false);
  return {changed,dropped,archived,skipped:false};
}

function load(){
  const raw=localStorage.getItem(APP_KEY);
  if(!raw){state=defaultState();save(false);return}
  try{state=migrateState(JSON.parse(raw))}
  catch(e){console.error('Lokale Daten beschädigt',e);state=defaultState();state.meta.loadError=String(e)}
  save(false);
}

let snapshotTimer;
function save(scheduleSnapshot=true){
  state=normalizeState(state); state.meta.updated=new Date().toISOString();
  try{localStorage.setItem(APP_KEY,JSON.stringify(state))}
  catch(e){alert('Die lokalen Daten konnten nicht gespeichert werden. Bitte sofort eine Sicherung exportieren.');console.error(e)}
  if(window.CloudSync)CloudSync.onLocalChange();
  if(scheduleSnapshot){clearTimeout(snapshotTimer);snapshotTimer=setTimeout(()=>createLocalSnapshot('automatisch',false),1200)}
}

/* --------------------------------------------------------- task helpers ----- */
const plant=id=>plants.find(p=>p.id===id);
const taskState=id=>state.tasks[id]||{};
const nextFor=d=>taskState(d.id).next||'';
const inSeason=d=>d.months.includes(new Date().getMonth()+1);

function initialDueFor(d){
  const y=new Date().getFullYear();
  const firstMonth=Math.min(...d.months);
  if(d.interval>=365){ // annual event → first upcoming occurrence in its season
    const mm=String(firstMonth).padStart(2,'0');
    const dd=d.id.endsWith(':schnitt')||d.id.includes('winter')?'15':'01';
    const cand=`${y}-${mm}-${dd}`;
    return diff(cand)>=0?cand:`${y+1}-${mm}-${dd}`;
  }
  return today();
}

function initializeCareTasks(){
  let changed=false;
  defs.forEach(d=>{
    if(state.tasks[d.id]) return;
    if(d.id.endsWith(':duengen')) return;      // fertilizing started manually
    if(d.optional) return;                      // optional tasks not auto-started
    if(!inSeason(d)) return;
    state.tasks[d.id]={last:'',next:initialDueFor(d),autoStarted:true};
    changed=true;
  });
  if(changed) save();
}

function classify(d){const n=nextFor(d);if(!n)return 'new';const x=diff(n);return x<0?'late':x<=0?'due':x<=7?'soon':'ok'}
function statusText(d){const n=nextFor(d);if(!n)return 'Noch nicht terminiert';const x=diff(n);
  if(x<0)return `${Math.abs(x)} Tag${Math.abs(x)==1?'':'e'} überfällig`;
  if(x===0)return 'Heute fällig';if(x===1)return 'Morgen fällig';return `In ${x} Tagen`}
function sortTasks(a,b){const an=nextFor(a)||'9999',bn=nextFor(b)||'9999';
  return an.localeCompare(bn)||plant(a.plantId).name.localeCompare(plant(b.plantId).name)}

function complete(id){
  const d=defs.find(x=>x.id===id),date=today(),next=add(date,d.interval),fert=fertilizerInfo(d,date);
  state.tasks[id]={last:date,next};
  state.history.unshift({date,taskId:id,plantId:d.plantId,title:d.title,fertilizer:fert?.name||''});
  save();renderAll();
  toast(`${d.title} erledigt – wieder am ${fmt(next)}${fert?` · ${fert.name}`:''}`);
}
function setTaskDate(id,date){if(!date)return;const d=defs.find(x=>x.id===id);
  state.tasks[id]={last:date,next:add(date,d.interval)};save();renderAll();toast('Termin aktualisiert')}
function clearTask(id){delete state.tasks[id];save();renderAll()}
function startTask(id){const d=defs.find(x=>x.id===id);if(!d)return;
  state.tasks[id]={last:'',next:initialDueFor(d),autoStarted:false};save();renderAll();toast('Aufgabe gestartet')}

function migrateLegacy(force=false){
  let old={};try{old=JSON.parse(localStorage.getItem(LEGACY_KEY)||'{}')}catch(e){}
  let n=0;
  Object.entries(old).forEach(([pid,v])=>{const id=`${pid}:duengen`,d=defs.find(x=>x.id===id);
    if(d&&v.last&&(force||!state.tasks[id])){state.tasks[id]={last:v.last,next:add(v.last,d.interval)};n++}});
  state.migrated=true;save();renderAll();
}

/* --------------------------------------------------------------- health ----- */
const healthFor=id=>state.health[id]||{status:'🟢 Gesund',reason:'',updated:''};

/* ================================================================ RENDER ==== */

function renderSeason(){
  const m=new Date().getMonth()+1;
  const names=['Winter','Winter','Frühling','Frühling','Frühling','Sommer','Sommer','Sommer','Herbst','Herbst','Herbst','Winter'];
  const el=document.getElementById('season');
  const bars=Array.from({length:12},(_,i)=>{const mm=i+1;const on=mm<=m;const now=mm===m;
    return `<i class="${now?'now':on?'on':''}"></i>`}).join('');
  el.innerHTML=`<div class="s-name">${names[m-1]}</div>
    <div class="s-date">${new Intl.DateTimeFormat('de-AT',{weekday:'short',day:'numeric',month:'long',year:'numeric'}).format(new Date())}</div>
    <div class="s-bar" title="Gartenjahr">${bars}</div>`;
}

function renderStats(){
  const active=defs.filter(d=>inSeason(d)||state.showAllSeasons);
  const count=c=>active.filter(d=>classify(d)===c).length;
  document.getElementById('stats').innerHTML=
   `<div class="stat late"><b>${count('late')}</b><span>überfällig</span></div>
    <div class="stat due"><b>${count('due')}</b><span>heute fällig</span></div>
    <div class="stat soon"><b>${count('soon')}</b><span>diese Woche</span></div>
    <div class="stat ok"><b>${count('ok')}</b><span>später fällig</span></div>`;
}

function taskHTML(d){
  const p=plant(d.plantId),s=taskState(d.id),started=!!state.tasks[d.id];
  const cls=started?classify(d):'new';
  const fert=fertilizerInfo(d,nextFor(d)||today());
  const fertHTML=fert?`<div class="fert"><b>🌿 Dünger: ${esc(fert.name)}</b><br><span>Dosierung: ${esc(fert.dose)}</span>${fert.note?`<br><span>${esc(fert.note)}</span>`:''}${fert.switched?`<span class="switch">↪ Automatische Umstellung: Brennnesseljauche ist jetzt nicht mehr Hauptdünger.</span>`:''}</div>`:'';
  const meta=started
    ? `<span class="badge">${esc(p.cat)}</span><strong>${esc(p.name)}</strong> · ${statusText(d)}${nextFor(d)?` · fällig ${fmt(nextFor(d))}`:''}${s.last?` · zuletzt ${fmt(s.last)}`:''}`
    : `<span class="badge">${esc(p.cat)}</span><strong>${esc(p.name)}</strong> · ${d.optional?'optional':'noch nicht gestartet'}`;
  const actions=started
    ? `<input aria-label="Datum" type="date" value="${s.last||''}" onchange="setTaskDate('${d.id}',this.value)">
       <button class="btn primary" onclick="complete('${d.id}')">✓ Erledigt</button>
       ${s.last?`<button class="btn" onclick="clearTask('${d.id}')">Zurücksetzen</button>`:''}`
    : `<button class="btn soft" onclick="startTask('${d.id}')">Aufgabe starten</button>`;
  return `<article class="task ${cls}"><div>
    <h3>${esc(d.title)}</h3>
    <div class="meta">${meta}</div>
    ${d.note?`<div class="note">${esc(d.note)}</div>`:''}${fertHTML}
   </div><div class="actions">${actions}</div></article>`;
}

function relevantToday(){return defs.filter(d=>(inSeason(d)||state.showAllSeasons)&&state.tasks[d.id]&&['late','due'].includes(classify(d))).sort(sortTasks)}
function renderToday(){
  const overdue=relevantToday();
  const upcoming=defs.filter(d=>(inSeason(d)||state.showAllSeasons)&&state.tasks[d.id]&&classify(d)==='soon').sort(sortTasks).slice(0,8);
  document.getElementById('todayContent').innerHTML=
   `<div class="section-title"><h2>Jetzt zu erledigen</h2><small>${overdue.length} Aufgabe${overdue.length===1?'':'n'}</small></div>
    ${overdue.length?`<div class="task-list">${overdue.map(taskHTML).join('')}</div>`:`<div class="empty">🎉 Heute ist nichts dringend fällig.</div>`}
    <div class="section-title"><h2>Als Nächstes</h2><small>Nächste 7 Tage</small></div>
    ${upcoming.length?`<div class="task-list">${upcoming.map(taskHTML).join('')}</div>`:`<div class="empty">Keine weiteren Aufgaben in den nächsten sieben Tagen.</div>`}`;
}
function renderWeek(){
  const list=defs.filter(d=>(inSeason(d)||state.showAllSeasons)&&state.tasks[d.id]&&['late','due','soon'].includes(classify(d))).sort(sortTasks);
  document.getElementById('weekContent').innerHTML=list.length
   ?`<div class="task-list">${list.map(taskHTML).join('')}</div>`
   :'<div class="empty">Diese Woche ist alles erledigt.</div>';
}

function renderPlants(){
  const q=(document.getElementById('plantSearch')?.value||'').toLowerCase();
  const cat=document.getElementById('catFilter')?.value||'all';
  const list=plants.filter(p=>(cat==='all'||p.cat===cat)&&p.name.toLowerCase().includes(q));
  document.getElementById('plantGrid').innerHTML=list.map(p=>{
    const ts=defs.filter(d=>d.plantId===p.id);
    const next=ts.filter(d=>state.tasks[d.id]&&nextFor(d)).sort(sortTasks)[0];
    const photo=photoCache[p.id],h=healthFor(p.id),pf=profileFor(p.id);
    return `<article class="plant-card">
      <div class="pc-photo" onclick="openPlantFile('${p.id}')">
        <span class="pc-health">${esc(h.status)}</span>
        ${photo?`<img src="${photo}" alt="${esc(p.name)}">`:`<div class="pc-empty">📷 Kein Foto<br>Tippen für Pflanzenakte</div>`}
      </div>
      <div class="pc-body">
        <span class="badge">${esc(p.cat)}</span>
        <h3>${esc(p.name)}</h3>
        <div class="meta">${esc(h.reason||p.note)}</div>
        <div class="pc-next"><strong>Nächster Termin:</strong><br>${next?`${esc(next.title)} · ${fmt(nextFor(next))}`:'Noch keine Aufgabe geplant'}</div>
        <div class="pc-actions">
          <button class="btn primary" onclick="openPlantFile('${p.id}')">Pflanzenakte</button>
          <button class="btn" onclick="quickPhoto('${p.id}')">📷 Foto</button>
        </div>
      </div>
    </article>`;
  }).join('')||'<div class="empty">Keine passende Pflanze gefunden.</div>';
}

function renderJournal(){
  document.getElementById('journalContent').innerHTML=state.history.length
   ?`<div class="journal">${state.history.slice(0,120).map(h=>`<div class="j-row">
      <div class="date">${fmt(h.date)}</div>
      <div><strong>${esc(h.title)}</strong><div class="meta">${esc(plant(h.plantId)?.name||h.plantId)}${h.fertilizer?` · Dünger: ${esc(h.fertilizer)}`:''}${h.note?` · ${esc(h.note)}`:''}</div></div>
    </div>`).join('')}</div>`
   :'<div class="empty">Noch keine Einträge. Nach dem ersten „Erledigt“ erscheint hier der Verlauf.</div>';
}

/* --------------------------------------------------------- plant profiles --- */
const PROFILE_FIELDS=['location','planted','watering','fertilizing','diseases','treatments','harvest','notes'];
const PROFILE_LABELS={location:'Standort / Gartenbereich',planted:'Gepflanzt / Alter',watering:'Bewässerungsplan',fertilizing:'Düngeplan',diseases:'Krankheiten / Risiken',treatments:'Behandlungen / Maßnahmen',harvest:'Ernte / Entwicklung',notes:'Allgemeine Notizen'};
const profileFor=id=>{const b={};PROFILE_FIELDS.forEach(f=>b[f]='');return {...b,...(state.profiles[id]||{})}};
function saveProfile(id){
  const p={};PROFILE_FIELDS.forEach(f=>p[f]=(document.getElementById(`pf-${f}`)?.value||'').trim());
  state.profiles[id]=p;
  state.history.unshift({date:today(),taskId:'profile',plantId:id,title:'Pflanzenakte aktualisiert'});
  save();renderPlants();openPlantFile(id);toast('Pflanzenakte gespeichert');
}

/* --------------------------------------------------------- observations ----- */
function addObservation(id,type,text){
  if(!text)return;
  state.observations.unshift({id:`obs-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,plantId:id,date:today(),type,text});
  state.history.unshift({date:today(),taskId:'observation',plantId:id,title:type,note:text});
  save();renderJournal();renderPlants();
  if(!document.getElementById('plantFile').classList.contains('hidden'))openPlantFile(id);
  toast('Eintrag gespeichert');
}
function addObservationFromForm(id){
  const type=document.getElementById('obs-type').value,text=document.getElementById('obs-text').value.trim();
  if(text)addObservation(id,type,text);
}
function deleteObservation(id,plantId){
  if(!confirm('Diesen Eintrag löschen?'))return;
  state.observations=state.observations.filter(o=>o.id!==id);save();openPlantFile(plantId);toast('Eintrag gelöscht');
}
function plantTimeline(id){
  const obs=(state.observations||[]).filter(o=>o.plantId===id);
  const hist=(state.history||[]).filter(h=>h.plantId===id&&!['observation'].includes(h.taskId))
    .map((h,i)=>({id:`hist-${i}`,plantId:id,date:h.date,type:h.taskId==='health'?'Gesundheit':h.taskId==='profile'?'Akte':'Pflege',
      text:[h.title,h.note,h.fertilizer?`Dünger: ${h.fertilizer}`:''].filter(Boolean).join(' · '),readonly:true}));
  return [...obs,...hist].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
}

/* ------------------------------------------------- KI diagnosis import ------ */
/* Merge one diagnosis entry from the Drive inbox (gartenmanager-ki-diagnose.json)
   into local state. Called by cloud-sync during reconcile — the iPad remains the
   single writer of the data file; the AI only files suggestions through this
   inbox. Profile texts are appended with a dated [KI …] tag, never overwritten.
   Returns true if anything changed. */
function applyKiDiagnosis(e){
  if(!e||!plant(e.plantId))return false;
  const d=isDateString(e.date)?e.date:today();
  let changed=false;
  if(e.status||e.reason){
    const cur=healthFor(e.plantId);
    state.health[e.plantId]={status:e.status||cur.status,reason:e.reason!==undefined?e.reason:cur.reason,updated:d};
    changed=true;
  }
  if(e.observation){
    state.observations.unshift({id:`obs-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,plantId:e.plantId,date:d,type:'KI-Diagnose',text:e.observation});
    changed=true;
  }
  if(e.profile&&typeof e.profile==='object'){
    const prof={...profileFor(e.plantId)};
    for(const f of PROFILE_FIELDS){
      const txt=e.profile[f];
      if(!txt||typeof txt!=='string')continue;
      const tag=`[KI ${d}] ${txt}`;
      if(prof[f]&&prof[f].indexOf(tag)!==-1)continue;   // already applied
      prof[f]=prof[f]?`${prof[f]}\n${tag}`:tag;
      changed=true;
    }
    state.profiles[e.plantId]=prof;
  }
  return changed;
}

/* -------------------------------------------------------------- photos ------ */
function photoDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);
  r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains('photos'))db.createObjectStore('photos');
    if(!db.objectStoreNames.contains('backups'))db.createObjectStore('backups',{keyPath:'id'})};
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}

async function loadPhotos(){try{const db=await photoDB();
  photoCache=await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readonly'),st=tx.objectStore('photos'),r=st.getAllKeys(),out={};
    r.onsuccess=()=>{const keys=r.result;if(!keys.length)return resolve(out);let left=keys.length;
      keys.forEach(k=>{const g=st.get(k);g.onsuccess=()=>{out[k]=g.result;if(!--left)resolve(out)};g.onerror=()=>{if(!--left)resolve(out)}})};
    r.onerror=()=>reject(r.error)});db.close()}catch(e){console.warn('Fotos nicht geladen',e)}}

async function migrateOldPhotoDB(){try{
  const old=await new Promise((resolve,reject)=>{const r=indexedDB.open('gartenmanager_photos',1);
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onupgradeneeded=()=>{}});
  if(!old.objectStoreNames.contains('photos')){old.close();return 0}
  const data=await new Promise((resolve,reject)=>{const tx=old.transaction('photos','readonly'),st=tx.objectStore('photos'),req=st.getAllKeys(),out={};
    req.onsuccess=()=>{const keys=req.result;if(!keys.length)return resolve(out);let left=keys.length;
      keys.forEach(k=>{const g=st.get(k);g.onsuccess=()=>{out[k]=g.result;if(!--left)resolve(out)};g.onerror=()=>{if(!--left)resolve(out)}})};
    req.onerror=()=>reject(req.error)});old.close();
  if(!Object.keys(data).length)return 0;
  const db=await photoDB();await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite'),st=tx.objectStore('photos');
    Object.entries(data).forEach(([k,v])=>st.put(v,k));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
  return Object.keys(data).length}catch(e){return 0}}

function resizePhoto(file){return new Promise((resolve,reject)=>{const img=new Image(),u=URL.createObjectURL(file);
  img.onload=()=>{const max=1200,scale=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');
    c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(u);resolve(c.toDataURL('image/jpeg',.82))};
  img.onerror=reject;img.src=u})}

async function putPhoto(key,data){const db=await photoDB();
  await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put(data,key);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();photoCache[key]=data}
async function removePhoto(key){const db=await photoDB();
  await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').delete(key);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();delete photoCache[key]}

/* Cover photo (one per plant, keyed by plant id) */
function pickImage(useCamera){return new Promise(resolve=>{const i=document.createElement('input');
  i.type='file';i.accept='image/*';if(useCamera)i.setAttribute('capture','environment');
  i.onchange=()=>resolve(i.files[0]||null);i.click()})}
async function quickPhoto(id){const f=await pickImage(true);if(f)await setCover(id,f)}
async function setCover(id,file){
  if(!file||!file.type.startsWith('image/'))return;
  const data=await resizePhoto(file);await putPhoto(id,data);
  state.photoMeta[id]={plantId:id,date:today(),caption:'Titelbild',cover:true};
  save();renderPlants();
  if(!document.getElementById('plantFile').classList.contains('hidden'))openPlantFile(id);
  toast('Titelbild gespeichert');
}
async function deleteCover(id){if(!confirm('Titelbild löschen?'))return;await removePhoto(id);delete state.photoMeta[id];save();renderPlants();
  if(!document.getElementById('plantFile').classList.contains('hidden'))openPlantFile(id);}

/* Timeline photo (many per plant) with note, added to history in one step */
async function addTimelinePhoto(id,useCamera){
  const file=await pickImage(useCamera);if(!file||!file.type.startsWith('image/'))return;
  const data=await resizePhoto(file),key=`timeline|${id}|${Date.now()}`;
  const caption=(prompt('Kurze Notiz zum Foto (optional):')||'').trim();
  await putPhoto(key,data);
  state.photoMeta[key]={plantId:id,date:today(),caption,cover:false};
  state.observations.unshift({id:`obs-${Date.now()}`,plantId:id,date:today(),type:'Foto',text:caption||'Neues Verlaufsfoto',photoKey:key});
  save();openPlantFile(id);toast('Verlaufsfoto gespeichert');
}
async function deleteTimelinePhoto(key,id){if(!confirm('Dieses Verlaufsfoto löschen?'))return;
  await removePhoto(key);delete state.photoMeta[key];
  state.observations=state.observations.filter(o=>o.photoKey!==key);
  save();openPlantFile(id);}

/* -------------------------------------------------------- plant file modal -- */
function updateHealthFromFile(id){
  const status=document.getElementById('file-health-status').value;
  const reason=document.getElementById('file-health-reason').value.trim();
  const old=healthFor(id);
  state.health[id]={status,reason,updated:today()};
  state.observations.unshift({id:`obs-${Date.now()}`,plantId:id,date:today(),type:'Gesundheit',text:`${old.status} → ${status}${reason?`: ${reason}`:''}`});
  state.history.unshift({date:today(),taskId:'health',plantId:id,title:`Gesundheitsstatus: ${status}`,note:reason});
  save();renderPlants();openPlantFile(id);toast('Gesundheitsstatus gespeichert');
}

function openPlantFile(id){
  const p=plant(id);if(!p)return;
  const h=healthFor(id),pf=profileFor(id);
  const statuses=['🟢 Gesund','🟡 Beobachten','🟠 Behandlung läuft','🔴 Handlungsbedarf'];
  const ts=defs.filter(d=>d.plantId===id);
  const timeline=plantTimeline(id);
  const photos=Object.entries(state.photoMeta||{}).filter(([k,m])=>m.plantId===id&&!m.cover&&photoCache[k])
    .sort((a,b)=>(b[1].date||'').localeCompare(a[1].date||''));
  const el=document.getElementById('plantFile');el.classList.remove('hidden');
  el.innerHTML=`<div class="pf-panel">
    <div class="pf-head">
      <div><h2>${esc(p.name)}</h2><div class="meta">${esc(p.cat)}${pf.location?` · 📍 ${esc(pf.location)}`:''}</div></div>
      <button class="pf-close" onclick="closePlantFile()" aria-label="Schließen">×</button>
    </div>
    <div class="pf-body"><div class="grid2">

      <section class="fp"><h3>🩺 Gesundheit</h3>
        <div class="field"><select id="file-health-status">${statuses.map(x=>`<option${x===h.status?' selected':''}>${x}</option>`).join('')}</select></div>
        <div class="field"><textarea id="file-health-reason" placeholder="Aktuelle Beobachtung oder Diagnose">${esc(h.reason||'')}</textarea></div>
        <button class="btn primary" onclick="updateHealthFromFile('${id}')">Gesundheit speichern</button>
        ${h.updated?`<p class="meta" style="margin-top:8px">Zuletzt aktualisiert: ${fmt(h.updated)}</p>`:''}
      </section>

      <section class="fp"><h3>📷 Titelbild</h3>
        ${photoCache[id]?`<img src="${photoCache[id]}" alt="${esc(p.name)}" style="width:100%;height:180px;object-fit:cover;border-radius:12px;margin-bottom:8px">`:'<div class="empty">Noch kein Titelbild</div>'}
        <div class="capture-row">
          <button class="btn" onclick="quickPhoto('${id}')">📷 Aufnehmen</button>
          <button class="btn soft" onclick="chooseCover('${id}')">Aus Galerie</button>
          ${photoCache[id]?`<button class="btn danger" onclick="deleteCover('${id}')">Löschen</button>`:''}
        </div>
      </section>

      <section class="fp full"><h3>🌿 Stammdaten und Pflegehinweise</h3>
        <div class="form-grid">
          ${PROFILE_FIELDS.map(f=>`<div class="field ${['watering','fertilizing','diseases','treatments','harvest','notes'].includes(f)?'full':''}">
            <label>${PROFILE_LABELS[f]}</label>
            ${['location','planted'].includes(f)
              ?`<input id="pf-${f}" value="${esc(pf[f])}">`
              :`<textarea id="pf-${f}">${esc(pf[f])}</textarea>`}
          </div>`).join('')}
        </div>
        <button class="btn primary" onclick="saveProfile('${id}')">Pflanzenakte speichern</button>
      </section>

      <section class="fp full"><h3>📝 Neue Beobachtung oder Maßnahme</h3>
        <div class="field"><label>Art</label>
          <select id="obs-type"><option>Beobachtung</option><option>Behandlung</option><option>Krankheit</option><option>Bewässerung</option><option>Düngung</option><option>Schnitt</option><option>Ernte</option></select></div>
        <div class="field"><label>Eintrag</label><input id="obs-text" placeholder="Was wurde beobachtet oder gemacht?"></div>
        <div class="capture-row">
          <button class="btn primary" onclick="addObservationFromForm('${id}')">Eintragen</button>
          <button class="btn soft" onclick="addTimelinePhoto('${id}',true)">📷 Foto aufnehmen</button>
          <button class="btn" onclick="addTimelinePhoto('${id}',false)">Foto aus Galerie</button>
        </div>
      </section>

      <section class="fp full"><h3>📅 Pflegeplan</h3>
        <div class="task-list">${ts.length?ts.map(taskHTML).join(''):'<div class="empty">Keine Aufgaben hinterlegt.</div>'}</div>
      </section>

      <section class="fp full"><h3>📷 Fotoverlauf</h3>
        ${photos.length?`<div class="photo-timeline">${photos.map(([k,m])=>`<div class="pe">
          <img src="${photoCache[k]}" alt="${esc(m.caption||'')}">
          <div class="cap"><strong>${fmt(m.date)}</strong><br><span class="meta">${esc(m.caption||'Ohne Notiz')}</span><br>
          <button class="link-danger" onclick="deleteTimelinePhoto('${k}','${id}')">Löschen</button></div>
        </div>`).join('')}</div>`:'<div class="empty">Noch keine Verlaufsfotos.</div>'}
      </section>

      <section class="fp full"><h3>🕰️ Verlauf</h3>
        ${timeline.length?`<div class="timeline">${timeline.slice(0,120).map(o=>`<div class="tl-item ${o.type==='Gesundheit'?'health':o.type==='Behandlung'?'treatment':o.type==='Krankheit'?'problem':''}">
          <div class="when">${fmt(o.date)} · ${esc(o.type)}</div>
          <div>${esc(o.text)}</div>
          ${!o.readonly?`<button class="link-danger" onclick="deleteObservation('${o.id}','${id}')">Löschen</button>`:''}
        </div>`).join('')}</div>`:'<div class="empty">Noch keine Einträge.</div>'}
      </section>

    </div></div></div>`;
}
async function chooseCover(id){const f=await pickImage(false);if(f)await setCover(id,f)}
function closePlantFile(){const el=document.getElementById('plantFile');el.classList.add('hidden');el.innerHTML=''}

/* ---------------------------------------------------------- settings view --- */
function renderSettings(){
  const bi=document.getElementById('backupInfo'),si=document.getElementById('snapshotInfo'),
        ii=document.getElementById('integrityInfo'),di=document.getElementById('dossierInfo'),
        stgl=document.getElementById('seasonToggle');
  const nPhotos=Object.keys(photoCache).length;
  if(bi)bi.textContent=`Datenversion ${DATA_VERSION} · ${nPhotos} Foto${nPhotos===1?'':'s'} lokal`;
  if(si)si.textContent=state.meta?.lastSnapshotAt?`Letzter Schnappschuss: ${new Date(state.meta.lastSnapshotAt).toLocaleString('de-AT')} (${state.meta.lastSnapshotReason||'automatisch'})`:'Noch kein Schnappschuss';
  if(ii)ii.textContent=state.meta?.lastIntegrityAt?`${state.meta.lastIntegrityOk?'✓ Keine erkennbaren Probleme':'⚠ Probleme gefunden'} · geprüft ${new Date(state.meta.lastIntegrityAt).toLocaleString('de-AT')}`:'Noch nicht geprüft';
  if(di)di.textContent=state.meta?.lastDossierAt?`Letzter KI-Export: ${new Date(state.meta.lastDossierAt).toLocaleString('de-AT')}`:'Noch kein KI-Export';
  if(stgl)stgl.textContent=state.showAllSeasons?'Nur saisonale Aufgaben anzeigen':'Auch außersaisonale anzeigen';
  if(window.CloudSync)CloudSync.renderStatus();
}
function toggleSeasons(){state.showAllSeasons=!state.showAllSeasons;save();renderAll()}

function renderAll(){renderSeason();renderStats();renderToday();renderWeek();renderPlants();renderJournal();renderSettings()}

function switchView(v){
  document.querySelectorAll('main>section').forEach(s=>s.classList.add('hidden'));
  document.getElementById('view-'+v).classList.remove('hidden');
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  if(v==='plants')renderPlants();
}

/* -------------------------------------------------- backup / integrity ------ */
async function sha256(text){if(!crypto?.subtle)return '';
  const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}

async function buildPayload(){await loadPhotos();
  const core={format:'gartenmanager-backup',version:DATA_VERSION,exported:new Date().toISOString(),state:normalizeState(state),photos:photoCache};
  const checksum=await sha256(JSON.stringify(core));return {...core,checksum}}

async function exportData(){
  try{const payload=await buildPayload();
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`gartenmanager-sicherung-v${DATA_VERSION}-${today()}.json`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    state.meta.lastExportAt=new Date().toISOString();save(false);renderSettings();
    toast(`Sicherung erstellt · ${Object.keys(photoCache).length} Fotos enthalten`);
  }catch(e){console.error(e);alert('Die Sicherung konnte nicht erstellt werden.')}
}

function validatePayload(x){const issues=[];
  if(!x||typeof x!=='object')issues.push('Datei enthält kein gültiges Objekt');
  const st=x?.state||x;if(!st||typeof st!=='object')issues.push('Gartendaten fehlen');
  if(st?.tasks&&!(typeof st.tasks==='object'&&!Array.isArray(st.tasks)))issues.push('Aufgabenformat ungültig');
  if(st?.history&&!Array.isArray(st.history))issues.push('Journalformat ungültig');
  if(x?.photos&&typeof x.photos!=='object')issues.push('Fotoformat ungültig');
  return issues;}

async function restorePhotos(photos){
  if(!photos||typeof photos!=='object')return 0;
  const entries=Object.entries(photos).filter(([,d])=>typeof d==='string'&&d.startsWith('data:image/'));
  const db=await photoDB();
  await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite'),st=tx.objectStore('photos');
    st.clear();entries.forEach(([id,data])=>st.put(data,id));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
  db.close();photoCache=Object.fromEntries(entries);return entries.length;}

function importData(){
  const i=document.createElement('input');i.type='file';i.accept='.json,application/json';
  i.onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();
    r.onload=async()=>{try{
      const x=JSON.parse(r.result),issues=validatePayload(x);if(issues.length)throw new Error(issues.join('\n'));
      if(x.checksum){const core={format:x.format,version:x.version,exported:x.exported,state:x.state,photos:x.photos};
        const actual=await sha256(JSON.stringify(core));
        if(actual&&actual!==x.checksum&&!confirm('Hinweis: Die Prüfsumme der Datei weicht ab (z. B. weil sie von einer anderen Version stammt oder bearbeitet wurde). Die Struktur ist gültig.\n\nTrotzdem importieren?'))return;}
      const st=x.state||x,photos=x.photos||{};
      const taskCount=Object.keys(st.tasks||{}).length,photoCount=Object.keys(photos).length,journalCount=Array.isArray(st.history)?st.history.length:0;
      if(!confirm(`Sicherung importieren?\n\n${taskCount} Aufgabenstände\n${journalCount} Journaleinträge\n${photoCount} Fotos\n\nDie aktuellen Daten werden vorher lokal gesichert.`))return;
      await createLocalSnapshot('vor Import',false);
      state=migrateState(st);const n=await restorePhotos(photos);
      cleanupV12(true);save(false);await runIntegrityCheck(false);renderAll();
      toast(`Daten importiert · ${n} Fotos wiederhergestellt`);
    }catch(err){console.error(err);alert(`Import fehlgeschlagen:\n${err.message||err}`)}};
    r.readAsText(f)};
  i.click();
}

async function createLocalSnapshot(reason='automatisch',announce=false){
  try{
    const now=Date.now(),last=Number(state.meta?.lastSnapshotAt||0);
    if(!announce&&reason==='automatisch'&&now-last<6*60*60*1000)return;
    const payload=await buildPayload(),db=await photoDB(),record={id:`${now}`,created:new Date(now).toISOString(),reason,payload};
    await new Promise((resolve,reject)=>{const tx=db.transaction('backups','readwrite'),st=tx.objectStore('backups');
      st.put(record);const req=st.getAll();
      req.onsuccess=()=>{const rows=req.result.sort((a,b)=>b.created.localeCompare(a.created));rows.slice(30).forEach(r=>st.delete(r.id))};
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
    state.meta.lastSnapshotAt=now;state.meta.lastSnapshotReason=reason;save(false);renderSettings();
    if(announce)toast('Schnappschuss erstellt');
  }catch(e){console.error(e);if(announce)alert('Schnappschuss fehlgeschlagen. Bitte eine Sicherung exportieren.')}
}
async function getLatestSnapshot(){const db=await photoDB();
  const rows=await new Promise((resolve,reject)=>{const tx=db.transaction('backups','readonly'),r=tx.objectStore('backups').getAll();
    r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)});db.close();
  return rows.sort((a,b)=>b.created.localeCompare(a.created))[0]||null}
async function restoreLatestSnapshot(){
  const snap=await getLatestSnapshot();if(!snap)return alert('Noch kein Schnappschuss vorhanden.');
  if(!confirm(`Schnappschuss vom ${new Date(snap.created).toLocaleString('de-AT')} wiederherstellen? Aktuelle Daten werden vorher gesichert.`))return;
  await createLocalSnapshot('vor Wiederherstellung',false);
  state=migrateState(snap.payload.state);await restorePhotos(snap.payload.photos||{});
  save(false);renderAll();toast('Schnappschuss wiederhergestellt');
}

/* Recovery: list every stored snapshot with its content counts so the user can
   restore an older one that still holds photos / activity, not just the latest. */
async function listSnapshots(){const db=await photoDB();
  const rows=await new Promise((resolve,reject)=>{const tx=db.transaction('backups','readonly'),r=tx.objectStore('backups').getAll();
    r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)});db.close();
  return rows.sort((a,b)=>b.created.localeCompare(a.created));}
async function renderSnapshotList(){
  const box=document.getElementById('snapshotList');if(!box)return;
  const rows=await listSnapshots();
  if(!rows.length){box.innerHTML='<div class="empty">Keine Wiederherstellungspunkte vorhanden.</div>';return}
  box.innerHTML=`<div class="journal">${rows.map(s=>{
    const st=(s.payload&&s.payload.state)||{};
    const nHist=Array.isArray(st.history)?st.history.length:0;
    const nObs=Array.isArray(st.observations)?st.observations.length:0;
    const nProf=st.profiles?Object.keys(st.profiles).length:0;
    const nPhotos=(s.payload&&s.payload.photos)?Object.keys(s.payload.photos).length:0;
    const rich=nPhotos>0||nHist>0||nObs>0;
    return `<div class="j-row"><div class="date">${new Date(s.created).toLocaleString('de-AT')}</div>
      <div><strong>${esc(s.reason||'automatisch')}</strong>
      <div class="meta">${nHist} Journal · ${nObs} Beobachtungen · ${nProf} Akten · <b>${nPhotos} Foto${nPhotos===1?'':'s'}</b></div>
      <button class="btn ${rich?'primary':''}" onclick="restoreSnapshotById('${s.id}')">Diesen wiederherstellen</button></div></div>`;
  }).join('')}</div>`;
}
async function restoreSnapshotById(id){
  const rows=await listSnapshots(),snap=rows.find(s=>String(s.id)===String(id));
  if(!snap)return alert('Wiederherstellungspunkt nicht gefunden.');
  const nPhotos=(snap.payload&&snap.payload.photos)?Object.keys(snap.payload.photos).length:0;
  if(!confirm(`Wiederherstellungspunkt vom ${new Date(snap.created).toLocaleString('de-AT')} laden?\n\n${nPhotos} Foto(s) enthalten.\n\nDie aktuellen Daten werden vorher gesichert.`))return;
  await createLocalSnapshot('vor Wiederherstellung',false);
  state=migrateState(snap.payload.state);await restorePhotos(snap.payload.photos||{});
  save(false);renderAll();renderSnapshotList();toast('Wiederherstellungspunkt geladen');
}

async function runIntegrityCheck(announce=false){
  const cleanup=cleanupV12(false);
  const issues=[];state=normalizeState(state);
  Object.entries(state.tasks).forEach(([id,t])=>{if(!defs.some(d=>d.id===id))issues.push(`Unbekannte Aufgabe: ${id}`);
    if(t.last&&!isDateString(t.last))issues.push(`Ungültiges letztes Datum bei ${id}`);
    if(t.next&&!isDateString(t.next))issues.push(`Ungültiger Folgetermin bei ${id}`)});
  state.history.forEach((h,i)=>{if(!h||typeof h!=='object')issues.push(`Ungültiger Journaleintrag ${i+1}`);
    else if(h.date&&!isDateString(h.date))issues.push(`Ungültiges Journal-Datum ${i+1}`)});
  Object.entries(state.health).forEach(([id,h])=>{if(!plant(id))issues.push(`Gesundheitsstatus für unbekannte Pflanze: ${id}`);
    if(h.updated&&!isDateString(h.updated))issues.push(`Ungültiges Gesundheitsdatum bei ${id}`)});
  Object.entries(state.profiles||{}).forEach(([id])=>{if(!plant(id))issues.push(`Pflanzenakte für unbekannte Pflanze: ${id}`)});
  (state.observations||[]).forEach((o,i)=>{if(!plant(o.plantId))issues.push(`Beobachtung ${i+1} bei unbekannter Pflanze: ${o.plantId}`);
    if(!isDateString(o.date))issues.push(`Ungültiges Beobachtungsdatum bei Eintrag ${i+1}`)});
  await loadPhotos();
  Object.entries(photoCache).forEach(([id,data])=>{if(typeof data!=='string'||!data.startsWith('data:image/'))issues.push(`Beschädigtes Foto bei ${id}`)});
  lastIntegrity={ok:issues.length===0,issues};
  state.meta.lastIntegrityAt=new Date().toISOString();state.meta.lastIntegrityOk=lastIntegrity.ok;
  save(false);renderSettings();
  if(announce){const cleaned=cleanup.changed?`\n\nBereinigt: ${cleanup.dropped} Kirschlorbeer-Aufgabe(n) entfernt, ${cleanup.archived} unbekannte archiviert.`:'';
    alert(issues.length?`Datenprüfung: ${issues.length} Problem(e):\n\n${issues.slice(0,10).join('\n')}${cleaned}`:`Datenprüfung: Keine erkennbaren Probleme.${cleaned}`)}
  return lastIntegrity;
}

async function resetApp(){
  if(!confirm('Wirklich alle Daten zurücksetzen? Vorher wird automatisch ein Schnappschuss angelegt.'))return;
  await createLocalSnapshot('vor Zurücksetzen',false);
  localStorage.removeItem(APP_KEY);state=defaultState();save(false);await restorePhotos({});renderAll();
  toast('Gartenmanager zurückgesetzt');
}

/* ------------------------------------------------- AI dossier (MCP-ready) --- */
/* Structured, human- and machine-readable export of each plant's full history,
   designed for Claude to reason over via MCP. Photos referenced by key + date;
   base64 image data included separately so text reasoning stays light. */
function buildPlantDossier(id){
  const p=plant(id);
  const care=defs.filter(d=>d.plantId===id).map(d=>{const s=taskState(d.id);
    return {task:d.title,type:d.id.split(':')[1],intervalDays:d.interval,activeMonths:d.months,
      lastDone:s.last||null,nextDue:s.next||null,note:d.note||''}});
  const history=plantTimeline(id).map(o=>({date:o.date,type:o.type,text:o.text}));
  const photos=Object.entries(state.photoMeta||{}).filter(([,m])=>m.plantId===id)
    .map(([k,m])=>({key:k,date:m.date,caption:m.caption||'',isCover:!!m.cover,
      driveFile:gmDrivePhotoName(k,photoCache[k])}))
    .sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  return {
    plant:{id:p.id,name:p.name,category:p.cat,generalNote:p.note},
    currentHealth:healthFor(id),
    profile:profileFor(id),
    careSchedule:care,
    timeline:history,
    photos
  };
}
/* Drive filename for a photo: sanitised key + photo date + extension. The date
   suffix keeps replaced cover images apart, so every version survives in Drive
   as its own file. No date (legacy uploads) = plain sanitised key.
   Shared by the dossier (driveFile references) and cloud-sync photo uploads. */
function gmPhotoFileName(key,date,dataUrl){
  const ext=dataUrl&&dataUrl.startsWith('data:image/png')?'png':'jpg';
  return String(key).replace(/[^a-zA-Z0-9_-]+/g,'_')+(date?'_'+date:'')+'.'+ext;
}
/* Actual Drive filename for an already-uploaded photo, from cloud-sync's local
   index; falls back to the legacy (undated) name for pre-index uploads. */
function gmDrivePhotoName(key,dataUrl){
  try{
    const idx=JSON.parse(localStorage.getItem('gm_drive_photo_index')||'{}');
    if(idx[key]&&idx[key].name)return idx[key].name;
  }catch(e){}
  return gmPhotoFileName(key,'',dataUrl);
}
/* includePhotos=false builds a light dossier for automatic cloud upload: photo
   base64 data already syncs inside gartenmanager-data.json, so the cloud copy
   only references photos by key instead of doubling every upload. */
async function buildDossierPayload(includePhotos){
  await loadPhotos();
  const dossiers=plants.filter(p=>p.id!=='garten').map(p=>buildPlantDossier(p.id));
  const payload={
    format:'gartenmanager-ai-dossier',version:DATA_VERSION,generated:new Date().toISOString(),
    readme:'Strukturierte Pflanzenakten für die KI-Analyse (Claude/MCP). Jede Pflanze enthält Gesundheitsstatus, Stammdaten, Pflegeplan, chronologischen Verlauf und Fotoreferenzen.'+(includePhotos
      ?' Bilddaten stehen in "photoData" (Base64, Schlüssel = photos[].key).'
      :' Jedes Foto liegt als eigene Bilddatei im Drive-Unterordner "photos/" (Dateiname = photos[].driveFile). Der Ordner ist ein reines Archiv: auch in der App gelöschte Fotos und ersetzte Titelbilder bleiben dort als Verlauf erhalten (Titelbild-Versionen = frühere Bilder der Fotohistorie).'),
    plants:dossiers
  };
  if(includePhotos)payload.photoData=photoCache;
  return payload;
}
async function exportDossier(){
  try{
    const payload=await buildDossierPayload(true);
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`gartenmanager-ki-akte-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    state.meta.lastDossierAt=new Date().toISOString();save(false);renderSettings();
    toast('KI-Akte exportiert');
  }catch(e){console.error(e);alert('Der KI-Export konnte nicht erstellt werden.')}
}

/* ---------------------------------------------------------------- utils ----- */
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function toast(t){const e=document.getElementById('toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2600)}

/* ---------------------------------------------------------------- wiring ---- */
document.getElementById('nav').addEventListener('click',e=>{const b=e.target.closest('button');if(b)switchView(b.dataset.view)});
document.getElementById('plantFile').addEventListener('click',e=>{if(e.target.id==='plantFile')closePlantFile()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closePlantFile()});
document.getElementById('plantSearch').addEventListener('input',renderPlants);
document.getElementById('catFilter').addEventListener('change',renderPlants);
const cats=[...new Set(plants.map(p=>p.cat))].sort();
document.getElementById('catFilter').innerHTML+=cats.map(c=>`<option>${esc(c)}</option>`).join('');

async function startApp(){
  load();
  await migrateOldPhotoDB();
  await loadPhotos();
  cleanupV12(false);
  initializeCareTasks();
  if(!state.migrated)migrateLegacy();
  renderAll();
  await runIntegrityCheck(false);
  await createLocalSnapshot('automatisch',false);
  if(window.CloudSync)CloudSync.init();
  if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('service-worker.js')}catch(e){console.warn('SW nicht registriert',e)}}
}
startApp();
