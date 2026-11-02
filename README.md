# RishtaCV files (GitHub repo root)
index.html, admin.html, privacy.html, about.html, terms.html, contact.html, package.json, vercel.json,
api/index.js   <- inside a folder named api   (ocr.js is no longer used: delete it from GitHub)

# Vercel > Settings > Environment Variables (then Redeploy)
FIREBASE_SERVICE_ACCOUNT (Secret) = full JSON key    CRON_SECRET (Secret) = any long random text
Optional (defaults already set): PRICE=150, WINDOW_SEC=120, RECEIVER_LAST4=4734, RECEIVER_NAME=Mohzam, KEEP_DAYS=90, ADMIN_EMAILS=mohzammajeed@gmail.com
Framework Preset: Other. Build/Output/Install commands: empty.

# Firebase: Auth (Google + Email/Password) on, authorized domain rishtacv.vercel.app, Firestore created, firestore.rules published.
# Admin panel: https://rishtacv.vercel.app/admin  (sign in with the admin Gmail)
