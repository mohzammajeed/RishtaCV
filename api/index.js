// ONE file handles all server routes: /api/start-payment, /api/submit-receipt, /api/report-failed,
// /api/share, /api/admin-list, /api/admin-unlock
const crypto=require('crypto');
const E=process.env,PRICE=+E.PRICE||150,WINDOW=(+E.WINDOW_SEC||300)*1000;
const L4={easypaisa:E.EASYPAISA_LAST4||'',jazzcash:E.JAZZCASH_LAST4||''};
const ADMINS=(E.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
let admin,db,FV;
function init(){if(db)return;admin=require('firebase-admin');
if(!admin.apps.length){const raw=(E.FIREBASE_SERVICE_ACCOUNT||'').trim();if(!raw)throw new HttpError(500,'FIREBASE_SERVICE_ACCOUNT is not set in Vercel');
let sa;try{sa=JSON.parse(raw.startsWith('{')?raw:Buffer.from(raw,'base64').toString())}catch(e){throw new HttpError(500,'FIREBASE_SERVICE_ACCOUNT is not valid JSON')}
admin.initializeApp({credential:admin.credential.cert(sa)})}
db=admin.firestore();FV=admin.firestore.FieldValue}
class HttpError extends Error{constructor(c,m){super(m);this.code=c}}
const isAdmin=u=>!!u.token.email_verified&&ADMINS.includes(u.email.toLowerCase());
const MON=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
// Receipt time is shown in Pakistan time (UTC+5); returns epoch ms or null
function parseTime(t){const m=t.match(/(\d{1,2})[\s\/.-]+([A-Za-z]{3,9}|\d{1,2})[\s\/.,-]+(\d{4})[\s,at-]*(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?/);if(!m)return null;let[,d,mo,y,h,mi,ap]=m;mo=isNaN(mo)?MON.indexOf(mo.slice(0,3).toLowerCase())+1:+mo;if(!mo)return null;h=+h;if(ap){ap=ap.toLowerCase();if(ap=='pm'&&h<12)h+=12;if(ap=='am'&&h==12)h=0}return Date.UTC(+y,mo-1,+d,h,+mi)-5*3600e3}
function parse(text){const t=text.replace(/[\u200e\u200f]/g,''),am=t.match(/(?:rs\.?|pkr)\s*([\d,]+(?:\.\d{1,2})?)/i),id=t.match(/(?:transaction\s*id|trans\w*\s*id|tid|trx\s*id)\D{0,15}(\d{8,14})/i);return{amount:am?parseFloat(am[1].replace(/,/g,'')):null,tid:id?id[1]:null,time:parseTime(t),text:t}}
async function ocr(b64){const{createWorker}=require('tesseract.js');const w=await createWorker('eng',1,{cachePath:'/tmp'});try{return(await w.recognize(Buffer.from(b64,'base64'))).data.text}finally{await w.terminate()}}
async function fail(ref,reason,img){await ref.update({status:reason==='unreadable'?'pending':'failed',reason,...(img?{img}:{})});return{ok:false,reason}}
const H={
'start-payment':async(u,b)=>{const cvId=String(b.cvId||''),cv=cvId?await db.doc(`users/${u.uid}/cvs/${cvId}`).get():null;
if(!cv||!cv.exists)throw new HttpError(404,'CV not found');if(cv.get('isPaid'))throw new HttpError(409,'This CV is already paid');
const ref=await db.collection('attempts').add({uid:u.uid,email:u.email,cvId,method:['easypaisa','jazzcash'].includes(b.method)?b.method:'jazzcash',startedAt:FV.serverTimestamp(),status:'pending'});
return{attemptId:ref.id,seconds:WINDOW/1000,price:PRICE}},
// OCR runs here on the server, so the browser can never fake the result
'submit-receipt':async(u,b)=>{const ref=db.doc(`attempts/${b.attemptId}`),s=await ref.get(),image=b.image;
if(!s.exists||s.get('uid')!==u.uid)throw new HttpError(403,'Bad attempt');if(s.get('status')!=='pending')throw new HttpError(409,'Attempt closed');
if(typeof image!=='string'||image.length>8e5)throw new HttpError(400,'Image too large');
const start=s.get('startedAt').toMillis(),now=Date.now();if(now-start>WINDOW+15000)return fail(ref,'expired');
let p;try{p=parse(await ocr(image))}catch(e){console.error('OCR error',e);return fail(ref,'unreadable',image)}
if(p.amount==null||!p.tid||p.time==null)return fail(ref,'unreadable',image);
if(p.amount!==PRICE)return fail(ref,'wrong_amount',image);
const l4=L4[s.get('method')];if(l4&&!p.text.replace(/\D/g,'').includes(l4))return fail(ref,'wrong_receiver',image);
if(p.time<start-60000||p.time>now+60000)return fail(ref,'old_receipt',image);
try{await db.runTransaction(async t=>{const pr=db.doc(`payments/${p.tid}`);if((await t.get(pr)).exists)throw new Error('used');
t.create(pr,{uid:u.uid,cvId:s.get('cvId'),at:FV.serverTimestamp(),by:'ocr'});
t.update(db.doc(`users/${u.uid}/cvs/${s.get('cvId')}`),{isPaid:true,paidAt:FV.serverTimestamp(),tid:p.tid,method:'ocr'});
t.update(ref,{status:'paid',tid:p.tid})})}catch(e){if(e.message==='used')return fail(ref,'tid_used');throw e}
return{ok:true}},
'report-failed':async(u,b)=>{const ref=db.doc(`attempts/${b.attemptId}`),s=await ref.get();if(!s.exists||s.get('uid')!==u.uid)throw new HttpError(403,'Bad attempt');
await ref.update({reported:true,typedTid:String(b.tid||'').replace(/\D/g,'').slice(0,14),reportedAt:FV.serverTimestamp()});return{ok:true}},
'share':async(u,b)=>{const cv=await db.doc(`users/${u.uid}/cvs/${String(b.cvId||'')}`).get();if(!cv.exists)throw new HttpError(404,'CV not found');
const d=cv.data();['paidAt','tid','method'].forEach(k=>delete d[k]);const id=crypto.randomBytes(8).toString('hex');
await db.doc(`shares/${id}`).set({...d,isPaid:!!d.isPaid,sharedAt:FV.serverTimestamp()});return{id}},
'admin-list':async u=>{if(!isAdmin(u))throw new HttpError(403,'Admin only');
const q=await db.collection('attempts').where('reported','==',true).limit(100).get();
return{items:q.docs.filter(d=>d.get('status')!=='paid').map(d=>({id:d.id,email:d.get('email'),cvId:d.get('cvId'),reason:d.get('reason')||'',typedTid:d.get('typedTid')||'',img:d.get('img')||''}))}},
'admin-unlock':async(u,b)=>{if(!isAdmin(u))throw new HttpError(403,'Admin only');
const ref=db.doc(`attempts/${b.attemptId}`),s=await ref.get();if(!s.exists)throw new HttpError(404,'No attempt');const tid=s.get('typedTid')||'';
await db.runTransaction(async t=>{if(tid){const pr=db.doc(`payments/${tid}`);if((await t.get(pr)).exists)throw new HttpError(409,'TID already used');t.create(pr,{uid:s.get('uid'),cvId:s.get('cvId'),at:FV.serverTimestamp(),by:'admin'})}
t.update(db.doc(`users/${s.get('uid')}/cvs/${s.get('cvId')}`),{isPaid:true,paidAt:FV.serverTimestamp(),method:'admin',...(tid?{tid}:{})});t.update(ref,{status:'paid'})});return{ok:true}}
};
async function handler(req,res){
try{if(req.method!=='POST')throw new HttpError(405,'POST only');
const name=(req.url||'').split('?')[0].split('/').filter(Boolean).pop(),fn=H[name];if(!fn)throw new HttpError(404,'Unknown route: '+name);
init();const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))throw new HttpError(401,'Login required');
const tok=await admin.auth().verifyIdToken(h.slice(7));
res.status(200).json(await fn({uid:tok.uid,email:tok.email||'',token:tok},req.body||{}))}
catch(e){console.error(e);const c=e instanceof HttpError?e.code:String(e.code||'').startsWith('auth/')?401:500;res.status(c).json({error:e.message||'Server error'})}}
module.exports=handler;module.exports.parse=parse;
