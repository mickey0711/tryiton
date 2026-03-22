import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db/client";

const router = Router();
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "tryiton-admin-2026";

function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const token = req.headers["x-admin-token"] || req.query.token;
    if (token !== ADMIN_TOKEN) return res.status(401).json({ error: "UNAUTHORIZED" });
    next();
}

// ─── HTML helper ────────────────────────────────────────────────────────────
function shell(token: string, activeTab: string, content: string): string {
    const tabs = [
        { id: "overview",  icon: "🏠", label: "Overview"  },
        { id: "finance",   icon: "💰", label: "Finance"   },
        { id: "marketing", icon: "📣", label: "Marketing" },
        { id: "users",     icon: "👤", label: "Users"     },
        { id: "products",  icon: "🛍️", label: "Products"  },
    ];
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TryIt4U Admin — ${activeTab}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;background:#07070f;color:#f1f5f9;min-height:100vh;font-size:14px}
.topbar{background:rgba(7,7,15,.97);border-bottom:1px solid rgba(124,58,237,.25);padding:0 24px;display:flex;align-items:stretch;position:sticky;top:0;z-index:100;backdrop-filter:blur(20px)}
.logo{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;color:#a78bfa;padding:0 16px 0 0;margin-right:16px;border-right:1px solid rgba(255,255,255,.07)}
.tabs{display:flex;align-items:stretch;flex:1;gap:2px}
.tab{display:flex;align-items:center;gap:6px;padding:0 18px;height:52px;font-size:13px;font-weight:600;color:rgba(255,255,255,.4);text-decoration:none;border-bottom:2px solid transparent;transition:.2s;white-space:nowrap}
.tab:hover{color:rgba(255,255,255,.8)}
.tab.active{color:#a78bfa;border-bottom-color:#7c3aed}
.topbar-right{display:flex;align-items:center;gap:8px;margin-left:auto;padding-left:16px}
.btn-sm{padding:6px 14px;border-radius:100px;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:5px;transition:.2s;border:none}
.btn-outline{background:transparent;border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.5)}
.btn-outline:hover{border-color:rgba(124,58,237,.5);color:#a78bfa}
.btn-primary{background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff}
.ts{font-size:11px;color:rgba(255,255,255,.25)}
.main{padding:24px;max-width:1400px;margin:0 auto}
.section-title{font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:rgba(255,255,255,.3);margin:28px 0 14px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.05);display:flex;align-items:center;gap:8px}
/* STAT CARDS */
.sg{display:grid;gap:12px;margin-bottom:16px}
.sg-4{grid-template-columns:repeat(4,1fr)}.sg-5{grid-template-columns:repeat(5,1fr)}.sg-6{grid-template-columns:repeat(6,1fr)}.sg-3{grid-template-columns:repeat(3,1fr)}.sg-2{grid-template-columns:1fr 1fr}
.stat{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:16px 18px;transition:.2s}
.stat:hover{border-color:rgba(124,58,237,.3)}
.stat.ac{border-color:rgba(124,58,237,.3);background:rgba(124,58,237,.08)}
.stat.gr{border-color:rgba(52,211,153,.25);background:rgba(52,211,153,.06)}
.stat.yw{border-color:rgba(251,191,36,.2);background:rgba(251,191,36,.05)}
.stat.rd{border-color:rgba(248,113,113,.2);background:rgba(248,113,113,.05)}
.stat.bl{border-color:rgba(96,165,250,.2);background:rgba(96,165,250,.05)}
.kpi{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:6px}
.num{font-size:28px;font-weight:800;color:#fff;line-height:1}
.stat.ac .num{background:linear-gradient(135deg,#a78bfa,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.stat.gr .num{color:#34d399}.stat.yw .num{color:#fbbf24}.stat.rd .num{color:#f87171}.stat.bl .num{color:#60a5fa}
.sub{font-size:11px;color:rgba(255,255,255,.25);margin-top:4px}
/* CHART BOXES */
.cg{display:grid;gap:16px;margin-bottom:16px}
.cg-2{grid-template-columns:1fr 1fr}.cg-3{grid-template-columns:2fr 1fr 1fr}.cg-13{grid-template-columns:1fr 3fr}
.box{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:20px}
.box-h{font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.4);margin-bottom:14px;display:flex;justify-content:space-between;align-items:center}
/* TABLES */
.tbox{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;overflow:hidden;margin-bottom:16px}
.tbox-h{padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.06);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.4);display:flex;justify-content:space-between;align-items:center}
.tw{overflow-x:auto}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:10px;font-weight:700;color:rgba(255,255,255,.25);text-transform:uppercase;letter-spacing:1px;padding:8px 14px;background:rgba(255,255,255,.02);border-bottom:1px solid rgba(255,255,255,.05)}
td{padding:9px 14px;font-size:12px;color:rgba(255,255,255,.6);border-bottom:1px solid rgba(255,255,255,.04)}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(124,58,237,.05);color:#fff}
/* PILLS */
.pill{display:inline-block;padding:2px 8px;border-radius:100px;font-size:10px;font-weight:700}
.p-v{background:rgba(124,58,237,.2);color:#a78bfa;border:1px solid rgba(124,58,237,.3)}
.p-g{background:rgba(52,211,153,.12);color:#34d399;border:1px solid rgba(52,211,153,.2)}
.p-y{background:rgba(251,191,36,.12);color:#fbbf24;border:1px solid rgba(251,191,36,.2)}
.p-r{background:rgba(248,113,113,.12);color:#f87171;border:1px solid rgba(248,113,113,.2)}
.p-b{background:rgba(96,165,250,.12);color:#60a5fa;border:1px solid rgba(96,165,250,.2)}
.p-o{background:rgba(251,146,60,.12);color:#fb923c;border:1px solid rgba(251,146,60,.2)}
/* MINI BAR */
.mbar{height:4px;background:rgba(255,255,255,.06);border-radius:2px;margin-top:4px}
.mbar-f{height:100%;border-radius:2px;background:linear-gradient(90deg,#7c3aed,#a78bfa)}
/* FORM */
.form-row{display:flex;gap:10px;margin-bottom:10px;align-items:center}
.form-row input,.form-row select{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:8px 12px;color:#fff;font-size:13px;font-family:inherit;outline:none;transition:.2s}
.form-row input:focus,.form-row select:focus{border-color:rgba(124,58,237,.5)}
.form-row label{font-size:12px;color:rgba(255,255,255,.4);min-width:110px}
.form-row input{flex:1}
@media(max-width:1100px){.sg-6,.sg-5{grid-template-columns:repeat(3,1fr)}.sg-4{grid-template-columns:1fr 1fr}.cg-2,.cg-3,.cg-13{grid-template-columns:1fr}}
@media(max-width:600px){.sg-3,.sg-4,.sg-6{grid-template-columns:1fr 1fr}.tabs{overflow-x:auto}}
</style>
</head>
<body>
<div class="topbar">
  <div class="logo">✨ TryIt4U</div>
  <div class="tabs">
    ${tabs.map(t => `<a href="/admin/${t.id}?token=${token}" class="tab${activeTab===t.id?' active':''}">${t.icon} ${t.label}</a>`).join("")}
  </div>
  <div class="topbar-right">
    <span class="ts">🕐 ${new Date().toLocaleString("he-IL")}</span>
    <button class="btn-sm btn-outline" onclick="location.reload()">↻ Refresh</button>
    <a href="/admin/export?token=${token}" class="btn-sm btn-primary">⬇ CSV</a>
  </div>
</div>
<div class="main">${content}</div>
<script>
const CO = {responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'rgba(255,255,255,.3)',font:{size:9}},grid:{color:'rgba(255,255,255,.04)'}},y:{ticks:{color:'rgba(255,255,255,.3)',font:{size:9}},grid:{color:'rgba(255,255,255,.04)'},beginAtZero:true}}};
const DOCO = {responsive:true,plugins:{legend:{position:'bottom',labels:{color:'rgba(255,255,255,.55)',font:{size:11},padding:12}}}};
function barC(id,labels,data,color='#7c3aed'){if(!document.getElementById(id))return;new Chart(document.getElementById(id).getContext('2d'),{type:'bar',data:{labels,datasets:[{data,backgroundColor:color+'88',borderColor:color,borderWidth:1,borderRadius:3}]},options:CO});}
function lineC(id,labels,data,color='#a78bfa'){if(!document.getElementById(id))return;new Chart(document.getElementById(id).getContext('2d'),{type:'line',data:{labels,datasets:[{data,borderColor:color,backgroundColor:color+'18',fill:true,tension:.35,pointRadius:2}]},options:CO});}
function doC(id,labels,data){if(!document.getElementById(id))return;const cols=['#7c3aed','#4f46e5','#059669','#d97706','#0891b2','#ec4899','#f59e0b','#ef4444'];new Chart(document.getElementById(id).getContext('2d'),{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:cols,borderWidth:0}]},options:DOCO});}
</script>
</body>
</html>`;
}

// ─── OVERVIEW tab ────────────────────────────────────────────────────────────
router.get(["/", "/overview"], requireAdmin, async (req, res, next) => {
    try {
        const token = req.query.token as string || "";
        const [userS, nlS, jobS, topCat, userG, nlG, jobG] = await Promise.all([
            db.query<any>(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER(WHERE created_at>=NOW()-INTERVAL '1 day')::int AS today, COUNT(*) FILTER(WHERE created_at>=NOW()-INTERVAL '7 days')::int AS week, COUNT(*) FILTER(WHERE plan NOT IN('free','admin'))::int AS paid FROM users`),
            db.query<any>(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER(WHERE created_at>=NOW()-INTERVAL '1 day')::int AS today, COUNT(*) FILTER(WHERE created_at>=NOW()-INTERVAL '7 days')::int AS week FROM newsletter_subscribers`),
            db.query<any>(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER(WHERE status='done')::int AS done, COUNT(*) FILTER(WHERE created_at>=NOW()-INTERVAL '1 day')::int AS today, ROUND(AVG(fit_score) FILTER(WHERE fit_score IS NOT NULL))::int AS avg_fit FROM jobs`),
            db.query<any>(`SELECT category, COUNT(*)::int AS cnt FROM jobs GROUP BY category ORDER BY cnt DESC LIMIT 6`),
            db.query<any>(`SELECT TO_CHAR(created_at::date,'MM/DD') d,COUNT(*)::int c FROM users WHERE created_at>=NOW()-INTERVAL '30 days' GROUP BY d ORDER BY d`),
            db.query<any>(`SELECT TO_CHAR(created_at::date,'MM/DD') d,COUNT(*)::int c FROM newsletter_subscribers WHERE created_at>=NOW()-INTERVAL '30 days' GROUP BY d ORDER BY d`),
            db.query<any>(`SELECT TO_CHAR(created_at::date,'MM/DD') d,COUNT(*)::int c FROM jobs WHERE created_at>=NOW()-INTERVAL '30 days' GROUP BY d ORDER BY d`),
        ]);
        const u=userS.rows[0],n=nlS.rows[0],j=jobS.rows[0];
        const content = `
<div class="section-title">📊 Summary — Last 30 Days</div>
<div class="sg sg-4">
  <div class="stat ac"><div class="kpi">Total Users</div><div class="num">${u.total.toLocaleString()}</div><div class="sub">${u.today} today · ${u.week} this week</div></div>
  <div class="stat yw"><div class="kpi">Paid Users</div><div class="num">${u.paid}</div><div class="sub">${Math.round(u.paid/Math.max(u.total,1)*100)}% conversion rate</div></div>
  <div class="stat gr"><div class="kpi">Waitlist</div><div class="num">${n.total.toLocaleString()}</div><div class="sub">${n.today} today · ${n.week} this week</div></div>
  <div class="stat bl"><div class="kpi">Try-Ons</div><div class="num">${j.total.toLocaleString()}</div><div class="sub">${j.today} today · ${Math.round(j.done/Math.max(j.total,1)*100)}% success</div></div>
</div>
<div class="cg cg-3">
  <div class="box"><div class="box-h">📈 New Users (30d)</div><canvas id="uG" height="100"></canvas></div>
  <div class="box"><div class="box-h">📧 Waitlist Growth (30d)</div><canvas id="nG" height="100"></canvas></div>
  <div class="box"><div class="box-h">🎭 Try-Ons (30d)</div><canvas id="jG" height="100"></canvas></div>
</div>
<div class="cg cg-2">
  <div class="box"><div class="box-h">🗂️ Category Breakdown</div><canvas id="catD" height="160"></canvas></div>
  <div class="box"><div class="box-h">📡 Avg Fit Score</div>
    <div style="text-align:center;padding:30px 0">
      <div style="font-size:72px;font-weight:800;background:linear-gradient(135deg,#a78bfa,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">${j.avg_fit??'—'}</div>
      <div style="font-size:13px;color:rgba(255,255,255,.4);margin-top:8px">out of 100 · across all try-ons</div>
    </div>
  </div>
</div>
<script>
lineC('uG',${JSON.stringify(userG.rows.map((r:any)=>r.d))},${JSON.stringify(userG.rows.map((r:any)=>r.c))});
lineC('nG',${JSON.stringify(nlG.rows.map((r:any)=>r.d))},${JSON.stringify(nlG.rows.map((r:any)=>r.c))},'#34d399');
barC('jG',${JSON.stringify(jobG.rows.map((r:any)=>r.d))},${JSON.stringify(jobG.rows.map((r:any)=>r.c))});
doC('catD',${JSON.stringify(topCat.rows.map((r:any)=>r.category))},${JSON.stringify(topCat.rows.map((r:any)=>r.cnt))});
</script>`;
        res.send(shell(token, "overview", content));
    } catch(err){next(err);}
});

