// Lógica para leer un pick y decidir cómo va / si ya ganó o perdió.
// La usan la app (index.html) y el Worker de Cloudflare (calificación automática), así ambos deciden igual.
// Script clásico: en la app deja las funciones como globales; en el Worker se leen de globalThis.Calif.
const normTxt = t => String(t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const esFut = k => String(k||"").startsWith("soccer");
const esCombo = a => a.tipo==="Parlay/Combinada"||a.tipo==="Freebet";
// Detecta picks de un tramo del partido: cuarto, mitad/tiempo, periodo o primeras 5 entradas
const ORD = {primer:1,primero:1,primera:1,segundo:2,segunda:2,tercer:3,tercero:3,tercera:3,cuarto:4,cuarta:4};
const tramoPick = (t, ev) => {
  const fut=esFut(ev.k), beis=String(ev.k).startsWith("baseball");
  let m, n, tipo, txt;
  if((m=t.match(/\s(f5|(?:(?:las\s+)?primeras?\s+)?5\s+entradas|primeras?\s+cinco\s+entradas)\s/)) && beis){ return {quita:m[1], per:[1,2,3,4,5], hasta:5, label:"5 entradas"}; }
  if((m=t.match(/\s(?:(\d)\s*(?:er|era|ra|ro|do|da|to|ta|o|a|º|°)?|(primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]))\s+(cuarto|mitad|tiempo|periodo|half|quarter|qtr)\s/))){ n=m[1]?Number(m[1]):ORD[m[2]]; tipo=m[3]; txt=m[0]; }
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
  const t=" "+normTxt(a.descripcion||"")+" ", fin=v.st==="post";
  // Picks de un cuarto / mitad / 5 entradas: se califican con el marcador de ese tramo
  const tr = !sinTramo && tramoPick(t, ev);
  if(tr){
    if(!Array.isArray(v.hl)||!Array.isArray(v.al)) return null;
    const per=Number(v.per)||0, cierre=/^(end|halftime|ht)\b|end of|final/i.test(String(v.det||""));
    const empezo = fin || per>=tr.per[0], listoT = fin || per>tr.hasta || (per===tr.hasta && cierre);
    if(!empezo) return {txt:tr.label+" · aún no empieza", ok:0};
    const suma = arr => tr.per.reduce((s,p)=>s+(Number(arr[p-1])||0),0), ph=suma(v.hl), pa=suma(v.al);
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
    if(H&&!A) val=vh; else if(A&&!H) val=va; else if(!H&&!A){ let pre=t.slice(0,t.indexOf(lin[0])); ["total","partido","juego","del","el","vs","entre","ambos","equipos","mas de","menos de"].forEach(x=>{ pre=pre.split(x).join(" "); }); if(pre.replace(/[^a-z]/g,"").length>3) return null; val=vh+va; } else return null;
    if(isNaN(val)) return null;
    const under = /under|menos de|baja/.test(lin[1]||""), L = lin[2]!==undefined ? Number(lin[2]) : Number(lin[1])-0.5;
    if(!under){ const nec=Math.floor(L)+1; return val>=nec ? {txt:"¡Ganaste! · "+cu(val,stK[1]), ok:1, listo:1, prog:[val,nec], stats:1} : {txt:fin?"Perdiste · quedó en "+cu(val,stK[1]):val+" de "+cu(nec,stK[1]), ok:fin?-1:0, prog:[val,nec], stats:1}; }
    const mx=Math.floor(L); return val>mx ? {txt:"Perdiste · van "+cu(val,stK[1]), ok:-1, stats:1} : {txt:fin?"¡Ganaste! · quedó en "+cu(val,stK[1]):"Van "+cu(val,stK[1])+" · máximo "+mx, ok:fin?1:0, listo:fin?1:0, stats:1};
  }
  if(/tiempo|mitad|cuarto|entrada|inning|periodo|\s(1h|2h|1q|2q|3q|4q|half)\s|corner|tarjeta|remate|tiro|asistencia|rebote|yarda|ponche|hit|anota primero|primer/.test(t)) return null;
  const nm=e=>[e.n,e.full,e.a].filter(x=>x&&x.length>=3).map(normTxt);
  const ou=t.match(/(over|under|mas de|menos de|alta|baja)\s*(\d+(?:\.\d+)?)/);
  if(ou){ // solo totales del partido: antes del over no puede ir un jugador, después solo goles/puntos/carreras
    let pre=t.slice(0,ou.index); [...nm(ev.h),...nm(ev.a),"vs","total","partido","juego","del","el"].forEach(x=>{ pre=pre.split(x).join(" "); });
    const pos=t.slice(ou.index+ou[0].length).trim();
    if(pre.replace(/[^a-z0-9]/g,"")!=="" || (pos && !/^(goles?|puntos?|pts|carreras?|runs?|totales?|en total)(\s|$)/.test(pos))) return null; }
  if(ou && !uno){ const L=Number(ou[2]), tot=hs+as;
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

if (typeof globalThis !== "undefined") globalThis.Calif = { normTxt, esFut, esCombo, tramoPick, pistaPick, finalLimpio, resultadoAuto };
