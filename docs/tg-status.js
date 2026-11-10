(()=>{'use strict';
document.addEventListener('alpine:init',()=>Alpine.store('tgStatus',{ids:[],state:'loading'}));
document.addEventListener('DOMContentLoaded',()=>{
const status=Alpine.store('tgStatus');let stop=()=>{},generation=0;
try{const app=firebase.app(FitPPEnvironment.appName);FitPPEnvironment.assertProject(app.options.projectId,FitPPEnvironment.workspace.ownerUid);
app.auth().onAuthStateChanged(user=>{stop();const epoch=++generation;status.ids=[];status.state='loading';if(!user||user.uid!==FitPPEnvironment.workspace.ownerUid){status.state='unavailable';return}
stop=app.firestore().doc('fitppWorkspaces/personal-v1/notificationBindings/telegram').onSnapshot({includeMetadataChanges:true},snap=>{
if(epoch!==generation)return;if(snap.metadata.fromCache||snap.metadata.hasPendingWrites){status.ids=[];status.state='loading';return}
const data=snap.exists?snap.data():null,rows=data?.bindings;
const valid=data?.version===1&&Array.isArray(rows)&&rows.every(b=>FitPPEnvironment.validClientId(b.clientId));
status.ids=valid?rows.map(b=>b.clientId):[];status.state=valid?'ready':'unavailable';
},()=>{if(epoch===generation){status.ids=[];status.state='unavailable'}});
});}catch{status.ids=[];status.state='unavailable'}
});
})();
