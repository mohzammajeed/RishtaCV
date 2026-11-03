// ONE file handles all server routes (Vercel: /api/<name>)
const crypto=require('crypto');
const E=process.env,PRICE=+E.PRICE||150,WINDOW=(+E.WINDOW_SEC||120)*1000,DAYS=+E.KEEP_DAYS||90;
const L4=E.RECEIVER_LAST4||'4734',RNAME=(E.RECEIVER_NAME||'Mohzam').toLowerCase();
const ADMINS=(E.ADMIN_EMAILS||'mohzammajeed@gmail.com').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
class HttpError extends Error{constructor(c,m){super(m);this.code=c}}
let admin,db,FV,KEY='';
function init(){if(db)return;admin=require('firebase-admin');
if(!admin.apps.length){const raw=(E.FIREBASE_SERVICE_ACCOUNT||'').trim();if(!raw)throw new HttpError(500,'FIREBASE_SERVICE_ACCOUNT is not set in Vercel');
let sa;try{sa=JSON.parse(raw.startsWith('{')?raw:Buffer.from(raw,'base64').toString())}catch(e){throw new HttpError(500,'FIREBASE_SERVICE_ACCOUNT is not valid JSON')}
KEY=sa.private_key||'';admin.initializeApp({credential:admin.credential.cert(sa)})}
db=admin.firestore();FV=admin.firestore.FieldValue}
const isAdmin=u=>!!u.token.email_verified&&ADMINS.includes(u.email.toLowerCase());
const needAdmin=u=>{if(!isAdmin(u))throw new HttpError(403,'Admin only')};
const PROMPT='This is a screenshot of a Pakistani mobile wallet payment receipt (Easypaisa or JazzCash). Read it and reply with JSON only, with exactly these keys: {"is_receipt":true or false,"success":true or false (the payment completed),"amount":number or null (amount sent, e.g. 150),"transaction_id":string of digits or null (may be labelled "ID#", "TID", "Trx ID" or "Transaction ID"),"datetime":"YYYY-MM-DD HH:mm" in 24-hour time exactly as printed on the receipt, or null,"receiver_name":string or null (the account the money was sent TO),"receiver_number":string of digits or null (the number the money was sent TO),"looks_edited":true or false}';
// Gemini (free Google AI Studio key) reads the receipt image and returns structured data
async function readReceipt(b64){const key=E.GEMINI_API_KEY;if(!key)throw new HttpError(500,'GEMINI_API_KEY is not set in Vercel');
const models=[E.GEMINI_MODEL,'gemini-3.5-flash','gemini-flash-latest'].filter(Boolean);let last='';
for(const m of models){const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,{method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:PROMPT},{inline_data:{mime_type:'image/jpeg',data:b64}}]}],generationConfig:{responseMimeType:'application/json',temperature:0}}),signal:AbortSignal.timeout(40000)});
const j=await r.json().catch(()=>({}));if(!r.ok){last=(j.error&&j.error.message)||('HTTP '+r.status);if(r.status===404||r.status===400)continue;throw new Error(last)}
const t=((j.candidates&&j.candidates[0]&&j.candidates[0].content&&j.candidates[0].content.parts)||[]).map(x=>x.text||'').join('');return JSON.parse(t.replace(/```json|```/g,'').trim())}
throw new Error(last||'Gemini unavailable')}
// receipt time is Pakistan time (UTC+5)
function pkt(dt){const m=String(dt||'').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);return m?Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5])-5*3600e3:null}
async function fail(ref,reason,img){await ref.update({status:reason==='unreadable'?'pending':'failed',reason,img});return{ok:false,reason}}
const cvRef=(uid,id)=>db.doc(`users/${uid}/cvs/${String(id||'x')}`);
const shareId=(uid,id)=>crypto.createHmac('sha256',KEY||'rishtacv').update(uid+':'+id).digest('hex').slice(0,16);
const H={
'start-payment':async(u,b)=>{const cv=await cvRef(u.uid,b.cvId).get();if(!cv.exists)throw new HttpError(404,'CV not found');if(cv.get('isPaid'))throw new HttpError(409,'This CV is already paid');
const ref=await db.collection('attempts').add({uid:u.uid,email:u.email,cvId:String(b.cvId),startedAt:FV.serverTimestamp(),status:'pending'});return{attemptId:ref.id,seconds:WINDOW/1000,price:PRICE}},
// OCR runs on the server, so the browser can never fake the result. The screenshot is always saved for you to review.
'submit-receipt':async(u,b)=>{const ref=db.doc(`attempts/${b.attemptId}`),s=await ref.get(),image=b.image;
if(!s.exists||s.get('uid')!==u.uid)throw new HttpError(403,'Bad attempt');if(s.get('status')==='paid'||s.get('status')==='failed')throw new HttpError(409,'Attempt closed');
if(typeof image!=='string'||image.length>8e5)throw new HttpError(400,'Image too large');
const start=s.get('startedAt').toMillis(),now=Date.now();if(now-start>WINDOW+15000)return fail(ref,'expired',image);
let p;try{p=await readReceipt(image)}catch(e){console.error('Receipt AI error',e);if(e instanceof HttpError)throw e;return fail(ref,e instanceof SyntaxError?'unreadable':'ocr_unavailable',image)}
const tid=String(p.transaction_id||'').replace(/\D/g,''),amt=Number(p.amount),time=pkt(p.datetime);
if(!p.is_receipt||p.success===false||!/^\d{10,13}$/.test(tid)||!(amt>0)||time==null)return fail(ref,'unreadable',image);
if(amt!==PRICE)return fail(ref,'wrong_amount',image);
const rn=String(p.receiver_number||'').replace(/\D/g,''),nm=String(p.receiver_name||'').toLowerCase();
if(!rn.endsWith(L4)&&!nm.includes(RNAME))return fail(ref,'wrong_receiver',image);
if(time<start-60000||time>now+60000)return fail(ref,'old_receipt',image);
const hash=crypto.createHash('sha256').update(image).digest('hex');
try{await db.runTransaction(async t=>{const pr=db.doc(`payments/${tid}`),hr=db.doc(`imgHashes/${hash}`),[a,c]=await Promise.all([t.get(pr),t.get(hr)]);
if(a.exists)throw new Error('tid_used');if(c.exists)throw new Error('duplicate_image');
t.create(pr,{uid:u.uid,cvId:s.get('cvId'),at:FV.serverTimestamp(),by:'ocr'});t.create(hr,{uid:u.uid,at:FV.serverTimestamp()});
t.update(cvRef(u.uid,s.get('cvId')),{isPaid:true,paidAt:FV.serverTimestamp(),tid:tid,method:'ocr'});
t.update(ref,{status:'paid',tid:tid,img:image})})}catch(e){if(e.message==='tid_used'||e.message==='duplicate_image')return fail(ref,e.message,image);throw e}
return{ok:true}},
// One private link per CV (same id every time, so it is updated, not duplicated)
'share':async(u,b)=>{const cv=await cvRef(u.uid,b.cvId).get();if(!cv.exists)throw new HttpError(404,'CV not found');
const d=cv.data();['paidAt','tid','method'].forEach(k=>delete d[k]);const id=shareId(u.uid,b.cvId);
await db.doc(`shares/${id}`).set({...d,isPaid:!!d.isPaid,sharedAt:FV.serverTimestamp()});return{id}},
'delete-cv':async(u,b)=>{await cvRef(u.uid,b.cvId).delete();await db.doc(`shares/${shareId(u.uid,b.cvId)}`).delete();return{ok:true}},
// ---- admin panel ----
'admin-list':async(u,b)=>{needAdmin(u);const q=await db.collection('attempts').orderBy('startedAt','desc').limit(150).get(),em=String(b.q||'').toLowerCase(),st=b.status||'';
return{items:q.docs.map(d=>({id:d.id,uid:d.get('uid'),email:d.get('email')||'',cvId:d.get('cvId'),status:d.get('status'),reason:d.get('reason')||'',at:d.get('startedAt')?d.get('startedAt').toMillis():0,hasImg:!!d.get('img')})).filter(x=>(!em||x.email.toLowerCase().includes(em))&&(!st||x.status===st))}},
'admin-image':async(u,b)=>{needAdmin(u);const s=await db.doc(`attempts/${b.attemptId}`).get();return{img:s.exists?s.get('img')||'':''}},
'admin-cvs':async(u,b)=>{needAdmin(u);let usr;try{usr=await admin.auth().getUserByEmail(String(b.email||'').trim())}catch(e){throw new HttpError(404,'No user with that email')}
const q=await db.collection(`users/${usr.uid}/cvs`).select('name','isPaid').get();return{uid:usr.uid,items:q.docs.map(d=>({id:d.id,name:d.get('name')||'',isPaid:!!d.get('isPaid')}))}},
'admin-unlock':async(u,b)=>{needAdmin(u);await cvRef(b.uid,b.cvId).update({isPaid:true,paidAt:FV.serverTimestamp(),method:'admin'});
if(b.attemptId)await db.doc(`attempts/${b.attemptId}`).update({status:'paid',by:'admin'});return{ok:true}},
'admin-revoke':async(u,b)=>{needAdmin(u);await cvRef(b.uid,b.cvId).update({isPaid:false,paidAt:FV.delete(),method:FV.delete(),tid:FV.delete()});return{ok:true}}
};
async function handler(req,res){
try{const name=(req.url||'').split('?')[0].split('/').filter(Boolean).pop();
// daily cleanup (Vercel Cron): deletes payment screenshots older than KEEP_DAYS
if(name==='cleanup'){if(!E.CRON_SECRET||req.headers.authorization!=='Bearer '+E.CRON_SECRET)throw new HttpError(401,'Not allowed');init();
const q=await db.collection('attempts').where('startedAt','<',admin.firestore.Timestamp.fromMillis(Date.now()-DAYS*864e5)).limit(400).get(),bt=db.batch();q.docs.forEach(d=>bt.delete(d.ref));await bt.commit();return res.status(200).json({deleted:q.size})}
if(req.method!=='POST')throw new HttpError(405,'POST only');const fn=H[name];if(!fn)throw new HttpError(404,'Unknown route: '+name);
init();const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))throw new HttpError(401,'Login required');
const tok=await admin.auth().verifyIdToken(h.slice(7));
res.status(200).json(await fn({uid:tok.uid,email:tok.email||'',token:tok},req.body||{}))}
catch(e){console.error(e);const c=e instanceof HttpError?e.code:String(e.code||'').startsWith('auth/')?401:500;res.status(c).json({error:e.message||'Server error'})}}
module.exports=handler;module.exports.readReceipt=readReceipt;module.exports.pkt=pkt;
