(()=>{'use strict';
const G=FitPPGroupPeriods,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),days=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
let uid=null,base=null,state=null,cloud=null,selected=null,existing=[],message='',ready=false,sources=[],saving=false,panelEpoch=0;
const key=()=> FitPPRuntime.namespace+':group-period-draft-v1:'+uid,cloudMode=()=>globalThis.FitPPApplication?.workspace?.groupsWritable===true;
const serial=value=>JSON.stringify(value,(_key,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.keys(x).sort().reduce((out,key)=>(out[key]=x[key],out),{}):x);
function refresh(){window.dispatchEvent(new Event('fitpp-schedule-refresh'))}
function load(ctx){
ready=ctx.sourceReady;existing=ctx.existing;sources=ctx.sources||[];
if(!ready)return;
const source=ctx.history?.groupScheduleV1??null,stamp=serial(source);
if(uid===ctx.ownerUid&&base===stamp&&state)return;
uid=ctx.ownerUid;base=stamp;message='';cloud=source?G.validate(source,uid):null;state=cloud?structuredClone(cloud):{...G.empty(uid),groups:[]};
try{const draft=JSON.parse(localStorage.getItem(key())||'null');if(draft){
if(cloudMode()&&serial(draft.state?.groups)!==serial(cloud?.groups))message='Есть прежний локальный черновик групп. Он не отправлен в Firebase. Для сохранения создайте или измените нужную группу заново.';
else if(draft.base!==base)message='Есть черновик прежней версии. Он сохранён на устройстве, но не применён к изменившимся данным Firebase.';
else if(!cloudMode())state=G.validate(draft.state,uid);else message='На устройстве есть прежний черновик. Он не отправлен в Firebase; создайте период заново.';
}}catch{message='Локальный черновик не прочитан; показаны подтверждённые данные.'}
if(selected&&!state.groups.some(g=>g.id===selected))selected=null;
}
function markup(ctx){
try{load(ctx)}catch(e){return '<section class="card" role="alert">Группы не загружены: '+esc(e.message)+'</section>'}
if(!ready)return '<section class="card" role="status">'+esc(ctx.sourceError||'Проверка групп и периодов в Firebase…')+'</section>';
if(!cloud)return '<section class="card" role="alert">Подтверждённый список групп отсутствует. Создание отключено до сверки источника.</section>';
if(selected&&!state.groups.some(g=>g.id===selected))selected=null;
const hasDraft=serial(state)!==serial(cloud),status=cloudMode()?(hasDraft?'Группы сохранены в Firebase. Есть локальный черновик периодов.':'Группы и периоды сохранены в Firebase.'):(hasDraft?'Подготовлено локально. В Firebase ещё не сохранено.':'Группы и периоды прочитаны из Firebase.');
const head=`<p class="muted" role="status">${status}</p>${message?'<p role="status">'+esc(message)+'</p>':''}`;
if(!selected)return head+'<button data-gp-action="create">+ Группа</button><button data-gp-action="discard">Отменить локальный черновик</button><h2>Группы и расписание</h2><p class="muted">Даты периодов задаются явно. Отклонённые старые периоды не импортированы.</p>'+state.groups.map(g=>`<button class="card group" data-gp-action="group" data-id="${esc(g.id)}"><div class="row"><h3>${esc(g.name)}</h3><span>›</span></div><p class="muted">${g.slots.map(s=>days[s.day]+' '+s.time).join(' · ')}</p><small>Периоды: ${state.periods.filter(p=>p.group===g.id).length} · открыть периоды</small></button>`).join('');
const g=state.groups.find(g=>g.id===selected),ps=state.periods.filter(p=>p.group===selected).sort((a,b)=>a.start.localeCompare(b.start));
return head+`<button data-gp-action="back">← Все группы</button><section class="card"><h2>${esc(g.name)}</h2><p>${g.slots.map(s=>days[s.day]+' '+s.time).join(' · ')}</p><p class="muted">Дни и время группы. Без заданного периода занятия не создаются.</p><p>${esc(g.description||'')}</p><div class="actions"><button data-gp-action="edit">Изменить группу</button><button data-gp-action="delete">Удалить группу</button></div><h3>Периоды</h3>${ps.map(p=>`<article class="rule" data-period-id="${esc(p.id)}"><strong>${p.start} → ${p.end}</strong><p class="muted">${p.slots.map(s=>days[s.day]+' '+s.time).join(' · ')}</p><small>${state.workouts.filter(w=>w.periodId===p.id).length} новых занятий · ${state.links.filter(w=>w.periodId===p.id).length} связей с существующими</small><div class="actions"><button data-gp-action="edit-period" data-id="${esc(p.id)}">Изменить период</button><button data-gp-action="delete-period" data-id="${esc(p.id)}">Удалить период</button></div></article>`).join('')||'<p class="muted">Подтверждённых периодов пока нет. Начало и конец нового периода не заполнены автоматически.</p>'}<div class="actions"><button data-gp-action="new-period">Новый период</button><button data-gp-action="discard">Отменить локальный черновик</button></div><p class="muted">Периоды сохраняются в Firebase. Занятия со связанными данными защищены от удаления.</p></section>`;
}
function editor(id){if(!ready||!selected||saving)return;const g=state.groups.find(g=>g.id===selected),p=state.periods.find(p=>p.id===id),dialog=document.querySelector('#dialog'),form=document.querySelector('#form'),periodId=p?.id||'period-'+crypto.randomUUID();
document.querySelector('#modal-title').textContent=(p?'Изменить период · ':'Новый период · ')+g.name;
document.querySelector('#fields').innerHTML=`<label>Начало<input name="start" type="date" value="${p?.start||''}" required></label><label>Конец<input name="end" type="date" value="${p?.end||''}" required></label>`+['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'].map((d,i)=>{const slot=(p?.slots||g.slots).find(s=>s.day===i);return `<div class="period-slot"><label for="period-day-${i}">${d}</label><label class="period-day-toggle"><input id="period-day-${i}" aria-label="${d}" type="checkbox" name="days" value="${i}" ${slot?'checked':''}></label><input aria-label="Время ${d}" type="time" name="time${i}" value="${slot?.time||''}"></div>`}).join('');
document.querySelector('#error').textContent='';form.querySelector('button[type=submit]').textContent='Сохранить в Firebase';bindSave(form,dialog,()=>{const f=new FormData(form);return {type:p?'periodEdit':'periodCreate',id:periodId,group:selected,start:f.get('start'),end:f.get('end'),slots:f.getAll('days').map(d=>({day:Number(d),time:f.get('time'+d)}))}});dialog.showModal()}
function removePeriod(id){const p=state.periods.find(p=>p.id===id);if(!p||saving)return;const dialog=document.querySelector('#dialog'),form=document.querySelector('#form');document.querySelector('#modal-title').textContent='Удалить период?';document.querySelector('#fields').innerHTML='<p>'+esc(p.start)+' → '+esc(p.end)+'</p><p>Будут удалены только занятия этого периода без связанных данных. При наличии истории или записей удаление запрещено.</p>';document.querySelector('#error').textContent='';form.querySelector('button[type=submit]').textContent='Подтвердить удаление периода';bindSave(form,dialog,()=>({type:'periodDelete',id}));dialog.showModal()}

async function commit(op){
const epoch=panelEpoch,owner=uid;
if(cloudMode()){
const actual=await FitPPApplication.workspace.saveGroup(structuredClone(cloud),op);
if(epoch!==panelEpoch||owner!==uid||FitPPApplication.workspace.auth.currentUser?.uid!==owner)throw Error('SESSION_CHANGED');
cloud=G.validate(actual,owner);base=serial(cloud);state=structuredClone(cloud);message=op.type.startsWith('period')?'Расписание сохранено в Firebase. Результат прочитан с сервера.':op.type==='delete'?'Группа и локация удалены из Firebase. Результат прочитан с сервера.':'Группа и локация сохранены в Firebase. Результат прочитан с сервера.';
}else{
const saved=JSON.parse(localStorage.getItem(key())||'null');
if(saved&&(saved.base!==base||serial(saved.state)!==serial(state)))throw Error('Черновик изменён в другом окне. Перезагрузите страницу');
if(!saved&&serial(state)!==serial(cloud))throw Error('Черновик удалён в другом окне. Перезагрузите страницу');
const next=G.mutateGroup(state,op,sources);localStorage.setItem(key(),serial({base,state:next}));state=next;message='Изменения сохранены в локальном черновике и видны в Группах и Журнале. В Firebase ещё не сохранено.';
}
if(selected&&!state.groups.some(g=>g.id===selected))selected=null;
refresh();
}
function errorText(e){if(e.message==='SOURCE_CHANGED')return 'Группы изменились в другом окне. Перезагрузите список и откройте форму заново. Ваш ввод сохранён в этой форме.';if(e.message==='SESSION_CHANGED')return 'Сессия изменилась. Войдите и проверьте список перед повтором.';if(String(e.code||'').includes('permission-denied'))return 'Firebase отклонил запись. Успешное сохранение не подтверждено; права не изменялись.';if(['unavailable','deadline-exceeded','unknown','cancelled'].some(k=>String(e.code||'').includes(k)))return 'Сохранение не подтверждено. Проверьте список после восстановления связи перед повтором: операция могла сохраниться.';return e.message}
function bindSave(form,dialog,operation){
const owner=uid,targetBase=base,targetState=serial(state),epoch=panelEpoch,close=document.querySelector('#close');
form.onsubmit=async e=>{e.preventDefault();if(saving)return;
const submit=form.querySelector('button[type=submit]'),label=submit.textContent;
try{
if(owner!==uid||targetBase!==base||targetState!==serial(state)||FitPPApplication.workspace.auth.currentUser?.uid!==owner)throw Error('Сессия или источник изменились. Откройте форму заново');
saving=true;submit.disabled=true;close.disabled=true;submit.textContent=cloudMode()?'Сохранение в Firebase…':'Сохранение…';document.querySelector('#error').textContent='';
await commit(operation());if(epoch===panelEpoch)dialog.close();
}catch(e){if(epoch===panelEpoch){document.querySelector('#error').textContent=errorText(e);if(cloudMode())try{const history=await FitPPApplication.workspace.readHistory();if(epoch===panelEpoch&&FitPPApplication.workspace.auth.currentUser?.uid===owner)window.dispatchEvent(new CustomEvent('fitpp-groups-confirmed',{detail:{ownerUid:owner,generation:FitPPApplication.workspace.auth.sessionGeneration,history}}))}catch{}}}
finally{if(epoch===panelEpoch){saving=false;submit.disabled=false;close.disabled=false;submit.textContent=label}}
};
dialog.oncancel=e=>{if(saving)e.preventDefault()};close.onclick=()=>{if(!saving)dialog.close()};
}
function groupEditor(id){
if(!ready||!cloud||saving)return;const g=state.groups.find(g=>g.id===id),dialog=document.querySelector('#dialog'),form=document.querySelector('#form'),live=cloudMode(),newId=g?.id||'group-'+crypto.randomUUID();
document.querySelector('#modal-title').textContent=g?'Изменить группу':'Новая группа / локация';
document.querySelector('#fields').innerHTML=`<label>Название<input name="name" maxlength="80" required value="${esc(g?.name||'')}"></label><label>Описание<textarea name="description" maxlength="500">${esc(g?.description||'')}</textarea></label><p class="muted">${live?'Группа и локация будут сохранены в Firebase.':'Локальный черновик.'} Расписание и периоды не меняются.</p>`;
document.querySelector('#error').textContent='';form.querySelector('button[type=submit]').textContent=live?'Сохранить в Firebase':'Сохранить локальный черновик';
bindSave(form,dialog,()=>{const f=new FormData(form);return {type:g?'edit':'create',id:newId,name:f.get('name'),description:f.get('description')}});dialog.showModal();
}
function removeGroup(){
if(saving)return;const g=state.groups.find(g=>g.id===selected);if(!g)return;
const live=cloudMode(),dialog=document.querySelector('#dialog'),form=document.querySelector('#form');document.querySelector('#modal-title').textContent='Удалить группу?';
document.querySelector('#fields').innerHTML='<p>Удалить «'+esc(g.name)+'» и её локацию '+(live?'из Firebase?':'из локального черновика?')+'</p><p class="muted">Связанные данные не удаляются. Если найдены периоды, занятия, история, клиенты или финансы, удаление будет запрещено.</p>';
document.querySelector('#error').textContent='';form.querySelector('button[type=submit]').textContent=live?'Подтвердить удаление группы':'Подтвердить удаление из черновика';bindSave(form,dialog,()=>({type:'delete',id:g.id}));dialog.showModal();
}
document.getElementById('app').addEventListener('click',e=>{const b=e.target.closest('[data-gp-action]');if(!b||saving)return;const action=b.dataset.gpAction;
if(action==='create')groupEditor();if(action==='edit')groupEditor(selected);if(action==='delete')removeGroup();
if(action==='group'){selected=b.dataset.id;refresh()}if(action==='back'){selected=null;refresh()}if(action==='new-period')editor();if(action==='edit-period')editor(b.dataset.id);if(action==='delete-period')removePeriod(b.dataset.id);
if(action==='discard'){try{localStorage.removeItem(key());state=cloud?structuredClone(cloud):{...G.empty(uid),groups:[]};message='Локальный черновик отменён. Облако не менялось.';refresh()}catch(e){message='Не удалось удалить локальный черновик: '+e.message;refresh()}}
});
globalThis.FitPPGroupsPanel=Object.freeze({markup,groupEditor,view(ctx){load(ctx);return {groups:ready?(cloudMode()?cloud?.groups||[]:state?.groups||[]):[],draft:ready&&serial(state)!==serial(cloud),message}},reset(){panelEpoch++;uid=null;base=null;state=null;cloud=null;selected=null;ready=false;sources=[];saving=false;const dialog=document.querySelector('#dialog');if(dialog?.open)dialog.close();const close=document.querySelector('#close');if(close)close.disabled=false;const submit=document.querySelector('#form')?.querySelector('button[type=submit]');if(submit)submit.disabled=false}});
})();
