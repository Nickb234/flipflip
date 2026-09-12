"use client";
import { useMemo, useState } from "react";

const fmt = n => Number.isFinite(n) ? new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n) : "—";
const pct = n => Number.isFinite(n) ? `${n.toFixed(0)}%` : "—";
const num = n => Number.isFinite(n) ? new Intl.NumberFormat("en-US",{maximumFractionDigits:0}).format(n) : "—";

function gradeClass(g=""){
  if(g.startsWith("A")) return "grade gradeA";
  if(g.startsWith("B")) return "grade gradeB";
  if(g.startsWith("C")) return "grade gradeC";
  return "grade gradeD";
}

export default function Home(){
  const [area,setArea] = useState("");
  const [maxPrice,setMaxPrice] = useState(300000);
  const [soldDays,setSoldDays] = useState(365);
  const [minBeds,setMinBeds] = useState(2);
  const [rehab,setRehab] = useState(35);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const [data,setData] = useState(null);
  const [filter,setFilter] = useState("ALL");
  const [selected,setSelected] = useState(null);

  async function scan(){
    setLoading(true); setError(""); setData(null);
    try{
      const r = await fetch("/api/scan",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({area,maxPrice:Number(maxPrice),soldDays:Number(soldDays),minBeds:Number(minBeds),rehabPerSqft:Number(rehab)})
      });
      const body = await r.json();
      if(!r.ok) throw new Error(body?.error || "Scan failed");
      setData(body);
    }catch(e){ setError(e.message || String(e)); }
    finally{setLoading(false);}
  }

  const deals = useMemo(()=>{
    if(!data?.deals) return [];
    let d=[...data.deals];
    if(filter==="A") d=d.filter(x=>x.grade.startsWith("A"));
    if(filter==="50K") d=d.filter(x=>x.projectedProfit>=50000);
    if(filter==="100K") d=d.filter(x=>x.spread>=100000);
    if(filter==="60DOM") d=d.filter(x=>x.daysOnMarket>=60);
    return d;
  },[data,filter]);

  return <main className="shell">
    <div className="hero">
      <div className="brand">
        <h1>FlipLens Market Scanner</h1>
        <p>Scan an entire market, compare every active single-family listing against recent sold homes, and rank fix-and-flip opportunities by ARV, spread, profit, MAO and comp confidence.</p>
      </div>
      <div className="badge">HOSTED V6 · ACTIVE vs SOLD</div>
    </div>

    <section className="panel searchPanel">
      <div className="searchRow">
        <div className="inputWrap">
          <label>Market</label>
          <input value={area} onChange={e=>setArea(e.target.value)} placeholder="18301 or East Stroudsburg, PA" onKeyDown={e=>e.key==="Enter"&&scan()} />
        </div>
        <div className="inputWrap"><label>Max purchase</label><input type="number" value={maxPrice} onChange={e=>setMaxPrice(e.target.value)} /></div>
        <div className="inputWrap"><label>Sold lookback</label><select value={soldDays} onChange={e=>setSoldDays(e.target.value)}><option value="180">180 days</option><option value="365">365 days</option><option value="540">540 days</option></select></div>
        <div className="inputWrap"><label>Min beds</label><select value={minBeds} onChange={e=>setMinBeds(e.target.value)}><option value="2">2+</option><option value="3">3+</option><option value="4">4+</option></select></div>
        <div className="inputWrap"><label>Rehab / sqft</label><input type="number" value={rehab} onChange={e=>setRehab(e.target.value)} /></div>
        <button className="primary" onClick={scan} disabled={loading || !area.trim()}>{loading?"SCANNING MARKET…":"SCAN ALL HOUSES"}</button>
      </div>
      <div className="note">Use ZIP code or <b>City, ST</b>. FlipLens bulk-downloads active listings and sold property records, then performs comp scoring locally on the server for speed.</div>
      {loading && <div className="progress">Pulling active listings and sold homes, building market averages, then comping each active property…</div>}
      {error && <div className="error">{error}</div>}
    </section>

    {!data && !loading && <section className="panel empty">Enter a market to scan. Example: <b>East Stroudsburg, PA</b>, <b>18337</b>, <b>Scranton, PA</b>.</section>}

    {data && <>
      <section className="stats">
        <div className="panel stat"><div className="k">Active houses</div><div className="v">{num(data.market.activeCount)}</div><div className="s">screened under your max price</div></div>
        <div className="panel stat"><div className="k">Sold houses</div><div className="v">{num(data.market.soldCount)}</div><div className="s">{soldDays}-day comp pool</div></div>
        <div className="panel stat"><div className="k">Median sold</div><div className="v">{fmt(data.market.medianSold)}</div><div className="s">single-family sold sample</div></div>
        <div className="panel stat"><div className="k">Median $/sqft</div><div className="v">{fmt(data.market.medianPpsf)}</div><div className="s">sold sample</div></div>
        <div className="panel stat"><div className="k">A-grade deals</div><div className="v">{data.market.aCount}</div><div className="s">highest-ranked opportunities</div></div>
        <div className="panel stat"><div className="k">Best score</div><div className="v">{data.deals[0]?.score ?? "—"}</div><div className="s">out of 100</div></div>
      </section>

      <section className="panel toolbar">
        <div className="filters">
          {["ALL","A","50K","100K","60DOM"].map(k=><button key={k} className={`pill ${filter===k?"active":""}`} onClick={()=>setFilter(k)}>{
            {ALL:"All deals",A:"A / A+ only","50K":"$50K+ profit","100K":"$100K+ spread","60DOM":"60+ DOM"}[k]
          }</button>)}
        </div>
        <div className="small">{deals.length} shown · ranked by opportunity score</div>
      </section>

      <section className="panel tableWrap">
        <table>
          <thead><tr>
            <th>Grade</th><th>Property</th><th>Ask</th><th>Bed/Bath</th><th>Sqft</th><th>DOM</th><th>Ask $/sf</th><th>Base ARV</th><th>Spread</th><th>Rehab</th><th>Profit</th><th>MAO</th><th>Conf.</th><th>Score</th><th></th>
          </tr></thead>
          <tbody>
            {deals.map((d,i)=><tr key={d.id||i}>
              <td><span className={gradeClass(d.grade)}>{d.grade}</span></td>
              <td><div className="addr">{d.address}</div><div className="sub">{d.city}, {d.state} {d.zipCode}</div></td>
              <td>{fmt(d.price)}</td>
              <td>{d.bedrooms ?? "—"} / {d.bathrooms ?? "—"}</td>
              <td>{num(d.squareFootage)}</td>
              <td>{num(d.daysOnMarket)}</td>
              <td>{fmt(d.askPpsf)}</td>
              <td>{fmt(d.baseArv)}</td>
              <td className={`money ${d.spread>=100000?"good":""}`}>{fmt(d.spread)}</td>
              <td>{fmt(d.rehabEstimate)}</td>
              <td className={`money ${d.projectedProfit>=40000?"good":"bad"}`}>{fmt(d.projectedProfit)}</td>
              <td>{fmt(d.mao)}</td>
              <td>{pct(d.confidence)}</td>
              <td><b>{d.score}</b></td>
              <td><button className="linkBtn" onClick={()=>setSelected(d)}>DETAILS</button></td>
            </tr>)}
          </tbody>
        </table>
      </section>

      <div className="footer">
        Screening estimates are not appraisals or contractor bids. Recorded-sale data can lag county processing. Verify condition, title, taxes, HOA/community rules, septic/well, permits, liens, financing and final comps before offering.
      </div>
    </>}

    {selected && <div className="drawerOverlay" onMouseDown={()=>setSelected(null)}>
      <aside className="drawer" onMouseDown={e=>e.stopPropagation()}>
        <div className="drawerTop">
          <div><div className={gradeClass(selected.grade)}>{selected.grade}</div><h2>{selected.address}</h2><div className="small">{selected.city}, {selected.state} {selected.zipCode}</div></div>
          <button className="close" onClick={()=>setSelected(null)}>Close</button>
        </div>

        <div className="section grid2">
          {[
            ["Ask",fmt(selected.price)],["Base ARV",fmt(selected.baseArv)],["Conservative ARV",fmt(selected.lowArv)],["Upside ARV",fmt(selected.highArv)],
            ["Projected rehab",fmt(selected.rehabEstimate)],["Projected profit",fmt(selected.projectedProfit)],["MAO",fmt(selected.mao)],["Confidence",pct(selected.confidence)]
          ].map(([k,v])=><div className="metric" key={k}><div className="k">{k}</div><div className="v">{v}</div></div>)}
        </div>

        <div className="section"><h3>Why FlipLens scored it this way</h3><div className="why">{selected.explanation}</div></div>

        <div className="section">
          <h3>Closest weighted sold comps</h3>
          <div className="comp compHead"><div>Address</div><div>Sold</div><div>Date</div><div>Mi</div><div>Bed/Bath</div><div>Sqft</div><div>Score</div></div>
          {selected.comps?.map((c,i)=><div className="comp" key={i}>
            <div>{c.address}</div><div>{fmt(c.salePrice)}</div><div>{c.saleDate?.slice(0,10)||"—"}</div><div>{c.distance?.toFixed(2)}</div><div>{c.bedrooms ?? "—"}/{c.bathrooms ?? "—"}</div><div>{num(c.squareFootage)}</div><div>{c.compScore}</div>
          </div>)}
        </div>

        <div className="section grid2">
          <a className="linkBtn" target="_blank" rel="noreferrer" href={`https://www.zillow.com/homes/${encodeURIComponent(selected.address+" "+selected.city+" "+selected.state+" "+selected.zipCode)}_rb/`}>Open Zillow search</a>
          <a className="linkBtn" target="_blank" rel="noreferrer" href={`https://www.google.com/search?q=${encodeURIComponent(selected.address+" "+selected.city+" "+selected.state+" "+selected.zipCode+" real estate")}`}>Open Google verification</a>
        </div>
      </aside>
    </div>}
  </main>
}
