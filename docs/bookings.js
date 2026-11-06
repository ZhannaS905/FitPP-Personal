(()=>{'use strict';
function accept(app,data){
  app.testBookings={...data.entries};
  app.bookingVersions={...app.bookingVersions,...(data.versions||{})};
  app.bookingReady=true;
}
async function refresh(app,w){
  if(app.bookingImportBusy){app.bookingRefreshPending=true;return;}
  app.bookingReady=false;app.bookingImportBusy=true;
  const epoch=w.auth.sessionGeneration;
  try{
    const data=await w.readBookings(app.clients.map(c=>app.bookingKey(c.id)));
    if(epoch!==w.auth.sessionGeneration)return;
    accept(app,data);
    app.bookingImportStatus=w.bookingsWritable?'Записи обновлены':'Записи MAX загружены. Посещения отмечаются в карточках.';
  }catch(e){
    if(epoch===w.auth.sessionGeneration)app.bookingImportStatus='Не удалось проверить записи: '+e.message;
  }finally{
    app.bookingImportBusy=false;
    if(app.bookingRefreshPending){app.bookingRefreshPending=false;await refresh(app,w);}
  }
}
async function toggle(app,w,id){
  if(!app.bookingReady||!app.canBook()||app.bookingImportBusy||app.attendanceSaving||!app.clients.some(c=>c.id===id))return;
  const key=app.bookingKey(id),desired=!app.isBooked(id),epoch=w.auth.sessionGeneration;
  if(desired&&!FitPPStore.workoutsOn(app.sessionData(),app.currentLocation,app.selectedDate).some(w=>!w.cancelled))return;
  app.bookingImportBusy=true;let error=null;
  try{
    const data=await w.setBooking(key,desired,app.bookingVersions?.[key]??0,crypto.randomUUID());
    if(epoch!==w.auth.sessionGeneration)return;
    accept(app,data);
    await app.refreshAfterBooking();
    if(epoch!==w.auth.sessionGeneration)return;
    app.bookingImportStatus=data.freezeNotice || 'Запись сохранена. Абонементы обновлены.';
  }catch(e){
    if(epoch===w.auth.sessionGeneration){error=e;app.bookingReady=false;app.bookingRefreshPending=true;}
  }finally{
    app.bookingImportBusy=false;
    if(app.bookingRefreshPending){app.bookingRefreshPending=false;await refresh(app,w);}
    if(error&&epoch===w.auth.sessionGeneration)app.bookingImportStatus=error.message==='UI_REVISION_CONFLICT'
      ? 'Запись изменена другим действием. Загружено актуальное состояние; проверьте его перед повторным нажатием.'
      : 'Результат действия требует проверки: '+error.message;
  }
}
function workoutKey(workoutId,clientId){
  return JSON.stringify([clientId,workoutId]);
}
async function saveWorkout(w,workout,key,desired,expectedVersion){
  const epoch=w.auth.sessionGeneration;
  const publish=data=>{
    if(epoch!==w.auth.sessionGeneration)throw Error('SESSION_CHANGED');
    window.dispatchEvent(new CustomEvent('fitpp-bookings-confirmed',{detail:{epoch,data}}));
  };
  try{
    const {id,date,location}=workout;
    publish(await w.setBooking(key,desired,expectedVersion,crypto.randomUUID(),{id,date,location}));
  }catch(error){
    if(epoch===w.auth.sessionGeneration){
      try{publish(await w.readBookings([]));}catch{}
    }
    throw error;
  }
}
globalThis.FitPPBookings=Object.freeze({refresh,toggle,workoutKey,saveWorkout});})();
