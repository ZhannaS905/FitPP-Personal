(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./group-period-model.js'):root.FitPPGroupPeriods);if(typeof module==='object'&&module.exports)module.exports=api;else root.FitPPGroupWriter=api})(globalThis,G=>{'use strict';
// Cloud CRUD approved by the owner on 2026-10-29. No other writes are enabled.
async function execute({db,uid,mainPath,bookingPath,expected,op,session=()=>uid}){
const environment=(typeof module==='object'&&module.exports?require('./runtime-config.js'):globalThis.FitPPEnvironment);
environment.assertProject(db.app.options.projectId,uid);
const workspace=environment.workspace;
if(!op||!['create','edit','delete','periodCreate','periodEdit','periodDelete'].includes(op.type)||Object.keys(op).some(k=>!['type','id','name','description','group','start','end','slots'].includes(k)))throw Error('GROUP_ACTION_REJECTED');
if(mainPath!==workspace.path||bookingPath!==workspace.bookingPath)throw Error('PATH_REJECTED');
const trainerPath='trainers/'+uid,token=session();if(token!==uid)throw Error('SESSION_CHANGED');
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.keys(x).sort().reduce((a,k)=>(a[k]=x[k],a),{}):x);
return db.runTransaction(async tx=>{if(session()!==token)throw Error('SESSION_CHANGED');const refs=[mainPath,trainerPath,bookingPath].map(p=>db.doc(p)),snaps=await Promise.all(refs.map(r=>tx.get(r)));if(snaps.some(s=>!s.exists))throw Error('SOURCE_MISSING');const [main,trainer,bookings]=snaps.map(s=>s.data());if(main.ownerUid!==uid||bookings.ownerUid!==uid||main.datasetId!==workspace.datasetId||bookings.datasetId!==workspace.datasetId)throw Error('OWNER_METADATA');if(stable(trainer.groupScheduleV1)!==stable(expected))throw Error('SOURCE_CHANGED');const {groupScheduleV1,...history}=trainer,next=op.type.startsWith('period')?G.mutatePeriod(groupScheduleV1,op,[main,history,bookings]):G.mutateGroup(groupScheduleV1,op,[main,history,bookings]);if(session()!==token)throw Error('SESSION_CHANGED');tx.update(refs[1],{groupScheduleV1:next});return next});
}
return Object.freeze({execute});});
