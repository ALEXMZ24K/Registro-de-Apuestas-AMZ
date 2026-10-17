const m = await import("./w.mjs");
const hoy = new Date();
for (const k of ["baseball/mlb","basketball/nba","football/nfl","soccer/mex.1","soccer/eng.1"]) {
  let item=null;
  for (let b=1;b<20&&!item;b++){ const d=new Date(hoy-b*864e5).toISOString().slice(0,10).replace(/-/g,"");
    const sb=await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/${k}/scoreboard?dates=${d}`)).json().catch(()=>({}));
    const e=(sb.events||[]).find(e=>e.competitions[0].status.type.state==="post"); if(e) item=`${k}~${d}~${e.id}~j`; }
  if(!item){ console.log(k,"sin partido"); continue; }
  const t0=Date.now(); const ev=await m.__m([item]); const id=item.split("~")[2]; const j=(ev[id]||{}).j||[];
  console.log("==",k,item,"jugadores:",j.length,"ms:",Date.now()-t0);
  j.slice(0,4).forEach(p=>console.log("   ",p.n,JSON.stringify(p.s)));
}
