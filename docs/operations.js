(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./persistence.js').createProductionPricingModel():root.FitPPStore.createProductionPricingModel(),typeof module==='object'&&module.exports?require('./group-period-model.js'):root.FitPPGroupPeriods);if(typeof module==='object'&&module.exports)module.exports=api;else root.FitPPOperations=api})(globalThis,(E,G)=>{'use strict';
const ENV=typeof module==='object'&&module.exports?require('./runtime-config.js'):globalThis.FitPPEnvironment;
const UID=ENV.workspace.ownerUid,MAIN=ENV.workspace.path,copy=x=>JSON.parse(JSON.stringify(x)),stable=E.fingerprint;
const need=(ok,message)=>{if(!ok)throw Error(message)},today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date());
function guard(db,uid){ENV.assertProject(db.app.options.projectId,uid)}
function metadata(raw,uid){need(raw.ownerUid===uid&&raw.datasetId==='personal-v1'&&raw.schemaVersion===1,'OWNER_METADATA');E.read(raw)}
function groupFor(trainer,id){const s=G.validate(trainer.groupScheduleV1,UID),g=s.groups.find(g=>g.id===id);need(g,'Выберите существующую группу');return g}
function coversGroup(sub,g){return E.subscriptionTerms(sub).locations.includes(g.location)}
function apply(raw,trainer,action,day){let next=E.read(copy(raw));const a=copy(action),c=next.clients.find(c=>c.id===a.clientId);
if(a.type==='client'){
need(a.editingId!=null||next.clients.length<500,'Достигнут предел 500 клиентов');need(a.editingId!=null||ENV.validClientId(a.newId),'CLIENT_ID_INVALID');need(a.editingId!=null||typeof a.newId==='string'&&a.newId.length>0&&!next.clients.some(c=>c.id===a.newId),'CLIENT_ID_REUSED');next=E.reduce(next,a,day);
}else if(a.type==='subscription'){
const g=groupFor(trainer,a.homeGroupId);
if(a.visit?.requireAttendance){
  const {workoutId,date,location}=a.visit;
  const w=next.workouts[workoutId]||G.merge(next,G.validate(trainer.groupScheduleV1,UID),UID).workouts[workoutId];
  need(c&&w&&!w.cancelled&&w.date===date&&w.location===location&&date<=day,'Занятие изменилось. Обновите журнал');
  need(!E.availableSubscriptions(c,location,date).length,'У клиента уже есть действующий абонемент. Обновите журнал');
  if(!next.workouts[w.id])next.workouts[w.id]=copy(w);
}
next=E.reduce(next,a,day);const client=next.clients.find(c=>c.id===a.clientId),sub=client.subscriptions.find(s=>s.saleOperationId===a.operationId);need(sub,'Нет подтверждённой продажи');need(coversGroup(sub,g),'Тариф не действует в выбранной группе');need(!sub.homeGroupId||sub.homeGroupId===g.id,'Основная группа продажи уже сохранена');sub.homeGroupId=g.id;
}else if(a.type==='attendance'){
need(c&&!c.archivedAt,'Клиент недоступен');const w=next.workouts[a.workoutId]||G.merge(next,G.validate(trainer.groupScheduleV1,UID),UID).workouts[a.workoutId];if(w&&!next.workouts[w.id])next.workouts[w.id]=copy(w);need(w&&!w.cancelled&&w.date===a.date&&w.location===a.location,'Выберите сохранённое неотменённое занятие');need(a.date<=day,'Нельзя списать занятие за будущую тренировку');need(['attended','missed',null].includes(a.status),'Недопустимая отметка');const before=next.visits[w.id]?.[c.id]||null;
if(before===a.status)return next;
need(!Object.hasOwn(next.attendance[w.date]||{},c.id)||next.legacyLinks[w.date+'/'+c.id],'Сначала требуется явная сверка старой отметки');
const available=E.availableSubscriptions(c,w.location,w.date,next.visitOps[w.id]?.[c.id]?.subscriptionId);
if(a.status==='missed')need(available.length>0,'Нет действующего абонемента. Оформите абонемент или разовую оплату через Был');
if(a.singlePayment){need(a.status==='attended'&&!available.length,'Разовая оплата доступна только для Был без абонемента');need(!before,'Сначала снимите прежнюю отметку');need(['cash','transfer'].includes(a.method)&&Number.isFinite(a.received)&&a.received>=0,'Укажите оплату');}
next=E.reduce(next,{...a,status:a.status===null?before:a.status},day);
if(a.singlePayment){const charged=next.clients.find(c=>c.id===a.clientId),due=E.debt(charged);need(a.received>=due,'Недоплата: запись не сохранена');if(a.received>0)next=E.reduce(next,{type:'debtPayment',clientId:a.clientId,received:a.received,method:a.method,paymentDate:a.paymentDate},day);}
}else if(a.type==='template'){
need(['save','archive'].includes(a.mode),'Неизвестное действие с шаблоном');next=E.reduce(next,a,day);
need(stable(next.clients)===stable(E.read(raw).clients)&&stable(next.finances)===stable(E.read(raw).finances),'CATALOG_HISTORY_CHANGED');
}else if(a.type==='singlePrices'){
next=E.reduce(next,a,day);
need(stable(next.clients)===stable(E.read(raw).clients)&&stable(next.finances)===stable(E.read(raw).finances),'CATALOG_HISTORY_CHANGED');
}else if(a.type==='workout'){
need(['add','move','cancel','resume'].includes(a.mode),'Неизвестное действие с занятием');
const merged=G.merge(next,trainer.groupScheduleV1,UID),before=merged.workouts[a.workoutId];
if(a.mode!=='add')need(before,'Занятие не найдено');
if(a.mode==='move'&&before?.periodId)merged.workouts[a.workoutId].originTime=before.originTime||before.time;
const changed=E.reduce(merged,a,day);
next.workouts[a.workoutId]=changed.workouts[a.workoutId];
}else if(a.type==='taxPayment'){
next=E.reduce(next,a,day);
const withoutTax=value=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='taxPayments'));
need(stable(withoutTax(next))===stable(withoutTax(E.read(raw))),'TAX_HISTORY_CHANGED');
}else if(['extendSubscription','freeze','unfreeze','cancelSubscription','editSubscription','refund','debtPayment','archiveClient','restoreClient','deleteClient','rentMonth','deleteRentMonth','financeMonth','classifyLegacy'].includes(a.type))next=E.reduce(next,a,day);
else if(a.type==='assignHomeGroup'){
need(c&&!c.archivedAt,'Клиент недоступен');const sub=c.subscriptions?.find(s=>s.id===a.subscriptionId),g=groupFor(trainer,a.groupId);need(sub&&stable(sub)===a.expectedSubscription,'Абонемент изменён. Обновите данные');need(!sub.homeGroupId||sub.homeGroupId===g.id,'Основная группа уже назначена');need(coversGroup(sub,g),'Абонемент не действует в этой группе');sub.homeGroupId=g.id;
}else throw Error('Эта операция ещё не подключена');
E.read(next);return next;
}
const operationCollections=['operations','paymentReceipts'];
function operationPath(collection,id){return 'fitppWorkspaces/personal-v1/'+collection+'/'+id}
function paymentEntries(before,after,clientId){
  const previous=before.clients.find(c=>c.id===clientId)?.money?.entries||[];
  const current=after.clients.find(c=>c.id===clientId)?.money?.entries||[];
  const ids=new Set(previous.map(e=>e.id));
  return current.filter(e=>!ids.has(e.id)&&['sale','cancel','refund','debtPayment','legacy'].includes(e.kind));
}
// Keep the existing receipt keys and preserve the original action signature for retries.
function matchesSignature(receipt,signature){
  if(receipt.signature===signature)return true;
  try {
    const {personalNotificationsV1,...request}=JSON.parse(receipt.signature);
    return Array.isArray(personalNotificationsV1)&&stable(request)===signature;
  }catch{return false}
}
function notificationEvents(before,after,action){
  if(!['subscription','attendance'].includes(action.type)||!ENV.validClientId(String(action.clientId??'')))return [];
  const client=after.clients.find(c=>c.id===action.clientId);
  if(!client)return [];
  const events=[];
  if(action.type==='subscription'){
    const sub=client.subscriptions?.find(s=>s.saleOperationId===action.operationId);
    if(sub)events.push({kind:'purchase',subscriptionId:sub.id,sessions:sub.terms.sessions,
      expires:sub.expires,remaining:sub.left});
  }
  const visit=action.type==='subscription'?action.visit:action;
  const status=action.type==='subscription'?'attended':action.status;
  if(!visit||!['attended','missed'].includes(status))return events;
  const old=before.visitOps?.[visit.workoutId]?.[action.clientId];
  const op=after.visitOps?.[visit.workoutId]?.[action.clientId];
  if(!op?.operationId||old?.operationId===op.operationId||op.status!==status||
     after.visits?.[visit.workoutId]?.[action.clientId]!==status)return events;
  const sub=client.subscriptions?.find(s=>s.id===op.subscriptionId);
  const details=sub?{subscriptionId:sub.id,remaining:sub.left}:op.moneyChargeId?{price:op.price}:null;
  if(details)events.push({kind:status,workoutId:visit.workoutId,visitId:op.operationId,date:visit.date,...details});
  return events;
}
async function execute({db,uid,expectedFingerprint,action,operationDay=today(),session=()=>uid,confirm}){
guard(db,uid);need(action&&typeof action.type==='string','ACTION_REQUIRED');need(operationDay===today(),'Дата изменилась. Обновите данные');need(/^[a-zA-Z0-9-]{1,100}$/.test(action.operationId||''),'OPERATION_ID_REQUIRED');const signature=stable({action,operationDay}),ref=db.doc(MAIN),trainerRef=db.doc('trainers/'+uid),bookingRef=db.doc('fitppWorkspaces/personal-v1/states/bookings');
const operationRefs=operationCollections.map(collection=>db.doc(operationPath(collection,action.operationId)));
const transact=()=>db.runTransaction(async tx=>{need(session()===uid,'SESSION_CHANGED');const [m,t,b,operation,payment]=await Promise.all([ref,trainerRef,bookingRef,...operationRefs].map(r=>tx.get(r)));need(m.exists&&t.exists&&b.exists,'SOURCE_MISSING');const raw=m.data(),trainer=t.data(),bookings=b.data();metadata(raw,uid);need(bookings.ownerUid===uid&&bookings.datasetId==='personal-v1','BOOKINGS_METADATA');const prior=operation.data()||payment.data()||raw.mutationReceipts?.[action.operationId];if(prior){need(matchesSignature(prior,signature),'OPERATION_ID_REUSED');return {revision:raw._fitppRevision,duplicate:true}}
need(stable(E.read(raw))===expectedFingerprint,'Данные изменены. Обновите страницу перед повтором');let candidate,patch,bookingPatch;
if(action.type==='workout'){
const schedule=G.merge(E.read(raw),trainer.groupScheduleV1,uid),w=schedule.workouts[action.workoutId];
const booked=(date,location)=>Object.entries(bookings.entries||{}).some(([key,value])=>{if(value!==true)return false;try{const parts=JSON.parse(key);return parts[1]===date&&parts[2]===location}catch{return false}});
if(action.mode==='move'&&w&&action.date!==w.date)need(!booked(w.date,w.location),'На занятие есть записи. Сейчас можно изменить время; перенос даты требует отдельного переноса записей.');
if(action.mode==='add'&&Object.values(schedule.workouts).some(w=>!w.cancelled&&w.date===action.date&&w.location===action.location))need(!booked(action.date,action.location),'На эту дату и локацию уже есть занятие с записями. Второе занятие сделает записи неоднозначными.');
}
if(action.type==='booking'){
const parts=JSON.parse(action.key);
need(Array.isArray(parts)&&JSON.stringify(parts)===action.key&&ENV.validClientId(parts[0])&&typeof action.desired==='boolean','BOOKING_ACTION_REJECTED');
const [clientId,scope,location]=parts, target=action.workout;
// Journal keys name a workout; older booking keys name a date and location.
const exact=parts.length===2;
need(exact ? target&&typeof scope==='string'&&scope===target.id : parts.length===3&&['zarya','pole','online'].includes(location),'BOOKING_ACTION_REJECTED');
if(!exact)E.dayNumber(scope);
const c=raw.clients.find(c=>(target?String(c.id):c.id)===clientId);
need((target&&!action.desired)||c&&!c.archivedAt,'Клиент недоступен');
const entries={...bookings.entries},versions={...(bookings.versions||{})},version=versions[action.key]||0;
need(version===action.expectedVersion,'UI_REVISION_CONFLICT');
if((entries[action.key]===true)===action.desired)return {revision:raw._fitppRevision,duplicate:true};
const current=E.read(raw);
if(action.desired||target&&!exact){
  const merged=G.merge(current,trainer.groupScheduleV1,uid);
  if(target){
    const w=Object.hasOwn(merged.workouts,target.id)&&merged.workouts[target.id];
    need(w&&w.date===target.date&&w.location===target.location,'WORKOUT_UNAVAILABLE');
    const sameDay=Object.values(merged.workouts).filter(item=>item.location===w.location&&item.date===w.date);
    const active=sameDay.filter(item=>!item.cancelled);
    if(action.desired){
      need(exact&&!w.cancelled&&c.locations?.includes(w.location),'WORKOUT_UNAVAILABLE');
      if(active.length===1&&entries[JSON.stringify([clientId,w.date,w.location])]===true)return {revision:raw._fitppRevision,duplicate:true};
    }else{
      const matching=active.length?active:sameDay;
      need(scope===w.date&&location===w.location&&matching.length===1&&matching[0].id===w.id,'WORKOUT_UNAVAILABLE');
    }
  }else need(E.workoutsOn(merged,location,scope).some(w=>!w.cancelled),'WORKOUT_UNAVAILABLE');
}
if(action.desired)entries[action.key]=true;else delete entries[action.key];
need(Object.keys(entries).length<=500,'Достигнут предел 500 записей');versions[action.key]=version+1;
// The journal leaves subscription and attendance data untouched.
candidate=target?current:E.bookingFreeze(current,action.key,action.desired,entries)||current;
bookingPatch={entries,versions,revision:(bookings.revision||0)+1};
}else if(action.type==='schedulePeriod'){throw Error('Используйте сохранение периода в разделе Группы');
const g=groupFor(trainer,action.group);need(['zarya','pole','online'].includes(g.location),'Для этой группы не задана совместимая учётная локация');const original=G.validate(trainer.groupScheduleV1,uid);need(action.start>=operationDay,'Период не может начинаться в прошлом');const known=[...Object.values(raw.workouts||{}).map(w=>({...w,source:'main'})),...Object.values(trainer.workouts||{}).filter(w=>!raw.workouts?.[w.id]).map(w=>({...w,source:'trainers'}))];let count=0;const next=G.addPeriod(original,action,known,()=>action.operationId+'-'+(++count));
const added=next.workouts.filter(w=>!original.workouts.some(o=>o.id===w.id));candidate=E.read(copy(raw));for(const w of added){w.id=w.location+'_extra_'+w.id;w.extra=true;for(const o of Object.values(candidate.workouts)){if(o.cancelled)continue;const distance=Math.abs(Date.parse(o.date+'T'+o.time+':00Z')-Date.parse(w.date+'T'+w.time+':00Z'));need(distance>=75*60000||distance===0&&((o.location==='online')!==(w.location==='online')),'Занятия пересекаются или нет перерыва 15 минут')}candidate.workouts[w.id]=copy(w)}next.revision++;G.validate(next,uid);patch={groupScheduleV1:next};E.read(candidate);
}else {if(action.type==='deleteClient')need(!G.referenced([trainer,bookings],{id:action.clientId,name:'\u0000'}),'У клиента есть связанные записи. Используйте архивирование');candidate=apply(raw,trainer,action,operationDay);}
if(!bookingPatch&&stable(candidate)===stable(E.read(raw)))return {revision:raw._fitppRevision,duplicate:true};
const entries=paymentEntries(raw,candidate,action.clientId);
const index=entries.length?1:0,collection=operationCollections[index],revision=raw._fitppRevision+1;
const notifications=notificationEvents(raw,candidate,action);
const receiptSignature=notifications.length?stable({action,operationDay,personalNotificationsV1:notifications}):signature;
const receipt={signature:receiptSignature,type:action.type,at:Date.now(),revision};
if(entries.length)Object.assign(receipt,{clientId:action.clientId,entries});
const lastOperation={id:action.operationId,collection};
need(session()===uid,'SESSION_CHANGED');
const update={...candidate,_fitppRevision:revision,lastOperation};
metadata({...raw,...update},uid);
tx.update(ref,update);
tx.set(operationRefs[index],receipt);
if(patch)tx.update(trainerRef,patch);
if(bookingPatch)tx.update(bookingRef,bookingPatch);
return {revision,duplicate:false,index,receiptSignature,trainerRevision:patch?.groupScheduleV1?.revision};
});
let outcome;
try{outcome=await transact()}catch(error){
  // The rules can see a concurrent winner before Firestore reports a transaction conflict.
  if(error.code!=='permission-denied')throw error;
  need(session()===uid,'SESSION_CHANGED');
  const receipts=await Promise.all(operationRefs.map(r=>r.get({source:'server'})));
  need(session()===uid,'SESSION_CHANGED');
  const prior=receipts.find(s=>s.exists&&!s.metadata?.fromCache&&!s.metadata?.hasPendingWrites)?.data();
  if(!prior)throw error;
  need(matchesSignature(prior,signature),'OPERATION_ID_REUSED');
  outcome={revision:prior.revision,duplicate:true};
}
need(session()===uid,'SESSION_CHANGED');const verify=s=>s.exists&&!s.metadata?.fromCache&&!s.metadata?.hasPendingWrites&&(s.data()._fitppRevision||0)>=outcome.revision;
let snap=await ref.get({source:'server'});if(!verify(snap))snap=await new Promise((resolve,reject)=>{let done=false,stop=()=>{};const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);stop();error?reject(error):resolve(value)};const timer=setTimeout(()=>finish(Error('Запись могла сохраниться. Серверное подтверждение не получено; обновите данные перед повтором')),10000);stop=ref.onSnapshot({includeMetadataChanges:true},s=>{try{need(session()===uid,'SESSION_CHANGED');if(verify(s))finish(null,s)}catch(e){finish(e)}},e=>finish(e));if(done)stop()});
need(session()===uid,'SESSION_CHANGED');if(confirm){if(outcome.trainerRevision)await confirm(trainerRef,'groupScheduleV1',outcome.trainerRevision,session);}metadata(snap.data(),uid);if(!outcome.duplicate){
  const receipt=await operationRefs[outcome.index].get({source:'server'});
  need(session()===uid,'SESSION_CHANGED');
  need(receipt.exists&&!receipt.metadata?.fromCache&&!receipt.metadata?.hasPendingWrites&&
    receipt.data().signature===outcome.receiptSignature&&receipt.data().revision===outcome.revision,'Результат операции не подтверждён');
}return snap.data();
}
return Object.freeze({execute,apply,today,MAIN,UID,operationPath});});
