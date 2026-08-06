/* ============================================================================
   Mein Garten – Gartenmanager v12
   Offline-first PWA. Data: localStorage (state) + IndexedDB (photos, snapshots).
   Rebuilt from v11 with corrected botany, safer migration, friendlier capture,
   and an AI-ready per-plant dossier export for later MCP analysis.
   ========================================================================== */

const LEGACY_KEY='duengekalender_v1', APP_KEY='gartenmanager_v2';
const DATA_VERSION=12, DB_NAME='gartenmanager_storage', DB_VERSION=2;
/* Build of the code itself. DATA_VERSION is the storage format and has not moved
   since v12 — it says nothing about which JavaScript a device is running, which
   made a stale device impossible to spot. Keep this in step with CACHE in
   service-worker.js; the app compares the two at runtime and says so if they
   disagree. */
const APP_BUILD='v48';

/* ---------------------------------------------------------------- plants ---- */
/* Built-in garden inventory. User-added plants live in state.customPlants /
   state.customTasks and are merged in by rebuildCatalog(). */
const basePlants=[
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
let plants=basePlants.slice();

/* ------------------------------------------------------ default health ------ */
/* The four health values the app understands. Single source of truth: the
   plant-file dropdown renders from this list and every incoming diagnosis is
   validated against it, so a status that cannot round-trip through the UI can
   never enter state. Also mirrored as an enum in the KI request schema. */
const HEALTH_STATUSES=['🟢 Gesund','🟡 Beobachten','🟠 Behandlung läuft','🔴 Handlungsbedarf'];
const isHealthStatus=s=>HEALTH_STATUSES.includes(s);

const healthDefaults={
 'euonymus-alatus':{status:'🟠 Behandlung läuft',reason:'Fortschreitende Welke bzw. Triebsterben am erkrankten Strauch wird beobachtet'},
 felsenbirne:{status:'🟡 Beobachten',reason:'Gelbe Blätter beobachten'},
 rasen:{status:'🟡 Beobachten',reason:'Braune Stellen kontrollieren'}
};

/* ------------------------------------------------------------- care tasks --- */
/* [plantId, id, title, intervalDays, months[], note?, optional?] */
const baseDefs=[
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
let defs=baseDefs.slice();

/* ----------------------------------------------- custom plants (catalog) ---- */
const ALL_MONTHS=[1,2,3,4,5,6,7,8,9,10,11,12];
function slugify(s){return String(s).toLowerCase()
  .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
  .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')}

/* Merge built-in catalog with user-added plants/tasks from state. Runs on
   every renderAll, so any state change (import, cloud pull, KI inbox) is
   reflected immediately. */
function rebuildCatalog(){
  const cp=(state.customPlants||[]).filter(p=>p&&p.id&&p.name&&!basePlants.some(b=>b.id===p.id));
  plants=[...basePlants,...cp.map(p=>({id:p.id,name:p.name,cat:p.cat||'Zimmerpflanzen',note:p.note||''}))];
  // Custom tasks may now OVERRIDE a built-in task of the same id, not just add
  // new ones. A care plan that changes with the plant's condition has to be able
  // to alter an existing rhythm — otherwise the old and new regimes run in
  // parallel, which for things like "stop feeding from August" is actively
  // harmful rather than merely untidy.
  const byId=new Map(baseDefs.map(d=>[d.id,d]));
  (state.customTasks||[]).filter(t=>t&&t.id&&t.plantId).forEach(t=>{
    const base=byId.get(t.id);
    byId.set(t.id,{id:t.id,plantId:t.plantId,title:t.title||(base&&base.title)||'Pflege',
      interval:Number(t.interval)||(base&&base.interval)||14,
      months:Array.isArray(t.months)&&t.months.length?t.months.filter(m=>m>=1&&m<=12):((base&&base.months)||ALL_MONTHS),
      note:t.note!==undefined?t.note:((base&&base.note)||''),optional:!!t.optional});
  });
  // Retired tasks disappear from the plan entirely, so initializeCareTasks
  // cannot quietly restart them on the next app open.
  const sup=state.suppressedTasks||{};
  defs=[...byId.values()].filter(d=>!(sup[d.id]&&sup[d.id].active));
  refreshCatFilter();
}

function refreshCatFilter(){
  const sel=document.getElementById('catFilter');if(!sel)return;
  const cur=sel.value||'all';
  const cats=[...new Set(plants.map(p=>p.cat))].sort();
  sel.innerHTML='<option value="all">Alle Kategorien</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join('');
  sel.value=(cur==='all'||cats.includes(cur))?cur:'all';
}

function addDefaultTasksFor(id,cat){
  state.customTasks=state.customTasks||[];
  const t=cat==='Zimmerpflanzen'
    ?[['wasser','Gießbedarf prüfen',7,ALL_MONTHS,'Fingerprobe: obere 2–3 cm Erde trocken → gießen. Staunässe vermeiden.'],
      ['duengen','Leicht düngen',14,[3,4,5,6,7,8,9,10],'Nur in der Wachstumszeit; halbe Herstellerdosierung.'],
      ['kontrolle','Auf Schädlinge kontrollieren',30,ALL_MONTHS,'Blattunterseiten auf Spinnmilben, Woll- und Schildläuse prüfen (v. a. bei trockener Heizungsluft).']]
    :[['wasser','Gießbedarf prüfen',7,[4,5,6,7,8,9],'Boden prüfen, bei Trockenheit tiefgründig wässern.'],
      ['duengen','Düngen',21,[4,5,6,7,8],'Mäßig düngen, auf feuchte Erde.']];
  t.forEach(([type,title,interval,months,note])=>{const tid=`${id}:${type}`;
    if(!state.customTasks.some(x=>x.id===tid)&&!baseDefs.some(b=>b.id===tid))
      state.customTasks.push({id:tid,plantId:id,title,interval,months,note,optional:false})});
}

function addPlantDialog(){
  const name=(prompt('Name der neuen Pflanze:')||'').trim();if(!name)return;
  const cats=[...new Set([...plants.map(p=>p.cat),'Zimmerpflanzen'])].filter(c=>c!=='Allgemein').sort();
  const pick=prompt('Kategorie wählen (Nummer):\n'+cats.map((c,i)=>`${i+1} ${c}`).join('\n'),String(cats.indexOf('Zimmerpflanzen')+1));
  const cat=cats[Number(pick)-1]||'Zimmerpflanzen';
  const note=(prompt('Notiz (optional):')||'').trim();
  let id=slugify(name)||'pflanze';let n=2;while(plant(id))id=`${slugify(name)}-${n++}`;
  state.customPlants=state.customPlants||[];
  state.customPlants.push({id,name,cat,note});
  addDefaultTasksFor(id,cat);
  rebuildCatalog();initializeCareTasks();save();renderAll();
  toast(`${name} hinzugefügt`);openPlantFile(id);
}

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

/* ---------------------------------------------------- change timestamps ----- */
/* Every mutable record carries `ts`, the moment it last changed, and the sync
   merge resolves conflicts by "later ts wins" — one rule instead of a different
   heuristic per record type. Previously recency was inferred from whatever the
   data happened to contain (a completion date, an `updated` day), and where it
   could not be inferred the local side won, which let a stale device hold its
   ground indefinitely. Day-resolution dates made that the common case rather
   than an edge case, because most edits happen on the same day.

   Stamping is done centrally in save() by diffing against the previously saved
   state, rather than by hand at each mutation site — there are ~20 of those and
   any one missed would silently reintroduce the bug. The same diff detects
   removals and writes tombstones, so a deletion on one device is no longer
   undone by the other device's surviving copy. */
const nowTs=()=>new Date().toISOString();
const TS_MAPS=['tasks','health','profiles','photoMeta','suppressedTasks','plantEdits','kiReviewed'];
const TS_LISTS=['customPlants','customTasks','kiProposals','observations'];
let tsSnapshot=null;

const tsBody=v=>{if(!v||typeof v!=='object')return JSON.stringify(v);
  const c={...v};delete c.ts;return JSON.stringify(c)};
function tsSnapshotOf(st){
  const s={};
  TS_MAPS.forEach(g=>{s[g]={};Object.entries(st[g]||{}).forEach(([k,v])=>s[g][k]=tsBody(v))});
  TS_LISTS.forEach(g=>{s[g]={};(st[g]||[]).forEach(v=>{if(v&&v.id)s[g][v.id]=tsBody(v)})});
  return s;
}
function stampChanges(){
  const ts=nowTs();
  state.tombstones=state.tombstones||{};
  // Read markers store the moment they were read, not `true` — a truthy string
  // keeps every existing check working while making them mergeable.
  Object.keys(state.kiRead||{}).forEach(k=>{if(typeof state.kiRead[k]!=='string')state.kiRead[k]=ts});
  if(!tsSnapshot){tsSnapshot=tsSnapshotOf(state);return}
  TS_MAPS.forEach(g=>{
    const cur=state[g]||{},prev=tsSnapshot[g]||{};
    Object.entries(cur).forEach(([k,v])=>{
      if(v&&typeof v==='object'&&prev[k]!==tsBody(v))v.ts=ts});
    Object.keys(prev).forEach(k=>{if(!(k in cur))state.tombstones[`${g}:${k}`]=ts});
  });
  TS_LISTS.forEach(g=>{
    const cur=state[g]||[],prev=tsSnapshot[g]||{},seen=new Set();
    cur.forEach(v=>{if(!v||!v.id)return;seen.add(v.id);
      if(prev[v.id]!==tsBody(v))v.ts=ts});
    Object.keys(prev).forEach(k=>{if(!seen.has(k))state.tombstones[`${g}:${k}`]=ts});
  });
  tsSnapshot=tsSnapshotOf(state);
}
/* Call after REPLACING state wholesale — adopting the cloud copy, importing a
   backup, restoring a snapshot. Without this, stampChanges compares the new
   state against the old one, sees every record the replacement does not contain
   as "deleted here", and writes tombstones for all of them — which then
   propagate and delete those records on the other device. Replacing local data
   must never be interpreted as a deliberate deletion of what it replaced. */
function resetTsBaseline(){tsSnapshot=tsSnapshotOf(state)}
/* One-off on upgrade: stamp records that predate this change.

   These stamps must NOT be "now". Each device migrates whenever it first opens
   the new build, so stamping with the current time hands victory to whichever
   device upgraded LAST — which, if that is the out-of-date device, means its
   stale copy legitimately beats the good one. That is a real failure that
   happened, not a hypothetical.

   Instead, derive the stamp from whatever date the record already carries, and
   fall back to the epoch. Historical records then keep their true relative
   order, and any genuine edit made after the upgrade beats all of them. */
const TS_EPOCH='1970-01-01T00:00:00.000Z';
const asTs=d=>(typeof d==='string'&&/^\d{4}-\d{2}-\d{2}/.test(d))?new Date(d+'T12:00:00.000Z').toISOString():TS_EPOCH;
function migrateTimestamps(){
  state.meta=state.meta||{};
  if(!state.meta.deviceId)state.meta.deviceId='d-'+Math.random().toString(36).slice(2,10);
  if(state.meta.tsMigrated===2)return;
  const pick=v=>asTs(v.ts&&v.ts.length>10?null:(v.updated||v.last||v.since||v.date||v.decidedAt));
  TS_MAPS.forEach(g=>Object.values(state[g]||{}).forEach(v=>{
    if(v&&typeof v==='object'&&(!v.ts||state.meta.tsMigrated===true))v.ts=pick(v)}));
  TS_LISTS.forEach(g=>(state[g]||[]).forEach(v=>{
    if(v&&(!v.ts||state.meta.tsMigrated===true))v.ts=pick(v)}));
  Object.keys(state.kiRead||{}).forEach(k=>{
    if(typeof state.kiRead[k]!=='string')state.kiRead[k]=TS_EPOCH});
  state.meta.tsMigrated=2;
  tsSnapshot=null;save(false);
}

/* One-off repair. A bug in the sync path ran the v12 cleanup against a stale
   task catalogue on every pull, deleting the task state of custom plants and —
   once tombstones existed — propagating those deletions to the other device.
   The cause is fixed, but the tombstones it already wrote would keep deleting
   tasks forever. Drop them once; genuine task deletions are rare and re-doing
   one by hand is far cheaper than losing care history on every sync. */
/* One-off repair for findings that were duplicated under different random ids
   before the id became deterministic. Collapse each set of identical
   KI-Diagnose entries to one, preferring a copy that is already marked read so
   the marker is not orphaned, and carry the read state onto the survivor. */
function dedupeKiFindings(){
  state.meta=state.meta||{};
  const groups={};
  (state.observations||[]).filter(o=>o&&o.type==='KI-Diagnose').forEach(o=>{
    const k=`${o.plantId}|${o.date}|${o.text}`;(groups[k]=groups[k]||[]).push(o)});
  const read=state.kiRead||{},drop=new Set();
  Object.values(groups).forEach(list=>{
    if(list.length<2)return;
    const keep=list.find(o=>read[o.id])||list[0];
    const wasRead=list.some(o=>read[o.id]);
    list.forEach(o=>{if(o.id!==keep.id){drop.add(o.id);delete read[o.id]}});
    if(wasRead)read[keep.id]=read[keep.id]||nowTs();
  });
  if(drop.size){
    state.observations=state.observations.filter(o=>!drop.has(o.id));
    // These are duplicates, not deletions — no tombstones, or the survivor
    // would be deleted on the other device too.
    state.kiRead=read;resetTsBaseline();save(false);
  }
}

function purgeBadTaskTombstones(){
  state.meta=state.meta||{};
  if(state.meta.taskTombstonePurge)return;
  const t=state.tombstones||{};
  Object.keys(t).forEach(k=>{if(k.startsWith('tasks:'))delete t[k]});
  state.meta.taskTombstonePurge=1;
  save(false);
}

function defaultState(){return {tasks:{},history:[],health:{},profiles:{},observations:[],photoMeta:{},customPlants:[],customTasks:[],kiRead:{},kiApplied:{},kiProposals:[],suppressedTasks:{},plantEdits:{},kiReviewed:{},tombstones:{},showAllSeasons:false,migrated:false,dataVersion:DATA_VERSION,meta:{created:new Date().toISOString(),updated:new Date().toISOString()}}}

function normalizeState(raw){
  const base=defaultState(), x=(raw&&typeof raw==='object')?raw:{};
  const out={...base,...x};
  out.tasks=(x.tasks&&typeof x.tasks==='object'&&!Array.isArray(x.tasks))?x.tasks:{};
  out.history=Array.isArray(x.history)?x.history:[];
  out.health=(x.health&&typeof x.health==='object'&&!Array.isArray(x.health))?x.health:{};
  /* Validation used to live only in applyKiDiagnosis, so an unknown status could
     still arrive via a backup, a snapshot, or a merge from a device on an older
     build. The card renders the stored value verbatim while the plant file's
     dropdown falls back to its first option — the grid then shows one status and
     the file another, and pressing "Gesundheit speichern" writes whatever the
     dropdown happens to display, logging a transition that never happened.
     Every path into state now goes through the same vocabulary. */
  Object.entries(out.health).forEach(([id,h])=>{
    if(!h||typeof h!=='object')return;
    if(h.status&&!isHealthStatus(h.status)){
      console.warn('Unbekannter Gesundheitsstatus verworfen:',id,h.status);
      h.status=HEALTH_STATUSES[0];
    }
  });
  out.profiles=(x.profiles&&typeof x.profiles==='object'&&!Array.isArray(x.profiles))?x.profiles:{};
  out.observations=Array.isArray(x.observations)?x.observations:[];
  out.photoMeta=(x.photoMeta&&typeof x.photoMeta==='object'&&!Array.isArray(x.photoMeta))?x.photoMeta:{};
  out.customPlants=Array.isArray(x.customPlants)?x.customPlants:[];
  out.customTasks=Array.isArray(x.customTasks)?x.customTasks:[];
  out.kiRead=(x.kiRead&&typeof x.kiRead==='object'&&!Array.isArray(x.kiRead))?x.kiRead:{};
  out.kiApplied=(x.kiApplied&&typeof x.kiApplied==='object'&&!Array.isArray(x.kiApplied))?x.kiApplied:{};
  out.kiProposals=Array.isArray(x.kiProposals)?x.kiProposals:[];
  out.suppressedTasks=(x.suppressedTasks&&typeof x.suppressedTasks==='object'&&!Array.isArray(x.suppressedTasks))?x.suppressedTasks:{};
  out.plantEdits=(x.plantEdits&&typeof x.plantEdits==='object'&&!Array.isArray(x.plantEdits))?x.plantEdits:{};
  out.kiReviewed=(x.kiReviewed&&typeof x.kiReviewed==='object'&&!Array.isArray(x.kiReviewed))?x.kiReviewed:{};
  out.tombstones=(x.tombstones&&typeof x.tombstones==='object'&&!Array.isArray(x.tombstones))?x.tombstones:{};
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
  state=normalizeState(state); stampChanges(); state.meta.updated=new Date().toISOString();
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
  const next=initialDueFor(d);
  state.tasks[id]={last:'',next,autoStarted:false};save();renderAll();
  toast(`Eingeplant – fällig ${diff(next)===0?'heute':fmt(next)}`)}

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
  const due=started?'':initialDueFor(d);
  const dueTxt=started?'':(diff(due)===0?'heute':fmt(due));
  const cycleTxt=d.interval>=365?'in einem Jahr':`in ${d.interval} Tagen`;
  const meta=started
    ? `<span class="badge">${esc(p.cat)}</span><strong>${esc(p.name)}</strong> · ${statusText(d)}${nextFor(d)?` · fällig ${fmt(nextFor(d))}`:''}${s.last?` · zuletzt ${fmt(s.last)}`:''}`
    : `<span class="badge">${esc(p.cat)}</span><strong>${esc(p.name)}</strong> · ${d.optional?'optional · ':''}noch nicht aktiv`;
  const startHint=started?'':`<div class="hint">„✓ Gerade gemacht“: du hast das eben erledigt – nächster Termin ${cycleTxt}.<br>„Einplanen“: nur auf die Aufgabenliste setzen – fällig ${dueTxt}.</div>`;
  const actions=started
    ? `<input aria-label="Erledigt am" title="Datum der letzten Erledigung setzen" type="date" value="${s.last||''}" onchange="setTaskDate('${d.id}',this.value)">
       <button class="btn primary" onclick="complete('${d.id}')">✓ Erledigt</button>
       ${s.last?`<button class="btn" onclick="clearTask('${d.id}')">Zurücksetzen</button>`:''}`
    : `<button class="btn primary" onclick="complete('${d.id}')">✓ Gerade gemacht</button>
       <button class="btn soft" onclick="startTask('${d.id}')">Einplanen (fällig ${dueTxt})</button>`;
  return `<article class="task ${cls}"><div>
    <h3>${esc(d.title)}</h3>
    <div class="meta">${meta}</div>
    ${d.note?`<div class="note">${esc(d.note)}</div>`:''}${fertHTML}${startHint}
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
  document.getElementById('plantGrid').insertAdjacentHTML('beforeend',
    `<article class="plant-card" onclick="addPlantDialog()" style="cursor:pointer">
      <div class="pc-empty" style="padding:2.5rem 1rem;text-align:center">➕<br><strong>Neue Pflanze hinzufügen</strong><br><span class="meta">z. B. Zimmerpflanzen</span></div>
    </article>`);
  renderPhotoInbox();
}

/* Gallery imports arrive without a plant. Filing them is ablage, not diagnosis,
   so the inbox lives here next to the plants rather than in the KI view — that
   view is for what Claude contributed, and nothing else. An unfiled photo is
   invisible in every plant file, so it stays listed until it is placed. */
function renderPhotoInbox(){
  const box=document.getElementById('photoInbox');
  if(!box)return;
  const un=(window.KiDiagnose&&KiDiagnose.unassigned)?KiDiagnose.unassigned():[];
  if(!un.length){box.innerHTML='';return}
  box.innerHTML=`<div class="section-title"><h2>Fotos ohne Pflanze</h2><small>${un.length}</small></div>
    <div class="task-list">${un.map(([k,m])=>`<article class="task due"><div>
      <h3>Importiertes Foto</h3>
      <div class="meta">${fmt(m.date)}</div>
      <img src="${photoCache[k]}" alt="" style="margin-top:10px;max-width:220px;width:100%;border-radius:12px">
    </div><div class="actions">
      <button class="btn primary" onclick="KiDiagnose.assignPhoto('${k}')">Pflanze zuordnen</button>
      <button class="btn" onclick="KiDiagnose.ignorePhoto('${k}')">Ausblenden</button>
    </div></article>`).join('')}</div>`;
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
  // Stamp the edit so the diagnosis routine can tell user-authored care text
  // from its own earlier suggestions and defer to yours.
  p.updated=today();
  state.profiles[id]=p;
  state.history.unshift({date:today(),taskId:'profile',plantId:id,title:'Pflanzenakte aktualisiert'});
  markPlantEdited(id,'Pflanzenakte bearbeitet');
  save();renderPlants();openPlantFile(id);toast('Pflanzenakte gespeichert');
}

/* Record that YOU changed something about a plant — its name, category, note,
   care profile or health status. The daily diagnosis run compares this against
   when it last looked at the plant, and re-checks the care plan for anything
   you have corrected since. Correcting "unknown red grass" to a real species
   usually invalidates the care schedule that was guessed from the wrong name,
   and until now nothing re-examined it: the run only ever reacted to new
   photos, so a correction changed the label and left the watering, feeding and
   pruning tasks derived from the wrong plant in place.

   Only user actions call this. KI-applied changes must NOT, or the run would
   see its own edits as fresh corrections and re-review the same plant forever. */
function markPlantEdited(id,what){
  if(!id||!plant(id))return;
  state.plantEdits=state.plantEdits||{};
  state.plantEdits[id]={at:new Date().toISOString(),what:what||'geändert'};
}

/* --------------------------------------------------------- observations ----- */
function addObservation(id,type,text){
  if(!text)return;
  state.observations.unshift({id:`obs-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,plantId:id,date:today(),type,text});
  state.history.unshift({date:today(),taskId:'observation',plantId:id,title:type,note:text});
  /* Your own words about a plant are the strongest signal the app has, and until
     now they reached the daily run and were never acted on: the run only looks
     at plants with a new photo or a pending correction, and an observation was
     neither. A question typed here — "why are the tomato leaves curling?" —
     simply sat in the timeline. Stamping it as an edit puts the plant on the
     run's list, and the text goes along so the run knows what was asked.

     Every note therefore costs one entry in the next run, harvest and watering
     logs included. That is deliberate: the alternative is guessing which notes
     deserve an answer, and a filter that silently swallows a real question is
     worse than a run that occasionally replies "nothing to change". */
  markPlantEdited(id,`${type}: ${String(text).slice(0,200)}`);
  save();renderJournal();renderPlants();
  if(!document.getElementById('plantFile').classList.contains('hidden'))openPlantFile(id);
  toast('Eintrag gespeichert');
}
/* Harvest.

   "Ernte" already existed as one option in the observation dropdown, but as free
   text — so a season's picking was a pile of sentences nobody could add up. The
   point of recording a harvest is the total and the trend across years, which
   needs a number and a unit.

   The amount is parsed leniently and kept as text as well: "450 g", "1,2 kg" and
   "3 Stück" all work, and anything unparseable is still recorded rather than
   refused. A garden log that rejects "eine Handvoll" is worse than one that
   cannot add it up. */
