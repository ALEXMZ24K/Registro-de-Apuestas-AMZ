// Lógica para leer un pick y decidir cómo va / si ya ganó o perdió.
// La usan la app (index.html) y el Worker de Cloudflare (calificación automática), así ambos deciden igual.
// Script clásico: en la app deja las funciones como globales; en el Worker se leen de globalThis.Calif.
const normTxt = t => String(t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const esFut = k => String(k||"").startsWith("soccer");
const esCombo = a => a.tipo==="Parlay/Combinada"||a.tipo==="Freebet"||a.tipo==="Crear apuesta";
// ── Picks de JUGADOR (NBA, MLB, NFL y remates a puerta en fútbol) ──
// v.j = [{n:"Shohei Ohtani", s:{h:1,...}}] lo manda el Worker cuando el partido tiene un pick de jugador.
// Solo dicen cómo vas: NO se califican solos (ESPN puede contar distinto que la casa de apuestas).
const sumaJ = (...ks) => s => ks.reduce((t,k)=>t+(Number(s[k])||0),0);
const STATS_JUG = {
  basketball: [
    [/puntos?\s*\+\s*rebotes?\s*\+\s*asist|\spra\s|pts\s*\+\s*reb\s*\+\s*ast/, sumaJ("pts","reb","ast"), "pts+reb+ast"],
    [/puntos?\s*\+\s*rebotes?|pts\s*\+\s*reb/, sumaJ("pts","reb"), "pts+reb"],
    [/puntos?\s*\+\s*asist|pts\s*\+\s*ast/, sumaJ("pts","ast"), "pts+ast"],
    [/rebotes?\s*\+\s*asist|reb\s*\+\s*ast/, sumaJ("reb","ast"), "reb+ast"],
    [/triples?|tres puntos|\s3\s?pts?\s|three|3pm|\s3s\s/, sumaJ("tres"), "triples"],
    [/rebotes?|rebounds?|\sreb\s/, sumaJ("reb"), "rebotes"],
    [/asistencias?|assists?|\sast\s/, sumaJ("ast"), "asistencias"],
    [/robos?|steals?/, sumaJ("stl"), "robos"],
    [/tapones?|bloqueos?|blocks?/, sumaJ("blk"), "tapones"],
    [/puntos?|points?|\spts\s/, sumaJ("pts"), "puntos"],
  ],
  baseball: [
    [/home ?runs?|jonr[oó]n(es)?|jonron(es)?|cuadrangular(es)?|\shr\s/, sumaJ("hr"), "jonrones"],
    [/impulsad|\srbis?\s|carreras? producidas/, sumaJ("rbi"), "impulsadas"],
    [/carreras? anotadas?|runs? scored/, sumaJ("r"), "carreras"],
    [/ponches?|strikeouts?|ponchad|\sks?\s|\sso\s/, s => ("k" in s ? Number(s.k) : Number(s.so)||0), "strikeouts"],
    [/hits?|imparables?|indiscutibles?/, sumaJ("h"), "hits"],
    [/bases? por bolas?|walks?/, sumaJ("bb"), "bases por bola"],
  ],
  football: [
    [/yardas? (por|de) pase|yardas? aereas|passing yards|pass yds/, sumaJ("pay"), "yardas por pase"],
    [/yardas? (por|de) tierra|yardas? terrestres|yardas? por carrera|rushing yards|rush yds/, sumaJ("ruy"), "yardas por tierra"],
    [/yardas? (por|de) recepcion|receiving yards|rec yds/, sumaJ("rey"), "yardas por recepción"],
    [/recepciones?|receptions?/, sumaJ("rec"), "recepciones"],
    [/pases? (de )?(td|touchdown)|passing (td|touchdowns?)|(td|touchdown)s? (pass|de pase)/, sumaJ("patd"), "pases de TD"],
    [/touchdowns?|\stds?\s|anota|anytime/, sumaJ("rutd","retd"), "touchdowns"],
    [/yardas?|yards?/, s => Math.max(Number(s.pay)||0, (Number(s.ruy)||0)+(Number(s.rey)||0)), "yardas"],
  ],
  soccer: [
    [/(remates?|tiros?|disparos?)\s+(a|al)\s+(puerta|gol|arco|marco)|shots? on (target|goal)/, sumaJ("sot"), "remates a puerta"],
    [/paradas?|atajadas?|salvadas?|saves?/, sumaJ("sv"), "atajadas"],
  ],
};
// Apodos y nombres cortos -> nombre como lo trae ESPN ("Chivas ML", "Barca over 2.5", "City -1.5"...).
// Solo se cambia si ese equipo juega en el partido y el texto no trae ya otro nombre con esa palabra ("Newcastle United").
const APODOS = [["chivas","guadalajara"],["rebano","guadalajara"],["rayados","monterrey"],["la maquina","cruz azul"],["aguilas","america"],
  ["tuzos","pachuca"],["diablos rojos","toluca"],["xolos","tijuana"],["zorros","atlas"],["gallos blancos","queretaro"],["gallos","queretaro"],
  ["la fiera","leon"],["esmeraldas","leon"],["camoteros","puebla"],["franja","puebla"],["rayos","necaxa"],["bravos","juarez"],["guerreros","santos"],
  ["felinos","tigres"],["auriazules","pumas"],["pumas","pumas unam"],["tigres","tigres uanl"],["santos","santos laguna"],["san luis","atletico de san luis"],
  ["barca","barcelona"],["blaugrana","barcelona"],["culers","barcelona"],["merengues","real madrid"],["atleti","atletico madrid"],["colchoneros","atletico madrid"],
  ["man utd","manchester united"],["man united","manchester united"],["utd","manchester united"],["united","manchester united"],["red devils","manchester united"],
  ["man city","manchester city"],["city","manchester city"],["citizens","manchester city"],["gunners","arsenal"],["reds","liverpool"],["blues","chelsea"],
  ["spurs","tottenham"],["toffees","everton"],["hammers","west ham"],["magpies","newcastle"],["wolves","wolverhampton"],["forest","nottingham forest"],
  ["palace","crystal palace"],["villa","aston villa"],["juve","juventus"],["inter milan","internazionale"],["inter","internazionale"],["milan","ac milan"],
  ["bayern","bayern munich"],["bvb","borussia dortmund"],["dortmund","borussia dortmund"],["leverkusen","bayer leverkusen"],["psg","paris saint-germain"],["paris","paris saint-germain"]];
const conApodos = (t, ev) => {
  if(!ev || !esFut(ev.k)) return t;
  const noms = [ev.h,ev.a].filter(Boolean).flatMap(e=>[e.n,e.full].filter(Boolean).map(x=>normTxt(x).trim()));
  return APODOS.reduce((x,[a,b])=>{
    if(!x.includes(" "+a+" ")) return x;
    if(!noms.some(n=>n.includes(b))) return x;                                   // ese equipo no juega aquí
    if(noms.some(n=>n!==b && (" "+n+" ").includes(" "+a+" ") && x.includes(" "+n+" "))) return x; // ya trae el nombre completo
    return x.split(" "+a+" ").join(" "+b+" ");
  }, t);
};
const deporteK = k => String(k||"").split("/")[0];
// ¿El pick parece de jugador? (para que la app le pida al Worker las estadísticas de jugadores de ese partido)
const pareceJugador = (desc, ev) => {
  if(!ev) return false; const lst = STATS_JUG[deporteK(ev.k)]; if(!lst) return false;
  let t = conApodos(" "+normTxt(desc||"")+" ", ev); const st = lst.find(([re])=>re.test(t)); if(!st) return false;
  [ev.h,ev.a].forEach(e=>{ if(e) [e.n,e.full,e.a].filter(x=>x&&x.length>=2).map(normTxt).forEach(n=>{ t=t.split(n).join(" "); }); });
  lst.forEach(([re])=>{ t=t.replace(new RegExp(re.source,"g")," "); });
  t = t.replace(/(over|under|mas de|menos de|alta|baja|total(es)?|del|de|el|la|los|en|partido|juego|equipo|vs|anota|conecta|hace|\d+(\.\d+)?\+?|[+\-.()])/g," ");
  return t.split(/\s+/).some(w=>w.length>=3);
};
const pickJugador = (t, ev, v, fin) => {
  if(!v || !Array.isArray(v.j) || !v.j.length) return null;
  const lst = STATS_JUG[deporteK(ev.k)]; if(!lst) return null;
  const st = lst.find(([re])=>re.test(t)); if(!st) return null;
  // Encontrar al jugador: nombre completo, o apellido si solo hay uno con ese apellido en el partido
  const limpia = n => normTxt(n).replace(/\s+(jr|sr|ii|iii|iv)\.?$/,"").trim();
  const con = w => new RegExp("[^a-z0-9]"+w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"[^a-z0-9]").test(t);
  let jug = v.j.find(p=>con(limpia(p.n)));
  if(!jug){ const ap = p => limpia(p.n).split(" ").pop(); const cand = v.j.filter(p=>ap(p).length>=3 && con(ap(p)));
    if(cand.length===1) jug=cand[0]; else return null; }
  // Línea: over/under N, "N+", o "anota"/"conecta un hit" (= más de 0.5)
  const lin = t.match(/(over|under|mas de|menos de|alta|baja)\s*(\d+(?:\.\d+)?)/) || t.match(/\s(\d+)\s*\+/);
  let under=false, nec, mx;
  if(lin && lin[2]!==undefined){ under=/under|menos de|baja/.test(lin[1]); const L=Number(lin[2]); nec=Math.floor(L)+1; mx=Math.floor(L); }
  else if(lin){ nec=Number(lin[1]); }
  else if(/anota|anytime|conecta|hace un|al menos un/.test(t) || st[2]==="touchdowns") nec=1; // "Walker TD" = anota touchdown
  else return null;
  const SING = {hits:"hit",jonrones:"jonrón",impulsadas:"impulsada",carreras:"carrera",strikeouts:"strikeout","bases por bola":"base por bola",puntos:"punto",rebotes:"rebote",
    asistencias:"asistencia",triples:"triple",robos:"robo",tapones:"tapón",recepciones:"recepción","pases de TD":"pase de TD",touchdowns:"touchdown","remates a puerta":"remate a puerta",atajadas:"atajada",
    "yardas por pase":"yarda por pase","yardas por tierra":"yarda por tierra","yardas por recepción":"yarda por recepción",yardas:"yarda"};
  const val = st[1](jug.s||{}), nombre = jug.n.split(" ").filter(w=>!/^(jr|sr|ii|iii|iv)\.?$/i.test(w)).slice(-1)[0] || jug.n;
  const uu = n => n===1 ? (SING[st[2]]||st[2]) : st[2], u = uu(val);
  if(!under) return val>=nec ? {txt:"¡Ganaste! · "+nombre+" "+val+" "+u, ok:1, listo:1, prog:[val,nec], stats:1, jug:1}
    : {txt:fin ? "Perdiste · "+nombre+" quedó en "+val+" "+u : nombre+" · "+val+" de "+nec+" "+uu(nec), ok:fin?-1:0, prog:[val,nec], stats:1, jug:1};
  return val>mx ? {txt:"Perdiste · "+nombre+" lleva "+val+" "+u, ok:-1, stats:1, jug:1}
    : {txt:fin ? "¡Ganaste! · "+nombre+" quedó en "+val+" "+u : nombre+" · "+val+" "+u+" · máximo "+mx, ok:fin?1:0, listo:fin?1:0, stats:1, jug:1};
};
// Detecta picks de un tramo del partido: cuarto, mitad/tiempo, periodo o primeras 5 entradas
const ORD = {primer:1,primero:1,primera:1,segundo:2,segunda:2,tercer:3,tercero:3,tercera:3,cuarto:4,cuarta:4};
const tramoPick = (t, ev) => {
  const fut=esFut(ev.k), beis=String(ev.k).startsWith("baseball");
  let m, n, tipo, txt;
  if((m=t.match(/\s(f5|(?:(?:las\s+)?primeras?\s+)?5\s+entradas|primeras?\s+cinco\s+entradas)\s/)) && beis){ return {quita:m[1], per:[1,2,3,4,5], hasta:5, label:"5 entradas"}; }
  if((m=t.match(/\s(?:(\d)\s*(?:er|era|ra|ro|do|da|to|ta|o|a|º|°|ª)?|(primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]))\s+(cuarto|mitad|tiempo|periodo|half|quarter|qtr)\s/))){ n=m[1]?Number(m[1]):ORD[m[2]]; tipo=m[3]; txt=m[0]; }
  else if((m=t.match(/\s(?:([1-4])\s*(q|h)|(q|h)\s*([1-4]))\s/))){ n=Number(m[1]||m[4]); tipo=(m[2]||m[3])==="q"?"cuarto":"mitad"; txt=m[0]; }
  else return null;
  if(!n||n<1||n>4) return null;
  if(/cuarto|quarter|qtr/.test(tipo)){ if(fut||beis) return null; return {quita:txt, per:[n], hasta:n, label:["1er","2º","3er","4º"][n-1]+" cuarto"}; }
  if(/periodo/.test(tipo)) return {quita:txt, per:[n], hasta:n, label:["1er","2º","3er","4º"][n-1]+" periodo"};
  if(n>2||beis) return null;
  if(fut) return {quita:txt, per:[n], hasta:n, label:(n===1?"1er":"2º")+" tiempo"};
  return n===1 ? {quita:txt, per:[1,2], hasta:2, label:"1ª mitad"} : {quita:txt, per:[3,4,5,6,7,8], hasta:99, label:"2ª mitad"};
};
const pistaPick = (a,ev,v,sinTramo) => {
  if(!v||!ev) return null; const hs=Number(v.hs), as=Number(v.as); if(v.hs===""||v.as===""||isNaN(hs)||isNaN(as)) return null;
  // "(incl. prórroga)" / "(tiempo regular)" no cambian cómo se lee el pick: se quitan para que no estorben
  const t=conApodos(" "+normTxt(a.descripcion||"")+" ", ev)
    .replace(/\(?\s*(incl\.?|incluye|incluyendo|con)\s+(la\s+)?(prorroga|tiempo extra|tiempos extras?|overtime|ot)\s*\)?/g," ")
    .replace(/\(?\s*resultado final\s*[,\-]?\s*(tiempo regular|90 minutos)?\s*\)?/g," ")
    .replace(/\(?\s*(tiempo regular|90 minutos)\s*\)?/g," ")
    .replace(/\s(tt|team total)\s/g," total equipo "), fin=v.st==="post";
  // Picks de un cuarto / mitad / 5 entradas: se califican con el marcador de ese tramo
  const tr = !sinTramo && tramoPick(t, ev);
  if(tr){
    const sinLS = !Array.isArray(v.hl)||!Array.isArray(v.al);
    const per=Number(v.per)||0, cierre=/^(end|halftime|ht)\b|end of|final/i.test(String(v.det||""));
    if(sinLS && !per) return null; // sin datos del periodo no se sabe en qué tramo va
    const empezo = fin || per>=tr.per[0], listoT = fin || per>tr.hasta || (per===tr.hasta && cierre);
    if(!empezo) return {txt:tr.label+" · aún no empieza", ok:0};
    const suma = arr => tr.per.reduce((s,p)=>s+(Number(arr[p-1])||0),0);
    // Si el tramo empieza desde el inicio y todavía se está jugando, su marcador ES el marcador del partido
    // (ESPN a veces no actualiza el marcador por tiempo/cuarto mientras está en vivo)
    const enCurso = !fin && tr.per[0]===1 && per>=1 && per<=tr.hasta;
    if(!enCurso && sinLS) return null;
    const ph = enCurso ? hs : suma(v.hl), pa = enCurso ? as : suma(v.al);
    const p = pistaPick({descripcion:t.replace(tr.quita," ")}, ev, {st:listoT?"post":"in", hs:ph, as:pa}, true);
    if(!p||p.stats) return null;
    const marc = tr.label+" "+(esFut(ev.k)?ph+"-"+pa:pa+"-"+ph);
    if((listoT||p.listo) && p.ok===1) return {...p, txt:"¡Ganaste! · "+marc, listo:1};
    if(p.ok===-1 && (listoT||/^Perdiste/.test(p.txt))) return {...p, txt:"Perdiste · "+marc};
    if(listoT) return {...p, txt:"Empate · "+marc};
    return {...p, txt:marc+" · "+p.txt};
  }
  const esc=x=>x.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const hit=e=>[e.n,e.full,e.a].filter(x=>x&&x.length>=3).map(normTxt).some(n=>new RegExp("[^a-z0-9]"+esc(n)+"[^a-z0-9]").test(t));
  const H=hit(ev.h), A=hit(ev.a), uno=H!==A;
  const un=esFut(ev.k)?"goles":String(ev.k).startsWith("baseball")?"carreras":"puntos";
  const cu=(n,pl)=>n+" "+(n===1?({goles:"gol",carreras:"carrera",puntos:"punto","remates a puerta":"remate a puerta",remates:"remate","córners":"córner",tarjetas:"tarjeta"}[pl]||pl):pl);
  const sc=esFut(ev.k)?hs+"-"+as:as+"-"+hs;
  // Picks de jugador (si el Worker mandó las estadísticas de jugadores de este partido)
  const pj = pickJugador(t, ev, v, fin); if(pj) return pj;
  // Ambos equipos anotan (Sí / No)
  if(/ambos\s+(equipos\s+)?(marcan|anotan)|\sbtts\s|both teams to score/.test(t) && !/tiempo|mitad|\s(1h|2h|half)\s/.test(t)){
    const no = /(marcan|anotan|btts|score)\s*:?\s*no(\s|$)/.test(t) || /\sno\s+(marcan|anotan)/.test(t);
    const falta = hs===0&&as===0 ? "Falta que anoten los dos" : "Falta que anote "+(hs===0?ev.h.n:ev.a.n);
    if(!no) return hs>0&&as>0 ? {txt:"¡Ganaste! · anotaron los dos", ok:1, listo:1} : {txt:fin?"Perdiste · no anotaron los dos":falta, ok:fin?-1:0};
    return hs>0&&as>0 ? {txt:"Perdiste · anotaron los dos", ok:-1} : {txt:fin?"¡Ganaste! · no anotaron los dos":"Va bien · "+(hs===0&&as===0?"nadie ha anotado":"solo ha anotado "+(hs>0?ev.h.n:ev.a.n)), ok:fin?1:0, listo:fin?1:0};
  }
  // Estadísticas de equipo: remates / tiros a puerta, córners, tarjetas
  const stK = /(remates?|tiros?|disparos?)\s+(a|al)\s+(puerta|gol|arco|marco)|shots? on (target|goal)/.test(t) ? ["shotsOnTarget","remates a puerta"]
    : /\s(remates?|tiros?|disparos?|shots?)\s/.test(t) && !/\s(de esquina|libres?|penal)/.test(t) ? ["totalShots","remates"]
    : /corner|tiros? de esquina|saques? de esquina/.test(t) ? ["wonCorners","córners"]
    : /tarjetas?|cards?/.test(t) ? ["tarjetas","tarjetas"] : null;
  if(stK){
    if(/tiempo|mitad|\s(1h|2h|half)\s/.test(t)) return null;
    const lin = t.match(/(over|under|mas de|menos de|alta|baja)\s*(\d+(?:\.\d+)?)/) || t.match(/(\d+)\s*\+/);
    if(!lin) return null;
    const leer = e => { if(!e) return NaN; if(stK[0]==="tarjetas") return e.yellowCards===undefined?NaN:Number(e.yellowCards)+Number(e.redCards||0); return e[stK[0]]===undefined?NaN:Number(e[stK[0]]); };
    const vh=leer(v.eh), va=leer(v.ea);
    let val;
    if(H&&!A) val=vh; else if(A&&!H) val=va; else if(!H&&!A){ let pre=t.slice(0,t.indexOf(lin[0])); ["total","partido","juego","del","el","vs","entre","ambos","equipos","mas de","menos de"," fc "," cf "," afc "," club "].forEach(x=>{ pre=pre.split(x).join(" "); }); if(pre.replace(/[^a-z]/g,"").length>3) return null; val=vh+va; } else return null;
    if(isNaN(val)) return null;
    const under = /under|menos de|baja/.test(lin[1]||""), L = lin[2]!==undefined ? Number(lin[2]) : Number(lin[1])-0.5;
    if(!under){ const nec=Math.floor(L)+1; return val>=nec ? {txt:"¡Ganaste! · "+cu(val,stK[1]), ok:1, listo:1, prog:[val,nec], stats:1} : {txt:fin?"Perdiste · quedó en "+cu(val,stK[1]):val+" de "+cu(nec,stK[1]), ok:fin?-1:0, prog:[val,nec], stats:1}; }
    const mx=Math.floor(L); return val>mx ? {txt:"Perdiste · van "+cu(val,stK[1]), ok:-1, stats:1} : {txt:fin?"¡Ganaste! · quedó en "+cu(val,stK[1]):"Van "+cu(val,stK[1])+" · máximo "+mx, ok:fin?1:0, listo:fin?1:0, stats:1};
  }
  if(/tiempo|mitad|cuarto|entrada|inning|periodo|\s(1h|2h|1q|2q|3q|4q|half)\s|corner|tarjeta|remate|tiro|asistencia|rebote|yarda|ponche|hit|anota primero|primer/.test(t)) return null;
  const nm=e=>[e.n,e.full,e.a].filter(x=>x&&x.length>=3).map(normTxt);
  const ou=t.match(/(over|under|mas de|menos de|alta|baja)\s*(\d+(?:\.\d+)?)/);
  if(ou){ // totales del partido o de UN equipo: antes del over no puede ir un jugador, después solo goles/puntos/carreras
    const conect = s => s.replace(/(^|\s)(vs|total|totales|partido|juego|del|de|el|la|los|para|equipo|anota|anotan|marca|marcan|mete|meten|hace|hacen|en|fc|cf|afc|sc|ac|cd|club|goles?|puntos?|carreras?|-)(?=\s|$)/g," ");
    let pre=t.slice(0,ou.index); [...nm(ev.h),...nm(ev.a)].forEach(x=>{ pre=pre.split(x).join(" "); }); pre=conect(pre);
    let pos=" "+t.slice(ou.index+ou[0].length)+" "; [...nm(ev.h),...nm(ev.a)].forEach(x=>{ pos=pos.split(x).join(" "); }); pos=conect(pos).trim();
    if(pre.replace(/[^a-z0-9]/g,"")!=="" || (pos && !/^(goles?|puntos?|pts|carreras?|runs?)$/.test(pos))) return null; }
  if(ou){ const L=Number(ou[2]), tot=uno?(H?hs:as):hs+as; // si nombra un solo equipo, cuenta solo lo de ese equipo
    if(/over|mas de|alta/.test(ou[1])){ const nec=Math.floor(L)+1;
      return tot>=nec ? {txt:"¡Ganaste! · "+cu(tot,un), ok:1, listo:1, prog:[tot,nec]} : {txt:fin?"Perdiste · quedó en "+cu(tot,un):tot+" de "+cu(nec,un), ok:fin?-1:0, prog:[tot,nec]}; }
    const mx=Math.floor(L); return tot>mx ? {txt:"Perdiste · van "+cu(tot,un), ok:-1} : {txt:fin?"¡Ganaste! · quedó en "+cu(tot,un):"Van "+cu(tot,un)+" · máximo "+mx, ok:fin?1:0, listo:fin?1:0}; }
  if(!uno||ou) return null;
  const mio=H?hs:as, otro=H?as:hs;
  const sp=t.match(/\s([+-]\d+(?:\.\d+)?)\s/);
  if(sp){ const m=mio-otro+Number(sp[1]); return {txt:fin?(m>0?"¡Ganaste! · cubrió ("+sc+")":m<0?"Perdiste · no cubrió ("+sc+")":"Quedó justo en la línea ("+sc+")"):(m>0?"Va cubriendo":m<0?"No está cubriendo":"Justo en la línea"), ok:m>0?1:m<0?(fin?-1:0):0, listo:fin&&m>0?1:0}; }
  if(/\d/.test(t.replace(/\s(ml|moneyline)\s/g," "))) return null;
  if(/empate|draw|doble/.test(t)) return mio>=otro ? {txt:fin?"¡Ganaste! · "+sc:"Va bien", ok:1, listo:fin?1:0} : {txt:fin?"Perdiste · "+sc:"Va perdiendo", ok:fin?-1:0};
  if(mio>otro) return {txt:fin?"¡Ganaste! · "+sc:"Va ganando", ok:1, listo:fin?1:0};
  if(mio<otro) return {txt:fin?"Perdiste · "+sc:"Va perdiendo", ok:fin?-1:0};
  return {txt:fin?(esFut(ev.k)?"Perdiste · empate "+sc:"Empate · "+sc):"Van empatados", ok:fin&&esFut(ev.k)?-1:0};
};
// Calificación automática: decide el resultado de un pick cuando su partido terminó, SOLO si la app lo entiende con seguridad.
// No califica picks basados en estadísticas (remates, córners, tarjetas): ESPN puede contar distinto que la casa de apuestas.
// Regresa {res, patas} / {patas} (parlay con legs nuevas resueltas) / null.
const finalLimpio = v => !!v && v.st==="post" && v.hs!=="" && v.as!=="" && v.hs!=null && v.as!=null && !/postp|cancel|susp|aplaz|abandon|forfeit|delay/i.test(v.det||"");
const resultadoAuto = (a, vivoMap) => {
  if(a.resultado!=="Pendiente") return null;
  const decide = (desc, ev) => { if(!ev||!ev.id) return 0; const v=vivoMap[ev.id]; if(!finalLimpio(v)) return 0;
    const p=pistaPick({descripcion:desc}, ev, v); if(!p||p.stats) return 0; return p.ok===1?1:p.ok===-1?-1:0; };
  if(!esCombo(a)){ const d=decide(a.descripcion, a.evento); return d===1?{res:"Ganada"}:d===-1?{res:"Perdida"}:null; }
  if(!Array.isArray(a.patas)) return null;
  let cambio=false;
  const patas = a.patas.map(p=>{ const o=typeof p==="object"?{...p}:{deporte:"",desc:p};
    if(o.desc&&String(o.desc).trim()&&!o.res){ const d=decide(o.desc,o.evento); if(d){ o.res=d===1?"G":"P"; cambio=true; } } return o; });
  const vis = patas.filter(p=>p.desc&&String(p.desc).trim());
  if(!vis.length) return null;
  if(vis.some(p=>p.res==="P")) return {res:"Perdida", patas};
  if(vis.every(p=>p.res==="G")) return {res:"Ganada", patas};
  return cambio ? {patas} : null;
};

if (typeof globalThis !== "undefined") globalThis.Calif = { normTxt, esFut, esCombo, tramoPick, pistaPick, finalLimpio, resultadoAuto, pareceJugador, pickJugador };
