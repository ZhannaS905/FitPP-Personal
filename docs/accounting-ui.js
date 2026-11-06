(()=>{'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let busy=false;
const app=()=>Alpine.$data(document.body),id=()=> 'op-'+crypto.randomUUID(),key=(c,s)=>c.id+'/'+s.id;
function editor(title,html,submit,label='Сохранить в Firebase'){
const dialog=document.querySelector('#dialog'),form=document.querySelector('#form');document.querySelector('#modal-title').textContent=title;document.querySelector('#fields').innerHTML=html;document.querySelector('#error').textContent='';const button=form.querySelector('[type=submit]'),close=document.querySelector('#close'),owner=FitPPApplication.workspace.auth.currentUser?.uid,epoch=FitPPApplication.workspace.auth.sessionGeneration;button.textContent=label;button.hidden=false;button.disabled=false;close.disabled=false;
form.onsubmit=async e=>{e.preventDefault();if(busy)return;try{if(owner!==FitPPApplication.workspace.auth.currentUser?.uid||epoch!==FitPPApplication.workspace.auth.sessionGeneration)throw Error('Сессия изменилась');busy=true;button.disabled=true;close.disabled=true;document.querySelector('#error').textContent='';const result=await submit(new FormData(form),e.submitter);if(result!==false){dialog.close();await app().reloadData();window.dispatchEvent(new Event('fitpp-schedule-refresh'))}}catch(e){document.querySelector('#error').textContent='Не сохранено. '+(e.code?e.code+': ':'')+e.message}finally{busy=false;button.disabled=false;close.disabled=false}};close.onclick=()=>{if(!busy)dialog.close()};dialog.oncancel=e=>{if(busy)e.preventDefault()};dialog.showModal();return form;
}
async function send(action){const a=app();if(!a.canEdit())throw Error('Дождитесь загрузки данных');const ok=await FitPPApplication.store.run({...action,operationId:action.operationId||id()});if(!ok)throw Error(a.syncError||'Сохранение не подтверждено');return true}
function subscription(cid,sid){const c=app().clients.find(c=>c.id===cid),s=c?.subscriptions?.find(s=>s.id===sid);if(!s)throw Error('Абонемент не найден');return {c,s,index:c.subscriptions.indexOf(s)}}
function markup(a,history){const groups=history?.groupScheduleV1?.groups||[];return '<section class="card"><h2>Продления абонементов</h2><p class="muted">Ручное продление — до 14 дней суммарно. Деньги и остатки не меняются.</p>'+a.clients.filter(c=>!c.archivedAt).flatMap(c=>(c.subscriptions||[]).map(s=>`<article class="rule"><strong>${esc(c.name)}</strong><p>До ${esc(s.expires)} · Остаток: ${esc(s.left)}</p><p>${esc(groups.find(g=>g.id===s.homeGroupId)?.name||'Основная группа не назначена')} · Ручное продление: ${esc(s.extensionDays||0)} из 14 дней</p><div class="actions"><button data-account="extend" data-client="${esc(c.id)}" data-sub="${esc(s.id)}" ${s.left>0?'':'disabled'}>Продлить</button><button data-account="home" data-client="${esc(c.id)}" data-sub="${esc(s.id)}" ${s.homeGroupId?'disabled':''}>Указать группу</button></div></article>`)).join('')+'</section>'}

async function extend(cid,sid){const {c,s,index}=subscription(cid,sid),remaining=FitPPStore.extensionRemaining(s),operationId=id();editor('Продлить абонемент',`<p>${esc(c.name)} · До ${esc(s.expires)} · Остаток ${s.left}</p><label>Дней<input name="days" aria-label="Дней продления" type="number" min="1" max="${remaining}" required></label><p>Лимит: ${remaining} дней. Оплаты и занятия сохраняются.</p>`,f=>send({operationId:operationId,type:'extendSubscription',clientId:cid,subscriptionIndex:index,expectedExpires:s.expires,expectedUsed:s.extensionDays||0,days:Number(f.get('days'))}))}
async function home(cid,sid){const {c,s}=subscription(cid,sid),h=await FitPPApplication.workspace.readHistory(),groups=(h.groupScheduleV1?.groups||[]).filter(g=>FitPPStore.subscriptionTerms(s).locations.includes(g.location));editor('Основная группа абонемента',`<p>${esc(c.name)}. Выберите явно — история автоматически не сопоставляется.</p><label>Группа<select name="group" required><option value="">Выберите группу</option>${groups.map(g=>`<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}</select></label>`,f=>send({type:'assignHomeGroup',clientId:cid,subscriptionId:sid,groupId:f.get('group'),expectedSubscription:FitPPStore.fingerprint(s)}))}
function periodEditor(group,groups){const g=groups.find(g=>g.id===group);editor('Новый период · '+g.name,`<label>Начало<input name="start" type="date" aria-label="Начало периода" required></label><label>Конец<input name="end" type="date" aria-label="Конец периода" required></label>${['Вс','Пн','Вт','Ср','Чт','Пт','Сб'].map((d,i)=>`<div class="slot"><label><input type="checkbox" name="days" value="${i}" ${g.slots.some(s=>s.day===i)?'checked':''}>${d}</label><input type="time" aria-label="Время ${d}" name="time${i}" value="${g.slots.find(s=>s.day===i)?.time||''}"></div>`).join('')}`,f=>send({type:'schedulePeriod',group,start:f.get('start'),end:f.get('end'),slots:f.getAll('days').map(d=>({day:Number(d),time:f.get('time'+d)}))}))}
async function workoutById(wid){const a=app(),workspace=FitPPApplication.workspace;if(a.workouts[wid])return a.workouts[wid];const owner=workspace.auth.currentUser?.uid,epoch=workspace.auth.sessionGeneration,h=await workspace.readHistory();if(owner!==workspace.auth.currentUser?.uid||epoch!==workspace.auth.sessionGeneration)throw Error('Сессия изменилась');return FitPPGroupPeriods.merge({workouts:a.workouts},h.groupScheduleV1,owner).workouts[wid]}
async function addPerson(wid){const w=await workoutById(wid);if(!w)return;editor('Клиент на занятии',`<label>Клиент<select name="client" required><option value="">Выберите клиента</option>${app().clients.filter(c=>!c.archivedAt&&(c.locations||[]).includes(w.location)).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label><p>Выбор добавляет строку в журнал. Занятие спишется только после отметки.</p>`,f=>{window.dispatchEvent(new CustomEvent('fitpp-manual-row',{detail:{workoutId:wid,clientId:f.get('client')}}));return true},'Добавить в журнал')}
async function mark(wid,cid,status){const a=app(),w=await workoutById(wid),c=a.clients.find(c=>c.id===cid);if(!w||!c)return;const current=a.visits[wid]?.[cid]||null,desired=current===status?null:status,op=a.visitOps[wid]?.[cid];const items=FitPPStore.availableSubscriptions(c,w.location,w.date,op?.subscriptionId);
if(desired==='attended'&&!items.length){
  const price=a.pricingSettings.singlePrices[w.location]/100;
  const due=Math.max(0,price-FitPPStore.balance(c))+FitPPStore.debt(c);
  const operationId=id();
  let settlement=null;
  const form=editor('Был · посещение',`<p>${esc(c.name)} · занятие ${price} ₽</p>
    <div class="visit-options">
      <button type="button" name="purchase" class="visit-purchase" ${current?'disabled':''}>Купить абонемент</button>
      <button type="button" data-settlement="pay" aria-pressed="false">Разовая оплата</button>
      <button type="button" data-settlement="debt" aria-pressed="false">В долг</button>
    </div>
    ${current?'<p>Чтобы купить абонемент для этой тренировки, сначала снимите текущую отметку.</p>':''}
    <p data-debt hidden>К оплате ${due} ₽ с учётом баланса и долга. Оплату можно принять позже.</p>
    <fieldset data-payment hidden disabled>
      <p>К оплате ${due} ₽ с учётом баланса и долга.</p>
      <label>Способ оплаты<select name="method" required><option value="">Выберите способ</option><option value="cash">Наличные</option><option value="transfer">Перевод</option></select></label>
      <label>Фактически получено, ₽<input name="received" type="number" min="0" step="0.01" value="${due}" required></label>
    </fieldset>`,async (f,button)=>{
      if(button?.name==='purchase'){
        await a.openSubModal(c,{workoutId:wid,clientId:cid,date:w.date,location:w.location,requireAttendance:true});
        if(a.showSubModal)form.closest('dialog').close();
        else if(a.syncError)throw Error(a.syncError);
        return false;
      }
      if(!settlement)return false;
      const singlePayment=settlement==='pay';
      return send({type:'attendance',workoutId:wid,date:w.date,location:w.location,clientId:cid,status:'attended',singlePayment,method:f.get('method'),received:Number(f.get('received')),paymentDate:FitPPOperations.today(),operationId});
    },'Сохранить посещение');
  const save=form.querySelector('[type=submit]');
  const payment=form.querySelector('[data-payment]');
  const debt=form.querySelector('[data-debt]');
  const choices=form.querySelectorAll('[data-settlement]');
  save.hidden=true;
  const purchase=form.querySelector('[name="purchase"]');
  purchase.onclick=()=>{
    if(busy)return;
    form.dispatchEvent(new SubmitEvent('submit',{cancelable:true,submitter:purchase}));
  };
  for(const button of choices)button.onclick=()=>{
    if(busy)return;
    settlement=button.dataset.settlement;
    for(const choice of choices)choice.setAttribute('aria-pressed',choice===button);
    payment.hidden=payment.disabled=settlement!=='pay';
    debt.hidden=settlement!=='debt';
    save.hidden=false;
  };
  return;
}
if(desired==='missed'&&!items.length){a.syncError='Для отметки Сгорело нужен действующий абонемент.';return}
const action={type:'attendance',workoutId:wid,date:w.date,location:w.location,clientId:cid,status:desired,operationId:id()};
if(current==='razov'&&!confirm('Отмена разового посещения вернёт стоимость на баланс клиента. Фактический возврат денег оформляется отдельно. Продолжить?'))return;
if(['attended','missed'].includes(desired)&&items.length>1){editor('С какого абонемента списать занятие?',`<label>Абонемент<select name="subscription" required>${items.map(i=>`<option value="${esc(i.key)}">До ${esc(i.sub.expires)} · ${i.sub.left} занятий</option>`).join('')}</select></label>`,f=>send({...action,subscriptionKey:f.get('subscription')}));return}
try{await send(action);window.dispatchEvent(new Event('fitpp-schedule-refresh'))}catch(e){a.syncError=e.message}}
function canManage(w){return !!w&&app().canManageWorkout(w)}
async function workoutEditor(mode,wid,date,location){
if(!app().canEdit())throw Error('Дождитесь загрузки данных');
const operationId=id(),w=wid?await workoutById(wid):null;
if(mode!=='add'&&!canManage(w))throw Error('Изменять можно только будущее занятие без отметок');
if(mode==='add'){
const h=await FitPPApplication.workspace.readHistory(),groups=(h.groupScheduleV1?.groups||[]).filter(g=>FitPPStore.schedule[g.location]);
editor('Дополнительное занятие',`<label>Локация<select name="location" required>${groups.map(g=>`<option value="${esc(g.location)}" ${g.location===location?'selected':''}>${esc(g.name)}</option>`).join('')}</select></label><label>Дата<input name="date" type="date" min="${FitPPOperations.today()}" value="${esc(date)}" required></label><label>Время<input name="time" type="time" required></label>`,f=>send({type:'workout',mode:'add',operationId,workoutId:f.get('location')+'_extra_'+operationId,location:f.get('location'),date:f.get('date'),time:f.get('time')}));return}
const base={type:'workout',mode,workoutId:wid,operationId};
if(mode==='move')editor('Перенести занятие',`<label>Дата<input name="date" type="date" min="${FitPPOperations.today()}" value="${esc(w.date)}" required></label><label>Время<input name="time" type="time" value="${esc(w.time)}" required></label>`,f=>send({...base,date:f.get('date'),time:f.get('time')}));
else editor(mode==='cancel'?'Отменить занятие':'Восстановить занятие',`<p>${esc(w.date)} · ${esc(w.time)}</p><p>${mode==='cancel'?'Подтвердите отмену занятия.':'Подтвердите восстановление занятия.'}</p>`,()=>send(base),'Подтвердить');
}
async function bookingList(wid){
const w=await workoutById(wid);if(!w)return;
const data=await FitPPApplication.workspace.readBookings([]),a=app(),people=FitPPCalendar.entries(a,data,w).filter(c=>c.booked);
editor('Записи на занятие',`<p>${esc(w.date)} · ${esc(w.time)}</p>${people.some(c=>c.ambiguousBooking)?'<p>На эту дату и локацию есть несколько занятий. Записи общие; отдельное занятие в них не указано.</p>':''}${people.map(c=>`<p>${esc(c.client?.name||'Клиент отсутствует в источнике')}</p>`).join('')||'<p>Записанных клиентов нет.</p>'}`,()=>true,'Закрыть');
}
document.getElementById('app').addEventListener('click',e=>{const b=e.target.closest('[data-account]');if(!b||b.disabled)return;const d=b.dataset;Promise.resolve(d.account==='bookings'?bookingList(d.workout):['add','move','cancel','resume'].includes(d.account)?workoutEditor(d.account,d.workout,d.date,d.location):d.account==='extend'?extend(d.client,d.sub):d.account==='home'?home(d.client,d.sub):d.account==='addPerson'?addPerson(d.workout):d.account==='mark'?mark(d.workout,d.client,d.status):null).catch(e=>{app().syncError=e.message})});
globalThis.FitPPAccountingUI=Object.freeze({markup,periodEditor,extend,canManage});})();