function parseHarvestAmount(txt){
  const m=String(txt||'').trim().match(/^([0-9]+(?:[.,][0-9]+)?)\s*(.*)$/);
  if(!m)return null;
  const amount=parseFloat(m[1].replace(',','.'));
  if(!isFinite(amount)||amount<=0)return null;
  return {amount,unit:(m[2]||'Stück').trim()||'Stück'};
}
/* Totals per unit for one season. Units are grouped as entered rather than
   converted — guessing that "g" and "kg" should be combined is how a 450 g
   harvest turns into 450 kg in someone's records. */
function harvestSummary(id,year){
  const y=String(year||new Date().getFullYear());
  const hs=(state.observations||[]).filter(o=>o&&o.plantId===id&&o.type==='Ernte'&&String(o.date||'').slice(0,4)===y);
  const totals={};
  hs.forEach(o=>{if(typeof o.amount==='number'&&o.unit)totals[o.unit]=(totals[o.unit]||0)+o.amount});
  return {year:y,count:hs.length,totals};
}
function harvestSummaryText(id,year){
  const s=harvestSummary(id,year);
  if(!s.count)return '';
  const parts=Object.entries(s.totals)
    .map(([u,v])=>`${(Math.round(v*100)/100).toString().replace('.',',')} ${u}`);
  return `Ernte ${s.year}: ${parts.length?parts.join(' · '):`${s.count} Einträge`}`
    + (parts.length?` (${s.count} Einträg${s.count===1?'':'e'})`:'');
}
function addHarvest(id){
  const p=plant(id);if(!p)return;
  const raw=(prompt(`Ernte bei „${p.name}" — wie viel?\n(z. B. 450 g, 1,2 kg, 3 Stück)`)||'').trim();
  if(!raw)return;
  const parsed=parseHarvestAmount(raw);
  const note=(prompt('Notiz zur Ernte (optional) — Sorte, Qualität, Verwendung:')||'').trim();
  const o={id:`obs-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,plantId:id,date:today(),
    type:'Ernte',text:note?`${raw} – ${note}`:raw};
  if(parsed){o.amount=parsed.amount;o.unit=parsed.unit}
  state.observations.unshift(o);
  state.history.unshift({date:today(),taskId:'harvest',plantId:id,title:`Ernte: ${raw}`,note});
  markPlantEdited(id,`Ernte: ${raw}${note?` – ${String(note).slice(0,160)}`:''}`);
  save();renderAll();
  if(!document.getElementById('plantFile').classList.contains('hidden'))openPlantFile(id);
  toast(`Ernte eingetragen: ${raw}`);
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
async function applyKiDiagnosis(e){
  if(!e)return false;
  const d=isDateString(e.date)?e.date:today();
  let changed=false;
  // addPlant: create a user plant (e.g. Zimmerpflanze identified from a photo).
  if(e.addPlant&&e.addPlant.name){
    const ap=e.addPlant,id=ap.id||slugify(ap.name);
    if(id&&!plant(id)){
      state.customPlants=state.customPlants||[];
      state.customPlants.push({id,name:ap.name,cat:ap.cat||'Zimmerpflanzen',note:ap.note||'',fromKi:true});
      if(!(Array.isArray(e.addTasks)&&e.addTasks.length))addDefaultTasksFor(id,ap.cat||'Zimmerpflanzen');
      // A plant identified from a photo is a guess about a real thing in the
      // garden. Surface it for review so the name/category can be corrected
      // rather than silently entering the catalogue as fact.
      if(ap.needsReview!==false)addProposal({id:`${e.id||'ki'}-newplant`,plantId:id,type:'newPlant',
        title:`Neue Pflanze erkannt: ${ap.name}`,
        detail:ap.note||'Bitte Name, Kategorie und Notiz prüfen und bestätigen.',date:d});
      /* Rebuild NOW, not at the end. Everything below — assignPhoto, the health
         status, the profile — first asks plant(id) whether the plant exists, and
         until the catalogue is rebuilt it does not. The photo a plant was
         identified FROM was therefore silently dropped, leaving exactly the
         plant you most want to look at showing "Kein Foto". */
      rebuildCatalog();
      changed=true;
    }
    e={...e,plantId:e.plantId||id};
  }
  // addTasks: tailored care schedule for the plant.
  if(Array.isArray(e.addTasks)&&e.plantId){
    state.customTasks=state.customTasks||[];
    for(const t of e.addTasks){
      if(!t||!t.type)continue;
      const tid=`${e.plantId}:${t.type}`;
      /* A retired task is filtered out of `defs` but its DEFINITION survives in
         customTasks/baseDefs. So re-adding one looked like a duplicate and was
         skipped, while the app still reported "Pflegeplan aktualisiert" — the
         task stayed retired for ever and the dossier then showed the proposal as
         confirmed AND the task as suppressed, a contradiction the next run had
         to reason about. Confirming a plan that re-adds it must un-retire it. */
      if(state.suppressedTasks&&state.suppressedTasks[tid]){
        delete state.suppressedTasks[tid];changed=true;
      }
      if(state.customTasks.some(x=>x.id===tid)||baseDefs.some(b=>b.id===tid))continue;
      state.customTasks.push({id:tid,plantId:e.plantId,title:t.title||'Pflege',
        interval:Number(t.interval)||14,months:t.months,note:t.note||'',optional:!!t.optional});
      changed=true;
    }
  }
  // A care-plan change is proposed as ONE unit — additions, altered rhythms and
  // retirements together — so the user confirms a coherent regime rather than
  // bolting a new task onto an old one that contradicts it. Nothing reaches the
  // schedule until confirmed. `proposeTasks` is the additions-only shorthand.
  const plan=e.proposePlan||(Array.isArray(e.proposeTasks)&&e.proposeTasks.length?{addTasks:e.proposeTasks}:null);
  if(plan&&e.plantId){
    const adds=(plan.addTasks||[]).filter(t=>t&&t.type)
      .filter(t=>!defs.some(x=>x.id===`${e.plantId}:${t.type}`));
    const changes=(plan.changeTasks||[]).filter(t=>t&&t.id&&defs.some(x=>x.id===t.id));
    const removes=(plan.removeTasks||[]).filter(t=>t&&t.id&&defs.some(x=>x.id===t.id));
    if(adds.length||changes.length||removes.length){
      const lines=[];
      if(plan.reason)lines.push(plan.reason,'');
      adds.forEach(t=>lines.push(`+ NEU: ${t.title||t.type}${t.interval?` (alle ${t.interval} Tage)`:''}${t.reason?` – ${t.reason}`:''}`));
      changes.forEach(t=>{const cur=defs.find(x=>x.id===t.id);
        lines.push(`~ GEÄNDERT: ${(cur&&cur.title)||t.id}${t.interval?` – jetzt alle ${t.interval} Tage`:''}${t.reason?` – ${t.reason}`:''}`)});
      removes.forEach(t=>{const cur=defs.find(x=>x.id===t.id);
        lines.push(`− ENTFÄLLT: ${(cur&&cur.title)||t.id}${t.reason?` – ${t.reason}`:''}`)});
      if(addProposal({id:`${e.id||'ki'}-plan`,plantId:e.plantId,type:'plan',
        title:removes.length||changes.length?'Pflegeplan anpassen':(adds.length===1?adds[0].title||'Neue Pflegeaufgabe':`${adds.length} neue Pflegeaufgaben`),
        detail:lines.join('\n'),
        payload:{addTasks:adds,changeTasks:changes,removeTasks:removes},date:d}))changed=true;
    }
  }
  // assignPhoto: adopt a photo the app already holds but has not filed under any
  // plant (imported via "Fotos importieren"). The inbox could previously only
  // create plants or deliver new images — never re-home an orphan.
  if(e.assignPhoto&&e.assignPhoto.file&&e.plantId){
    if(await assignDrivePhotoToPlant(e.assignPhoto.file,e.plantId,e.assignPhoto.caption||'',d))changed=true;
  }
  if(changed){rebuildCatalog();initializeCareTasks()}
  if(!plant(e.plantId))return changed;
  /* The run has now looked at this plant. Stamped for EVERY applied entry, even
     one that concluded nothing needs changing — otherwise a plant you corrected
     stays flagged as needing re-assessment and is re-examined every morning
     forever, at a cost, to reach the same answer. */
  state.kiReviewed=state.kiReviewed||{};
  state.kiReviewed[e.plantId]={at:new Date().toISOString()};
  if(e.status||e.reason){
    const cur=healthFor(e.plantId);
    // A status outside the app's own vocabulary cannot round-trip through the
    // plant-file dropdown (it would silently be rewritten on the next save), so
    // an unknown value is rejected and the current status kept.
    let status=cur.status;
    if(e.status){
      if(isHealthStatus(e.status))status=e.status;
      else console.warn('KI-Diagnose: unbekannter Gesundheitsstatus verworfen:',e.status);
    }
    state.health[e.plantId]={status,reason:e.reason!==undefined?e.reason:cur.reason,updated:d};
    changed=true;
  }
  if(e.observation){
    /* The observation id is DERIVED from the diagnosis entry id, never random.
       Two devices applying the same inbox entry must produce the same
       observation, or each ends up with its own copy under a different id — and
       a read marker set on one device then points at an id the other has never
       heard of, so the finding reads as unread there forever. */
    const oid=`obs-ki-${String(e.id||`${e.plantId}-${d}`).replace(/[^a-zA-Z0-9_-]+/g,'-')}`;
    if(state.observations.some(o=>o.id===oid))return changed;
    state.observations.unshift({id:oid,plantId:e.plantId,date:d,type:'KI-Diagnose',text:e.observation});
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

/* ------------------------------------------------------- KI proposals ------- */
/* A proposal is something the AI suggests but must not do on its own: a new
   care task, or a plant it created from a photo. It sits pending in the KI view
   until confirmed or rejected. Ids are deterministic, so the same suggestion
   arriving twice (a re-run, a second device) never duplicates, and a decision
   already taken is never reopened. Returns true if a new proposal was added. */
function addProposal(p){
  if(!p||!p.id)return false;
  state.kiProposals=state.kiProposals||[];
  if(state.kiProposals.some(x=>x.id===p.id))return false;
  state.kiProposals.push({id:p.id,plantId:p.plantId||'',type:p.type||'tasks',
    title:p.title||'Vorschlag',detail:p.detail||'',payload:p.payload||null,
    date:p.date||today(),status:'pending',decidedAt:''});
  return true;
}
const pendingProposals=()=>(state.kiProposals||[]).filter(p=>p.status==='pending');

async function confirmProposal(id){
  const p=(state.kiProposals||[]).find(x=>x.id===id);
  if(!p||p.status!=='pending')return;
  if((p.type==='plan'||p.type==='tasks')&&p.payload){
    const pl=p.payload;
    // Order matters: retire and re-tune the existing regime first, then add, so
    // the plan is never briefly inconsistent with itself.
    (pl.removeTasks||[]).forEach(t=>suppressTask(t.id,t.reason||p.title));
    (pl.changeTasks||[]).forEach(t=>{
      const cur=defs.find(x=>x.id===t.id);if(!cur)return;
      state.customTasks=(state.customTasks||[]).filter(x=>x.id!==t.id);
      state.customTasks.push({id:t.id,plantId:cur.plantId,
        title:t.title||cur.title,interval:Number(t.interval)||cur.interval,
        months:Array.isArray(t.months)&&t.months.length?t.months:cur.months,
        note:t.note!==undefined?t.note:cur.note,optional:!!cur.optional});
      // A changed rhythm re-bases from today rather than keeping a due date
      // computed under the old interval.
      if(state.tasks[t.id]){const last=state.tasks[t.id].last||'';
        state.tasks[t.id]={last,next:add(last||today(),Number(t.interval)||cur.interval)}}
    });
    if(Array.isArray(pl.addTasks)&&pl.addTasks.length)
      await applyKiDiagnosis({id:`${p.id}-apply`,plantId:p.plantId,date:p.date,addTasks:pl.addTasks});
  }
  if(p.type==='newPlant'){
    const cp=(state.customPlants||[]).find(x=>x.id===p.plantId);
    if(cp)delete cp.fromKi;
  }
  p.status='confirmed';p.decidedAt=today();
  state.history.unshift({date:today(),taskId:'ki-proposal',plantId:p.plantId,title:`Bestätigt: ${p.title}`});
  save();renderAll();toast('Bestätigt – Pflegeplan aktualisiert');
}
async function rejectProposal(id){
  const p=(state.kiProposals||[]).find(x=>x.id===id);
  if(!p||p.status!=='pending')return;
  // Rejecting "new plant identified" means the thing is not a plant in this
  // garden — so the plant the KI already created has to go with it. Marking the
  // proposal rejected while leaving the plant standing was the one irreversible
  // outcome in the whole pipeline: nothing else could remove it.
  if(p.type==='newPlant'&&p.plantId&&plant(p.plantId)){
    if(!confirm(`„${plant(p.plantId).name}" wurde von der KI angelegt. Ablehnen entfernt die Pflanze samt ihrer Fotos und Aufgaben. Fortfahren?`))return;
    await removePlantData(p.plantId);
  }
  p.status='rejected';p.decidedAt=today();
  state.history.unshift({date:today(),taskId:'ki-proposal',plantId:p.plantId,title:`Abgelehnt: ${p.title}`});
  rebuildCatalog();save();renderAll();toast('Vorschlag abgelehnt');
}

