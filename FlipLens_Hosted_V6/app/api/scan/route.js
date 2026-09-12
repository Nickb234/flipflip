import { NextResponse } from "next/server";

const API = "https://api.rentcast.io/v1";

function parseArea(area){
  const s=(area||"").trim();
  if(/^\d{5}$/.test(s)) return {zipCode:s};
  const m=s.match(/^(.+?),\s*([A-Za-z]{2})$/);
  if(!m) throw new Error("Enter a 5-digit ZIP code or City, ST (example: East Stroudsburg, PA).");
  return {city:m[1].trim(),state:m[2].toUpperCase()};
}
function q(params){
  const u=new URLSearchParams();
  Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=="")u.set(k,String(v))});
  return u.toString();
}
async function apiGet(path,params,key){
  const r=await fetch(`${API}${path}?${q(params)}`,{
    headers:{"X-Api-Key":key,"Accept":"application/json"},
    next:{revalidate:600}
  });
  if(!r.ok){
    let t=""; try{t=await r.text()}catch{}
    throw new Error(`Property data API returned ${r.status}. ${t.slice(0,220)}`);
  }
  const total=Number(r.headers.get("x-total-count")||0);
  const json=await r.json();
  return {items:Array.isArray(json)?json:(json?.data||[]),total};
}
async function fetchPaged(path,base,key,maxPages=8){
  const limit=500;
  let first=await apiGet(path,{...base,limit,offset:0,includeTotalCount:true},key);
  let all=[...first.items];
  const total=first.total || first.items.length;
  const pages=Math.min(maxPages,Math.ceil(total/limit));
  if(pages>1){
    const jobs=[];
    for(let p=1;p<pages;p++) jobs.push(apiGet(path,{...base,limit,offset:p*limit},key));
    const rest=await Promise.all(jobs);
    rest.forEach(x=>all.push(...x.items));
  }
  return all;
}
function median(a){
  const v=a.filter(Number.isFinite).sort((x,y)=>x-y); if(!v.length)return null;
  const m=Math.floor(v.length/2); return v.length%2?v[m]:(v[m-1]+v[m])/2;
}
function mean(a){const v=a.filter(Number.isFinite);return v.length?v.reduce((x,y)=>x+y,0)/v.length:null}
function clamp(n,a,b){return Math.max(a,Math.min(b,n))}
function hav(lat1,lon1,lat2,lon2){
  if(![lat1,lon1,lat2,lon2].every(Number.isFinite)) return 99;
  const R=3958.7613,d2r=Math.PI/180;
  const dLat=(lat2-lat1)*d2r,dLon=(lon2-lon1)*d2r;
  const x=Math.sin(dLat/2)**2+Math.cos(lat1*d2r)*Math.cos(lat2*d2r)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}
function daysBetween(a,b=new Date()){
  if(!a)return 999;
  const d=new Date(a); if(Number.isNaN(d.getTime()))return 999;
  return Math.max(0,(b-d)/86400000);
}
function salePrice(x){
  return Number(x.lastSalePrice ?? x.salePrice ?? x.price ?? x.lastSaleAmount);
}
function saleDate(x){return x.lastSaleDate ?? x.saleDate ?? x.lastSale?.date ?? x.sale?.date ?? null}
function addressLine(x){return x.formattedAddress ?? x.addressLine1 ?? x.address ?? [x.addressLine1,x.city,x.state,x.zipCode].filter(Boolean).join(", ")}
function numeric(v){const n=Number(v);return Number.isFinite(n)?n:null}

