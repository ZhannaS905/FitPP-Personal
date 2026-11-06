(()=>{'use strict';function start(){
const W=FitPPWorkspace;let currentUser=null,generation=0,attendanceRevision=0,initError=null;const listeners=new Set();
const locked=()=>{throw Error('Эта операция не включена. Разрешено только операции личной CRM.')};
function notice(message){let el=document.getElementById('firebase-connection');if(!el){el=document.createElement('aside');el.id='firebase-connection';el.className='max-w-4xl mx-auto px-4 py-3 text-sm';el.setAttribute('role','status');document.querySelector('header')?.before(el)}el.textContent=message}
const ready=(async()=>{try{
if(!globalThis.firebase)throw Error('Firebase Web SDK не загрузился. Проверьте соединение с www.gstatic.com.');
const app=firebase.initializeApp(FitPPFirebaseConfig,FitPPEnvironment.appName);
const nativeAuth=app.auth();const firestore=app.firestore();
if(FitPPEnvironment.emulator){if(!['localhost','127.0.0.1'].includes(location.hostname))throw Error('EMULATOR_LOCALHOST_ONLY');nativeAuth.useEmulator('http://127.0.0.1:19457',{disableWarnings:true});firestore.useEmulator('127.0.0.1',19456);}
await nativeAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
nativeAuth.onAuthStateChanged(user=>{currentUser=user;generation++;notice(user?'FitPP · вход выполнен · загрузка данных…':'FitPP · войдите существующим email и паролем. Данные ещё не загружены.');for(const fn of listeners)fn(user)},error=>{initError=error;notice('Ошибка Firebase Auth: '+error.message)});
return {nativeAuth,firestore};
}catch(e){initError=e;queueMicrotask(()=>notice('Ошибка подключения: '+e.message));throw e}})();ready.catch(()=>{});
const auth={get currentUser(){return currentUser},get sessionGeneration(){return generation},persistenceWarning:'FitPP · группы, расходы, продажи и посещаемость подключены',onAuthStateChanged(fn){listeners.add(fn);ready.then(()=>{if(currentUser)fn(currentUser)}).catch(()=>fn(null));return()=>listeners.delete(fn)},async signInWithEmailAndPassword(email,password){return (await ready).nativeAuth.signInWithEmailAndPassword(email,password)},async signOut(){generation++;currentUser=null;for(const fn of listeners)fn(null);return (await ready).nativeAuth.signOut()}};
function check(){if(initError)throw initError;if(!currentUser)throw Error('Требуется вход в Firebase Auth');if(currentUser.uid!==W.ownerUid)throw Error('Этот аккаунт не является владельцем существующей рабочей области FitPP. Доступ не расширялся.')}
async function read(path){check();const epoch=generation;try{const {firestore}=await ready;const snap=await firestore.doc(path).get({source:'server'});check();if(epoch!==generation)throw Error('Сессия изменилась. Повторите загрузку.');if(!snap.exists)throw Error('Документ отсутствует: '+path);return snap}catch(e){if(epoch===generation)notice('Ошибка чтения FitPP: '+(e.code||'')+' '+e.message);throw e}}
const ref={path:W.path,async get(){const snap=await read(W.path);W.validate(snap.data());attendanceRevision=snap.data().attendanceRevision||0;document.getElementById('firebase-connection')?.remove();return snap}};
async function saveGroup(expected,op){
check();FitPPEnvironment.assertProject(W.projectId,currentUser.uid);
if(navigator.onLine===false)throw Error('Нет сети. Группа не отправлена; повторите после подключения.');
const epoch=generation,owner=currentUser.uid,assertSession=()=>{check();if(epoch!==generation||currentUser.uid!==owner)throw Error('SESSION_CHANGED');return owner};
const {firestore}=await ready;assertSession();
const committed=await FitPPGroupWriter.execute({db:firestore,uid:owner,mainPath:W.path,bookingPath:'fitppWorkspaces/personal-v1/states/bookings',expected,op,session:assertSession});
assertSession();let verified;try{const confirmed=await FitPPExpenses.confirmedRead(firestore.doc('trainers/'+owner),'groupScheduleV1',committed.revision,assertSession);verified=confirmed.data();FitPPGroupPeriods.validate(verified.groupScheduleV1,owner)}catch(e){const error=Error('Запись отправлена, но серверное подтверждение недоступно. Обновите список перед повтором; операция могла сохраниться.');error.code='GROUP_SAVE_UNCONFIRMED';throw error}
assertSession();window.dispatchEvent(new CustomEvent('fitpp-groups-confirmed',{detail:{ownerUid:owner,generation:epoch,history:verified}}));
const actual=verified.groupScheduleV1,match=op.type.startsWith('period')?JSON.stringify(actual,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)===JSON.stringify(committed,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v):op.type==='delete'?!actual.groups.some(g=>g.id===op.id):actual.groups.some(g=>g.id===op.id&&g.name===String(op.name).trim().replace(/\s+/g,' ')&&(g.description||'')===String(op.description||'').trim());
if(!match)throw Error('Список изменился после сохранения. Показана текущая серверная версия.');
notice('FitPP · группы сохранены и прочитаны с сервера');return actual;
}
async function saveExpense(expected,op){
check();FitPPEnvironment.assertProject(W.projectId,currentUser.uid);
if(navigator.onLine===false)throw Error('Нет сети. Расход не отправлен.');const epoch=generation,owner=currentUser.uid,session=()=>{check();if(epoch!==generation||currentUser.uid!==owner)throw Error('SESSION_CHANGED');return owner};const {firestore}=await ready;session();return FitPPExpenses.execute({db:firestore,uid:owner,expected,op,session});
}
async function commitAction(request){check();FitPPEnvironment.assertProject(W.projectId,currentUser.uid);if(navigator.onLine===false)throw Error('Нет сети. Действие не отправлено.');const epoch=generation,owner=currentUser.uid,session=()=>{check();if(epoch!==generation||currentUser.uid!==owner)throw Error('SESSION_CHANGED');return owner};const {firestore}=await ready;session();const value=await FitPPOperations.execute({db:firestore,uid:owner,...request,session,confirm:FitPPExpenses.confirmedRead});session();attendanceRevision=value.attendanceRevision||0;if(['schedulePeriod'].includes(request.action.type)){const history=(await read('trainers/'+owner)).data();session();window.dispatchEvent(new CustomEvent('fitpp-groups-confirmed',{detail:{ownerUid:owner,generation:epoch,history}}))}return value;}
function watchHistory(onValue,onError){check();const epoch=generation,owner=currentUser.uid;let stopped=false,unsubscribe=()=>{};
ready.then(({firestore})=>{if(stopped||epoch!==generation)return;unsubscribe=firestore.doc('trainers/'+owner).onSnapshot({includeMetadataChanges:true},snap=>{if(stopped||epoch!==generation||currentUser?.uid!==owner||snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;try{check();if(!snap.exists)throw Error('Документ групп отсутствует');FitPPGroupPeriods.validate(snap.data().groupScheduleV1,owner);onValue(snap.data())}catch(e){onError(e)}},e=>{if(!stopped&&epoch===generation)onError(e)})}).catch(e=>{if(!stopped&&epoch===generation)onError(e)});
return()=>{stopped=true;unsubscribe()};
}
async function readOperation(id){
check();if(!/^[a-zA-Z0-9-]{1,100}$/.test(id))throw Error('OPERATION_ID_REQUIRED');
const epoch=generation,{firestore}=await ready;
const refs=['operations','paymentReceipts'].map(collection=>firestore.doc(FitPPOperations.operationPath(collection,id)));
const results=await Promise.all(refs.map(r=>r.get({source:'server'})));
check();if(epoch!==generation||results.some(s=>s.metadata.fromCache||s.metadata.hasPendingWrites))throw Error('SESSION_CHANGED');
return results.find(s=>s.exists)?.data();
}
const db={doc(path){if(path!==W.path)throw Error('PATH_REJECTED');return ref},runTransaction:locked};
return Object.freeze({local:false,emulator:FitPPEnvironment.emulator,testWorkspace:true,production:false,projectId:W.projectId,catalogEnabled:true,writesEnabled:true,financeStageReady:true,commitAction,readOperation,expensesWritable:true,operationsWritable:true,bookingsWritable:true,groupsWritable:true,saveExpense,saveGroup,watchHistory,auth,db,check,validate:W.validate,reference(){check();return ref},async readSalesMode(){check();return 'catalog'},async requireCatalog(){await ref.get()},authorizeWrite:locked,activateCatalog:locked,get attendanceRevision(){return attendanceRevision},confirmAttendance:locked,async readBookings(keys){const epoch=generation;const snap=await read('fitppWorkspaces/personal-v1/states/bookings');if(epoch!==generation)throw Error('SESSION_CHANGED');const data=snap.data();if(data.ownerUid!==W.ownerUid||data.datasetId!==W.datasetId)throw Error('BOOKINGS_METADATA_REJECTED');return {...data,versions:data.versions||{}}},async readHistory(){return (await read('trainers/'+W.ownerUid)).data()},async setBooking(key,desired,expectedVersion,operationId,workout){check();const epoch=generation,raw=(await ref.get()).data();if(epoch!==generation)throw Error('SESSION_CHANGED');await commitAction({action:{type:'booking',key,desired,expectedVersion,operationId,...(workout?{workout}:{})},operationDay:FitPPOperations.today(),expectedFingerprint:FitPPStore.fingerprint(FitPPStore.read(raw))});return this.readBookings()}})
}globalThis.FitPPCloud=Object.freeze({start})})();
