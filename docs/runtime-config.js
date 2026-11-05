(function(root,factory){const p=typeof module==='object'&&module.exports?require('./personal-profile.js'):root.FitPPProfile;const e=factory(p);if(typeof module==='object'&&module.exports)module.exports=e;else{root.FitPPEnvironment=e;root.FitPPFirebaseConfig=e.firebase;root.FitPPRuntime=e.runtime}})(globalThis,p=>{
'use strict';
if(!p||!['emulator','cloud'].includes(p.mode)||!p.ownerUid||!p.firebase?.projectId)throw Error('PERSONAL_PROFILE_REQUIRED');
if(['fitpp-test','fitpp-165a2'].includes(p.firebase.projectId))throw Error('EXISTING_PROJECT_FORBIDDEN');
const emulator=p.mode==='emulator';if(emulator&&!p.firebase.projectId.startsWith('demo-')||!emulator&&p.firebase.projectId.startsWith('demo-'))throw Error('PROFILE_MODE_MISMATCH');
const firebase=Object.freeze({...p.firebase});
const workspace=Object.freeze({ownerUid:p.ownerUid,datasetId:'personal-v1',schemaVersion:1,path:'fitppWorkspaces/personal-v1/states/main',bookingPath:'fitppWorkspaces/personal-v1/states/bookings',calendarBookingsPath:'fitppWorkspaces/personal-v1/calendarBookings'});
const runtime=Object.freeze({mode:'test-workspace-ui',salesMode:'catalog',catalogEnabled:true,catalogActivationEnabled:false,namespace:'fitpp-personal:'+firebase.projectId+':'+workspace.ownerUid});
function assertProject(projectId,uid){if(projectId!==firebase.projectId||uid!==workspace.ownerUid)throw Error('PROJECT_OR_OWNER_REJECTED')}
function validClientId(id){return typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id)&&!['__proto__','prototype','constructor'].includes(id)}
return Object.freeze({name:'personal',production:false,testWorkspace:true,writesEnabled:true,emulator,firebase,workspace,runtime,appName:'fitpp-personal',assertProject,validClientId});
});
