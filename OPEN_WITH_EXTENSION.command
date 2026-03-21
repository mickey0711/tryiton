#!/bin/bash
# ─── TryItOn — פתח Chrome עם ה-Extension טעון ─────────────────────────────────

EXTENSION_PATH="/Users/mickeycohen/Desktop/TryItOn/apps/extension/dist"

echo "🚀 פותח Chrome עם TryItOn Extension..."
echo ""

# בדוק שה-dist קיים
if [ ! -f "$EXTENSION_PATH/manifest.json" ]; then
  echo "❌ Extension לא בנוי. בונה עכשיו..."
  cd /Users/mickeycohen/Desktop/TryItOn/apps/extension
  npm run build
  echo ""
fi

# פתח Chrome עם ה-Extension
open -na "Google Chrome" --args \
  --load-extension="$EXTENSION_PATH" \
  --new-window \
  "https://www.zara.com/il/he/woman-new-l1180.html"

echo "✅ Chrome נפתח עם TryItOn Extension!"
echo ""
echo "👉 עכשיו:"
echo "   1. לחץ על סמל הפאזל 🧩 בסרגל Chrome (פינה ימנית עליונה)"
echo "   2. או לחץ ישירות על סמל TryItOn ✨"
echo "   3. העלה סלפי → בחר מוצר → לחץ 'Will This Fit Me?'"