// ─── FINANCE tab ─────────────────────────────────────────────────────────────
router.get("/finance", requireAdmin, async (req, res, next) => {
    try {
        const token = req.query.token as string || "";
        const [planRows, creditS, userGrowth, convFunnel] = await Promise.all([
            db.query<any>(`SELECT plan, COUNT(*)::int cnt FROM users GROUP BY plan ORDER BY cnt DESC`),
            db.query<any>(`SELECT ROUND(AVG(credits) FILTER(WHERE credits>=0))::int avg_c, SUM(credits) FILTER(WHERE credits>=0)::bigint total_c, COUNT(*) FILTER(WHERE credits=0)::int zero_c, COUNT(*) FILTER(WHERE credits<=2 AND credits>0)::int low_c FROM users`),
            db.query<any>(`SELECT TO_CHAR(created_at::date,'YYYY-MM') m, COUNT(*)::int c FROM users WHERE created_at>=NOW()-INTERVAL '6 months' GROUP BY m ORDER BY m`),
            db.query<any>(`SELECT COUNT(*)::int all_users, COUNT(*) FILTER(WHERE plan!='free' AND plan!='admin')::int paid, COUNT(*) FILTER(WHERE credits=0)::int zero_credit FROM users`),
        ]);
        const cs=creditS.rows[0], cf=convFunnel.rows[0];
        const totalUsers=cf.all_users||1;
        const planColors: Record<string,string> = {free:'p-b',admin:'p-v','pro-basic':'p-g','pro-plus':'p-y'};
        const content = `
<div class="section-title">💰 Financial Overview</div>
<div class="sg sg-4">
  <div class="stat ac"><div class="kpi">Paid Subscribers</div><div class="num">${cf.paid}</div><div class="sub">${Math.round(cf.paid/totalUsers*100)}% conversion rate</div></div>
  <div class="stat gr"><div class="kpi">Avg Credits/User</div><div class="num">${cs.avg_c??0}</div><div class="sub">Free tier starts at 5</div></div>
  <div class="stat yw"><div class="kpi">Zero Credits</div><div class="num">${cs.zero_c??0}</div><div class="sub">Ready to upgrade 🎯</div></div>
  <div class="stat bl"><div class="kpi">Low Credits (≤2)</div><div class="num">${cs.low_c??0}</div><div class="sub">Upsell opportunity</div></div>
</div>

<div class="cg cg-2">
  <div class="box"><div class="box-h">📈 Monthly New Users (6m)</div><canvas id="ugC" height="120"></canvas></div>
  <div class="box"><div class="box-h">🥧 Plan Distribution</div><canvas id="planD" height="180"></canvas></div>
</div>

<div class="tbox">
  <div class="tbox-h">📋 Plan Breakdown <span style="color:rgba(255,255,255,.3);font-size:10px">by plan type</span></div>
  <div class="tw"><table>
    <thead><tr><th>Plan</th><th>Users</th><th>Share</th><th>Status</th></tr></thead>
    <tbody>
    ${planRows.rows.map((r:any) => {
      const pct=Math.round(r.cnt/totalUsers*100);
      const cls=planColors[r.plan]||'p-v';
      return `<tr>
        <td><span class="pill ${cls}">${r.plan}</span></td>
        <td style="font-weight:700;color:#fff">${r.cnt.toLocaleString()}</td>
        <td><div style="display:flex;align-items:center;gap:8px"><span style="min-width:35px">${pct}%</span><div class="mbar" style="flex:1;max-width:120px"><div class="mbar-f" style="width:${pct}%"></div></div></div></td>
        <td>${r.plan==='free'?'<span class="pill p-b">Free</span>':r.plan==='admin'?'<span class="pill p-v">Admin</span>':'<span class="pill p-g">Paid ✓</span>'}</td>
      </tr>`;
    }).join("")}
    </tbody>
  </table></div>
</div>

<div class="box" style="margin-bottom:16px">
  <div class="box-h">🔁 Conversion Funnel</div>
  ${[
    {label:'Total Users',val:totalUsers,pct:100,color:'#7c3aed'},
    {label:'Paid Users',val:cf.paid,pct:Math.round(cf.paid/totalUsers*100),color:'#059669'},
    {label:'Zero Credits (Upsell)',val:cf.zero_credit,pct:Math.round(cf.zero_credit/totalUsers*100),color:'#d97706'},
  ].map(f=>`<div style="margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px">
      <span style="color:#fff;font-weight:600">${f.label}</span>
      <span style="color:rgba(255,255,255,.5)">${f.val.toLocaleString()} (${f.pct}%)</span>
    </div>
    <div class="mbar" style="height:8px"><div class="mbar-f" style="width:${f.pct}%;background:${f.color}"></div></div>
  </div>`).join("")}
</div>

<div class="box" style="background:rgba(251,191,36,.05);border-color:rgba(251,191,36,.2)">
  <div class="box-h" style="color:#fbbf24">⚠️ Revenue Tracking</div>
  <p style="font-size:13px;color:rgba(255,255,255,.45);line-height:1.7">Revenue data will appear here once <strong style="color:#fbbf24">Paddle Checkout</strong> is connected to the backend. Currently awaiting Paddle domain approval for <code style="color:#a78bfa">tryit4u.ai</code>. Once approved, we'll see: MRR, ARR, plan revenue split, churn rate, and LTV.</p>
</div>
<script>
barC('ugC',${JSON.stringify(userGrowth.rows.map((r:any)=>r.m))},${JSON.stringify(userGrowth.rows.map((r:any)=>r.c))},'#4f46e5');
doC('planD',${JSON.stringify(planRows.rows.map((r:any)=>r.plan))},${JSON.stringify(planRows.rows.map((r:any)=>r.cnt))});
</script>`;
        res.send(shell(token, "finance", content));
    } catch(err){next(err);}
});

