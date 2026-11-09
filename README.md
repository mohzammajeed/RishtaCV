# RishtaCV files (GitHub repo root)
index.html, admin.html, privacy.html, about.html, terms.html, contact.html, sitemap.xml, robots.txt, package.json, vercel.json,
BingSiteAuth.xml, google10a9247aa276c6b6.txt (search engine verification files, keep them)
api/index.js   <- inside a folder named api   (ocr.js is no longer used: delete it from GitHub)

# Vercel > Settings > Environment Variables (then Redeploy)
FIREBASE_SERVICE_ACCOUNT (Secret) = full JSON key    CRON_SECRET (Secret) = any long random text
GEMINI_API_KEY (Secret) = free Google AI Studio key (reads payment screenshots; payments cannot be checked without it)
Optional (defaults already set): GEMINI_MODEL, PRICE=150, WINDOW_SEC=120, RECEIVER_LAST4=4734, RECEIVER_NAME=Mohzam, KEEP_DAYS=90, ADMIN_EMAILS=mohzammajeed@gmail.com
Framework Preset: Other. Build/Output/Install commands: empty.

# Firebase: Auth (Google + Email/Password) on, authorized domain rishtacv.vercel.app, Firestore created, firestore.rules published.
# Admin panel: https://rishtacv.vercel.app/admin  (sign in with the admin Gmail). It is hidden from search engines.
# Search: https://rishtacv.vercel.app/sitemap.xml and /robots.txt are served automatically.
#   Submit the sitemap in Google Search Console and Bing Webmaster Tools.

# What the app offers
Four designs: Islamic, Normal professional, Biodata, Job CV. Urdu and English. Download PDF or PNG.
Share link (WhatsApp). 15-second MP4 video (free = watermark, paid = no watermark), made on the user's device.
