import { logger } from "../config/logger";

// ─── Email Service (Resend) ─────────────────────────────────────────────────
// Sends transactional emails via Resend. Falls back to console logging if
// RESEND_API_KEY is not set (development mode).

const FROM = process.env.EMAIL_FROM ?? "TryIt4U <noreply@tryit4u.ai>";
const API_KEY = process.env.RESEND_API_KEY;

interface SendEmailOpts {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailOpts): Promise<boolean> {
    if (!API_KEY) {
        logger.info({ to, subject }, "📧 [DEV] Email would be sent (no RESEND_API_KEY)");
        return true;
    }

    try {
        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${API_KEY}`,
            },
            body: JSON.stringify({ from: FROM, to, subject, html, text }),
        });

        if (!res.ok) {
            const body = await res.text();
            logger.error({ to, subject, status: res.status, body }, "Email send failed");
            return false;
        }

        logger.info({ to, subject }, "📧 Email sent");
        return true;
    } catch (err) {
        logger.error({ err, to, subject }, "Email send error");
        return false;
    }
}

// ─── Templates ──────────────────────────────────────────────────────────────

export function welcomeEmail(email: string): SendEmailOpts {
    return {
        to: email,
        subject: "Welcome to TryIt4U! ✨",
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:system-ui,-apple-system,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:32px">
    <span style="font-size:32px">✨</span>
    <h1 style="color:#e2e8f0;font-size:24px;margin:12px 0 0">Welcome to TryIt4U</h1>
  </div>
  <div style="background:#1a1a2e;border-radius:12px;padding:24px;border:1px solid rgba(124,58,237,0.2)">
    <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 16px">
      You're in! 🎉 You now have <strong style="color:#a78bfa">5 free AI try-ons</strong> waiting for you.
    </p>
    <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 16px">
      Install the Chrome extension, visit any fashion store, and try on clothes, glasses, or shoes using just your photo.
    </p>
    <div style="text-align:center;margin:24px 0">
      <a href="https://tryit4u.ai" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#7c3aed,#a78bfa);color:white;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
        Get Started →
      </a>
    </div>
  </div>
  <p style="color:#475569;font-size:12px;text-align:center;margin-top:24px">
    TryIt4U — AI-Powered Virtual Try-On · <a href="https://tryit4u.ai" style="color:#7c3aed">tryit4u.ai</a>
  </p>
</div>
</body>
</html>`,
        text: "Welcome to TryIt4U! You have 5 free AI try-ons. Visit tryit4u.ai to get started.",
    };
}

export function paymentReceiptEmail(email: string, plan: string, credits: number): SendEmailOpts {
    return {
        to: email,
        subject: `Payment confirmed — ${credits} try-ons added ✅`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:system-ui,-apple-system,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:32px">
    <span style="font-size:32px">✅</span>
    <h1 style="color:#e2e8f0;font-size:24px;margin:12px 0 0">Payment Confirmed</h1>
  </div>
  <div style="background:#1a1a2e;border-radius:12px;padding:24px;border:1px solid rgba(52,211,153,0.2)">
    <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 8px">
      Plan: <strong style="color:#34d399">${plan}</strong>
    </p>
    <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 16px">
      Credits added: <strong style="color:#34d399">${credits} try-ons</strong>
    </p>
    <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0">
      Your credits have been added to your account. Happy styling! 💃
    </p>
  </div>
  <p style="color:#475569;font-size:12px;text-align:center;margin-top:24px">
    TryIt4U — <a href="https://tryit4u.ai" style="color:#7c3aed">tryit4u.ai</a>
  </p>
</div>
</body>
</html>`,
        text: `Payment confirmed: ${plan} — ${credits} try-ons added to your account.`,
    };
}

export function referralRewardEmail(email: string, newCredits: number): SendEmailOpts {
    return {
        to: email,
        subject: `You earned ${newCredits} free try-ons! 🎁`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:system-ui,-apple-system,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:32px">
    <span style="font-size:32px">🎁</span>
    <h1 style="color:#e2e8f0;font-size:24px;margin:12px 0 0">Referral Reward!</h1>
  </div>
  <div style="background:#1a1a2e;border-radius:12px;padding:24px;border:1px solid rgba(251,191,36,0.2)">
    <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 16px">
      Someone used your referral code! You just earned <strong style="color:#fbbf24">${newCredits} free try-ons</strong>.
    </p>
    <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0">
      Keep sharing your code to earn even more free credits. 🚀
    </p>
  </div>
</div>
</body>
</html>`,
        text: `Referral reward! You earned ${newCredits} free try-ons. Keep sharing!`,
    };
}