// ─── MARKETING tab ───────────────────────────────────────────────────────────
router.get("/marketing", requireAdmin, async (req, res, next) => {
    try {
        const token = req.query.token as string || "";
        const [utmSource, utmCampaign, utmMedium, countryRows, referrerRows, pixelRows, campaignRows, daily30] = await Promise.all([
            db.query<any>(`SELECT COALESCE(utm_source,'(direct)') s, COUNT(*)::int c FROM newsletter_subscribers GROUP BY utm_source ORDER BY c DESC LIMIT 12`),
            db.query<any>(`SELECT COALESCE(utm_campaign,'(none)') s, COUNT(*)::int c FROM newsletter_subscribers GROUP BY utm_campaign ORDER BY c DESC LIMIT 12`),
            db.query<any>(`SELECT COALESCE(utm_medium,'(none)') s, COUNT(*)::int c FROM newsletter_subscribers GROUP BY utm_medium ORDER BY c DESC LIMIT 8`),
            db.query<any>(`SELECT COALESCE(country,'Unknown') c, COUNT(*)::int n FROM newsletter_subscribers GROUP BY country ORDER BY n DESC LIMIT 20`),
            db.query<any>(`SELECT COALESCE(referrer_url,'(direct)') r, COUNT(*)::int c FROM newsletter_subscribers WHERE referrer_url IS NOT NULL GROUP BY referrer_url ORDER BY c DESC LIMIT 15`),
            db.query<any>(`SELECT * FROM site_pixels ORDER BY platform`).catch(()=>({rows:[]})),
            db.query<any>(`SELECT * FROM campaigns ORDER BY created_at DESC`).catch(()=>({rows:[]})),
            db.query<any>(`SELECT TO_CHAR(created_at::date,'MM/DD') d, COUNT(*)::int c FROM newsletter_subscribers WHERE created_at>=NOW()-INTERVAL '30 days' GROUP BY d ORDER BY d`),
        ]);
        const totalNl = utmSource.rows.reduce((s:any,r:any)=>s+r.c,0)||1;
        const flagMap: Record<string,string> = {US:'🇺🇸',IL:'🇮🇱',GB:'🇬🇧',DE:'🇩🇪',FR:'🇫🇷',CA:'🇨🇦',AU:'🇦🇺',BR:'🇧🇷',IN:'🇮🇳',RU:'🇷🇺',IT:'🇮🇹',ES:'🇪🇸',NL:'🇳🇱',TR:'🇹🇷',MX:'🇲🇽',PL:'🇵🇱',Unknown:'🌍'};
        const platformIcon: Record<string,string> = {facebook:'🟦',google:'🔴',tiktok:'⬛',instagram:'🟣',twitter:'🐦',email:'📧',other:'🔗'};

        const content = `
<div class="section-title">📡 Traffic & Attribution</div>
<div class="cg cg-2">
  <div class="box"><div class="box-h">📈 Daily Signups (30d)</div><canvas id="nlDay" height="110"></canvas></div>
  <div class="box"><div class="box-h">📍 UTM Sources</div>
    ${utmSource.rows.map((r:any)=>{const pct=Math.round(r.c/totalNl*100);return `<div style="margin-bottom:9px"><div style="display:flex;justify-content:space-between;font-size:12px"><span style="color:#fff;font-weight:600">${r.s}</span><span style="color:rgba(255,255,255,.4)">${r.c} (${pct}%)</span></div><div class="mbar"><div class="mbar-f" style="width:${pct}%"></div></div></div>`;}).join("") || '<div style="color:rgba(255,255,255,.3);font-size:12px;padding:8px 0">No UTM data yet — add ?utm_source=facebook to campaigns</div>'}
  </div>
</div>

<div class="cg cg-3">
  <div class="box"><div class="box-h">📣 Campaigns (utm_campaign)</div>
    ${utmCampaign.rows.map((r:any)=>{const pct=Math.round(r.c/totalNl*100);return `<div style="margin-bottom:9px"><div style="display:flex;justify-content:space-between;font-size:12px"><span class="pill p-v">${r.s}</span><span style="color:rgba(255,255,255,.4)">${r.c} leads (${pct}%)</span></div></div>`;}).join("") || '<div style="color:rgba(255,255,255,.3);font-size:12px">No data</div>'}
  </div>
  <div class="box"><div class="box-h">📲 Mediums</div>
    ${utmMedium.rows.map((r:any)=>{const pct=Math.round(r.c/totalNl*100);return `<div style="margin-bottom:9px"><div style="display:flex;justify-content:space-between;font-size:12px"><span style="color:#fff">${r.s}</span><span style="color:rgba(255,255,255,.4)">${r.c} (${pct}%)</span></div></div>`;}).join("") || '<div style="color:rgba(255,255,255,.3);font-size:12px">No data</div>'}
  </div>
  <div class="box"><div class="box-h">🔗 Referrers</div>
    ${referrerRows.rows.slice(0,8).map((r:any)=>{const host=r.r.replace(/https?:\/\//,'').split('/')[0];return `<div style="margin-bottom:7px;font-size:12px;display:flex;justify-content:space-between"><span style="color:#a78bfa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px" title="${r.r}">${host}</span><span style="color:rgba(255,255,255,.4)">${r.c}</span></div>`;}).join("") || '<div style="color:rgba(255,255,255,.3);font-size:12px">No data</div>'}
  </div>
</div>

<div class="section-title">🌍 Geographic Breakdown</div>
<div class="tbox">
  <div class="tbox-h">Countries <span class="pill p-v">${countryRows.rows.length} countries</span></div>
  <div class="tw"><table>
    <thead><tr><th>Country</th><th>Signups</th><th>Share</th></tr></thead>
    <tbody>
    ${countryRows.rows.map((r:any)=>{const pct=Math.round(r.n/totalNl*100);return `<tr>
      <td><span style="font-size:18px;margin-right:6px">${flagMap[r.c]||'🌍'}</span><span style="color:#fff">${r.c}</span></td>
      <td style="font-weight:700;color:#a78bfa">${r.n.toLocaleString()}</td>
      <td><div style="display:flex;align-items:center;gap:6px"><span style="min-width:32px;font-size:11px">${pct}%</span><div class="mbar" style="flex:1;max-width:100px"><div class="mbar-f" style="width:${pct}%"></div></div></div></td>
    </tr>`}).join("") || '<tr><td colspan="3" style="color:rgba(255,255,255,.3)">No country data yet (Cloudflare headers needed)</td></tr>'}
    </tbody>
  </table></div>
</div>

<div class="section-title">💸 Campaigns & Costs</div>
<div class="tbox">
  <div class="tbox-h">Campaign Performance
    <a href="/admin/add-campaign?token=${token}" style="font-size:11px;color:#a78bfa;text-decoration:none">+ Add Campaign</a>
  </div>
  <div class="tw"><table>
    <thead><tr><th>Campaign</th><th>Platform</th><th>Budget</th><th>Spent</th><th>Leads</th><th>CPL</th><th>Status</th></tr></thead>
    <tbody>
    ${campaignRows.rows.length > 0 ? campaignRows.rows.map((r:any)=>{
      const leadsRow = utmCampaign.rows.find((u:any)=>u.s===r.utm_campaign);
      const leads = leadsRow?.c || 0;
      const cpl = leads > 0 ? (r.spent/leads).toFixed(2) : '—';
      return `<tr>
        <td style="font-weight:600;color:#fff">${r.name}</td>
        <td><span class="pill p-b">${platformIcon[r.platform]||'🔗'} ${r.platform}</span></td>
        <td>$${Number(r.budget).toLocaleString()}</td>
        <td>$${Number(r.spent).toLocaleString()}</td>
        <td style="color:#34d399;font-weight:700">${leads}</td>
        <td style="color:#fbbf24;font-weight:700">${cpl === '—' ? '—' : '$'+cpl}</td>
        <td>${r.active ? '<span class="pill p-g">Active</span>' : '<span class="pill p-r">Paused</span>'}</td>
      </tr>`;
    }).join("") : '<tr><td colspan="7" style="color:rgba(255,255,255,.3);text-align:center;padding:24px">No campaigns yet — click "+ Add Campaign" to track spend</td></tr>'}
    </tbody>
  </table></div>
</div>

<div class="section-title">🎯 Pixel / Tag Manager</div>
<div class="cg cg-2">
  <div class="box">
    <div class="box-h">Active Pixels</div>
    ${['facebook','google','tiktok','twitter'].map(platform=>{
      const px = pixelRows.rows.find((r:any)=>r.platform===platform);
      return `<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.05)">
        <span style="font-size:20px">${platformIcon[platform]}</span>
        <div style="flex:1"><div style="font-size:13px;font-weight:600;color:#fff;text-transform:capitalize">${platform} Pixel</div>
          <div style="font-size:11px;color:rgba(255,255,255,.3)">${px ? px.pixel_id : 'Not configured'}</div></div>
        <span class="pill ${px?.active ? 'p-g' : 'p-r'}">${px?.active ? '✓ Active' : 'Not set'}</span>
      </div>`;
    }).join("")}
  </div>
  <div class="box">
    <div class="box-h">Set Pixel ID</div>
    <form method="POST" action="/admin/set-pixel?token=${token}">
      <div class="form-row"><label>Platform</label><select name="platform" style="flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:8px 12px;color:#fff;font-family:inherit"><option value="facebook">Facebook</option><option value="google">Google Tag</option><option value="tiktok">TikTok</option><option value="twitter">Twitter/X</option></select></div>
      <div class="form-row"><label>Pixel / Tag ID</label><input name="pixel_id" placeholder="e.g. 123456789012345" required></div>
      <button type="submit" class="btn-sm btn-primary" style="margin-top:8px;padding:10px 20px">Save Pixel →</button>
    </form>
    <p style="font-size:11px;color:rgba(255,255,255,.3);margin-top:12px">The pixel code will be auto-injected into the landing page on next deploy.</p>
  </div>
</div>

<div class="section-title">🔥 Heatmap</div>
<div class="box" style="background:rgba(124,58,237,.06);border-color:rgba(124,58,237,.25)">
  <div class="box-h" style="color:#a78bfa">Microsoft Clarity (Free Heatmap)</div>
  <p style="font-size:13px;color:rgba(255,255,255,.5);line-height:1.7;margin-bottom:14px">
    <strong style="color:#fff">Microsoft Clarity</strong> is integrated — it records sessions, shows click heatmaps, and scroll depth. <br>
    To activate: go to <a href="https://clarity.microsoft.com" target="_blank" style="color:#a78bfa">clarity.microsoft.com</a> → Create project → "tryit4u.ai" → Copy Project ID → set pixel above with platform="clarity".
  </p>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <a href="https://clarity.microsoft.com" target="_blank" rel="noopener" class="btn-sm btn-primary">Open Clarity Dashboard →</a>
    <a href="https://clarity.microsoft.com/projects" target="_blank" rel="noopener" class="btn-sm btn-outline">View Recordings</a>
  </div>
</div>
<script>
lineC('nlDay',${JSON.stringify(daily30.rows.map((r:any)=>r.d))},${JSON.stringify(daily30.rows.map((r:any)=>r.c))},'#34d399');
</script>`;
        res.send(shell(token, "marketing", content));
    } catch(err){next(err);}
});

