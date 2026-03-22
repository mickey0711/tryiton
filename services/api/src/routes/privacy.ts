import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>TryItOn — Privacy Policy</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 760px; margin: 40px auto; padding: 0 24px; color: #1a1a2e; line-height: 1.7; }
  h1 { color: #6366f1; }
  h2 { color: #4f46e5; margin-top: 32px; }
  p, li { color: #333; }
  a { color: #6366f1; }
  .updated { color: #888; font-size: 14px; }
</style>
</head>
<body>
<h1>TryItOn — Privacy Policy</h1>
<p class="updated">Last updated: March 22, 2026</p>

<p>TryItOn ("we", "us") is a Chrome extension that lets users virtually try on clothing, shoes, and furniture from any shopping website using AI. We are committed to protecting your privacy.</p>

<h2>1. Data We Collect</h2>
<ul>
  <li><strong>Profile photo:</strong> Optionally uploaded by the user for AI try-on. Stored locally on your device.</li>
  <li><strong>Body measurements:</strong> Extracted by AI from your full-body photo. Stored locally in Chrome storage.</li>
  <li><strong>Product images:</strong> Detected from the current shopping page and sent to our AI service for processing. Not stored permanently.</li>
  <li><strong>Account info (optional):</strong> If you sign in with Google or Facebook, we store your email and name to sync your wishlist.</li>
</ul>

<h2>2. How We Use Your Data</h2>
<ul>
  <li>To generate virtual try-on images using AI</li>
  <li>To provide size recommendations based on your measurements</li>
  <li>To save your wishlist and preferences</li>
</ul>
<p>We <strong>never</strong> sell your data to third parties.</p>

<h2>3. Permissions Used</h2>
<ul>
  <li><strong>activeTab</strong> — to detect product images on the current shopping page</li>
  <li><strong>scripting</strong> — to inject the TryItOn button on product pages</li>
  <li><strong>storage</strong> — to save your profile photo and settings locally on your device</li>
  <li><strong>identity</strong> — for optional Google sign-in</li>
  <li><strong>host permissions (&lt;all_urls&gt;)</strong> — to work on any shopping website (Amazon, IKEA, Zara, ASOS, etc.)</li>
</ul>

<h2>4. Third-Party Services</h2>
<ul>
  <li><strong>Replicate AI</strong> — processes product and user images to generate try-on results. Images are not stored by Replicate beyond processing.</li>
  <li><strong>Google OAuth / Facebook OAuth</strong> — for optional sign-in only.</li>
</ul>

<h2>5. Data Retention</h2>
<p>Your photos and measurements are stored locally on your device. If you delete the extension, all local data is removed. Server-side data (wishlist, account) can be deleted by contacting us.</p>

<h2>6. Your Rights</h2>
<p>You may request deletion of your account and all associated data at any time by emailing us.</p>

<h2>7. Contact</h2>
<p>For privacy questions: <a href="mailto:privacy@tryiton.app">privacy@tryiton.app</a></p>

<p style="margin-top:48px; color:#aaa; font-size:13px">© 2026 TryItOn. All rights reserved.</p>
</body>
</html>`);
});

export default router;
