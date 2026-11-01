# RishtaCV files (GitHub repo root must look like this)
index.html
admin.html
package.json
vercel.json
api/index.js        <- must be inside a folder named api

# Vercel > Project > Settings
- Framework Preset: Other. Leave Build Command, Output Directory and Install Command EMPTY. Root Directory: empty.
- Environment Variables (then Redeploy): FIREBASE_SERVICE_ACCOUNT (full JSON), PRICE=150, WINDOW_SEC=300,
  EASYPAISA_LAST4=7170, JAZZCASH_LAST4=4734, ADMIN_EMAILS=your admin gmail

# Firebase (paste firestore.rules in Firestore > Rules > Publish)
Enable Google + Email/Password login; add your Vercel domain in Authentication > Settings > Authorized domains.
Edit index.html: replace wa:'92XXXXXXXXXX' with your WhatsApp number.