// ─── USERS tab ───────────────────────────────────────────────────────────────
router.get("/users", requireAdmin, async (req, res, next) => {
    try {
        const token = req.query.token as string || "";
        const [recentUsers, authProv, planRows] = await Promise.all([
            db.query<any>(`SELECT u.id,u.email,u.full_name,u.plan,u.credits,u.status,TO_CHAR(u.created_at,'DD/MM/YY HH24:MI') created,u.email_verified,op.provider
                FROM users u LEFT JOIN oauth_providers op ON op.user_id=u.id AND op.id=(SELECT id FROM oauth_providers WHERE user_id=u.id LIMIT 1)
                ORDER BY u.created_at DESC LIMIT 200`),
            db.query<any>(`SELECT provider, COUNT(*)::int c FROM oauth_providers GROUP BY provider ORDER BY c DESC`),
            db.query<any>(`SELECT plan, COUNT(*)::int c FROM users GROUP BY plan ORDER BY c DESC`),
        ]);
        const content = `
<div class="section-title">👤 User Management</div>
<div class="sg sg-4" style="margin-bottom:20px">
${planRows.rows.map((r:any)=>`<div class="stat"><div class="kpi">${r.plan}</div><div class="num">${r.c}</div></div>`).join("")}
</div>
<div class="tbox">
  <div class="tbox-h">All Users — Latest 200 <span style="color:rgba(255,255,255,.3);font-size:10px">${recentUsers.rows.length} shown</span></div>
  <div class="tw"><table>
    <thead><tr><th>#</th><th>Email</th><th>Name</th><th>Plan</th><th>Credits</th><th>Auth</th><th>Verified</th><th>Joined</th></tr></thead>
    <tbody>
    ${recentUsers.rows.map((r:any,i:number)=>{
      const planCls:Record<string,string>={free:'p-b',admin:'p-v','pro-basic':'p-g','pro-plus':'p-y'};
      return `<tr>
        <td style="color:rgba(255,255,255,.2)">${i+1}</td>
        <td style="color:#a78bfa">${r.email}</td>
        <td>${r.full_name||'—'}</td>
        <td><span class="pill ${planCls[r.plan]||'p-v'}">${r.plan}</span></td>
        <td style="color:${r.credits===0?'#f87171':r.credits===-1?'#fbbf24':'#34d399'};font-weight:700">${r.credits===-1?'∞':r.credits}</td>
        <td>${r.provider?`<span class="pill p-b">${r.provider}</span>`:'<span style="color:rgba(255,255,255,.2)">email</span>'}</td>
        <td>${r.email_verified?'<span class="pill p-g">✓</span>':'<span class="pill p-r">No</span>'}</td>
        <td style="color:rgba(255,255,255,.35)">${r.created}</td>
      </tr>`;
    }).join("")}
    </tbody>
  </table></div>
</div>`;
        res.send(shell(token, "users", content));
    } catch(err){next(err);}
});