/* Remove a plant and everything hanging off it. Only user/KI-created plants can
   go: the built-in catalogue lives in code, so deleting one would simply be
   recreated by rebuildCatalog on the next open — a delete that silently undoes
   itself is worse than no delete at all.

   Every store the plant appears in must be cleared, or the leftovers resurface:
   an orphaned photo would keep being uploaded by syncPhotos, and an orphaned
   photoMeta entry would reappear in the diagnosis dossier. Removal from these
   maps and lists is what stampChanges turns into tombstones, so the deletion
   travels to the other device instead of being undone by the next merge. */
async function removePlantData(id){
  if(!id)return false;
  const keys=Object.entries(state.photoMeta||{}).filter(([,m])=>m&&m.plantId===id).map(([k])=>k);
  if(photoCache[id]&&keys.indexOf(id)===-1)keys.push(id);          // the cover, keyed by plant id
  for(const k of keys){try{await removePhoto(k)}catch(e){console.warn('Foto konnte nicht gelöscht werden',k,e)}
    delete state.photoMeta[k]}
  state.customPlants=(state.customPlants||[]).filter(x=>x.id!==id);
  state.customTasks=(state.customTasks||[]).filter(t=>t.plantId!==id);
  state.observations=(state.observations||[]).filter(o=>o.plantId!==id);
  state.history=(state.history||[]).filter(h=>h.plantId!==id);
  Object.keys(state.tasks||{}).forEach(tid=>{if(tid.split(':')[0]===id)delete state.tasks[tid]});
  Object.keys(state.suppressedTasks||{}).forEach(tid=>{if(tid.split(':')[0]===id)delete state.suppressedTasks[tid]});
  delete (state.health||{})[id];
  delete (state.profiles||{})[id];
  delete (state.plantEdits||{})[id];
  delete (state.kiReviewed||{})[id];
  return true;
}