function compScore(subject,c,soldDays){
  const dist=haversineSubject(subject,c);
  const sfS=numeric(subject.squareFootage), sfC=numeric(c.squareFootage);
  const bedsS=numeric(subject.bedrooms), bedsC=numeric(c.bedrooms);
  const bathS=numeric(subject.bathrooms), bathC=numeric(c.bathrooms);
  const age=daysBetween(saleDate(c));
  const distanceScore=100*Math.exp(-dist/0.65);
  const sqftScore=(sfS&&sfC)?clamp(100-(Math.abs(sfS-sfC)/sfS)*180,0,100):55;
  const bedScore=(bedsS!=null&&bedsC!=null)?clamp(100-Math.abs(bedsS-bedsC)*32,0,100):60;
  const bathScore=(bathS!=null&&bathC!=null)?clamp(100-Math.abs(bathS-bathC)*30,0,100):60;
  const recency=clamp(100-(age/Math.max(180,soldDays))*70,25,100);
  return Math.round(distanceScore*.34+sqftScore*.28+bedScore*.14+bathScore*.10+recency*.14);
}
function haversineSubject(a,b){
  return hav(numeric(a.latitude),numeric(a.longitude),numeric(b.latitude),numeric(b.longitude));
}
function grade(score){
  if(score>=92)return"A+";
  if(score>=85)return"A";
  if(score>=78)return"B+";
  if(score>=70)return"B";
  if(score>=62)return"C";
  if(score>=52)return"D";
  return"F";
}
function estimateDeal(active,sold,opts){
  const soldDays=opts.soldDays;
  let candidates=sold.filter(c=>{
    const p=salePrice(c); if(!p||p<20000)return false;
    if((c.propertyType||"").toLowerCase()!=="single family")return false;
    const d=haversineSubject(active,c);
    return d<=2.0;
  }).map(c=>({...c,_distance:haversineSubject(active,c),_score:compScore(active,c,soldDays)}))
    .filter(c=>c._score>=45)
    .sort((a,b)=>b._score-a._score)
    .slice(0,12);

  // If local sample is thin, broaden using same ZIP sold homes.
  if(candidates.length<4){
    const extra=sold.filter(c=>c.zipCode===active.zipCode && salePrice(c)>20000)
      .map(c=>({...c,_distance:haversineSubject(active,c),_score:compScore(active,c,soldDays)}))
      .sort((a,b)=>b._score-a._score);
    const seen=new Set(candidates.map(c=>c.id||addressLine(c)));
    for(const c of extra){
      const id=c.id||addressLine(c); if(seen.has(id))continue;
      candidates.push(c); seen.add(id); if(candidates.length>=12)break;
    }
  }
  const top=candidates.slice(0,8);
  let wsum=0,vsum=0;
  top.forEach(c=>{
    const w=Math.max(0.12,c._score/100)**2;
    wsum+=w; vsum+=salePrice(c)*w;
  });
  let baseArv=wsum?vsum/wsum:null;

  const sf=numeric(active.squareFootage);
  const sameZip=sold.filter(c=>c.zipCode===active.zipCode && salePrice(c)>20000);
  const ppsfs=sameZip.map(c=>{
    const csf=numeric(c.squareFootage),p=salePrice(c); return csf&&p?p/csf:null;
  }).filter(Number.isFinite);
  const zipPpsf=median(ppsfs);
  const ppsfArv=(sf&&zipPpsf)?sf*zipPpsf:null;

  // Blend exact comps strongly, ZIP ppsf lightly.
  if(baseArv&&ppsfArv) baseArv=baseArv*.82+ppsfArv*.18;
  else if(!baseArv) baseArv=ppsfArv;

  const prices=top.map(salePrice).filter(Number.isFinite);
  const dispersion=prices.length&&baseArv?Math.sqrt(mean(prices.map(p=>(p-baseArv)**2)))/baseArv:0.35;
  const avgScore=mean(top.map(x=>x._score))||0;
  const confidence=clamp((avgScore*.7)+(Math.min(top.length,6)/6*20)+(clamp(1-dispersion,0,1)*10),30,97);

  const lowArv=baseArv?(baseArv*(1-clamp(.06+dispersion*.22,.06,.16))):null;
  const highArv=baseArv?(baseArv*(1+clamp(.07+dispersion*.18,.07,.17))):null;

  const price=numeric(active.price) || numeric(active.listPrice) || numeric(active.listedPrice) || 0;
  const rehabEstimate=sf?sf*opts.rehabPerSqft:45000;
  const contingency=rehabEstimate*.12;
  const buyCosts=price*.025;
  const financing=(price*.88)*.115*(6/12) + (price*.88)*.02;
  const holding=(price*.012)*(6/12)+4200;
  const selling=baseArv?baseArv*.075:0;
  const projectedProfit=baseArv?baseArv-price-rehabEstimate-contingency-buyCosts-financing-holding-selling:null;
  const targetProfit=Math.max(40000,(baseArv||0)*.12);
  const mao=baseArv?baseArv-rehabEstimate-contingency-(baseArv*.075)-financing-holding-(baseArv*.025)-targetProfit:null;
  const spread=baseArv?baseArv-price:null;
  const dom=numeric(active.daysOnMarket) ?? daysBetween(active.listedDate ?? active.listingDate ?? active.createdDate);
  const askPpsf=(price&&sf)?price/sf:null;

  const spreadPct=baseArv?spread/baseArv:0;
  const profitScore=projectedProfit==null?0:clamp((projectedProfit/70000)*100,0,100);
  const spreadScore=clamp((spreadPct/.40)*100,0,100);
  const confScore=confidence;
  const domScore=clamp(dom/120*100,0,100);
  const rehabScore=clamp(100-(opts.rehabPerSqft-20)*2.2,25,100);
  const score=Math.round(profitScore*.33+spreadScore*.27+confScore*.22+domScore*.10+rehabScore*.08);

  const why=[];
  why.push(`${top.length} weighted nearby sold comp${top.length===1?"":"s"} were used.`);
  if(spreadPct>=.35) why.push(`Ask is ${Math.round(spreadPct*100)}% below the model's base ARV, creating a large acquisition-to-exit spread.`);
  else if(spreadPct>=.22) why.push(`Ask is ${Math.round(spreadPct*100)}% below base ARV, giving moderate room.`);
  else why.push(`The ask-to-ARV spread is only ${Math.round(spreadPct*100)}%, which leaves limited room after rehab and transaction costs.`);
  if(dom>=90) why.push(`${Math.round(dom)} DOM suggests potential seller motivation.`);
  if(confScore<65) why.push(`ARV confidence is only ${Math.round(confScore)}%, so the result needs stronger manual comp verification.`);
  if(projectedProfit<40000) why.push(`Modeled profit is below the preferred $40K first-flip threshold.`);
  else why.push(`Modeled profit clears the $40K first-flip threshold before income taxes.`);

  return {
    id:active.id,
    address:active.addressLine1 ?? active.formattedAddress ?? active.address ?? "Unknown address",
    city:active.city,state:active.state,zipCode:active.zipCode,
    price,bedrooms:numeric(active.bedrooms),bathrooms:numeric(active.bathrooms),squareFootage:sf,
    daysOnMarket:dom,askPpsf,
    lowArv,baseArv,highArv,spread,rehabEstimate,projectedProfit,mao,confidence,score,grade:grade(score),
    explanation:why.join(" "),
    comps:top.map(c=>({
      address:addressLine(c),salePrice:salePrice(c),saleDate:saleDate(c),distance:c._distance,
      bedrooms:numeric(c.bedrooms),bathrooms:numeric(c.bathrooms),squareFootage:numeric(c.squareFootage),compScore:c._score
    }))
  };
}

