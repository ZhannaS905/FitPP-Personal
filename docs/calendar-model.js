(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FitPPCalendar=api})(typeof globalThis!=='undefined'?globalThis:this,()=>{'use strict';
const halls=['zarya','pole','online'];
function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw Error('Некорректная дата');return value}
function add(value,n){date(value);const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function workouts(raw){const ids=new Set();return Object.values(raw?.workouts||{}).filter(w=>{if(!w||typeof w.id!=='string'||ids.has(w.id)||typeof w.location!=='string'||!(/^[a-z][a-z0-9-]{0,79}$/).test(w.location))return false;try{date(w.date);date(w.originDate||w.date)}catch{return false}if(!/^\d\d:\d\d$/.test(w.time||''))return false;ids.add(w.id);return true}).sort((a,b)=>a.date.localeCompare(b.date)||Number(a.cancelled)-Number(b.cancelled)||a.time.localeCompare(b.time)||a.id.localeCompare(b.id))}
function confirmed(raw,old){const current=workouts(raw),ids=new Set(current.map(w=>w.id));return [...current.map(w=>({...w,source:'main'})),...workouts(old).filter(w=>!ids.has(w.id)).map(w=>({...w,source:'trainers'}))]}
function history(raw,source){const rows=[],seen=new Set(),clients=new Map((raw?.clients||[]).map(c=>[String(c.id),c])),ws=new Map(workouts(raw).map(w=>[w.id,w]));
 for(const [wid,entries]of Object.entries(raw?.visits||{})){const w=ws.get(wid);const inferred=/^(zarya|pole|online)_(\d{4}-\d{2}-\d{2})$/.exec(wid);for(const [cid,status]of Object.entries(entries)){if(!status)continue;const key=wid+'/'+cid;if(seen.has(key))continue;seen.add(key);rows.push({source,key,workoutId:wid,clientId:cid,name:clients.get(cid)?.name||'Клиент отсутствует в источнике',date:w?.date||inferred?.[2]||null,location:w?.location||inferred?.[1]||null,time:w?.time||null,status,workoutConfirmed:!!w})}}
 for(const [day,entries]of Object.entries(raw?.attendance||{}))for(const [cid,status]of Object.entries(entries)){const link=raw.legacyLinks?.[day+'/'+cid];if(link&&seen.has(link+'/'+cid))continue;if(!status)continue;rows.push({source,key:'legacy/'+day+'/'+cid,workoutId:link||null,clientId:cid,name:clients.get(cid)?.name||'Клиент отсутствует в источнике',date:day,location:raw.attendanceOps?.[day]?.[cid]?.location||null,time:null,status,workoutConfirmed:false})}
 return rows;
}
function entries(raw,bookings,w){
 const visits=raw.visits?.[w.id]||{}, clients=new Map((raw.clients||[]).map(c=>[String(c.id),c]));
 const people=new Map(Object.keys(visits).map(id=>[id,{}]));
 const matching=workouts(raw).filter(x=>x.date===w.date&&x.location===w.location);
 const active=matching.filter(x=>!x.cancelled), legacyWorkouts=active.length?active:matching;
 for(const [key,value] of Object.entries(bookings?.entries||{})){
  if(value!==true)continue;
  try{
   const parts=JSON.parse(key);
   if(!Array.isArray(parts))continue;
   const [id,scope,location]=parts;
   const exact=parts.length===2&&scope===w.id;
   const legacy=parts.length===3&&scope===w.date&&location===w.location&&legacyWorkouts.some(x=>x.id===w.id);
   if(exact||legacy&&!people.get(id)?.exact)people.set(id,{bookingKey:key,exact,ambiguousBooking:legacy&&legacyWorkouts.length>1});
  }catch{}
 }
 return [...people].map(([id,booking])=>({id,client:clients.get(id),status:visits[id]||null,booked:!!booking.bookingKey,...booking}));
}
function view(raw,bookings,day){date(day);const all=workouts(raw),rows=all.filter(w=>w.date===day).map(w=>({...w,clients:entries(raw,bookings,w)})),moved=all.filter(w=>w.originDate===day&&w.date!==day);return {rows,moved,autoHalls:[...new Set(rows.filter(w=>!w.cancelled).map(w=>w.location))],week:Array.from({length:7},(_,i)=>add(day,i-3))}}
return Object.freeze({date,add,today,halls,workouts,confirmed,history,entries,view});});