async function deletePlant(id){
  const p=plant(id);if(!p)return;
  // Built-ins are defined in code and would come straight back.
  if(!(state.customPlants||[]).some(x=>x.id===id))
    return alert('Diese Pflanze gehört zum festen Bestand der App und kann nicht gelöscht werden.');
  const nPhotos=Object.values(state.photoMeta||{}).filter(m=>m&&m.plantId===id).length;
  if(!confirm(`„${p.name}" wirklich löschen?\n\nEntfernt die Pflanze, ihre Pflegeaufgaben, ihren Verlauf und ${nPhotos} Foto${nPhotos===1?'':'s'} aus der App. Die Bilddateien in Google Drive bleiben als Archiv erhalten.`))return;
  await removePlantData(id);
  (state.kiProposals||[]).forEach(x=>{
    if(x.plantId===id&&x.status==='pending'){x.status='rejected';x.decidedAt=today()}});
  state.history.unshift({date:today(),taskId:'plant',plantId:'',title:`Pflanze gelöscht: ${p.name}`});
  rebuildCatalog();save();closePlantFile();renderAll();toast(`„${p.name}" gelöscht`);
}

/* Retire a care task. The definition itself is never deleted — built-in tasks
   live in code and a deleted state.tasks entry would simply be re-created by
   initializeCareTasks on the next app open. Instead the id is recorded as
   suppressed, rebuildCatalog filters it out of the plan, and it can be brought
   back later. Nothing is lost, and the old rhythm genuinely stops. */
