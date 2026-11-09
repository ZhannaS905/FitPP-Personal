(()=>{'use strict';
const M=FitPPCalendar,app=document.getElementById('app'),names={zarya:'Заря',pole:'Поле чудес',online:'Онлайн'},statuses={attended:'Был',missed:'Сгорело',razov:'Разовое',excused:'Уважительная причина'};
let catalog=null,tab='journal',day=M.today(),hall=null,auto=true,calendarMonth=M.today().slice(0,7),calendarSelectedDay=M.today(),last='',session=null,history=null,historyError='',bookings=null,bookingError='',loaded=false,loading=false,rawMain=null,unwatch=null,unwatchBookings=null,paused=false;
const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=d=>d?new Date(d+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'short'}):'Дата неизвестна';
function stopBookings(){unwatchBookings?.();unwatchBookings=null}
function sourceData(a){
const w=FitPPApplication.workspace,key=w.auth.sessionGeneration+':'+w.auth.currentUser?.uid;
if(key!==session){
  unwatch?.();unwatch=null;stopBookings();session=key;history=null;bookings=null;FitPPGroupsPanel.reset();
  rawMain=null;historyError='';bookingError='';loaded=false;loading=false;hall=null;auto=true;calendarMonth=M.today().slice(0,7);calendarSelectedDay=M.today();last='';
}
if(paused||!a.currentUser||a.currentUser.uid!==w.auth.currentUser?.uid)return;
const update=()=>{last='';render()};
if(!unwatchBookings){
  const onError=e=>{bookingError=e.message;update()};
  try{
    unwatchBookings=w.watchBookings(value=>{bookings=value;bookingError='';update()},onError);
  }catch(e){bookingError=e.message}
}
if(loaded||loading)return;
loading=true;
Promise.allSettled([w.readHistory(),w.reference().get()]).then(([h,m])=>{
  if(session!==key||w.auth.sessionGeneration+':'+w.auth.currentUser?.uid!==key)return;
  rawMain=m.status==='fulfilled'?m.value.data():null;
  history=h.status==='fulfilled'?h.value:null;historyError=h.status==='rejected'?h.reason.message:'';
  loaded=true;loading=false;
  if(h.status==='fulfilled'&&w.watchHistory)unwatch=w.watchHistory(value=>{history=value;historyError='';update()},e=>{historyError='Группы не синхронизированы: '+e.message;update()});
  update();
});
}
const statIcon=paths=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const peopleIcon=statIcon('<circle cx="9" cy="6" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4H3Zm14-18a3 3 0 0 1 0 6m2 4a6 6 0 0 1 2 4v4"/>');
const bookingsIcon=statIcon('<rect x="5" y="3" width="15" height="19" rx="2"/><path d="M3 7h4M3 12h4M3 17h4M10 8h6M10 12h6M10 16h6M17 3V1H7"/>');
const expiryIcon=statIcon('<circle cx="12" cy="13" r="8"/><path d="M12 8v5h4M3 4l3-3m12 0 3 3M6 21l-2 2m14-2 2 2"/>');
const countWord=(n,one,few,many)=>n%100>=11&&n%100<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many;
function bookingStatus(c,w,a){
  if(!c.booked)return '';
  const icon='<svg class="journal-booking-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10" cy="10" r="8"/><path d="m6 10 2.5 2.5L14 7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  if(c.ambiguousBooking)return '<small class="journal-booking">'+icon+'<span>Записан · общее бронирование на дату</span></small>';
  const version=bookings?.versions?.[c.bookingKey]??0;
  return `<button class="journal-booking" data-account="cancelBooking" data-workout="${esc(w.id)}" data-key="${esc(c.bookingKey)}" data-version="${esc(version)}" data-date="${esc(w.date)}" data-location="${esc(w.location)}" ${a.canEdit()?'':'disabled'}>${icon}<span>Записан</span></button>`;
}
function person(c,w,a){
  const subs=c.client?FitPPStore.availableSubscriptions(c.client,w.location,w.date):[];
  const balance=subs.map(({sub})=>'Остаток '+sub.left+' · до '+sub.expires).join('; ');
  const debt=c.client?FitPPStore.debt(c.client):0;
  return `<div class="person client-row"><div class="journal-client-identity">
    <button class="client-name" data-action="client" data-id="${esc(c.id)}">${esc(c.client?.name||'Клиент отсутствует в источнике')}</button>
    ${balance?'<small class="journal-client-balance">'+esc(balance)+'</small>':''}
    ${debt>0?'<small class="client-debt">Долг: '+esc(debt)+' ₽</small>':''}
    ${bookingStatus(c,w,a)}
  </div><div class="actions attendance-actions"><button data-account="mark" data-workout="${esc(w.id)}" data-client="${esc(c.id)}" data-status="attended" ${!a.canEdit()||w.cancelled||w.date>FitPPOperations.today()?'disabled':''} aria-pressed="${c.status==='attended'}">Был</button><button data-account="mark" data-workout="${esc(w.id)}" data-client="${esc(c.id)}" data-status="missed" ${!a.canEdit()||w.cancelled||w.date>FitPPOperations.today()?'disabled':''} aria-pressed="${c.status==='missed'}">Сгорело</button></div></div>`
}
function workout(w,a){return `<article class="card journal-panel ${tab==='journal'?'journal-workout':''} ${w.cancelled?'cancelled':''}" data-workout-id="${esc(w.id)}"><div class="row workout-heading"><span class="time">${esc(w.time)}</span><button class="workout-add-client" data-account="addPerson" data-workout="${esc(w.id)}" ${!a.canEdit()||w.cancelled?'disabled':''}>Добавить клиента</button><span class="tag">${w.cancelled?'Отменено':w.extra?'Дополнительная':w.periodId?'Регулярная':'Сохранённое занятие'}</span></div><h3>${esc(names[w.location])} · ${fmt(w.date)}</h3>${w.originDate!==w.date?'<p class="muted">Перенесено с '+fmt(w.originDate)+'</p>':''}${w.periodId?'<p class="muted">'+esc(names[w.groupId||w.location])+' · '+esc(history?.groupScheduleV1?.periods?.find(p=>p.id===w.periodId)?.start||'загрузка')+' → '+esc(history?.groupScheduleV1?.periods?.find(p=>p.id===w.periodId)?.end||'загрузка')+'</p>':''}${tab==='journal'?w.clients.map(c=>person(c,w,a)).join(''):''}<div class="actions workout-actions"><button class="journal-move" data-account="move" data-workout="${esc(w.id)}" ${!FitPPAccountingUI.canManage(w)||w.cancelled?'disabled':''}>Перенести</button><button class="${w.cancelled?'':'journal-cancel'}" data-account="${w.cancelled?'resume':'cancel'}" data-workout="${esc(w.id)}" ${!FitPPAccountingUI.canManage(w)?'disabled':''}>${w.cancelled?'Вернуть занятие':'Отменить'}</button></div></article>`}
function showExpiring(){
  const dialog=document.querySelector('#dialog'),form=document.querySelector('#form');
  if(!dialog||!form)return;
  const a=globalThis.Alpine?.$data?.(document.body);
  if(!a)return;
  const today=M.today(),loc=catalog?.groups?.find(g=>g.id===hall)?.location||hall;
  const list=(a.clients||[]).filter(c=>!c.archivedAt).map(c=>{
    const subs=(c.subscriptions||[]).filter(s=>
      !s.cancelledAt&&s.expires>=today&&(!s.startDate||s.startDate<=today)&&Number.isInteger(s.left)&&s.left>=0&&s.left<=2&&
      (auto||FitPPStore.subscriptionTerms(s).locations.includes(loc)));
    return subs.length?{client:c,subs}:null;
  }).filter(Boolean);
  const title=document.querySelector('#modal-title');
  if(title)title.textContent='Истекающие абонементы (≤ 2 занятия)';
  const fields=document.querySelector('#fields');
  const err=document.querySelector('#error');
  if(err)err.textContent='';
  if(fields){
    if(!list.length){
      fields.innerHTML='<p class="muted" style="padding:16px 0;text-align:center;">Нет клиентов с истекающими абонементами (≤ 2 занятия).</p>';
    }else{
      fields.innerHTML=`<div class="expiring-dialog-list" style="display:flex;flex-direction:column;gap:10px;max-height:65dvh;overflow-y:auto;padding:4px 0;">
        ${list.map(({client:c,subs})=>`
          <div class="card" style="margin:0;padding:12px;display:flex;flex-direction:column;gap:6px;background:rgba(255,255,255,0.03);border:1px solid #334155;border-radius:14px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <button type="button" class="client-name" data-action="client-from-modal" data-id="${esc(c.id)}" style="font-weight:600;font-size:16px;color:#38bdf8;background:none;border:none;padding:0;cursor:pointer;text-align:left;">
                ${esc(c.name||'Без имени')}
              </button>
              ${c.phone?`<a href="tel:${esc(c.phone)}" style="font-size:13px;color:#94a3b8;text-decoration:none;" title="Позвонить">📞 ${esc(c.phone)}</a>`:''}
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${subs.map(s=>{
                const terms=FitPPStore.subscriptionTerms(s);
                const leftText=s.left===0?'0 занятий':s.left===1?'1 занятие':`${s.left} занятия`;
                const badgeBg=s.left===0?'#450a0a':s.left===1?'#431407':'#422006';
                const badgeBorder=s.left===0?'#dc2626':s.left===1?'#ea580c':'#ca8a04';
                const badgeColor=s.left===0?'#fca5a5':s.left===1?'#fdba74':'#fde047';
                return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px;color:#cbd5e1;flex-wrap:wrap;">
                  <span>${esc(terms?.name||'Абонемент')}</span>
                  <span style="font-size:12px;padding:3px 10px;border-radius:999px;background:${badgeBg};border:1px solid ${badgeBorder};color:${badgeColor};font-weight:600;">
                    Остаток: ${leftText} · до ${fmt(s.expires)}
                  </span>
                </div>`;
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>`;
    }
  }
  const submit=form.querySelector('[type=submit]');
  if(submit)submit.hidden=true;
  const close=document.querySelector('#close');
  if(close){
    close.disabled=false;
    close.onclick=()=>{dialog.close()};
  }
  dialog.oncancel=()=>{};
  if(typeof dialog.showModal==='function')dialog.showModal();
}
function locationColor(loc){
  if(loc==='zarya')return '#15d6a2';
  if(loc==='pole')return '#26afff';
  if(loc==='online')return '#ffb43d';
  return '#a78bfa';
}
function formatCalendarMonth(m){
  const [y,mon]=m.split('-').map(Number);
  const n=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  return `${n[mon-1]} ${y}`;
}
function formatDayHeader(dateStr){
  if(!dateStr)return '';
  const [y,m,d]=dateStr.split('-').map(Number);
  const dt=new Date(Date.UTC(y,m-1,d));
  const wd=['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'][dt.getUTCDay()];
  const mn=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  return `${wd}, ${d} ${mn[m-1]}`;
}
function changeCalendarMonth(delta){
  const [y,m]=calendarMonth.split('-').map(Number);
  const next=new Date(Date.UTC(y,m-1+delta,1));
  calendarMonth=next.toISOString().slice(0,7);
  const today=M.today();
  if(today.startsWith(calendarMonth)){
    calendarSelectedDay=today;
  }else{
    calendarSelectedDay=`${calendarMonth}-01`;
  }
}
function generateMonthDays(monthStr){
  const [y,m]=monthStr.split('-').map(Number);
  const firstDay=new Date(Date.UTC(y,m-1,1));
  const lastDay=new Date(Date.UTC(y,m,0));
  const daysInMonth=lastDay.getUTCDate();
  const startDayOfWeek=(firstDay.getUTCDay()+6)%7;
  const cells=[];
  if(startDayOfWeek>0){
    const prevMonthLastDay=new Date(Date.UTC(y,m-1,0)).getUTCDate();
    const prevMonthStr=new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,7);
    for(let i=startDayOfWeek-1;i>=0;i--){
      const dayNum=prevMonthLastDay-i;
      const dStr=`${prevMonthStr}-${String(dayNum).padStart(2,'0')}`;
      cells.push({date:dStr,dayNum,isCurrentMonth:false});
    }
  }
  for(let d=1;d<=daysInMonth;d++){
    const dStr=`${monthStr}-${String(d).padStart(2,'0')}`;
    cells.push({date:dStr,dayNum:d,isCurrentMonth:true});
  }
  const remaining=(7-(cells.length%7))%7;
  if(remaining>0){
    const nextMonthStr=new Date(Date.UTC(y,m,1)).toISOString().slice(0,7);
    for(let d=1;d<=remaining;d++){
      const dStr=`${nextMonthStr}-${String(d).padStart(2,'0')}`;
      cells.push({date:dStr,dayNum:d,isCurrentMonth:false});
    }
  }
  return cells;
}
function renderCalendar(calendarRaw,a,catalog,bookings){
  const today=M.today();
  const allMain=M.workouts(calendarRaw);
  const historical=M.confirmed(a,history).filter(w=>w.source==='trainers');
  const allWorkouts=[...allMain,...historical];

  const monthWorkouts=allWorkouts.filter(w=>w.date.startsWith(calendarMonth));
  const activeMonthWorkouts=monthWorkouts.filter(w=>!w.cancelled);

  const groupMonthCounts={};
  for(const g of catalog.groups){
    groupMonthCounts[g.id]=monthWorkouts.filter(w=>!w.cancelled && (w.groupId===g.id||w.location===g.id)).length;
  }
  const allMonthWorkoutsCount=activeMonthWorkouts.length;

  const rawCells=generateMonthDays(calendarMonth);
  const cells=rawCells.map(c=>{
    const dayWorkouts=allWorkouts.filter(w=>w.date===c.date && (auto || !hall || w.location===hall));
    const isToday=c.date===today;
    const isSelected=c.date===calendarSelectedDay;
    const isCancelledOnly=dayWorkouts.length>0 && dayWorkouts.every(w=>w.cancelled);
    let classes='';
    if(!c.isCurrentMonth) classes+=' opacity-40 bg-slate-900/30 border-slate-800/40 text-slate-500';
    else if(isSelected) classes+=' bg-emerald-950/70 border-emerald-400 ring-2 ring-emerald-500/50 shadow-md text-emerald-100';
    else if(isToday) classes+=' bg-slate-800/90 border-emerald-500/60 text-slate-100';
    else classes+=' bg-slate-900/60 border-slate-700/60 hover:border-slate-500 text-slate-200';

    return {
      ...c,
      workouts: dayWorkouts,
      isToday,
      isSelected,
      isCancelledOnly,
      classes,
      numberClass: isToday ? 'text-emerald-400 font-bold' : isSelected ? 'text-white font-bold' : ''
    };
  });

  const selectedDayWorkouts=allWorkouts
    .filter(w=>w.date===calendarSelectedDay && (auto || !hall || w.location===hall))
    .map(w=>({...w,clients:M.entries(calendarRaw,bookings,w)}));
  const selectedDayClientsCount=selectedDayWorkouts.reduce((sum,w)=>sum+w.clients.length,0);

  app.innerHTML=`
    <div class="calendar-view space-y-4">
      <!-- Toolbar: Month switcher & Add Workout -->
      <div class="calendar-header-toolbar bg-slate-800 border border-slate-700 rounded-2xl p-4 shadow-lg space-y-3">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="inline-flex items-center bg-slate-900 border border-slate-700 rounded-xl p-1 gap-1">
            <button type="button" data-action="cal-prev-month" aria-label="Предыдущий месяц" class="px-3 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors">❮</button>
            <span class="px-2 text-base font-bold text-emerald-400 whitespace-nowrap">${formatCalendarMonth(calendarMonth)}</span>
            <button type="button" data-action="cal-next-month" aria-label="Следующий месяц" class="px-3 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors">❯</button>
          </div>

          <div class="flex items-center gap-2">
            <button type="button" data-action="cal-today" class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-xl transition-colors">Сегодня</button>
            <button type="button" data-account="add" data-date="${calendarSelectedDay}" data-location="${esc(hall||'')}" ${!a.canEdit()?'disabled':''} class="journal-add px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold rounded-xl shadow transition-colors flex items-center gap-1.5">+ Занятие</button>
          </div>
        </div>

        <!-- Location Filter Chips -->
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar text-xs">
          <button type="button" data-action="cal-hall" data-id="" class="px-2.5 py-1 rounded-lg border whitespace-nowrap transition-colors font-medium flex items-center gap-1.5 ${!hall ? 'bg-emerald-600/25 border-emerald-500 text-emerald-300' : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:text-slate-200'}">
            <span>Все локации</span>
            <span class="opacity-75">(${allMonthWorkoutsCount})</span>
          </button>
          ${catalog.groups.map(g=>`
            <button type="button" data-action="cal-hall" data-id="${esc(g.id)}" class="px-2.5 py-1 rounded-lg border whitespace-nowrap transition-colors font-medium flex items-center gap-1.5 ${hall===g.id ? 'bg-emerald-600/25 border-emerald-500 text-emerald-300' : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:text-slate-200'}">
              <span class="w-2 h-2 rounded-full inline-block" style="background:${locationColor(g.location||g.id)}"></span>
              <span>${esc(g.name)}</span>
              <span class="opacity-75">(${groupMonthCounts[g.id]||0})</span>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Month Grid -->
      <div class="calendar-month-card bg-slate-800 border border-slate-700 rounded-2xl p-3 sm:p-4 shadow-lg">
        <div class="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400 pb-2 border-b border-slate-700/60 mb-2">
          <span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span class="text-emerald-400/80">Сб</span><span class="text-rose-400/80">Вс</span>
        </div>
        <div class="calendar-grid grid grid-cols-7 gap-1 sm:gap-1.5">
          ${cells.map(c=>`
            <button type="button" data-action="cal-select-day" data-date="${c.date}" class="calendar-day-cell relative flex flex-col items-stretch justify-between rounded-xl border text-left cursor-pointer ${c.classes}">
              <div class="flex items-center justify-between pointer-events-none">
                <span class="text-xs sm:text-sm font-semibold ${c.numberClass}">${c.dayNum}</span>
                ${c.isToday ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>' : ''}
              </div>
              <div class="flex flex-col gap-0.5 mt-auto pointer-events-none">
                ${c.workouts.length ? `
                  <div class="flex items-center gap-1 flex-wrap">
                    ${c.workouts.slice(0,3).map(w=>`
                      <span class="w-2 h-2 rounded-full inline-block" style="background:${locationColor(w.location)}"></span>
                    `).join('')}
                    ${c.workouts.length>3 ? `<span class="text-[10px] text-slate-400 font-bold leading-none">+${c.workouts.length-3}</span>` : ''}
                  </div>
                  <span class="text-[10px] sm:text-[11px] leading-tight font-medium ${c.isCancelledOnly ? 'line-through text-slate-500' : 'text-slate-300'}">
                    ${c.workouts.length} ${countWord(c.workouts.length,'зан.','зан.','зан.')}
                  </span>
                ` : ''}
              </div>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Selected Day Details Panel -->
      <div class="calendar-day-details bg-slate-800 border border-slate-700 rounded-2xl p-4 shadow-lg space-y-3">
        <div class="flex items-center justify-between gap-3 flex-wrap border-b border-slate-700/60 pb-3">
          <div>
            <h3 class="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>${formatDayHeader(calendarSelectedDay)}</span>
              ${calendarSelectedDay===today ? '<span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-300">Сегодня</span>' : ''}
            </h3>
            <p class="text-xs text-slate-400">
              ${selectedDayWorkouts.length ? `${selectedDayWorkouts.length} ${countWord(selectedDayWorkouts.length,'тренировка','тренировки','тренировок')} · ${selectedDayClientsCount} ${countWord(selectedDayClientsCount,'клиент','клиента','клиентов')}` : 'Тренировок не запланировано'}
            </p>
          </div>

          <div class="flex items-center gap-2">
            <button type="button" data-action="open-journal-day" data-date="${calendarSelectedDay}" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs sm:text-sm font-semibold shadow transition-colors flex items-center gap-1.5" title="Перейти в журнал для отметки явки клиентов">
              <span>В Журнал</span>
              <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd"/></svg>
            </button>
          </div>
        </div>

        <!-- Selected Day Workouts List -->
        <div class="space-y-3">
          ${selectedDayWorkouts.length ? selectedDayWorkouts.map(w=>`
            <article class="p-3.5 rounded-xl border border-slate-700 bg-slate-900/70 flex flex-col gap-2.5 ${w.cancelled ? 'opacity-60 border-dashed' : ''}">
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <div class="flex items-center gap-2.5">
                  <span class="w-3 h-3 rounded-full flex-shrink-0" style="background:${locationColor(w.location)}"></span>
                  <span class="text-base font-bold text-slate-100">${esc(w.time)}</span>
                  <span class="font-semibold text-sm text-slate-200">${esc(names[w.groupId||w.location]||w.location)}</span>
                </div>
                <span class="text-xs px-2 py-0.5 rounded-lg font-medium ${w.cancelled ? 'bg-rose-950/80 text-rose-300 border border-rose-500/50' : w.extra ? 'bg-amber-950/80 text-amber-300 border border-amber-500/50' : 'bg-slate-800 text-slate-300 border border-slate-700'}">
                  ${w.cancelled ? 'Отменено' : w.extra ? 'Дополнительная' : w.periodId ? 'Регулярная' : 'Сохранённое занятие'}
                </span>
              </div>

              ${w.originDate!==w.date ? `<p class="text-xs text-amber-300/80">Перенесено с ${fmt(w.originDate)}</p>` : ''}

              <!-- Clients row -->
              <div class="flex items-center justify-between gap-2 text-xs text-slate-400 border-t border-slate-800 pt-2 flex-wrap">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-slate-300 font-medium">👥 Клиенты (${w.clients.length}):</span>
                  ${w.clients.length ? w.clients.map(c=>`
                    <span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] font-medium ${c.status==='attended' ? 'border border-emerald-500/50 text-emerald-300' : c.status==='missed' ? 'border border-rose-500/40 text-rose-300' : ''}">
                      ${esc(c.client?.name||c.id)}
                    </span>
                  `).join('') : '<span class="text-slate-500 italic">записей нет</span>'}
                </div>

                <div class="flex items-center gap-2 ml-auto">
                  <button class="px-2.5 py-1 text-xs rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300" data-account="move" data-workout="${esc(w.id)}" ${!FitPPAccountingUI.canManage(w)||w.cancelled ? 'disabled' : ''}>Перенести</button>
                  <button class="px-2.5 py-1 text-xs rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 ${w.cancelled ? 'text-emerald-300' : 'text-rose-300'}" data-account="${w.cancelled ? 'resume' : 'cancel'}" data-workout="${esc(w.id)}" ${!FitPPAccountingUI.canManage(w) ? 'disabled' : ''}>
                    ${w.cancelled ? 'Вернуть' : 'Отменить'}
                  </button>
                </div>
              </div>
            </article>
          `).join('') : `
            <div class="text-center py-6 px-4 bg-slate-900/40 border border-dashed border-slate-700/60 rounded-xl space-y-2">
              <p class="text-sm text-slate-400">На этот день тренировок не запланировано.</p>
              <button data-account="add" data-date="${calendarSelectedDay}" data-location="${esc(hall||'')}" ${!a.canEdit() ? 'disabled' : ''} class="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/40 rounded-xl text-xs font-semibold transition-colors">
                + Запланировать тренировку
              </button>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}
function render(){if(!globalThis.Alpine||!globalThis.FitPPApplication)return;const a=Alpine.$data(document.body);if(!a)return;sourceData(a);const signature=JSON.stringify([new Date().toISOString().slice(0,16),tab,day,hall,auto,calendarMonth,calendarSelectedDay,a.dataReady,a.loading,a.saving,a.syncError,a.currentUser?.uid,a.clients,a.workouts,a.visits,a.attendance,loaded,historyError,bookingError]);if(last===signature)return;last=signature;
document.querySelectorAll('.schedule-tabs [data-tab]').forEach(b=>{b.classList.toggle('selected',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false')});
if(!a.currentUser){app.innerHTML='<div class="empty-state">Войдите в Firebase для просмотра данных.</div>';return}if(!a.dataReady){app.innerHTML='<div class="empty-state" role="status">'+esc(a.syncError||'Загрузка из Firebase…')+'</div>';return}
const groupCtx={ownerUid:a.currentUser.uid,history,sourceReady:loaded&&!historyError,sourceError:historyError,existing:M.confirmed(a,history),sources:loaded&&!historyError&&!bookingError&&rawMain&&bookings?[rawMain,Object.fromEntries(Object.entries(history||{}).filter(([k])=>k!=='groupScheduleV1')),bookings]:[]};try{catalog=FitPPGroupsPanel.view(groupCtx)}catch(e){app.innerHTML='<section class="card" role="alert">Группы требуют сверки: '+esc(e.message)+'</section>';return}for(const k of Object.keys(names))delete names[k];for(const g of catalog.groups)names[g.id]=g.name;if(hall&&!catalog.groups.some(g=>g.id===hall)){hall=null;auto=true}if(tab==='groups'){app.innerHTML=FitPPGroupsPanel.markup(groupCtx);return}
if(tab==='extensions'){app.innerHTML=FitPPAccountingUI.markup(a,history);return}
let calendarRaw=a;try{if(history?.groupScheduleV1)calendarRaw=FitPPGroupPeriods.merge({workouts:a.workouts,clients:a.clients,visits:a.visits,visitOps:a.visitOps},history.groupScheduleV1,a.currentUser.uid)}catch(e){app.innerHTML='<section class="card" role="alert">Расписание требует сверки: '+esc(e.message)+'</section>';return}
if(tab==='calendar'){renderCalendar(calendarRaw,a,catalog,bookings);return}
const v=M.view(calendarRaw,bookings,day),historicalWorkouts=M.confirmed(a,history).filter(w=>w.source==='trainers'&&w.date===day);v.autoHalls=[...new Set([...v.autoHalls,...historicalWorkouts.filter(w=>!w.cancelled).map(w=>w.location)])];const shown=v.rows.filter(w=>auto||w.location===hall),shownHistorical=historicalWorkouts.filter(w=>auto||w.location===hall),mainHistory=M.history(a,'main'),mainHistoryKeys=new Set(mainHistory.map(r=>r.key)),allHistory=[...mainHistory,...M.history(history,'trainers').filter(r=>!mainHistoryKeys.has(r.key))];const old=allHistory.filter(r=>r.date===day&&(r.source==='trainers'||!r.workoutConfirmed)&&(auto||!r.location||r.location===hall));
const count=shown.flatMap(w=>w.clients),activeRows=shown.filter(w=>!w.cancelled);
const bookingCount=new Set(activeRows.flatMap(w=>w.clients.filter(c=>c.booked).map(c=>c.bookingKey))).size;
const visited=count.filter(c=>c.status==='attended').length+old.filter(r=>r.status==='attended').length;
const today=M.today(),location=catalog.groups.find(g=>g.id===hall)?.location||hall;
const expiring=a.clients.filter(c=>!c.archivedAt).flatMap(c=>c.subscriptions||[]).filter(s=>
  !s.cancelledAt&&s.expires>=today&&(!s.startDate||s.startDate<=today)&&Number.isInteger(s.left)&&s.left>=0&&s.left<=2&&
  (auto||FitPPStore.subscriptionTerms(s).locations.includes(location))).length;
app.innerHTML=`<div class="datepick journal-date-row"><input aria-label="Дата занятия" id="live-date" type="date" value="${day}"><button class="journal-add" data-account="add" data-date="${day}" data-location="${esc(hall||v.autoHalls[0]||'')}" ${!a.canEdit()||day<FitPPOperations.today()?'disabled':''}>+ Занятие</button></div><div class="week">${v.week.map(d=>`<button data-action="date" data-date="${d}" class="${d===day?'selected':''}" aria-label="${d}" aria-current="${d===day?'date':'false'}"><small>${new Date(d+'T12:00:00Z').toLocaleDateString('ru-RU',{weekday:'short'})}</small>${+d.slice(-2)}</button>`).join('')}</div><div class="location-switch journal-locations">${catalog.groups.map(g=>g.id).map(id=>`<button data-action="hall" data-id="${id}" data-location="${catalog.groups.find(g=>g.id===id)?.location||id}" aria-pressed="${auto?v.autoHalls.includes(id):hall===id}"><svg class="journal-location-icon" viewBox="0 0 24 32" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M12 0C5.4 0 1 5 1 11c0 8 11 21 11 21s11-13 11-21C23 5 18.6 0 12 0Zm0 7a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/></svg><span>${esc(names[id])}</span></button>`).join('')}</div><p class="muted" role="status">${catalog.draft?(FitPPApplication.workspace.groupsWritable?'Есть локальный черновик периодов; группы читаются из Firebase.':'Локальный черновик групп / локаций. В Firebase ещё не сохранено.'):''}${catalog.message?' '+esc(catalog.message):''}</p>${history?.groupScheduleV1 ? (!history.groupScheduleV1.periods.length ? '<p class="muted">Периоды пока не заданы. Создайте нужный период в разделе «Группы».</p>' : '') : '<p class="muted">Полнота расписания не подтверждена: групп и периодов нет.</p>'}${bookingError?'<p role="alert">Записи недоступны: '+esc(bookingError)+'</p>':''}${tab==='journal'?`<div class="summary journal-summary"><div><div class="journal-stat-label">${peopleIcon}<span>Посетили</span></div><div class="journal-stat-value"><strong>${visited}</strong><span>${countWord(visited,'человек','человека','человек')}</span></div></div><div><div class="journal-stat-label">${bookingsIcon}<span>Записано</span></div><div class="journal-stat-value"><strong>${bookings?bookingCount:'—'}</strong><span>${countWord(bookingCount,'клиент','клиента','клиентов')}</span></div></div><div role="button" tabindex="0" data-action="expiring" aria-label="Истекающие абонементы" title="Нажмите, чтобы посмотреть список"><div class="journal-stat-label">${expiryIcon}<span>Истекают</span></div><div class="journal-stat-value"><strong>${expiring}</strong><span>≤ 2 занятия</span></div></div></div>`:''}${v.moved.filter(w=>auto||hall===w.location).map(w=>'<div class="card"><p>'+esc(names[w.location])+' · перенесено на '+fmt(w.date)+' '+esc(w.time)+'</p></div>').join('')}${shown.map(w=>workout(w,a)).join('')||(!shownHistorical.length&&'<div class="card empty">На выбранную дату в источнике нет сохранённых занятий. Это не подтверждение отсутствия тренировок.</div>'||'')}${shownHistorical.map(w=>`<article class="card" data-workout-id="${esc(w.id)}"><h3>${esc(names[w.location])} · ${esc(w.time)}</h3><p class="muted">Старый журнал · ${w.cancelled?'Отменено':w.extra?'Дополнительная':w.periodId?'Регулярная':'Сохранённое занятие'}${w.originDate!==w.date?' · перенесено с '+fmt(w.originDate):''}</p></article>`).join('')}${!loaded?'<p>Чтение старого журнала…</p>':''}${historyError?'<p role="alert">Старый журнал недоступен: '+esc(historyError)+'</p>':''}${old.map(r=>`<div class="person" data-history-key="${esc(r.source+'/'+r.key)}"><span>${esc(r.name)}<br><small>${esc(statuses[r.status]||r.status)} · ${esc(names[r.location]||'Зал не указан')} · ${r.source==='trainers'?'Старый журнал':'main: посещение без сохранённого занятия'}</small></span></div>`).join('')}`;}
app.addEventListener('click',e=>{const b=e.target.closest('button, [role="button"]');if(!b)return;if(b.dataset.action==='new-location')FitPPGroupsPanel.groupEditor();if(b.dataset.action==='manage-locations'){tab='groups';render()}if(b.dataset.action==='date'){day=M.date(b.dataset.date);auto=true;hall=null;render()}if(b.dataset.action==='hall'){hall=b.dataset.id;auto=false;render()}if(b.dataset.action==='auto'){auto=true;hall=null;render()}if(b.dataset.action==='expiring')showExpiring();if(b.dataset.action==='client'){const a=Alpine.$data(document.body),c=a.clients.find(c=>String(c.id)===b.dataset.id);if(c)a.openClientDetail(c)}if(b.dataset.action==='cal-prev-month'){changeCalendarMonth(-1);render()}if(b.dataset.action==='cal-next-month'){changeCalendarMonth(1);render()}if(b.dataset.action==='cal-today'){calendarMonth=M.today().slice(0,7);calendarSelectedDay=M.today();day=M.today();render()}if(b.dataset.action==='cal-hall'){hall=b.dataset.id||null;auto=!hall;render()}if(b.dataset.action==='cal-select-day'){calendarSelectedDay=b.dataset.date;day=b.dataset.date;if(!b.dataset.date.startsWith(calendarMonth))calendarMonth=b.dataset.date.slice(0,7);render()}if(b.dataset.action==='open-journal-day'){day=b.dataset.date||calendarSelectedDay;tab='journal';auto=true;hall=null;render()}});
app.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const b=e.target.closest('[role="button"]');if(b?.dataset.action==='expiring'){e.preventDefault();showExpiring()}}});
document.querySelector('#dialog')?.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.dataset.action!=='client-from-modal')return;document.querySelector('#dialog')?.close();const a=globalThis.Alpine?.$data?.(document.body),c=a?.clients?.find(c=>String(c.id)===b.dataset.id);if(c)a.openClientDetail(c)});
app.addEventListener('change',e=>{if(e.target.id==='live-date'){try{day=M.date(e.target.value);auto=true;hall=null;render()}catch{}}});document.querySelector('.schedule-tabs').addEventListener('click',e=>{if(e.target.dataset.action==='new-location')FitPPGroupsPanel.groupEditor();if(e.target.dataset.tab){tab=e.target.dataset.tab;render()}});window.addEventListener('fitpp-groups-confirmed',e=>{const w=FitPPApplication.workspace,d=e.detail;if(w.auth.currentUser?.uid!==d?.ownerUid||w.auth.sessionGeneration!==d.generation)return;history=d.history;historyError='';last='';render()});window.addEventListener('fitpp-schedule-refresh',()=>{last='';render()});window.addEventListener('pagehide',()=>{paused=true;stopBookings()});window.addEventListener('pageshow',()=>{paused=false;render()});setInterval(render,500);render();})();
