const m = await import("./w.mjs");
for (const item of ["baseball/mlb~20261015~401908025~j","baseball/mlb~20261015~401908033~j"]) {
  const ev=await m.__m([item]); const id=item.split("~")[2]; const j=(ev[id]||{}).j||[];
  console.log("==",item,"jugadores:",j.length); j.filter(p=>p.s.h>0||p.s.k>0).slice(0,5).forEach(p=>console.log("   ",p.n,JSON.stringify(p.s)));
}
