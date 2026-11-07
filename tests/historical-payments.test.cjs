const assert = require('node:assert/strict');
const { test } = require('node:test');

const store = require('../docs/persistence.js');
const operations = require('../docs/operations.js');

test('Историческая разовая оплата относится к месяцу получения денег', () => {
  const workoutId = 'pole_2026-09-22';

  const data = store.read({
    clients: [
      { id: 'test-client', name: 'Тестовый клиент' }
    ],
    workouts: {
      [workoutId]: {
        id: workoutId,
        location: 'pole',
        originDate: '2026-09-22',
        date: '2026-09-22',
        time: '20:00',
        cancelled: false
      }
    }
  });

  const result = operations.apply(
    data,
    {},
    {
      type: 'attendance',
      workoutId,
      date: '2026-09-22',
      location: 'pole',
      clientId: 'test-client',
      status: 'attended',
      singlePayment: true,
      method: 'cash',
      received: 600,
      paymentDate: '2026-09-22',
      operationId: 'test-september-22'
    },
    '2026-11-07'
  );

  assert.equal(result.visits[workoutId]['test-client'], 'attended');
  assert.equal(result.finances['2026-09'], 600);
  assert.equal(result.finances['2026-11'] || 0, 0);
  assert.equal(store.balance(result.clients[0]), 0);
  assert.equal(store.debt(result.clients[0]), 0);
});

test('22 сентября: разовая, 29 сентября: абонемент, отмена и возврат при вводе в ноябре', () => {
  const date='2026-09-22', workoutId='pole_'+date, today='2026-11-07';
  let data=store.read({clients:[{id:'c',name:'Клиент'}],workouts:{[workoutId]:{id:workoutId,location:'pole',originDate:date,date,time:'18:30',cancelled:false}}});
  data=operations.apply(data,{}, {type:'attendance',workoutId,date,location:'pole',clientId:'c',status:'attended',singlePayment:true,method:'cash',received:600,paymentDate:date,operationId:'historical-visit'},today);
  assert.deepEqual(data.clients[0].money.entries.map(e=>e.date),[date,date]);
  data=store.reduce(data,{type:'subscription',clientId:'c',date:'2026-09-29',paymentDate:'2026-09-29',subscriptionType:'pole',method:'transfer',received:3800,operationId:'historical-sub'},today);
  assert.equal(data.finances['2026-09'],4400);
  assert.equal(store.balance(data.clients[0]),0);
  data=operations.apply(data,{}, {type:'attendance',workoutId,date,location:'pole',clientId:'c',status:null,operationId:'cancel-visit'},today);
  assert.equal(store.balance(data.clients[0]),600);
  data=store.reduce(data,{type:'refund',clientId:'c',date:today,method:'cash',received:600},today);
  assert.equal(store.balance(data.clients[0]),0);
  assert.equal(store.debt(data.clients[0]),0);
  assert.equal(data.finances['2026-11'],-600);
  assert.equal(store.report(data,'2026-09').total,4400);
  assert.equal(store.report(data,'2026-11').cashRefund,600);
});
