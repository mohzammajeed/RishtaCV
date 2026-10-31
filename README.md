# RishtaCV: setup (GitHub + Vercel + Firebase)

Folder layout (keep exactly this on GitHub):
index.html, admin.html, package.json, vercel.json, firestore.rules, .gitignore, .env.example, api/ (7 files, including share.js)

## A. Firebase (console.firebase.google.com, project rishta-cv)
1. Authentication > Sign-in method: enable **Google** and **Email/Password**.
2. Authentication > Settings > Authorized domains: add your Vercel domain (e.g. yoursite.vercel.app) and your own domain if any.
3. Firestore Database > Create database (production mode).
4. Firestore > Rules: paste the contents of firestore.rules > Publish.
5. Project settings > Service accounts > **Generate new private key**. Keep that file SECRET (never upload it to GitHub).

## B. Vercel (Project > Settings > Environment Variables)
- FIREBASE_SERVICE_ACCOUNT = the full contents of the downloaded JSON file
- PRICE=150, WINDOW_SEC=300, EASYPAISA_LAST4=7170, JAZZCASH_LAST4=4734
- ADMIN_EMAILS = your admin Gmail
Then Deployments > Redeploy.

## C. Edit index.html once
Find `wa:'92XXXXXXXXXX'` and put your WhatsApp number (country code, no +).

## D. Test
Login > New CV > Preview > Pay. Private link button gives /p/xxxx. Admin page: /admin
If you changed firestore.rules, publish it again in Firebase > Firestore > Rules.