export async function POST(req){
  try{
    const key=process.env.RENTCAST_API_KEY;
    if(!key) return NextResponse.json({error:"Server is missing RENTCAST_API_KEY. Add it in Vercel → Project Settings → Environment Variables, then redeploy."},{status:500});
    const body=await req.json();
    const location=parseArea(body.area);
    const maxPrice=Number(body.maxPrice||300000);
    const soldDays=Number(body.soldDays||365);
    const minBeds=Number(body.minBeds||2);
    const rehabPerSqft=Number(body.rehabPerSqft||35);

    const common={...location,propertyType:"Single Family"};
    const [activeRaw,soldRaw]=await Promise.all([
      fetchPaged("/listings/sale",{...common,price:`0:${maxPrice}`,bedrooms:`${minBeds}:10`},key,10),
      fetchPaged("/properties",{...common,saleDateRange:soldDays},key,10)
    ]);

    const active=activeRaw.filter(x=>{
      const status=String(x.status||x.listingStatus||"").toLowerCase();
      const p=numeric(x.price)||numeric(x.listPrice)||numeric(x.listedPrice);
      const type=String(x.propertyType||"").toLowerCase();
      return type==="single family" && p && p<=maxPrice && (!status || status.includes("active") || status.includes("for sale"));
    });
    const sold=soldRaw.filter(x=>String(x.propertyType||"").toLowerCase()==="single family" && salePrice(x)>20000 && saleDate(x));

    const deals=active.map(a=>estimateDeal(a,sold,{soldDays,rehabPerSqft})).filter(d=>d.baseArv).sort((a,b)=>b.score-a.score);
    const soldPrices=sold.map(salePrice).filter(Number.isFinite);
    const soldPpsf=sold.map(c=>{
      const p=salePrice(c),sf=numeric(c.squareFootage); return p&&sf?p/sf:null
    }).filter(Number.isFinite);

    return NextResponse.json({
      market:{
        area:body.area,activeCount:active.length,soldCount:sold.length,
        medianSold:median(soldPrices),medianPpsf:median(soldPpsf),
        aCount:deals.filter(d=>d.grade.startsWith("A")).length
      },
      deals,
      warnings:[
        "Rehab is a screening estimate based on the $/sqft assumption you selected.",
        "Public-record sold transactions may lag county processing.",
        "Final ARV should be verified from listing photos, micro-neighborhood boundaries and actual condition."
      ]
    });
  }catch(e){
    return NextResponse.json({error:e.message||String(e)},{status:500});
  }
}
