import json, urllib.request, datetime
def get(u):
    return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent":"Mozilla/5.0"}), timeout=30))
out = {}
for k in ["baseball/mlb","basketball/nba","football/nfl","soccer/eng.1","soccer/mex.1"]:
    ev=None
    for back in range(1,20):
        d=(datetime.date.today()-datetime.timedelta(days=back)).strftime("%Y%m%d")
        try: sb=get(f"https://site.api.espn.com/apis/site/v2/sports/{k}/scoreboard?dates={d}")
        except Exception as e: continue
        for e in sb.get("events",[]):
            if e["competitions"][0]["status"]["type"]["state"]=="post": ev=e["id"]; break
        if ev: break
    if not ev: out[k]="sin partido"; continue
    s=get(f"https://site.api.espn.com/apis/site/v2/sports/{k}/summary?event={ev}")
    r={"event":ev,"top":list(s.keys())}
    bp=s.get("boxscore",{}).get("players")
    if bp:
        r["players"]=[{"team":t.get("team",{}).get("displayName"),"statistics":[{"name":g.get("name"),"type":g.get("type"),"keys":g.get("keys"),"labels":g.get("labels"),"names":g.get("names"),
            "athletes":[{"athlete":{x:a.get("athlete",{}).get(x) for x in ("id","displayName","shortName","firstName","lastName")},"stats":a.get("stats")} for a in g.get("athletes",[])[:3]]} for g in t.get("statistics",[])]} for t in bp[:1]]
    ro=s.get("rosters")
    if ro:
        r["rosters"]=[{"team":t.get("team",{}).get("displayName"),"roster":[{"athlete":{x:p.get("athlete",{}).get(x) for x in ("id","displayName","shortName","lastName")},"stats":p.get("stats")} for p in t.get("roster",[])[:3]]} for t in ro[:1]]
    out[k]=r
json.dump(out,open("muestra.json","w"),ensure_ascii=False,indent=1)
