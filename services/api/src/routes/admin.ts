import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db/client";

const router = Router();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "tryiton-admin-2026";

function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const token = req.headers["x-admin-token"] || req.query.token;
    if (token !== ADMIN_TOKEN) return res.status(401).json({ error: "UNAUTHORIZED" });
    next();
}

// ─── GET /admin/dashboard ────────────────────────────────────────────────────
router.get("/dashboard", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.query.token as string || "";

        const [
            userStats, planBreakdown, newUsersGrowth,
            authProviders,
            jobStats, jobsByCategory, jobsByDay, topBrands, topProducts,
            nlStats, nlBySource, nlGrowth, nlRecentRows,
            eventTypes, eventsByDay,
            creditStats,
        ] = await Promise.all([
            // Users
            db.query<any>(`SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '1 day')::int AS today,
                COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '7 days')::int AS week,
                COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '30 days')::int AS month,
                COUNT(*) FILTER (WHERE status='active')::int AS active,
                COUNT(*) FILTER (WHERE plan='free')::int AS free_plan,
                COUNT(*) FILTER (WHERE plan NOT IN ('free','admin'))::int AS paid
            FROM users`),
            db.query<any>(`SELECT plan, COUNT(*)::int AS cnt FROM users GROUP BY plan ORDER BY cnt DESC`),
            db.query<any>(`SELECT TO_CHAR(created_at::date,'YYYY-MM-DD') AS day, COUNT(*)::int AS cnt
                FROM users WHERE created_at >= NOW()-INTERVAL '30 days'
                GROUP BY day ORDER BY day`),

            // OAuth
            db.query<any>(`SELECT provider, COUNT(*)::int AS cnt FROM oauth_providers GROUP BY provider ORDER BY cnt DESC`),

            // Jobs (try-ons)
            db.query<any>(`SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '1 day')::int AS today,
                COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '7 days')::int AS week,
                COUNT(*) FILTER (WHERE status='done')::int AS done,
                COUNT(*) FILTER (WHERE status='failed')::int AS failed,
                ROUND(AVG(fit_score) FILTER (WHERE fit_score IS NOT NULL))::int AS avg_fit_score
            FROM jobs`),
            db.query<any>(`SELECT category, COUNT(*)::int AS cnt FROM jobs GROUP BY category ORDER BY cnt DESC LIMIT 10`),
            db.query<any>(`SELECT TO_CHAR(created_at::date,'YYYY-MM-DD') AS day, COUNT(*)::int AS cnt
                FROM jobs WHERE created_at >= NOW()-INTERVAL '30 days'
                GROUP BY day ORDER BY day`),
            db.query<any>(`SELECT p.brand, COUNT(j.id)::int AS cnt
                FROM jobs j JOIN products p ON j.product_id=p.id
                WHERE p.brand IS NOT NULL
                GROUP BY p.brand ORDER BY cnt DESC LIMIT 10`),
            db.query<any>(`SELECT p.title, p.brand, p.category, COUNT(j.id)::int AS cnt
                FROM jobs j JOIN products p ON j.product_id=p.id
                WHERE p.title IS NOT NULL
                GROUP BY p.title,p.brand,p.category ORDER BY cnt DESC LIMIT 15`),

            // Newsletter
            db.query<any>(`SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '1 day')::int AS today,
                COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '7 days')::int AS week,
                COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '30 days')::int AS month
            FROM newsletter_subscribers`),
            db.query<any>(`SELECT COALESCE(source,'landing') AS source, COUNT(*)::int AS cnt
                FROM newsletter_subscribers GROUP BY source ORDER BY cnt DESC`),
            db.query<any>(`SELECT TO_CHAR(created_at::date,'YYYY-MM-DD') AS day, COUNT(*)::int AS cnt
                FROM newsletter_subscribers WHERE created_at >= NOW()-INTERVAL '30 days'
                GROUP BY day ORDER BY day`),
            db.query<any>(`SELECT email, COALESCE(source,'landing') AS source, COALESCE(name,'—') AS name,
                TO_CHAR(created_at,'DD/MM/YY HH24:MI') AS created_at
                FROM newsletter_subscribers ORDER BY created_at DESC LIMIT 100`),

            // Events
            db.query<any>(`SELECT event_type, COUNT(*)::int AS cnt FROM events GROUP BY event_type ORDER BY cnt DESC LIMIT 12`),
            db.query<any>(`SELECT TO_CHAR(created_at::date,'YYYY-MM-DD') AS day, COUNT(*)::int AS cnt
                FROM events WHERE created_at >= NOW()-INTERVAL '30 days'
                GROUP BY day ORDER BY day`),

            // Credits
            db.query<any>(`SELECT
                ROUND(AVG(credits) FILTER (WHERE credits >= 0))::int AS avg_credits,
                SUM(credits) FILTER (WHERE credits >= 0)::int AS total_credits,
                COUNT(*) FILTER (WHERE credits = 0)::int AS zero_credits
            FROM users`),
        ]);

        const us = userStats.rows[0];
        const js = jobStats.rows[0];
        const ns = nlStats.rows[0];
        const cs = creditStats.rows[0];

        // Chart data
        const userDays   = JSON.stringify(newUsersGrowth.rows.map((r:any) => r.day));
        const userData   = JSON.stringify(newUsersGrowth.rows.map((r:any) => r.cnt));
        const jobDays    = JSON.stringify(jobsByDay.rows.map((r:any) => r.day));
        const jobData    = JSON.stringify(jobsByDay.rows.map((r:any) => r.cnt));
        const nlDays     = JSON.stringify(nlGrowth.rows.map((r:any) => r.day));
        const nlData     = JSON.stringify(nlGrowth.rows.map((r:any) => r.cnt));
        const evDays     = JSON.stringify(eventsByDay.rows.map((r:any) => r.day));
        const evData     = JSON.stringify(eventsByDay.rows.map((r:any) => r.cnt));
        const catLabels  = JSON.stringify(jobsByCategory.rows.map((r:any) => r.category));
        const catData    = JSON.stringify(jobsByCategory.rows.map((r:any) => r.cnt));
        const planLabels = JSON.stringify(planBreakdown.rows.map((r:any) => r.plan));
        const planData   = JSON.stringify(planBreakdown.rows.map((r:any) => r.cnt));

        const totalNl = ns.total || 1;
        const totalJobs = js.total || 1;
        const totalUsers = us.total || 1;

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TryIt4U — Admin Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;background:#07070f;color:#f1f5f9;min-height:100vh;font-size:14px}
a{color:inherit;text-decoration:none}
.topbar{background:linear-gradient(90deg,rgba(124,58,237,.15),rgba(79,70,229,.1));border-bottom:1px solid rgba(124,58,237,.3);padding:14px 28px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;backdrop-filter:blur(20px)}
.topbar h1{font-size:16px;font-weight:700;color:#a78bfa;display:flex;align-items:center;gap:8px}
.topbar-right{display:flex;align-items:center;gap:12px}
.refresh-btn{background:rgba(124,58,237,.2);border:1px solid rgba(124,58,237,.4);color:#a78bfa;padding:6px 14px;border-radius:100px;font-size:12px;cursor:pointer;transition:.2s}
.refresh-btn:hover{background:rgba(124,58,237,.35)}
.export-btn{background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border:none;padding:7px 16px;border-radius:100px;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.ts{font-size:11px;color:rgba(255,255,255,.3)}
.main{padding:24px;max-width:1400px;margin:0 auto}
.section-title{font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.35);margin:28px 0 14px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.06)}
/* STAT CARDS */
.stats-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:8px}
.stat{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:16px 18px;transition:.2s}
.stat:hover{border-color:rgba(124,58,237,.35);background:rgba(124,58,237,.07)}
.stat.purple{border-color:rgba(124,58,237,.3);background:rgba(124,58,237,.1)}
.stat.green{border-color:rgba(52,211,153,.25);background:rgba(52,211,153,.07)}
.stat.yellow{border-color:rgba(251,191,36,.25);background:rgba(251,191,36,.06)}
.stat.red{border-color:rgba(248,113,113,.2);background:rgba(248,113,113,.06)}
.stat-label{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:6px}
.stat-val{font-size:28px;font-weight:800;color:#fff;line-height:1}
.stat.purple .stat-val{background:linear-gradient(135deg,#a78bfa,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.stat.green .stat-val{color:#34d399}
.stat.yellow .stat-val{color:#fbbf24}
.stat.red .stat-val{color:#f87171}
.stat-sub{font-size:11px;color:rgba(255,255,255,.3);margin-top:4px}
/* CHARTS */
.charts-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
.charts-grid-3{display:grid;grid-template-columns:2fr 1fr 1fr;gap:16px;margin-bottom:16px}
.chart-box{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:20px}
.chart-box h3{font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:14px}
/* TABLES */
.table-box{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:20px;margin-bottom:16px}
.table-box h3{font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:14px;display:flex;justify-content:space-between;align-items:center}
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:10px;font-weight:700;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:1px;padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.06)}
td{padding:9px 10px;font-size:12px;color:rgba(255,255,255,.6);border-bottom:1px solid rgba(255,255,255,.04)}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(124,58,237,.06);color:#fff}
.pill{display:inline-block;padding:2px 8px;border-radius:100px;font-size:10px;font-weight:700}
.pill-purple{background:rgba(124,58,237,.2);color:#a78bfa;border:1px solid rgba(124,58,237,.3)}
.pill-green{background:rgba(52,211,153,.15);color:#34d399;border:1px solid rgba(52,211,153,.25)}
.pill-yellow{background:rgba(251,191,36,.15);color:#fbbf24;border:1px solid rgba(251,191,36,.25)}
.pill-red{background:rgba(248,113,113,.15);color:#f87171;border:1px solid rgba(248,113,113,.2)}
.pill-blue{background:rgba(96,165,250,.15);color:#60a5fa;border:1px solid rgba(96,165,250,.2)}
/* MINI BAR */
.mini-bar-wrap{margin-bottom:4px}
.mini-bar{height:4px;background:rgba(255,255,255,.07);border-radius:2px;margin-top:3px}
.mini-bar-fill{height:100%;border-radius:2px}
/* SPLIT COLS */
.split2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.split3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
@media(max-width:1100px){.stats-grid{grid-template-columns:repeat(3,1fr)}.charts-grid,.charts-grid-3{grid-template-columns:1fr}.split2,.split3{grid-template-columns:1fr}}
@media(max-width:600px){.stats-grid{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>
<div class="topbar">
  <h1>✨ TryIt4U Admin <span style="font-size:11px;color:rgba(255,255,255,.3);font-weight:400">Analytics Dashboard</span></h1>
  <div class="topbar-right">
    <span class="ts">🕐 ${new Date().toLocaleString("he-IL")}</span>
    <button class="refresh-btn" onclick="location.reload()">↻ Refresh</button>
    <a href="/admin/export?token=${token}" class="export-btn">⬇ Export CSV</a>
  </div>
</div>

<div class="main">

<!-- ── USERS ── -->
<div class="section-title">👤 Users</div>
<div class="stats-grid">
  <div class="stat purple"><div class="stat-label">Total Users</div><div class="stat-val">${us.total.toLocaleString()}</div><div class="stat-sub">All time</div></div>
  <div class="stat green"><div class="stat-label">Today</div><div class="stat-val">${us.today}</div><div class="stat-sub">New signups</div></div>
  <div class="stat"><div class="stat-label">This Week</div><div class="stat-val">${us.week}</div><div class="stat-sub">7d signups</div></div>
  <div class="stat"><div class="stat-label">This Month</div><div class="stat-val">${us.month}</div><div class="stat-sub">30d signups</div></div>
  <div class="stat yellow"><div class="stat-label">Paid Users</div><div class="stat-val">${us.paid}</div><div class="stat-sub">${Math.round(us.paid/totalUsers*100)}% conversion</div></div>
  <div class="stat"><div class="stat-label">Free Plan</div><div class="stat-val">${us.free_plan}</div><div class="stat-sub">${Math.round(us.free_plan/totalUsers*100)}% of users</div></div>
</div>

<div class="charts-grid-3">
  <div class="chart-box"><h3>📈 New Users — 30 Days</h3><canvas id="userChart" height="100"></canvas></div>
  <div class="chart-box"><h3>🥧 Plans Breakdown</h3><canvas id="planChart" height="140"></canvas></div>
  <div class="chart-box"><h3>🔑 Auth Providers</h3>
    ${authProviders.rows.map((r:any) => {
      const pct = Math.round(r.cnt/totalUsers*100);
      const color = r.provider==='google' ? '#ea4335' : r.provider==='facebook' ? '#1877f2' : r.provider==='apple' ? '#fff' : '#a78bfa';
      return `<div class="mini-bar-wrap">
        <div style="display:flex;justify-content:space-between;font-size:12px">
          <span style="color:#fff;text-transform:capitalize">${r.provider}</span>
          <span style="color:rgba(255,255,255,.4)">${r.cnt} (${pct}%)</span>
        </div>
        <div class="mini-bar"><div class="mini-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      </div>`;
    }).join("") || '<div style="color:rgba(255,255,255,.3);font-size:13px">No OAuth data yet</div>'}
  </div>
</div>

<!-- ── TRY-ONS ── -->
<div class="section-title">🎭 Try-On Activity</div>
<div class="stats-grid">
  <div class="stat purple"><div class="stat-label">Total Try-Ons</div><div class="stat-val">${js.total.toLocaleString()}</div><div class="stat-sub">All time jobs</div></div>
  <div class="stat green"><div class="stat-label">Today</div><div class="stat-val">${js.today}</div><div class="stat-sub">Jobs today</div></div>
  <div class="stat"><div class="stat-label">This Week</div><div class="stat-val">${js.week}</div><div class="stat-sub">7d jobs</div></div>
  <div class="stat green"><div class="stat-label">Completed</div><div class="stat-val">${js.done}</div><div class="stat-sub">${Math.round(js.done/Math.max(js.total,1)*100)}% success rate</div></div>
  <div class="stat red"><div class="stat-label">Failed</div><div class="stat-val">${js.failed}</div><div class="stat-sub">${Math.round(js.failed/Math.max(js.total,1)*100)}% fail rate</div></div>
  <div class="stat yellow"><div class="stat-label">Avg Fit Score</div><div class="stat-val">${js.avg_fit_score ?? '—'}</div><div class="stat-sub">out of 100</div></div>
</div>

<div class="charts-grid">
  <div class="chart-box"><h3>📊 Try-Ons per Day — 30 Days</h3><canvas id="jobChart" height="100"></canvas></div>
  <div class="chart-box"><h3>🗂️ Category Breakdown</h3><canvas id="catChart" height="140"></canvas></div>
</div>

<!-- ── CATEGORIES & BRANDS ── -->
<div class="split2">
  <div class="table-box">
    <h3>🏷️ Top Categories <span class="pill pill-purple">${jobsByCategory.rows.length} types</span></h3>
    <div class="table-wrap">
    <table>
      <thead><tr><th>Category</th><th>Try-Ons</th><th>Share</th></tr></thead>
      <tbody>
      ${jobsByCategory.rows.map((r:any) => {
        const pct = Math.round(r.cnt/totalJobs*100);
        return `<tr><td>${r.category}</td><td style="color:#a78bfa;font-weight:700">${r.cnt.toLocaleString()}</td><td>
          <span>${pct}%</span>
          <div class="mini-bar" style="width:80px;display:inline-block;vertical-align:middle;margin-left:6px"><div class="mini-bar-fill" style="width:${pct}%;background:linear-gradient(90deg,#7c3aed,#a78bfa)"></div></div>
        </td></tr>`;
      }).join("") || '<tr><td colspan="3" style="color:rgba(255,255,255,.3)">No job data yet</td></tr>'}
      </tbody>
    </table>
    </div>
  </div>
  <div class="table-box">
    <h3>🔥 Top Brands</h3>
    <div class="table-wrap">
    <table>
      <thead><tr><th>Brand</th><th>Views</th></tr></thead>
      <tbody>
      ${topBrands.rows.map((r:any) => `<tr><td style="font-weight:600;color:#fff">${r.brand}</td><td style="color:#fbbf24;font-weight:700">${r.cnt}</td></tr>`).join("") || '<tr><td colspan="2" style="color:rgba(255,255,255,.3)">No brand data yet</td></tr>'}
      </tbody>
    </table>
    </div>
  </div>
</div>

<!-- ── TOP PRODUCTS ── -->
<div class="table-box">
  <h3>🛍️ Most Tried-On Products <span style="font-weight:400;color:rgba(255,255,255,.3);font-size:11px">Top 15</span></h3>
  <div class="table-wrap">
  <table>
    <thead><tr><th>#</th><th>Product</th><th>Brand</th><th>Category</th><th>Try-ons</th></tr></thead>
    <tbody>
    ${topProducts.rows.map((r:any,i:number) => `<tr>
      <td style="color:rgba(255,255,255,.25)">${i+1}</td>
      <td style="color:#fff;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.title}</td>
      <td><span class="pill pill-purple">${r.brand||'—'}</span></td>
      <td><span class="pill pill-blue">${r.category||'—'}</span></td>
      <td style="color:#34d399;font-weight:700">${r.cnt}</td>
    </tr>`).join("") || '<tr><td colspan="5" style="color:rgba(255,255,255,.3)">No product data yet</td></tr>'}
    </tbody>
  </table>
  </div>
</div>

<!-- ── CREDITS ── -->
<div class="section-title">💳 Credits</div>
<div class="stats-grid" style="grid-template-columns:repeat(3,1fr)">
  <div class="stat purple"><div class="stat-label">Avg Credits/User</div><div class="stat-val">${cs.avg_credits ?? 0}</div><div class="stat-sub">Free tier starts at 5</div></div>
  <div class="stat yellow"><div class="stat-label">Total Credits Pool</div><div class="stat-val">${(cs.total_credits||0).toLocaleString()}</div><div class="stat-sub">Across all users</div></div>
  <div class="stat red"><div class="stat-label">Zero Credits</div><div class="stat-val">${cs.zero_credits ?? 0}</div><div class="stat-sub">Ready to upgrade</div></div>
</div>

<!-- ── EVENTS ── -->
<div class="section-title">📡 Events & Analytics</div>
<div class="charts-grid">
  <div class="chart-box"><h3>📅 Events per Day — 30 Days</h3><canvas id="evChart" height="100"></canvas></div>
  <div class="chart-box"><h3>🎯 Event Types</h3>
    ${eventTypes.rows.length > 0 ? `<div class="table-wrap"><table><thead><tr><th>Event</th><th>Count</th></tr></thead><tbody>
    ${eventTypes.rows.map((r:any) => `<tr><td style="font-family:monospace;font-size:11px;color:#a78bfa">${r.event_type}</td><td style="color:#fff;font-weight:700">${r.cnt.toLocaleString()}</td></tr>`).join("")}
    </tbody></table></div>` : '<div style="color:rgba(255,255,255,.3);font-size:13px;padding:20px 0">No events tracked yet</div>'}
  </div>
</div>

<!-- ── NEWSLETTER ── -->
<div class="section-title">📧 Waitlist / Newsletter</div>
<div class="stats-grid">
  <div class="stat purple"><div class="stat-label">Total Subscribers</div><div class="stat-val">${ns.total.toLocaleString()}</div><div class="stat-sub">All time</div></div>
  <div class="stat green"><div class="stat-label">Today</div><div class="stat-val">${ns.today}</div><div class="stat-sub">New today</div></div>
  <div class="stat"><div class="stat-label">This Week</div><div class="stat-val">${ns.week}</div></div>
  <div class="stat"><div class="stat-label">This Month</div><div class="stat-val">${ns.month}</div></div>
  ${nlBySource.rows.slice(0,2).map((r:any) => {
    const pct = Math.round(r.cnt/totalNl*100);
    return `<div class="stat"><div class="stat-label">${r.source}</div><div class="stat-val">${r.cnt}</div><div class="stat-sub">${pct}%</div></div>`;
  }).join("")}
</div>

<div class="charts-grid">
  <div class="chart-box"><h3>📈 Subscriber Growth — 30 Days</h3><canvas id="nlChart" height="100"></canvas></div>
  <div class="chart-box"><h3>📍 Signup Sources</h3>
    ${nlBySource.rows.map((r:any) => {
      const pct = Math.round(r.cnt/totalNl*100);
      return `<div class="mini-bar-wrap" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:12px">
          <span class="pill pill-purple">${r.source}</span>
          <span style="color:rgba(255,255,255,.6)">${r.cnt} (${pct}%)</span>
        </div>
        <div class="mini-bar" style="margin-top:6px"><div class="mini-bar-fill" style="width:${pct}%;background:linear-gradient(90deg,#7c3aed,#a78bfa)"></div></div>
      </div>`;
    }).join("")}
  </div>
</div>

<div class="table-box">
  <h3>🆕 Latest Subscribers <span style="font-weight:400;color:rgba(255,255,255,.3);font-size:11px">Last 100</span>
    <a href="/admin/export?token=${token}" class="export-btn" style="font-size:11px;padding:5px 12px">⬇ Export CSV</a>
  </h3>
  <div class="table-wrap">
  <table>
    <thead><tr><th>#</th><th>Email</th><th>Name</th><th>Source</th><th>Signup Date</th></tr></thead>
    <tbody>
    ${nlRecentRows.rows.map((r:any,i:number) => `<tr>
      <td style="color:rgba(255,255,255,.2)">${i+1}</td>
      <td style="color:#a78bfa">${r.email}</td>
      <td>${r.name}</td>
      <td><span class="pill pill-purple">${r.source}</span></td>
      <td style="color:rgba(255,255,255,.4)">${r.created_at}</td>
    </tr>`).join("")}
    </tbody>
  </table>
  </div>
</div>

</div><!-- end main -->

<script>
const CHART_DEFAULTS = {
  responsive:true,
  plugins:{legend:{display:false}},
  scales:{
    x:{ticks:{color:'rgba(255,255,255,.3)',font:{size:9}},grid:{color:'rgba(255,255,255,.04)'}},
    y:{ticks:{color:'rgba(255,255,255,.3)',font:{size:9}},grid:{color:'rgba(255,255,255,.04)'},beginAtZero:true}
  }
};
const PIE_DEFAULTS = {responsive:true,plugins:{legend:{position:'bottom',labels:{color:'rgba(255,255,255,.6)',font:{size:11},padding:10}}}};

function barChart(id,labels,data,color){
  new Chart(document.getElementById(id).getContext('2d'),{type:'bar',data:{labels,datasets:[{data,backgroundColor:color+'99',borderColor:color,borderWidth:1,borderRadius:4}]},options:CHART_DEFAULTS});
}
function lineChart(id,labels,data,color){
  new Chart(document.getElementById(id).getContext('2d'),{type:'line',data:{labels,datasets:[{data,borderColor:color,backgroundColor:color+'22',fill:true,tension:.35,pointRadius:2}]},options:CHART_DEFAULTS});
}
function doughnut(id,labels,data){
  const colors=['#7c3aed','#4f46e5','#059669','#d97706','#dc2626','#0891b2','#7c3aed','#ec4899'];
  new Chart(document.getElementById(id).getContext('2d'),{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:colors,borderWidth:0}]},options:PIE_DEFAULTS});
}

lineChart('userChart', ${userDays}, ${userData}, '#a78bfa');
barChart('jobChart',   ${jobDays},  ${jobData},  '#7c3aed');
lineChart('nlChart',   ${nlDays},   ${nlData},   '#34d399');
barChart('evChart',    ${evDays},   ${evData},   '#4f46e5');
doughnut('catChart',   ${catLabels}, ${catData});
doughnut('planChart',  ${planLabels}, ${planData});
</script>
</body>
</html>`;

        res.send(html);
    } catch(err) { next(err); }
});

// ─── GET /admin/export ───────────────────────────────────────────────────────
router.get("/export", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const { rows } = await db.query(
            "SELECT id,email,COALESCE(name,'') AS name,COALESCE(source,'landing') AS source,created_at FROM newsletter_subscribers ORDER BY created_at DESC"
        );
        const csv = ["id,email,name,source,created_at",
            ...rows.map((r:any) => `${r.id},${r.email},${r.name},${r.source},${r.created_at}`)
        ].join("\n");
        res.setHeader("Content-Type","text/csv");
        res.setHeader("Content-Disposition",`attachment;filename="subscribers-${new Date().toISOString().slice(0,10)}.csv"`);
        res.send(csv);
    } catch(err) { next(err); }
});

// ─── GET /admin/stats JSON ───────────────────────────────────────────────────
router.get("/stats", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const [u,j,n] = await Promise.all([
            db.query<any>("SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE created_at>=NOW()-INTERVAL '1 day')::int today FROM users"),
            db.query<any>("SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='done')::int done FROM jobs"),
            db.query<any>("SELECT COUNT(*)::int total FROM newsletter_subscribers"),
        ]);
        res.json({users:u.rows[0],jobs:j.rows[0],newsletter:n.rows[0]});
    } catch(err) { next(err); }
});

export default router;
