# RishtaCV files (GitHub repo root)
index.html, admin.html, privacy.html, about.html, terms.html, contact.html, sitemap.xml, 404.html, package.json, vercel.json,
BingSiteAuth.xml, google10a9247aa276c6b6.txt (search engine verification files, keep them)
favicon.ico, favicon-16.png, favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png, icon-maskable-512.png, site.webmanifest  (website icon set, repo root)
api/index.js and api/_ocr.js   <- both inside the folder named api   (the OCR reader is api/_ocr.js; an old ocr.js, if you still have one, can be deleted)

# Vercel > Settings > Environment Variables (then Redeploy)
FIREBASE_SERVICE_ACCOUNT (Secret) = full JSON key    CRON_SECRET (Secret) = any long random text
Optional (defaults already set): PRICE=150, WINDOW_SEC=120, RECEIVER_LAST4=4734, RECEIVER_NAME=Mohzam, KEEP_DAYS=90, ADMIN_EMAILS=mohzammajeed@gmail.com
Framework Preset: Other. Build/Output/Install commands: empty.

# Firebase: Auth (Google + Email/Password) on, authorized domain rishtacv.vercel.app, Firestore created, firestore.rules published.
# Admin panel: https://rishtacv.vercel.app/admin  (sign in with the admin Gmail). It is hidden from search engines.
# Search: https://rishtacv.vercel.app/sitemap.xml is served automatically. Submit it in Google Search Console and Bing Webmaster Tools.
# Payment screenshots are read by the built-in OCR (tesseract.js, free, no API key). The first check after a quiet period can take 10-30 seconds. Test it in /admin, section 3.
# 404.html is the page shown for any wrong address (Vercel uses it automatically).

# What the app offers
Four designs: Islamic, Normal professional, Biodata, Job CV. Urdu and English. Download PDF or PNG.
Share link (WhatsApp). 15-second MP4 video (free = watermark, paid = no watermark), made on the user's device.