// ─── PRODUCTS tab ────────────────────────────────────────────────────────────
router.get("/products", requireAdmin, async (req, res, next) => {
    try {
        const token = req.query.token as string || "";
        // No LIMIT — show all products tried more than once, as user requested
        const [repeatProducts, allCats, topBrands, jobStats] = await Promise.all([
            db.query<any>(`SELECT p.title,p.brand,p.category,p.canonical_url,p.price,COUNT(j.id)::int tryon_cnt,ROUND(AVG(j.fit_score) FILTER(WHERE j.fit_score IS NOT NULL))::int avg_fit
                FROM jobs j JOIN products p ON j.product_id=p.id
                WHERE p.title IS NOT NULL
                GROUP BY p.id,p.title,p.brand,p.category,p.canonical_url,p.price
                HAVING COUNT(j.id)>1
                ORDER BY tryon_cnt DESC`),
            db.query<any>(`SELECT p.category, COUNT(j.id)::int c FROM jobs j JOIN products p ON j.product_id=p.id GROUP BY p.category ORDER BY c DESC`),
            db.query<any>(`SELECT p.brand, COUNT(j.id)::int c, ROUND(AVG(j.fit_score) FILTER(WHERE j.fit_score IS NOT NULL))::int avg_fit FROM jobs j JOIN products p ON j.product_id=p.id WHERE p.brand IS NOT NULL GROUP BY p.brand ORDER BY c DESC LIMIT 20`),
            db.query<any>(`SELECT COUNT(*)::int total, COUNT(DISTINCT product_id)::int unique_products, COUNT(DISTINCT user_id)::int active_users FROM jobs WHERE status='done'`),
        ]);
        const js=jobStats.rows[0];
        const content = `
<div class="section-title">🛍️ Products Intelligence</div>
<div class="sg sg-4">
  <div class="stat ac"><div class="kpi">Completed Try-Ons</div><div class="num">${js.total.toLocaleString()}</div></div>
  <div class="stat gr"><div class="kpi">Unique Products</div><div class="num">${js.unique_products.toLocaleString()}</div></div>
  <div class="stat yw"><div class="kpi">Active Users</div><div class="num">${js.active_users.toLocaleString()}</div></div>
  <div class="stat bl"><div class="kpi">Repeat Products</div><div class="num">${repeatProducts.rows.length}</div><div class="sub">tried >1 times</div></div>
</div>
<div class="cg cg-2">
  <div class="box"><div class="box-h">📦 All Categories</div><canvas id="catC" height="150"></canvas></div>
  <div class="tbox" style="margin:0"><div class="tbox-h">🔥 Top Brands</div><div class="tw"><table>
    <thead><tr><th>Brand</th><th>Try-Ons</th><th>Avg Fit</th></tr></thead><tbody>
    ${topBrands.rows.map((r:any)=>`<tr><td style="color:#fff;font-weight:600">${r.brand}</td><td style="color:#a78bfa;font-weight:700">${r.c}</td><td>${r.avg_fit??'—'}</td></tr>`).join("") || '<tr><td colspan="3" style="color:rgba(255,255,255,.3)">No data</td></tr>'}
    </tbody></table></div>
  </div>
</div>
<div class="tbox">
  <div class="tbox-h">📊 Products Tried More Than Once — ${repeatProducts.rows.length} products detected
    <span style="font-size:10px;color:rgba(255,255,255,.3)">Sorted by popularity</span>
  </div>
  <div class="tw"><table>
    <thead><tr><th>#</th><th>Product</th><th>Brand</th><th>Category</th><th>Price</th><th>Try-Ons</th><th>Avg Fit</th></tr></thead>
    <tbody>
    ${repeatProducts.rows.length > 0 ? repeatProducts.rows.map((r:any,i:number)=>`<tr>
      <td style="color:rgba(255,255,255,.2)">${i+1}</td>
      <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        ${r.canonical_url ? `<a href="${r.canonical_url}" target="_blank" style="color:#a78bfa">${r.title}</a>` : r.title}
      </td>
      <td>${r.brand ? `<span class="pill p-v">${r.brand}</span>` : '—'}</td>
      <td>${r.category ? `<span class="pill p-b">${r.category}</span>` : '—'}</td>
      <td style="color:#fbbf24">${r.price ? '$'+Number(r.price).toFixed(2) : '—'}</td>
      <td style="color:#34d399;font-weight:800;font-size:15px">${r.tryon_cnt}</td>
      <td>${r.avg_fit ? `<span style="color:${r.avg_fit>=80?'#34d399':r.avg_fit>=60?'#fbbf24':'#f87171'}">${r.avg_fit}</span>` : '—'}</td>
    </tr>`).join("") : '<tr><td colspan="7" style="color:rgba(255,255,255,.3);text-align:center;padding:24px">No repeat products yet — data will accumulate as users try on products</td></tr>'}
    </tbody>
  </table></div>
</div>
<script>
doC('catC',${JSON.stringify(allCats.rows.map((r:any)=>r.category))},${JSON.stringify(allCats.rows.map((r:any)=>r.c))});
</script>`;
        res.send(shell(token, "products", content));
    } catch(err){next(err);}
});

