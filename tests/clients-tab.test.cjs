const assert = require('node:assert/strict');
const { test } = require('node:test');

const store = require('../docs/persistence.js');

function createClientsTestApp(clients = []) {
  const today = '2026-11-08';
  return {
    today,
    activeTab: 'clients',
    clientSearch: '',
    clientFilter: 'all',
    clients,
    clientDebt(c) { return c ? store.debt(c) : 0; },
    moneyBalance(c) { return c ? store.balance(c) : 0; },
    isFrozen(sub) { try { return store.frozenOn(sub, this.today); } catch { return false; } },
    formatSubscriptionDate(v) { return store.formatSubscriptionDate ? store.formatSubscriptionDate(v) : (v || '—'); },
    activeClientsCount() {
      return (this.clients || []).filter(c => !c.archivedAt).length;
    },
    archiveClientsCount() {
      return (this.clients || []).filter(c => !!c.archivedAt).length;
    },
    clientFilterCounts() {
      const list = (this.clients || []).filter(c => !c.archivedAt);
      return {
        all: list.length,
        activeSub: list.filter(c => this.clientSubStatus(c).kind === 'active').length,
        expiring: list.filter(c => ['expiring', 'ended'].includes(this.clientSubStatus(c).kind)).length,
        noSub: list.filter(c => ['none', 'ended'].includes(this.clientSubStatus(c).kind)).length,
        debt: list.filter(c => this.clientDebt(c) > 0).length,
      };
    },
    getClientActiveSubscription(client) {
      if (!client || !client.subscriptions || client.subscriptions.length === 0) return null;
      let active = client.subscriptions.find(s => s.left > 0 && !s.cancelledAt && s.expires >= this.today);
      if (active) return active;
      let hasLeft = client.subscriptions.find(s => s.left > 0 && !s.cancelledAt);
      return hasLeft || client.subscriptions[client.subscriptions.length - 1];
    },
    clientSubStatus(client) {
      if (!client) return { kind: 'none', label: 'Нет данных', sub: null };
      const validSubs = (client.subscriptions || []).filter(s => !s.cancelledAt);
      if (!validSubs.length) return { kind: 'none', label: 'Нет абонемента', sub: null };
      const current = validSubs.find(s => s.left > 0 && s.expires >= this.today);
      if (current) {
        if (this.isFrozen(current)) {
          const end = current.freezes?.at(-1)?.end || current.expires;
          return { kind: 'frozen', label: '❄️ Заморожен до ' + this.formatSubscriptionDate(end), sub: current };
        }
        if (current.left <= 2) {
          return { kind: 'expiring', label: 'Осталось: ' + current.left + ' зан. · до ' + this.formatSubscriptionDate(current.expires), sub: current };
        }
        return { kind: 'active', label: current.left + ' зан. · до ' + this.formatSubscriptionDate(current.expires), sub: current };
      }
      const frozen = validSubs.find(s => this.isFrozen(s));
      if (frozen) {
        const end = frozen.freezes?.at(-1)?.end || frozen.expires;
        return { kind: 'frozen', label: '❄️ Заморожен до ' + this.formatSubscriptionDate(end), sub: frozen };
      }
      const latest = validSubs[validSubs.length - 1];
      if (latest.left === 0) {
        return { kind: 'ended', label: 'Закончился (0 зан.)', sub: latest };
      }
      if (latest.expires < this.today) {
        return { kind: 'ended', label: 'Истёк ' + this.formatSubscriptionDate(latest.expires), sub: latest };
      }
      return { kind: 'none', label: 'Нет абонемента', sub: latest };
    },
    visibleClients() {
      const isArchive = this.activeTab === 'archive';
      let list = (this.clients || []).filter(c => !!c.archivedAt === isArchive);
      const q = (this.clientSearch || '').trim().toLowerCase();
      if (q) {
        const qDigits = q.replace(/\D/g, '');
        list = list.filter(c => {
          const nameMatch = (c.name || '').toLowerCase().includes(q);
          const phoneMatch = qDigits && (c.phone || '').replace(/\D/g, '').includes(qDigits);
          return nameMatch || phoneMatch;
        });
      }
      if (!isArchive && this.clientFilter !== 'all') {
        if (this.clientFilter === 'activeSub') {
          list = list.filter(c => this.clientSubStatus(c).kind === 'active');
        } else if (this.clientFilter === 'expiring') {
          list = list.filter(c => ['expiring', 'ended'].includes(this.clientSubStatus(c).kind));
        } else if (this.clientFilter === 'noSub') {
          list = list.filter(c => ['none', 'ended'].includes(this.clientSubStatus(c).kind));
        } else if (this.clientFilter === 'debt') {
          list = list.filter(c => this.clientDebt(c) > 0);
        }
      }
      return list.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
    }
  };
}

