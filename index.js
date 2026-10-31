const {onCall,HttpsError}=require('firebase-functions/v2/https');
const admin=require('firebase-admin');admin.initializeApp();
const db=admin.firestore(),FV=admin.firestore.FieldValue,E=process.env;
const PRICE=+E.PRICE||150,WINDOW=(+E.WINDOW_SEC||300)*1000,L4={easypaisa:E.EASYPAISA_LAST4||'',jazzcash:E.JAZZCASH_LAST4||''};
const ADMINS=(E.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
const opt={memory:'1GiB',timeoutSeconds:120};
const need=r=>{if(!r.auth)throw new HttpsError('unauthenticated','Login required');return r.auth};
const isAdmin=a=>ADMINS.includes((a.token.email||'').toLowerCase());
const MON=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
// Receipt time is shown in Pakistan time (UTC+5); returns epoch ms or null
function parseTime(t){const m=t.match(/(\d{1,2})[\s\/.-]+([A-Za-z]{3,9}|\d{1,2})[\s\/.,-]+(\d{4})[\s,at-]*(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?/);if(!m)return null;let[,d,mo,y,h,mi,ap]=m;mo=isNaN(mo)?MON.indexOf(mo.slice(0,3).toLowerCase())+1:+mo;if(!mo)return null;h=+h;if(ap){ap=ap.toLowerCase();if(ap=='pm'&&h<12)h+=12;if(ap=='am'&&h==12)h=0}return Date.UTC(+y,mo-1,+d,h,+mi)-5*3600e3}
function parse(text){const t=text.replace(/[\u200e\u200f]/g,''),am=t.match(/(?:rs\.?|pkr)\s*([\d,]+(?:\.\d{1,2})?)/i),id=t.match(/(?:transaction\s*id|trans\w*\s*id|tid|trx\s*id)\D{0,15}(\d{8,14})/i);return{amount:am?parseFloat(am[1].replace(/,/g,'')):null,tid:id?id[1]:null,time:parseTime(t),text:t}}
async function ocr(b64){const{createWorker}=require('tesseract.js');const w=await createWorker('eng',1,{cachePath:'/tmp'});try{return(await w.recognize(Buffer.from(b64,'base64'))).data.text}finally{await w.terminate()}}
async function fail(ref,reason,img){await ref.update({status:reason==='unreadable'?'pending':'failed',reason,...(img?{img}:{})});return{ok:false,reason}}

// 1) User taps "Pay": start the timer (server clock) for ONE specific CV
exports.startPayment=onCall(async r=>{const a=need(r),cvId=String(r.data.cvId||'');const cv=await db.doc(`users/${a.uid}/cvs/${cvId}`).get();if(!cv.exists)throw new HttpsError('not-found','CV not found');if(cv.get('isPaid'))throw new HttpsError('already-exists','This CV is already paid');const ref=await db.collection('attempts').add({uid:a.uid,email:a.token.email||'',cvId,method:['easypaisa','jazzcash'].includes(r.data.method)?r.data.method:'jazzcash',startedAt:FV.serverTimestamp(),status:'pending'});return{attemptId:ref.id,seconds:WINDOW/1000,price:PRICE}});

// 2) User uploads receipt (base64 JPEG, resized in browser): OCR runs on the SERVER so it cannot be tampered with
exports.submitReceipt=onCall(opt,async r=>{const a=need(r),{attemptId,image}=r.data,ref=db.doc(`attempts/${attemptId}`),s=await ref.get();
if(!s.exists||s.get('uid')!==a.uid)throw new HttpsError('permission-denied','Bad attempt');if(s.get('status')!=='pending')throw new HttpsError('failed-precondition','Attempt closed');
if(typeof image!=='string'||image.length>8e5)throw new HttpsError('invalid-argument','Image too large');
const start=s.get('startedAt').toMillis(),now=Date.now();if(now-start>WINDOW+15000)return fail(ref,'expired');
let p;try{p=parse(await ocr(image))}catch(e){return fail(ref,'unreadable',image)}
if(p.amount==null||!p.tid||p.time==null)return fail(ref,'unreadable',image);
if(p.amount!==PRICE)return fail(ref,'wrong_amount',image);
const l4=L4[s.get('method')];if(l4&&!p.text.replace(/\D/g,'').includes(l4))return fail(ref,'wrong_receiver',image);
if(p.time<start-60000||p.time>now+60000)return fail(ref,'old_receipt',image);
try{await db.runTransaction(async t=>{const pr=db.doc(`payments/${p.tid}`);if((await t.get(pr)).exists)throw new Error('used');
t.create(pr,{uid:a.uid,cvId:s.get('cvId'),at:FV.serverTimestamp(),by:'ocr'});
t.update(db.doc(`users/${a.uid}/cvs/${s.get('cvId')}`),{isPaid:true,paidAt:FV.serverTimestamp(),tid:p.tid,method:'ocr'});
t.update(ref,{status:'paid',tid:p.tid})})}catch(e){if(e.message==='used')return fail(ref,'tid_used');throw e}
return{ok:true}});

// 3) OCR could not read it: user taps "Report on WhatsApp" (the website opens wa.me with TID + email prefilled)
exports.reportFailed=onCall(async r=>{const a=need(r),ref=db.doc(`attempts/${r.data.attemptId}`),s=await ref.get();if(!s.exists||s.get('uid')!==a.uid)throw new HttpsError('permission-denied','Bad attempt');
await ref.update({reported:true,typedTid:String(r.data.tid||'').replace(/\D/g,'').slice(0,14),reportedAt:FV.serverTimestamp()});return{ok:true}});

// 4) /admin page
exports.adminList=onCall(async r=>{if(!isAdmin(need(r)))throw new HttpsError('permission-denied','Admin only');
const q=await db.collection('attempts').where('reported','==',true).limit(100).get();
return q.docs.filter(d=>d.get('status')!=='paid').map(d=>({id:d.id,email:d.get('email'),cvId:d.get('cvId'),reason:d.get('reason')||'',typedTid:d.get('typedTid')||'',img:d.get('img')||''}))});
exports.adminUnlock=onCall(async r=>{if(!isAdmin(need(r)))throw new HttpsError('permission-denied','Admin only');
const ref=db.doc(`attempts/${r.data.attemptId}`),s=await ref.get();if(!s.exists)throw new HttpsError('not-found','No attempt');const tid=s.get('typedTid')||'';
await db.runTransaction(async t=>{if(tid){const pr=db.doc(`payments/${tid}`);if((await t.get(pr)).exists)throw new HttpsError('already-exists','TID already used');t.create(pr,{uid:s.get('uid'),cvId:s.get('cvId'),at:FV.serverTimestamp(),by:'admin'})}
t.update(db.doc(`users/${s.get('uid')}/cvs/${s.get('cvId')}`),{isPaid:true,paidAt:FV.serverTimestamp(),method:'admin',...(tid?{tid}:{})});t.update(ref,{status:'paid'})});return{ok:true}});