// ─── DASHBOARD redirect ───────────────────────────────────────────────────────
router.get("/dashboard", requireAdmin, (req, res) => {
    res.redirect(`/admin/overview?token=${req.query.token||""}`);
});

// ─── POST /admin/set-pixel ────────────────────────────────────────────────────
router.post("/set-pixel", requireAdmin, async (req, res, next) => {
    try {
        const { platform, pixel_id } = req.body;
        if (!platform || !pixel_id) return res.status(400).send("Missing fields");
        await db.query(
            `INSERT INTO site_pixels(platform,pixel_id,active) VALUES($1,$2,true)
             ON CONFLICT(platform) DO UPDATE SET pixel_id=EXCLUDED.pixel_id, active=true, updated_at=NOW()`,
            [platform, pixel_id]
        );
        res.redirect(`/admin/marketing?token=${req.query.token||""}&saved=1`);
    } catch(err){next(err);}
});

// ─── GET /admin/export CSV ────────────────────────────────────────────────────
router.get("/export", requireAdmin, async (_req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT id,email,COALESCE(name,'') name,COALESCE(source,'landing') source,
             COALESCE(utm_source,'') utm_source,COALESCE(utm_campaign,'') utm_campaign,
             COALESCE(utm_medium,'') utm_medium,COALESCE(country,'') country,created_at
             FROM newsletter_subscribers ORDER BY created_at DESC`
        );
        const csv = ["id,email,name,source,utm_source,utm_campaign,utm_medium,country,created_at",
            ...rows.map((r:any)=>`${r.id},${r.email},${r.name},${r.source},${r.utm_source},${r.utm_campaign},${r.utm_medium},${r.country},${r.created_at}`)
        ].join("\n");
        res.setHeader("Content-Type","text/csv");
        res.setHeader("Content-Disposition",`attachment;filename="tryiton-subscribers-${new Date().toISOString().slice(0,10)}.csv"`);
        res.send(csv);
    } catch(err){next(err);}
});

// ─── GET /admin/stats JSON ────────────────────────────────────────────────────
router.get("/stats", requireAdmin, async (_req, res, next) => {
    try {
        const [u,j,n] = await Promise.all([
            db.query<any>("SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE plan NOT IN('free','admin'))::int paid FROM users"),
            db.query<any>("SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='done')::int done FROM jobs"),
            db.query<any>("SELECT COUNT(*)::int total FROM newsletter_subscribers"),
        ]);
        res.json({users:u.rows[0],jobs:j.rows[0],newsletter:n.rows[0]});
    } catch(err){next(err);}
});

export default router;
