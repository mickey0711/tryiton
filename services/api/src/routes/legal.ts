import { Router } from "express";
const router = Router();

const html = (title: string, body: string) => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title} — TryItOn</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:760px;margin:40px auto;padding:0 24px;color:#1a1a2e;line-height:1.7}h1{color:#6366f1}h2{color:#4f46e5;margin-top:32px}a{color:#6366f1}.updated{color:#888;font-size:14px}</style>
</head><body>${body}</body></html>`;

// ─── Terms of Service ─────────────────────────────────────────────────────────
router.get("/terms", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html("Terms of Service", `
<h1>TryItOn — Terms of Service</h1>
<p class="updated">Last updated: March 22, 2026</p>

<p>By using TryItOn ("the Service"), you agree to these terms. Please read them carefully.</p>

<h2>1. Use of Service</h2>
<p>TryItOn is a Chrome extension and mobile app that lets you virtually try on clothing and furniture using AI. You may use the Service for personal, non-commercial purposes.</p>

<h2>2. Accounts</h2>
<p>You are responsible for maintaining the security of your account and all activities under it.</p>

<h2>3. Credits & Subscriptions</h2>
<p>Credits are consumed per AI try-on request. Unused credits do not roll over between billing periods for subscription plans. All purchases are final unless stated otherwise in our Refund Policy.</p>

<h2>4. Acceptable Use</h2>
<p>You may not use TryItOn to process illegal content, violate third-party rights, or abuse our AI infrastructure.</p>

<h2>5. Intellectual Property</h2>
<p>TryItOn and its original content are owned by TryItOn and protected by applicable intellectual property laws.</p>

<h2>6. Limitation of Liability</h2>
<p>The Service is provided "as is" without warranties of any kind. We are not liable for indirect, incidental, or consequential damages.</p>

<h2>7. Termination</h2>
<p>We reserve the right to suspend or terminate accounts that violate these terms.</p>

<h2>8. Contact</h2>
<p><a href="mailto:hello@tryit4u.ai">hello@tryit4u.ai</a></p>
<p style="margin-top:48px;color:#aaa;font-size:13px">© 2026 TryItOn. All rights reserved.</p>
`));
});

// ─── Refund Policy ────────────────────────────────────────────────────────────
router.get("/refund", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html("Refund Policy", `
<h1>TryItOn — Refund Policy</h1>
<p class="updated">Last updated: March 22, 2026</p>

<h2>Monthly Subscriptions</h2>
<p>You may cancel your subscription at any time. Cancellation takes effect at the end of the current billing period. We do not offer prorated refunds for unused time within a billing period.</p>

<h2>Credit Packs</h2>
<p>Credit pack purchases are non-refundable once credits have been used. If you have unused credits and experience a technical issue preventing their use, contact us within 14 days for a review.</p>

<h2>Exceptions</h2>
<p>If you were charged in error or experienced a technical failure on our end, you are entitled to a full refund. Please contact us within 30 days of the charge.</p>

<h2>How to Request a Refund</h2>
<p>Email <a href="mailto:hello@tryit4u.ai">hello@tryit4u.ai</a> with your order details and we will respond within 2 business days.</p>

<p style="margin-top:48px;color:#aaa;font-size:13px">© 2026 TryItOn. All rights reserved.</p>
`));
});

export default router;