test('Active and Archive client counts match archivedAt flag', () => {
  const app = createClientsTestApp([
    { id: '1', name: 'Анна', phone: '+7 999 111-22-33' },
    { id: '2', name: 'Борис', phone: '+7 999 444-55-66' },
    { id: '3', name: 'Виктор', phone: '+7 999 777-88-99', archivedAt: '2026-10-01T10:00:00Z' }
  ]);

  assert.equal(app.activeClientsCount(), 2);
  assert.equal(app.archiveClientsCount(), 1);
});

test('clientSubStatus determines correct subscription states', () => {
  const app = createClientsTestApp([]);

  // 1. Active with 6 sessions left
  const activeClient = {
    id: 'c1',
    name: 'Алина',
    subscriptions: [{ left: 6, expires: '2026-12-01', location: 'zarya' }]
  };
  assert.equal(app.clientSubStatus(activeClient).kind, 'active');

  // 2. Expiring with 2 sessions left
  const expiringClient = {
    id: 'c2',
    name: 'Екатерина',
    subscriptions: [{ left: 2, expires: '2026-11-20', location: 'zarya' }]
  };
  assert.equal(app.clientSubStatus(expiringClient).kind, 'expiring');

  // 3. Ended with 0 sessions
  const endedClient = {
    id: 'c3',
    name: 'Дмитрий',
    subscriptions: [{ left: 0, expires: '2026-11-20', location: 'zarya' }]
  };
  assert.equal(app.clientSubStatus(endedClient).kind, 'ended');

  // 4. Ended because expired by date
  const expiredDateClient = {
    id: 'c4',
    name: 'Ольга',
    subscriptions: [{ left: 4, expires: '2026-10-01', location: 'zarya' }]
  };
  assert.equal(app.clientSubStatus(expiredDateClient).kind, 'ended');

  // 5. Frozen subscription
  const frozenClient = {
    id: 'c5',
    name: 'Мария',
    subscriptions: [{
      left: 5,
      expires: '2026-12-10',
      location: 'zarya',
      freezes: [{
        version: 1,
        start: '2026-11-05',
        end: '2026-11-15',
        returnDate: '2026-11-15',
        baseExpires: '2026-11-30'
      }]
    }]
  };
  assert.equal(app.clientSubStatus(frozenClient).kind, 'frozen');

  // 6. No subscriptions at all
  const noSubClient = { id: 'c6', name: 'Иван', subscriptions: [] };
  assert.equal(app.clientSubStatus(noSubClient).kind, 'none');
});

test('Search filters clients by Russian name or phone digits', () => {
  const app = createClientsTestApp([
    { id: '1', name: 'Светлана Соколова', phone: '+7 (916) 123-45-67' },
    { id: '2', name: 'Иван Иванов', phone: '+7 (903) 765-43-21' },
    { id: '3', name: 'Анна Кузнецова', phone: '+7 (916) 888-99-00' }
  ]);

  // Search by name (case insensitive)
  app.clientSearch = 'свет';
  assert.equal(app.visibleClients().length, 1);
  assert.equal(app.visibleClients()[0].name, 'Светлана Соколова');

  // Search by phone digits
  app.clientSearch = '76543';
  assert.equal(app.visibleClients().length, 1);
  assert.equal(app.visibleClients()[0].name, 'Иван Иванов');

  // Search with no matches
  app.clientSearch = 'Петр';
  assert.equal(app.visibleClients().length, 0);

  // Clear search
  app.clientSearch = '';
  assert.equal(app.visibleClients().length, 3);
});

test('Filter chips filter active clients correctly and show accurate counts', () => {
  const app = createClientsTestApp([
    { id: '1', name: 'Анна', subscriptions: [{ left: 8, expires: '2026-12-01', location: 'zarya' }] },
    { id: '2', name: 'Борис', subscriptions: [{ left: 1, expires: '2026-11-15', location: 'zarya' }] },
    { id: '3', name: 'Вера', subscriptions: [] },
    { id: '4', name: 'Глеб', subscriptions: [{ left: 0, expires: '2026-11-01', location: 'zarya' }] }
  ]);

  const counts = app.clientFilterCounts();
  assert.equal(counts.all, 4);
  assert.equal(counts.activeSub, 1); // Анна
  assert.equal(counts.expiring, 2);  // Борис (1 left) + Глеб (0 left)
  assert.equal(counts.noSub, 2);     // Вера (none) + Глеб (ended)

  app.clientFilter = 'activeSub';
  assert.equal(app.visibleClients().length, 1);
  assert.equal(app.visibleClients()[0].name, 'Анна');

  app.clientFilter = 'expiring';
  assert.equal(app.visibleClients().length, 2);
  assert.deepEqual(app.visibleClients().map(c => c.name), ['Борис', 'Глеб']);

  app.clientFilter = 'noSub';
  assert.equal(app.visibleClients().length, 2);
  assert.deepEqual(app.visibleClients().map(c => c.name), ['Вера', 'Глеб']);
});
