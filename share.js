const{db,FV,HttpError,route}=require('./_lib');const crypto=require('crypto');
// Creates a private, unguessable link /p/<id> with a snapshot of the CV (isPaid decides the watermark)
module.exports=route(async(u,b)=>{const cv=await db.doc(`users/${u.uid}/cvs/${String(b.cvId||'')}`).get();if(!cv.exists)throw new HttpError(404,'CV not found');
const d=cv.data();['paidAt','tid','method'].forEach(k=>delete d[k]);const id=crypto.randomBytes(8).toString('hex');
await db.doc(`shares/${id}`).set({...d,isPaid:!!d.isPaid,sharedAt:FV.serverTimestamp()});return{id}});
