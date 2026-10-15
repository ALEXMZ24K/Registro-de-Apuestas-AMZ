// AlexPicks · MODO PRUEBA
// Reemplaza a Firebase con una base de datos falsa guardada en este navegador (localStorage),
// con picks de ejemplo. Así la app de prueba (y el robot de pruebas) nunca tocan los datos reales.
// Se activa en /prueba/ o con ?prueba=1. Rol: ?rol=amigo para ver la app como un usuario normal.
(function(){
  "use strict";
  var CLAVE = "alexpicks-prueba-db";
  var params = new URLSearchParams(location.search);
  if(params.get("reiniciar")==="1"){ try{ localStorage.removeItem(CLAVE); localStorage.removeItem("alexpicks-prueba-rol"); }catch(e){} }
  if(params.get("rol")){ try{ localStorage.setItem("alexpicks-prueba-rol", params.get("rol")); }catch(e){} }
  var rol = (function(){ try{ return localStorage.getItem("alexpicks-prueba-rol")||"admin"; }catch(e){ return "admin"; } })();

  var clon = function(o){ return o===undefined ? undefined : JSON.parse(JSON.stringify(o)); };
  var pad = function(n){ return String(n).padStart(2,"0"); };
  var iso = function(d){ return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); };

  // ---------- Datos de ejemplo ----------
  function semilla(){
    var hoy = new Date(); hoy.setHours(12,0,0,0);
    var picks = [
      ["Fútbol","Moneyline","Tigres ML","Tigres vs Toluca",2,-150,"Ganada"],
      ["Béisbol","Moneyline","Dodgers ML","Dodgers vs Padres",3,-140,"Perdida"],
      ["Fútbol","Over/Under","Over 2.5 goles","América vs Pumas",2,-125,"Ganada"],
      ["Americano","Handicap/Spread","Chiefs -3.5","Chiefs vs Bills",2,-110,"Ganada"],
      ["Basquetbol","Over/Under","Lakers Over 224.5","Lakers vs Celtics",2,-110,"Perdida"],
      ["Fútbol","Especial por jugador","Barcelona Over 6.5 remates a puerta","Galatasaray vs Barcelona",2,-184,"Ganada"],
      ["Fútbol","Moneyline","Ambos equipos marcan: Sí","Villarreal vs Nápoles",2,-175,"Ganada"],
      ["Béisbol","Moneyline","Rays ML","Rays vs Guardians",3,-140,"Ganada"],
      ["Fútbol","Moneyline","Real Madrid ML","Real Madrid vs Sevilla",2,-200,"Nula"],
      ["Americano","Over/Under","Bills @ Rams Over 47.5","Bills @ Rams",2,-162,"Perdida"],
      ["Fútbol","Moneyline","Cruz Azul ML","Cruz Azul vs Chivas",2,+120,"Ganada"],
      ["Basquetbol","Handicap/Spread","Celtics -4.5","Celtics vs Knicks",2,-110,"Ganada"]
    ];
    var docs = {}, n = 0, id0 = Date.now()-1e8;
    // Mes pasado (8 picks) y este mes (hasta hoy), el último de hoy queda pendiente
    var hacer = function(fecha, p, res){
      n++; var key = "p"+n;
      docs[key] = {id:id0+n, fecha:iso(fecha), deporte:p[0], tipo:p[1], descripcion:p[2], partido:p[3], monto:p[4], cuota:p[5], resultado:res, patas:[], evento:null};
    };
    var mp = new Date(hoy.getFullYear(), hoy.getMonth()-1, 3, 12);
    for(var i=0;i<8;i++){ var f=new Date(mp); f.setDate(3+i*3); hacer(f, picks[i%picks.length], picks[i%picks.length][6]); }
    var dias = Math.max(1, hoy.getDate());
    for(var j=0;j<picks.length;j++){ var d=new Date(hoy.getFullYear(), hoy.getMonth(), Math.max(1, Math.round(1+j*(dias-1)/picks.length)), 12); if(d>hoy) d=new Date(hoy); hacer(d, picks[j], picks[j][6]); }
    // Pendientes de hoy: uno sencillo y un parlay
    hacer(hoy, ["Fútbol","Moneyline","Pumas ML","Pumas vs León",2,+105], "Pendiente");
    n++; docs["p"+n] = {id:id0+n, fecha:iso(hoy), deporte:"Combinación", tipo:"Parlay/Combinada",
      descripcion:"[Fútbol] Tigres ML | [Basquetbol] Lakers -2.5", partido:"", monto:1, cuota:+260, resultado:"Pendiente",
      patas:[{deporte:"Fútbol",desc:"Tigres ML"},{deporte:"Basquetbol",desc:"Lakers -2.5"}], evento:null};
    var bank = {}; bank[hoy.getFullYear()+"-"+hoy.getMonth()] = 50000; bank[mp.getFullYear()+"-"+mp.getMonth()] = 45000;
    return { apuestas: docs, config: { bankrolls: bank }, usuarios: {} };
  }

  var datos;
  try{ datos = JSON.parse(localStorage.getItem(CLAVE)||"null"); }catch(e){ datos = null; }
  if(!datos || !datos.apuestas) datos = semilla();
  var guardar = function(){ try{ localStorage.setItem(CLAVE, JSON.stringify(datos)); }catch(e){} };
  guardar();

  // ---------- Firestore falso ----------
  var BORRAR = {__borrar:true};
  var oyentes = [];
  var avisar = function(){ guardar(); oyentes.slice().forEach(function(o){ setTimeout(function(){ if(o.activo) o.disparar(); }, 0); }); };
  var col = function(nombre){ if(!datos[nombre]) datos[nombre] = {}; return datos[nombre]; };
  var nuevoId = function(){ return "f"+Date.now().toString(36)+Math.random().toString(36).slice(2,7); };

  function mezclar(dest, src){
    Object.keys(src).forEach(function(k){
      var v = src[k];
      if(v && v.__borrar){ delete dest[k]; return; }
      if(v && typeof v==="object" && !Array.isArray(v) && dest[k] && typeof dest[k]==="object" && !Array.isArray(dest[k])) mezclar(dest[k], v);
      else dest[k] = clon(v);
    });
    return dest;
  }
  function docSnap(nombre, id){
    var d = col(nombre)[id];
    return { id:id, exists: d!==undefined, data: function(){ return clon(d); }, ref: docRef(nombre,id) };
  }
  function docRef(nombre, id){
    return {
      id: id,
      get: function(){ return Promise.resolve(docSnap(nombre,id)); },
      set: function(v, opt){ var c=col(nombre); c[id] = (opt&&opt.merge&&c[id]) ? mezclar(c[id], v) : mezclar({}, v); avisar(); return Promise.resolve(); },
      update: function(v){
        var c=col(nombre); if(!c[id]) return Promise.reject(new Error("not-found"));
        Object.keys(v).forEach(function(k){
          var partes = k.split("."), o = c[id];
          for(var i=0;i<partes.length-1;i++){ if(!o[partes[i]] || typeof o[partes[i]]!=="object") o[partes[i]] = {}; o = o[partes[i]]; }
          var u = partes[partes.length-1];
          if(v[k] && v[k].__borrar) delete o[u]; else o[u] = clon(v[k]);
        });
        avisar(); return Promise.resolve();
      },
      delete: function(){ delete col(nombre)[id]; avisar(); return Promise.resolve(); },
      onSnapshot: function(cb, err){
        var o = {activo:true, disparar:function(){ try{ cb(docSnap(nombre,id)); }catch(e){ console.error(e); } }};
        oyentes.push(o); setTimeout(o.disparar, 30);
        return function(){ o.activo=false; oyentes = oyentes.filter(function(x){ return x!==o; }); };
      }
    };
  }
  function consulta(nombre, filtros, orden){
    var correr = function(){
      var c = col(nombre);
      var ids = Object.keys(c).filter(function(id){
        return filtros.every(function(f){ var v=c[id][f[0]];
          return f[1]===">=" ? v>=f[2] : f[1]==="<=" ? v<=f[2] : f[1]===">" ? v>f[2] : f[1]==="<" ? v<f[2] : f[1]==="==" ? v===f[2] : true; });
      });
      if(orden) ids.sort(function(a,b){ var x=c[a][orden[0]], y=c[b][orden[0]]; var r = x<y?-1:x>y?1:0; return orden[1]==="desc"?-r:r; });
      var docs = ids.map(function(id){ return docSnap(nombre,id); });
      return { docs:docs, size:docs.length, empty:!docs.length, forEach:function(f){ docs.forEach(f); } };
    };
    return {
      where: function(campo, op, val){ return consulta(nombre, filtros.concat([[campo,op,val]]), orden); },
      orderBy: function(campo, dir){ return consulta(nombre, filtros, [campo, dir||"asc"]); },
      limit: function(){ return this; },
      get: function(){ return Promise.resolve(correr()); },
      onSnapshot: function(cb, err){
        var o = {activo:true, disparar:function(){ try{ cb(correr()); }catch(e){ console.error(e); } }};
        oyentes.push(o); setTimeout(o.disparar, 60);
        return function(){ o.activo=false; oyentes = oyentes.filter(function(x){ return x!==o; }); };
      },
      add: function(v){ var id=nuevoId(); col(nombre)[id] = mezclar({}, v); avisar(); return Promise.resolve(docRef(nombre,id)); },
      doc: function(id){ return docRef(nombre, id||nuevoId()); }
    };
  }
  var db = { collection: function(nombre){ return consulta(nombre, [], null); } };

  // ---------- Auth falso ----------
  var USUARIOS = {
    admin: {uid:"prueba-admin", email:"alexitozenil@gmail.com", displayName:"Alex (prueba)"},
    amigo: {uid:"prueba-amigo", email:"amigo.prueba@gmail.com", displayName:"Amigo (prueba)"},
    nadie: null
  };
  var hacerUsuario = function(u){ return u ? Object.assign({}, u, {getIdToken:function(){ return Promise.resolve("token-de-prueba"); }}) : null; };
  var actual = hacerUsuario(USUARIOS.hasOwnProperty(rol) ? USUARIOS[rol] : USUARIOS.admin);
  var oyentesAuth = [];
  var auth = {
    get currentUser(){ return actual; },
    setPersistence: function(){ return Promise.resolve(); },
    onAuthStateChanged: function(cb){ oyentesAuth.push(cb); setTimeout(function(){ cb(actual); }, 20); return function(){ oyentesAuth = oyentesAuth.filter(function(x){ return x!==cb; }); }; },
    signInWithPopup: function(){ actual = hacerUsuario(USUARIOS.amigo); oyentesAuth.forEach(function(f){ f(actual); }); return Promise.resolve({user:actual}); },
    signInWithRedirect: function(){ return this.signInWithPopup(); },
    getRedirectResult: function(){ return Promise.resolve({user:null}); },
    signOut: function(){ actual = null; oyentesAuth.forEach(function(f){ f(null); }); return Promise.resolve(); }
  };
  function GoogleAuthProvider(){} GoogleAuthProvider.prototype.setCustomParameters = function(){};
  var authFn = function(){ return auth; }; authFn.GoogleAuthProvider = GoogleAuthProvider; authFn.Auth = {Persistence:{LOCAL:"local"}};
  var fsFn = function(){ return db; }; fsFn.FieldValue = { delete: function(){ return BORRAR; } };

  window.firebase = { initializeApp: function(){ return {}; }, firestore: fsFn, auth: authFn, apps: [], __falso: true };
  window.ES_PRUEBA = true;

  // ---------- Etiqueta "PRUEBA" con menú ----------
  document.addEventListener("DOMContentLoaded", function(){
    var b = document.createElement("div");
    b.id = "barra-prueba";
    // Abajo a la izquierda, arriba de la barra; sin sombra ni centrado con transform (eso la hacía verse borrosa)
    b.style.cssText = "position:fixed;bottom:calc(84px + env(safe-area-inset-bottom));left:10px;z-index:99999;background:#ffc94a;color:#2a1d00;font:800 11px/1 system-ui,sans-serif;padding:6px 9px;border-radius:20px;border:1px solid #2a1d00;cursor:pointer;letter-spacing:.3px;user-select:none;-webkit-user-select:none";
    b.textContent = "🧪 PRUEBA · " + (rol==="amigo"?"amigo":rol==="nadie"?"sin sesión":"admin") + " ▾";
    var m = document.createElement("div");
    m.style.cssText = "display:none;position:fixed;bottom:calc(116px + env(safe-area-inset-bottom));left:10px;z-index:99999;background:#1b1b1d;border:1px solid #333;border-radius:14px;overflow:hidden;min-width:220px;box-shadow:0 10px 30px #000a;font:600 14px system-ui,sans-serif";
    var opc = [["Ver como admin","?rol=admin"],["Ver como amigo","?rol=amigo"],["Ver sin sesión","?rol=nadie"],["Reiniciar datos de prueba","?reiniciar=1"]];
    opc.forEach(function(o,i){ var a=document.createElement("a"); a.href=location.pathname+o[1]+(location.search.indexOf("prueba=1")>=0?"&prueba=1":""); a.textContent=o[0];
      a.style.cssText="display:block;padding:12px 14px;color:"+(i===3?"#ff7a8f":"#eee")+";text-decoration:none;border-top:"+(i?"1px solid #2a2a2c":"none"); m.appendChild(a); });
    b.onclick = function(){ m.style.display = m.style.display==="none" ? "block" : "none"; };
    document.body.appendChild(b); document.body.appendChild(m);
    var etiqueta = function(u){ b.textContent = "🧪 PRUEBA · " + (!u ? "sin sesión" : u.uid==="prueba-admin" ? "admin" : "amigo") + " ▾"; };
    oyentesAuth.push(etiqueta);
    // Por si algo la quita, se vuelve a poner
    setInterval(function(){ if(!document.getElementById("barra-prueba")){ document.body.appendChild(b); document.body.appendChild(m); } }, 1000);
  });
})();