function suppressTask(id,reason){
  if(!id)return false;
  state.suppressedTasks=state.suppressedTasks||{};
  state.suppressedTasks[id]={since:today(),reason:reason||'',active:true};
  delete state.tasks[id];
  return true;
}
function restoreTask(id){
  const s=(state.suppressedTasks||{})[id];if(!s)return;
  state.suppressedTasks[id]={since:today(),reason:s.reason||'',active:false};
  rebuildCatalog();initializeCareTasks();save();renderAll();
  toast('Aufgabe wieder aufgenommen');
}
const suppressedFor=pid=>Object.entries(state.suppressedTasks||{})
  .filter(([id,s])=>s&&s.active&&id.split(':')[0]===pid);

/* Map a Drive photo filename back to the local photo key. cloud-sync records
   the uploaded name per key in gm_drive_photo_index; if that is missing (older
   uploads) fall back to recomputing the name from the key and its date. */
function photoKeyForDriveFile(name){
  if(!name)return '';
  try{
    const idx=JSON.parse(localStorage.getItem('gm_drive_photo_index')||'{}');
    for(const [k,v] of Object.entries(idx))if(v&&v.name===name)return k;
  }catch(e){}
  for(const [k,m] of Object.entries(state.photoMeta||{})){
    if(gmPhotoFileName(k,(m&&m.date)||'',photoCache[k])===name)return k;
  }
  return '';
}
/* Give a plant a title image from a photo it already holds, if it has none.
   A plant created from a photo would otherwise show "📷 Kein Foto" in the grid
   while the very picture it was identified from sat in its Verlauf — the one
   plant you most want to look at is the one you cannot see. The image is copied
   under the plant's own key because that is how covers are stored; the original
   stays in the Verlauf, so the photo is both title image and first history
   entry. Does nothing if a title image already exists — replacing one is a
   deliberate act, not a side effect of filing a photo. */
