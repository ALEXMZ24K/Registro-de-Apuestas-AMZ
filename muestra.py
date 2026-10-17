import json, urllib.request, datetime
def get(u): return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent":"Mozilla/5.0"}), timeout=30))
out=[]
for back in range(1,12):
    d=(datetime.date.today()-datetime.timedelta(days=back)).strftime("%Y%m%d")
    sb=get(f"https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates={d}")
    for e in sb.get("events",[])[:2]:
        s=get(f"https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event={e['id']}")
        bp=s.get("boxscore",{}).get("players",[])
        info={"event":e["id"],"fecha":d,"estado":e["competitions"][0]["status"]["type"]["state"],"nplayers":len(bp)}
        if bp:
            g=bp[0]["statistics"]; info["grupos"]=[(x.get("type"),len(x.get("athletes",[])),x.get("keys")) for x in g]
            for x in g:
                if x.get("athletes"): info["ej_"+str(x.get("type"))]=[{"a":a["athlete"].get("displayName"),"s":a.get("stats")} for a in x["athletes"][:2]]
        ro=s.get("rosters",[])
        info["rosters_raw"]=json.dumps(ro[:1],ensure_ascii=False)[:1500]
        out.append(info)
    if len(out)>=4: break
json.dump(out,open("muestra.json","w"),ensure_ascii=False,indent=1)
