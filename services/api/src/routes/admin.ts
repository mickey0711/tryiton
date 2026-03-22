import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db/client";

const router = Router();

// ─── Simple token auth middleware ────────────────────────────────────────────
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "tryiton-admin-2026";

function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const token = req.headers["x-admin-token"] || req.query.token;
    if (token !== ADMIN_TOKEN) {
        return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    next();
}

// ─── GET /admin/dashboard — HTML dashboard ───────────────────────────────────
router.get("/dashboard", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const [totalRow, todayRow, weekRow, monthRow, sourceRows, growthRows, recentRows] =
            await Promise.all([
                db.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM newsletter_subscribers"),
                db.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM newsletter_subscribers WHERE created_at >= NOW() - INTERVAL '1 day'"),
                db.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM newsletter_subscribers WHERE created_at >= NOW() - INTERVAL '7 days'"),
                db.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM newsletter_subscribers WHERE created_at >= NOW() - INTERVAL '30 days'"),
                db.query<{ source: string; count: string }>(
                    "SELECT COALESCE(source,'landing') AS source, COUNT(*)::text AS count FROM newsletter_subscribers GROUP BY source ORDER BY count DESC LIMIT 10"
                ),
                db.query<{ day: string; count: string }>(
                    "SELECT TO_CHAR(created_at::date,'YYYY-MM-DD') AS day, COUNT(*)::text AS count FROM newsletter_subscribers WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY day ORDER BY day"
                ),
                db.query<{ id: string; email: string; source: string; name: string; created_at: string }>(
                    "SELECT id, email, COALESCE(source,'landing') AS source, COALESCE(name,'—') AS name, TO_CHAR(created_at,'DD/MM/YYYY HH24:MI') AS created_at FROM newsletter_subscribers ORDER BY created_at DESC LIMIT 200"
                ),
            ]);

        const total   = parseInt(totalRow.rows[0].count);
        const today   = parseInt(todayRow.rows[0].count);
        const week    = parseInt(weekRow.rows[0].count);
        const month   = parseInt(monthRow.rows[0].count);
        const sources = sourceRows.rows;
        const growth  = growthRows.rows;
        const recent  = recentRows.rows;

        const growthLabels = JSON.stringify(growth.map(r => r.day));
        const growthData   = JSON.stringify(growth.map(r => parseInt(r.count)));

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TryIt4U — Admin Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a12;color:#f1f5f9;min-height:100vh}
.topbar{background:rgba(124,58,237,.12);border-bottom:1px solid rgba(124,58,237,.25);padding:16px 28px;display:flex;align-items:center;justify-content:space-between}
.topbar h1{font-size:18px;font-weight:700;color:#a78bfa}
.topbar span{font-size:12px;color:rgba(255,255,255,.4)}
.main{padding:28px;max-width:1300px;margin:0 auto}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-bottom:28px}
.stat{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:22px 24px}
.stat .num{font-size:36px;font-weight:800;color:#fff;margin:6px 0 2px}
.stat .lbl{font-size:12px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:1px}
.stat.accent{background:rgba(124,58,237,.12);border-color:rgba(124,58,237,.35)}
.stat.accent .num{background:linear-gradient(135deg,#a78bfa,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.section{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:24px;margin-bottom:24px}
.section h2{font-size:15px;font-weight:700;color:rgba(255,255,255,.7);margin-bottom:20px;text-transform:uppercase;letter-spacing:1px}
.grid2{display:grid;grid-template-columns:2fr 1fr;gap:24px;margin-bottom:24px}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:11px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:1px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.06)}
td{padding:10px 12px;font-size:13px;color:rgba(255,255,255,.65);border-bottom:1px solid rgba(255,255,255,.04)}
tr:hover td{background:rgba(124,58,237,.05);color:#fff}
.badge{display:inline-block;padding:2px 10px;border-radius:100px;font-size:11px;font-weight:600;background:rgba(124,58,237,.2);color:#a78bfa}
.src-bar{height:6px;background:rgba(124,58,237,.3);border-radius:3px;margin-top:4px}
.src-bar-fill{height:100%;background:linear-gradient(90deg,#7c3aed,#a78bfa);border-radius:3px}
.export-btn{background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border:none;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:8px}
.export-btn:hover{opacity:.9}
@media(max-width:800px){.stats{grid-template-columns:1fr 1fr}.grid2{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="topbar">
  <h1>✨ TryIt4U — Admin</h1>
  <span>Updated: ${new Date().toLocaleString("he-IL")}</span>
</div>
<div class="main">
  <div class="stats">
    <div class="stat accent">
      <div class="lbl">Total Subscribers</div>
      <div class="num">${total.toLocaleString()}</div>
    </div>
    <div class="stat">
      <div class="lbl">Today</div>
      <div class="num">${today.toLocaleString()}</div>
    </div>
    <div class="stat">
      <div class="lbl">This Week</div>
      <div class="num">${week.toLocaleString()}</div>
    </div>
    <div class="stat">
      <div class="lbl">This Month</div>
      <div class="num">${month.toLocaleString()}</div>
    </div>
  </div>

  <div class="grid2">
    <div class="section">
      <h2>📈 Growth (Last 30 Days)</h2>
      <canvas id="growthChart" height="120"></canvas>
    </div>
    <div class="section">
      <h2>📍 Sources</h2>
      ${sources.map(s => {
          const pct = Math.round((parseInt(s.count) / total) * 100);
          return `<div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
              <span style="color:#fff;font-weight:600">${s.source}</span>
              <span style="color:rgba(255,255,255,.4)">${s.count} (${pct}%)</span>
            </div>
            <div class="src-bar"><div class="src-bar-fill" style="width:${pct}%"></div></div>
          </div>`;
      }).join("")}
    </div>
  </div>

  <div class="section">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="margin:0">🪄 Latest Subscribers</h2>
      <a href="/admin/export?token=${req.query.token || ""}" class="export-btn">⬇ Export CSV</a>
    </div>
    <div style="overflow-x:auto">
    <table>
      <thead><tr><th>#</th><th>Email</th><th>Name</th><th>Source</th><th>Signup Date</th></tr></thead>
      <tbody>
      ${recent.map((r, i) => `<tr>
        <td style="color:rgba(255,255,255,.25)">${i + 1}</td>
        <td style="color:#a78bfa">${r.email}</td>
        <td>${r.name}</td>
        <td><span class="badge">${r.source}</span></td>
        <td>${r.created_at}</td>
      </tr>`).join("")}
      </tbody>
    </table>
    </div>
  </div>
</div>
<script>
new Chart(document.getElementById('growthChart').getContext('2d'),{
  type:'bar',
  data:{
    labels:${growthLabels},
    datasets:[{
      label:'New Subscribers',
      data:${growthData},
      backgroundColor:'rgba(124,58,237,.5)',
      borderColor:'#7c3aed',
      borderWidth:1,
      borderRadius:4
    }]
  },
  options:{
    responsive:true,
    plugins:{legend:{display:false}},
    scales:{
      x:{ticks:{color:'rgba(255,255,255,.3)',font:{size:10}},grid:{color:'rgba(255,255,255,.04)'}},
      y:{ticks:{color:'rgba(255,255,255,.3)',font:{size:10}},grid:{color:'rgba(255,255,255,.04)'},beginAtZero:true}
    }
  }
});
</script>
</body>
</html>`;

        res.send(html);
    } catch (err) { next(err); }
});

// ─── GET /admin/export — CSV export ─────────────────────────────────────────
router.get("/export", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const { rows } = await db.query(
            "SELECT id, email, COALESCE(name,'') AS name, COALESCE(source,'landing') AS source, created_at FROM newsletter_subscribers ORDER BY created_at DESC"
        );
        const csv = ["id,email,name,source,created_at",
            ...rows.map(r => `${r.id},${r.email},${r.name},${r.source},${r.created_at}`)
        ].join("\n");
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="subscribers-${new Date().toISOString().slice(0,10)}.csv"`);
        res.send(csv);
    } catch (err) { next(err); }
});

// ─── GET /admin/stats — JSON ─────────────────────────────────────────────────
router.get("/stats", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const { rows } = await db.query(
            "SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '1 day')::int AS today, COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '7 days')::int AS week, COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '30 days')::int AS month FROM newsletter_subscribers"
        );
        res.json(rows[0]);
    } catch (err) { next(err); }
});

export default router;