async function ensureCoverFromPhoto(plantId,key,date){
  if(!plant(plantId)||photoCache[plantId])return false;
  const data=photoCache[key];
  if(typeof data!=='string'||!data.startsWith('data:image/'))return false;
  await putPhoto(plantId,data);
  state.photoMeta[plantId]={plantId,date:isDateString(date)?date:today(),caption:'Titelbild',cover:true};
  return true;
}

async function assignDrivePhotoToPlant(file,plantId,caption,date){
  if(!plant(plantId))return false;
  const key=photoKeyForDriveFile(file);
  if(!key)return false;
  const meta=state.photoMeta[key];
  if(!meta||meta.plantId)return false;         // unknown, or already filed
  meta.plantId=plantId;
  if(caption)meta.caption=caption;
  state.observations.unshift({id:`obs-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    plantId,date:isDateString(date)?date:today(),type:'Foto',
    text:caption||'Zugeordnetes Foto',photoKey:key});
  try{await ensureCoverFromPhoto(plantId,key,date)}catch(e){console.warn('Titelbild konnte nicht gesetzt werden',e)}
  return true;
}

/* -------------------------------------------------------------- photos ------ */
function photoDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);
  r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains('photos'))db.createObjectStore('photos');
    if(!db.objectStoreNames.contains('backups'))db.createObjectStore('backups',{keyPath:'id'})};
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}

/* Delete image blobs no photoMeta entry claims any more.

   photoMeta deletions merge correctly — they are tombstoned and travel between
   devices — but the blob in IndexedDB was never removed with them. buildPayload
   serialises photoCache wholesale, so a device that still held the blob put the
   deleted image straight back into the cloud file, and the device that deleted
   it got the image restored on the next merge. Deleting a Titelbild visibly
   undid itself, because the plant grid reads the cover from photoCache without
   consulting photoMeta; deleting anything else undid itself invisibly, leaving
   the picture in the payload forever. Nothing else in the app ever removed an
   orphan, which is a good part of why that payload reached 60 MB.

   Every code path that stores a photo writes a photoMeta entry in the same
   breath, so "no meta" genuinely means "nothing refers to this". */
async function purgeOrphanPhotos(){
  await loadPhotos();
  const meta=state.photoMeta||{},tomb=state.tombstones||{};
  /* ONLY photos whose metadata was deliberately DELETED — proven by a tombstone.
     The first version of this deleted anything photoMeta did not mention, on the
     reasoning that every code path writes metadata alongside the image. That is
     true of the code as it stands and false of the data as it exists: covers
     stored by earlier builds have no photoMeta entry at all, and the plant grid
     renders a cover straight from photoCache without consulting photoMeta — so
     "no metadata" was not orphanhood, it was the app's oldest and most visible
     photos. The purge deleted precisely the pictures the user could see.
     A tombstone is the only evidence of an actual deletion. Absence of metadata
     is not evidence of anything. */
  const deleted=Object.keys(photoCache).filter(k=>!meta[k]&&tomb['photoMeta:'+k]);
  for(const k of deleted){
    try{await removePhoto(k)}catch(e){console.warn('Gelöschtes Foto konnte nicht entfernt werden',k,e)}
  }
  if(deleted.length)console.info(`${deleted.length} gelöschte(s) Foto(s) entfernt`);
  return deleted.length;
}

/* Give legacy photos the metadata they never had, so they are visible to every
   part of the app rather than only to the renderers that read photoCache. A
   photo stored under a plant's id is that plant's Titelbild; anything else is
   adopted as an unfiled photo rather than guessed at. Runs once per device. */
async function adoptUntrackedPhotos(){
  await loadPhotos();
  state.photoMeta=state.photoMeta||{};
  let n=0;
  for(const k of Object.keys(photoCache)){
    if(state.photoMeta[k])continue;
    if(plant(k)){state.photoMeta[k]={plantId:k,date:today(),caption:'Titelbild',cover:true};n++}
    else{state.photoMeta[k]={plantId:'',date:today(),caption:'Wiederhergestellt',cover:false};n++}
  }
  if(n)console.info(`${n} Foto(s) nachträglich erfasst`);
  return n;
}

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
/* multi=true returns every selected file. The OS picker runs outside the page
   and hands back only what the user ticked — the app has no way to enumerate
   the photo library, so nothing else is ever visible to it. */
function pickImage(useCamera,multi=false){return new Promise(resolve=>{const i=document.createElement('input');
  i.type='file';i.accept='image/*';if(useCamera)i.setAttribute('capture','environment');
  if(multi)i.multiple=true;
  i.onchange=()=>resolve(multi?Array.from(i.files||[]):(i.files[0]||null));i.click()})}
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

/* Bulk import from the phone's gallery: pick several photos at once and store
   them without a plant. They appear under „KI-Diagnosen“ → „Fotos ohne Pflanze“
   until assigned; only an assigned photo reaches the plant file and the KI-Akte
   that Claude evaluates. */
async function importGalleryPhotos(){
  const files=await pickImage(false,true);
  if(!files||!files.length)return;
  const imgs=files.filter(f=>f&&f.type.startsWith('image/'));
  if(!imgs.length)return;
  let n=0;
  for(const f of imgs){
    try{
      const data=await resizePhoto(f),key=`inbox|${Date.now()}|${Math.random().toString(36).slice(2,7)}`;
      await putPhoto(key,data);
      state.photoMeta[key]={plantId:'',date:today(),caption:'Import',cover:false};
      n++;
    }catch(e){console.warn('Foto konnte nicht importiert werden',e)}
  }
  save();renderAll();
  toast(`${n} Foto${n===1?'':'s'} importiert – jetzt Pflanzen zuordnen`);
}
async function deleteTimelinePhoto(key,id){if(!confirm('Dieses Verlaufsfoto löschen?'))return;
  await removePhoto(key);delete state.photoMeta[key];
  state.observations=state.observations.filter(o=>o.photoKey!==key);
  save();openPlantFile(id);}

/* Import a photo delivered through the KI inbox (already fetched from Drive by
   cloud-sync). Becomes the cover if the plant has none, otherwise a timeline
   photo. Returns the storage key, or '' if nothing was imported. */
async function importKiPhoto(plantId,dataUrl,caption,asCover,date){
  if(!plant(plantId)||typeof dataUrl!=='string'||!dataUrl.startsWith('data:image/'))return '';
  const d=isDateString(date)?date:today();
  // A first image becomes the title picture AND the first Verlauf entry — it is
  // both "what this plant looks like" and "what it looked like on this date".
  let becameCover=false;
  if(asCover&&!photoCache[plantId]){
    await putPhoto(plantId,dataUrl);
    state.photoMeta[plantId]={plantId,date:d,caption:caption||'Titelbild',cover:true};
    becameCover=true;
  }
  /* The image doubles as the first Verlauf entry only when the plant has no
     history yet — that is the case this was built for: a plant identified from a
     photo, where the picture is both what it looks like and what it looked like
     on that date. Copying it into a Verlauf that already has entries just adds a
     duplicate, which matters when covers are being restored in bulk. */
  const hasHistory=Object.values(state.photoMeta||{}).some(m=>m&&m.plantId===plantId&&!m.cover);
  if(becameCover&&hasHistory)return plantId;
  const key=`timeline|${plantId}|${Date.now()}`;
  await putPhoto(key,dataUrl);
  state.photoMeta[key]={plantId,date:d,caption:caption||'KI-Foto',cover:false};
  state.observations.unshift({id:`obs-${Date.now()}`,plantId,date:d,type:'Foto',text:caption||'KI-Foto',photoKey:key});
  return key;
}

/* -------------------------------------------------------- plant file modal -- */
function updateHealthFromFile(id){
  const status=document.getElementById('file-health-status').value;
  const reason=document.getElementById('file-health-reason').value.trim();
  const old=healthFor(id);
  state.health[id]={status,reason,updated:today()};
  state.observations.unshift({id:`obs-${Date.now()}`,plantId:id,date:today(),type:'Gesundheit',text:`${old.status} → ${status}${reason?`: ${reason}`:''}`});
  state.history.unshift({date:today(),taskId:'health',plantId:id,title:`Gesundheitsstatus: ${status}`,note:reason});
  markPlantEdited(id,`Status selbst auf ${status} gesetzt`);
  save();renderPlants();openPlantFile(id);toast('Gesundheitsstatus gespeichert');
}

function openPlantFile(id){
  const p=plant(id);if(!p)return;
  const h=healthFor(id),pf=profileFor(id);
  const custom=(state.customPlants||[]).find(x=>x.id===id);
  const statuses=HEALTH_STATUSES;
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

      ${custom?`<section class="fp full"><h3>🏷️ Pflanze bearbeiten ${custom.fromKi?'<span class="mini">von der KI erkannt – bitte prüfen</span>':''}</h3>
        <div class="form-grid">
          <div class="field"><label>Name</label><input id="pi-name" value="${esc(custom.name||'')}"></div>
          <div class="field"><label>Kategorie</label><input id="pi-cat" value="${esc(custom.cat||'')}"></div>
          <div class="field full"><label>Allgemeiner Hinweis</label><textarea id="pi-note">${esc(custom.note||'')}</textarea></div>
        </div>
        <button class="btn primary" onclick="savePlantIdentity('${id}')">Pflanze speichern</button>
        <button class="btn danger" onclick="deletePlant('${id}')">Pflanze löschen</button>
      </section>`:''}

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
          <button class="btn soft" onclick="addHarvest('${id}')">🧺 Ernte</button>
          <button class="btn soft" onclick="addTimelinePhoto('${id}',true)">📷 Foto aufnehmen</button>
          <button class="btn" onclick="addTimelinePhoto('${id}',false)">Foto aus Galerie</button>
        </div>
        ${harvestSummaryText(id)?`<div class="note" style="margin-top:10px">🧺 ${esc(harvestSummaryText(id))}</div>`:''}
      </section>

      <section class="fp full"><h3>📅 Pflegeplan</h3>
        <div class="task-list">${ts.length?ts.map(taskHTML).join(''):'<div class="empty">Keine Aufgaben hinterlegt.</div>'}</div>
        ${suppressedFor(id).length?`<h3 style="margin-top:16px;font-size:.95rem">Ausgesetzte Aufgaben</h3>
          <div class="journal">${suppressedFor(id).map(([tid,s])=>`<div class="j-row">
            <div class="date">seit ${fmt(s.since)}</div>
            <div><strong>${esc(tid.split(':')[1]||tid)}</strong>
            ${s.reason?`<div class="meta">${esc(s.reason)}</div>`:''}
            <button class="btn" onclick="restoreTask('${tid}')">Wieder aufnehmen</button></div>
          </div>`).join('')}</div>`:''}
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
/* Correct a plant the KI created (or that you added yourself). Editing clears
   the "needs review" flag — your version is the authoritative one from then on,
   and the diagnosis routine sees it in the next dossier. */
function savePlantIdentity(id){
  const cp=(state.customPlants||[]).find(x=>x.id===id);if(!cp)return;
  const name=(document.getElementById('pi-name')?.value||'').trim();
  if(!name)return alert('Der Name darf nicht leer sein.');
  const cat=(document.getElementById('pi-cat')?.value||'').trim()||'Zimmerpflanzen';
  const note=(document.getElementById('pi-note')?.value||'').trim();
  const renamed=cp.name!==name;
  cp.name=name;cp.cat=cat;cp.note=note;delete cp.fromKi;
  (state.kiProposals||[]).forEach(p=>{
    if(p.type==='newPlant'&&p.plantId===id&&p.status==='pending'){p.status='confirmed';p.decidedAt=today()}});
  state.history.unshift({date:today(),taskId:'plant',plantId:id,
    title:renamed?`Pflanze umbenannt: ${name}`:'Pflanzendaten aktualisiert'});
  markPlantEdited(id,renamed?`umbenannt in „${name}" (${cat})`:`Stammdaten geändert (${cat})`);
  rebuildCatalog();save();renderAll();openPlantFile(id);toast('Pflanze gespeichert');
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
  renderBuildInfo();
}
function toggleSeasons(){state.showAllSeasons=!state.showAllSeasons;save();renderAll()}

/* What is this device actually running? The loaded JavaScript reports APP_BUILD;
   the service worker's cache name is what will be served on the next launch. If
   they differ, the device is mid-update and a close-and-reopen is needed — which
   is exactly the state that is otherwise invisible and produces "but I changed
   that hours ago". */
async function renderBuildInfo(){
  const el=document.getElementById('buildInfo'),foot=document.getElementById('footerInfo');
  let cache='—';
  try{
    if(window.caches){
      const keys=await caches.keys();
      const mine=keys.filter(k=>k.startsWith('mein-garten-')).sort();
      if(mine.length)cache=mine[mine.length-1].replace('mein-garten-','');
    }
  }catch(e){}
  const sw=('serviceWorker' in navigator)&&navigator.serviceWorker.controller?'aktiv':'nicht aktiv';
  const stale=cache!=='—'&&cache!==APP_BUILD;
  if(foot)foot.textContent=`Code ${APP_BUILD} · Datenformat ${DATA_VERSION} · installierbar als App.`;
  if(el){
    el.innerHTML=`<div>Geladener Code: <strong>${esc(APP_BUILD)}</strong></div>
      <div>Offline-Cache: <strong>${esc(cache)}</strong> (Service Worker ${sw})</div>
      <div>Datenformat: ${DATA_VERSION}</div>
      ${stale?`<div style="color:var(--berry);font-weight:700;margin-top:6px">
        ⚠ Cache und Code sind nicht identisch – App einmal schließen und neu öffnen.</div>`:''}`;
  }
}

function renderAll(){rebuildCatalog();renderSeason();renderStats();renderToday();renderWeek();renderPlants();renderJournal();renderSettings();
  if(window.KiDiagnose)KiDiagnose.render()}

/* Remember which tab is open. Signing in to Google is a full-page redirect, so
   the app reloads on return and would otherwise always come back on "Heute" —
   which is jarring when you were three taps deep in Daten & KI, and made the
   sign-in feel like it had failed. Kept in sessionStorage, so it restores across
   the redirect and an ordinary reload, but a genuinely fresh start still opens
   on the home view. */
const LS_VIEW='gm_view';
function switchView(v){
  const sec=document.getElementById('view-'+v);
  if(!sec)return;
  document.querySelectorAll('main>section').forEach(s=>s.classList.add('hidden'));
  sec.classList.remove('hidden');
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  try{sessionStorage.setItem(LS_VIEW,v)}catch(e){}
  if(v==='plants')renderPlants();
}
function restoreView(){
  let v='';try{v=sessionStorage.getItem(LS_VIEW)||''}catch(e){}
  if(v&&v!=='today'&&document.getElementById('view-'+v))switchView(v);
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
      // Rebuild the catalogue from the imported data before cleanup judges which
      // task ids are valid — otherwise importing a backup silently drops the
      // task history of every custom plant it contains.
      rebuildCatalog();cleanupV12(false);resetTsBaseline();save(false);await runIntegrityCheck(false);renderAll();
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
  rebuildCatalog();resetTsBaseline();save(false);renderAll();toast('Schnappschuss wiederhergestellt');
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
  rebuildCatalog();resetTsBaseline();save(false);renderAll();renderSnapshotList();toast('Wiederherstellungspunkt geladen');
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
  localStorage.removeItem(APP_KEY);state=defaultState();
  /* Every other wholesale replacement resets the baseline; this one did not, and
     it is the most destructive place to forget. save() would otherwise diff the
     empty state against the pre-reset snapshot and write a tombstone dated NOW
     for every record that existed — tasks, health, observations, custom plants,
     the lot. Those tombstones are part of state, so the first thing added after
     a reset would push them to Drive and delete the other device's copy too.
     A reset must mean "this device forgets", never "the garden is deleted". */
  resetTsBaseline();
  save(false);await restorePhotos({});renderAll();
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
  /* One entry per Drive file. A cover is a byte-copy of the photo it was made
     from and the two keys now share a single Drive file, so without this the
     same filename would be listed twice for one plant — and a run that reads a
     filename twice has to work out for itself that it is not two pictures. */
  const seenFiles=new Set();
  const photos=Object.entries(state.photoMeta||{})
    .filter(([k,m])=>m.plantId===id&&gmPhotoInDrive(k,photoCache[k]))
    .map(([k,m])=>({key:k,date:m.date,caption:m.caption||'',isCover:!!m.cover,
      driveFile:gmDrivePhotoName(k,photoCache[k])}))
    .filter(p=>{if(seenFiles.has(p.driveFile))return false;seenFiles.add(p.driveFile);return true})
    .sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  // What YOU changed about this plant, and when the run last looked at it. If
  // your correction is newer, the care plan was derived from something now known
  // to be wrong and has to be re-checked — a schedule guessed for "unknown red
  // grass" does not survive that turning out to be Japanese blood grass.
  const edited=(state.plantEdits||{})[id]||null;
  const reviewed=(state.kiReviewed||{})[id]||null;
  // >= not >: when an edit and a review carry the same timestamp their order is
  // genuinely unknown, and the two outcomes are not equally bad. Re-checking
  // costs one extra look; skipping means a correction you made is silently never
  // acted on. The next review stamps a strictly later time, so this cannot loop.
  const needsReassessment=!!(edited&&edited.at&&(!reviewed||!reviewed.at||edited.at>=reviewed.at));
  return {
    plant:{id:p.id,name:p.name,category:p.cat,generalNote:p.note},
    userEdited:edited?{at:edited.at,what:edited.what||''}:null,
    lastKiReview:reviewed&&reviewed.at?reviewed.at:null,
    needsReassessment,
    /* Harvest totals per season. The timeline already carries each picking, but
       a run reading twenty entries cannot see the shape; a per-year total can be
       compared against last year's and turned into a real observation ("halb so
       viel wie 2025 bei gleicher Pflege"). Only years with entries appear. */
    harvests:(function(){
      const years=[...new Set((state.observations||[])
        .filter(o=>o&&o.plantId===id&&o.type==='Ernte'&&/^\d{4}/.test(String(o.date||'')))
        .map(o=>String(o.date).slice(0,4)))].sort();
      return years.map(y=>harvestSummary(id,y));
    })(),
    currentHealth:healthFor(id),
    profile:profileFor(id),
    careSchedule:care,
    // Deliberately retired tasks — so a later run understands the plan already
    // changed and does not propose reinstating what was just stopped.
    suppressedTasks:suppressedFor(id).map(([tid,s])=>({id:tid,since:s.since,reason:s.reason||''})),
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
/* Has THIS image actually reached Drive? The fingerprint check matters: a
   replaced cover keeps its key but is a different image, and the old upload
   does not vouch for the new one. Only confirmed uploads may be named in the
   dossier — a driveFile the diagnosis routine cannot open is worse than no
   entry at all, because it looks like a photo that was considered and wasn't. */
function gmPhotoInDrive(key,dataUrl){
  if(typeof dataUrl!=='string')return false;
  try{
    const idx=JSON.parse(localStorage.getItem('gm_drive_photo_index')||'{}');
    const rec=idx[key];
    return !!(rec&&rec.name&&rec.fp===dataUrl.length);
  }catch(e){return false}
}
/* includePhotos=false builds a light dossier for automatic cloud upload: photo
   base64 data already syncs inside gartenmanager-data.json, so the cloud copy
   only references photos by key instead of doubling every upload. */
async function buildDossierPayload(includePhotos){
  await loadPhotos();
  const dossiers=plants.filter(p=>p.id!=='garten').map(p=>buildPlantDossier(p.id));
  // Photos the app holds but has not filed under any plant (gallery imports).
  // Without these the diagnosis routine cannot see them at all, because the
  // per-plant dossiers group photos by plantId.
  const unassignedPhotos=Object.entries(state.photoMeta||{})
    .filter(([k,m])=>m&&!m.plantId&&!m.ignored&&gmPhotoInDrive(k,photoCache[k]))
    .map(([k,m])=>({driveFile:gmDrivePhotoName(k,photoCache[k]),date:m.date||'',caption:m.caption||''}));
  // Images this device holds that have not reached Drive yet. They are absent
  // from the lists above on purpose — the routine cannot open what is not there
  // — but the count must be stated, or a stalled upload looks like a garden
  // with nothing new in it.
  const photosPendingUpload=Object.entries(state.photoMeta||{})
    .filter(([k,m])=>m&&!m.ignored&&photoCache[k]&&!gmPhotoInDrive(k,photoCache[k])).length;
  // Decisions already taken, so nothing rejected gets proposed again.
  const proposals=(state.kiProposals||[]).map(p=>({id:p.id,type:p.type,plantId:p.plantId,
    title:p.title,status:p.status,date:p.date,decidedAt:p.decidedAt||''}));
  // Read markers are exported purely so this state is observable from outside
  // the app. Without them, "did my confirmations survive the sync?" cannot be
  // answered from Drive at all — which is exactly the question that came up.
  const readMarkers=Object.keys(state.kiRead||{});
  const payload={
    format:'gartenmanager-ai-dossier',version:DATA_VERSION,generated:new Date().toISOString(),
    appBuild:APP_BUILD,unassignedPhotos,photosPendingUpload,kiProposals:proposals,readMarkers,
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
refreshCatFilter();

async function startApp(){
  load();
  rebuildCatalog();
  await migrateOldPhotoDB();
  await loadPhotos();
  // Before anything else touches photos: give legacy images the metadata they
  // never had. Without it they are invisible to photoMeta-based logic while
  // still rendering, which is how a purge came to delete visible covers.
  await adoptUntrackedPhotos();
  migrateTimestamps();
  purgeBadTaskTombstones();
  dedupeKiFindings();
  cleanupV12(false);
  initializeCareTasks();
  if(!state.migrated)migrateLegacy();
  renderAll();
  restoreView();
  await runIntegrityCheck(false);
  await createLocalSnapshot('automatisch',false);
  if(window.CloudSync)CloudSync.init();
  if(window.KiDiagnose)KiDiagnose.init();
  /* Updating a home-screen PWA is otherwise unreliable, especially on iOS: the
     browser only re-checks the worker on a real navigation, and relaunching an
     installed app frequently restores it instead of navigating. A device can
     then serve old code indefinitely — which happened, and is painful to spot.
     Three things make it self-correcting:
       updateViaCache:'none'  – always fetch the worker script from the network
       reg.update()           – ask explicitly on every launch, not just on nav
       controllerchange       – when a new worker takes over, reload once so the
                                running JavaScript matches the new cache */
  if('serviceWorker' in navigator){
    try{
      const reg=await navigator.serviceWorker.register('service-worker.js',{updateViaCache:'none'});
      reg.update().catch(()=>{});
      let reloaded=false;
      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        if(reloaded)return;reloaded=true;location.reload();
      });
    }catch(e){console.warn('SW nicht registriert',e)}
  }
}
startApp();
