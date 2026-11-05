(()=>{
'use strict';
const environment=globalThis.FitPPEnvironment;
if(!environment)throw Error('ENVIRONMENT_REQUIRED');
environment.assertProject(globalThis.FitPPFirebaseConfig?.projectId,environment.workspace.ownerUid);
const projectId=environment.firebase.projectId,{ownerUid,datasetId,schemaVersion,path,bookingPath,calendarBookingsPath}=environment.workspace;
function validate(raw){if(!raw||raw.ownerUid!==ownerUid||raw.datasetId!==datasetId||raw.schemaVersion!==schemaVersion)throw Error('WORKSPACE_METADATA_REJECTED');FitPPStore.read(raw);return raw;}
globalThis.FitPPWorkspace=Object.freeze({projectId,ownerUid,datasetId,schemaVersion,path,bookingPath,calendarBookingsPath,productionStructure:environment.productionStructure,validate});
})();
