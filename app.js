/* ระบบรายงานความเสี่ยง NAH — Frontend (Vue 3, no build step) */
(function () {
  'use strict';

  const CFG = Object.assign({ API_URL: '', SESSION_HOURS: 6 }, window.NAH_CONFIG || {});
  const DEMO = !String(CFG.API_URL || '').trim();

  const STATUS = ['รอดำเนินการ', 'กำลังดำเนินการ', 'เสร็จสิ้น'];
  const PROGRAMS = ['PCT', 'IC', 'PTC', 'ENV', 'HRD', 'Lab', 'ETHIC', 'IT', 'เวชระเบียน', 'อื่นๆ'];
  const CLINICAL = [
    { v: 'A', t: 'มีเหตุการณ์ที่อาจเกิดความผิดพลาด' },
    { v: 'B', t: 'เกิดความผิดพลาดแต่ไม่ถึงผู้ป่วย' },
    { v: 'C', t: 'ถึงผู้ป่วย แต่ไม่เกิดอันตราย' },
    { v: 'D', t: 'ถึงผู้ป่วย ต้องเฝ้าระวังเพิ่ม' },
    { v: 'E', t: 'อันตรายชั่วคราว ต้องรักษาเพิ่ม' },
    { v: 'F', t: 'อันตรายชั่วคราว ต้องนอน รพ./นอนนานขึ้น' },
    { v: 'G', t: 'พิการถาวร' },
    { v: 'H', t: 'ต้องช่วยชีวิต' },
    { v: 'I', t: 'เสียชีวิต' }
  ];
  const SUPPORT = [
    { v: '1', t: 'น้อยที่สุด' }, { v: '2', t: 'น้อย' }, { v: '3', t: 'ปานกลาง' },
    { v: '4', t: 'มาก' }, { v: '5', t: 'รุนแรงที่สุด' }
  ];
  const SEV_RANK = { none: 0, low: 1, mid: 2, high: 3 };
  const SEV_LABEL = { none: 'ยังไม่ระบุ', low: 'ต่ำ', mid: 'กลาง', high: 'สูง' };

  /* ---------------- helpers ---------------- */
  const pad = (n, l) => String(n).padStart(l || 2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const nowIso = () => { const d = new Date(); return ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
  const blankForm = () => ({ date: '', riskCode: '', subject: '', detail: '', clinicalLevel: '', supportLevel: '', relatedProgram: '', initialFix: '', fixPlan: '', responsiblePerson: '' });
  const clone = o => JSON.parse(JSON.stringify(o));

  function levelOf(clinical, support) {
    const c = clinical && 'ABCDEFGHI'.indexOf(clinical) >= 0 ? 'ABCDEFGHI'.indexOf(clinical) : -1;
    const s = Number(support) || 0;
    let a = 'none', b = 'none';
    if (c >= 4) a = 'high'; else if (c >= 2) a = 'mid'; else if (c >= 0) a = 'low';
    if (s >= 4) b = 'high'; else if (s === 3) b = 'mid'; else if (s >= 1) b = 'low';
    return SEV_RANK[a] >= SEV_RANK[b] ? a : b;
  }

  /* ---------------- storage (demo mode) ---------------- */
  const mem = {};
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return k in mem ? JSON.parse(mem[k]) : d; } },
    set(k, v) { const s = JSON.stringify(v); try { localStorage.setItem(k, s); } catch (e) { mem[k] = s; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { delete mem[k]; } }
  };

  /* ---------------- demo backend (mirrors Code.gs) ---------------- */
  function seedReports() {
    const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
    const items = [
      [1, 'LAB-01 : ติดฉลากหลอดเลือดผิดคน', 'พยาบาลติดฉลากหลอดเก็บเลือดสลับผู้ป่วย 2 ราย ตรวจพบก่อนส่งตรวจ', 'B', '2', 'Lab', 'เสร็จสิ้น'],
      [2, 'LAB-07 : ตู้เย็นเก็บน้ำยาอุณหภูมิเกินช่วงกำหนด', 'อุณหภูมิตู้เย็นน้ำยา Chemistry สูงกว่า 8°C นาน 3 ชั่วโมง', 'A', '4', 'ENV', 'กำลังดำเนินการ'],
      [4, 'IT-02 : ระบบ LIS ขัดข้องช่วงเช้า', 'ระบบ LIS เชื่อมต่อไม่ได้ 40 นาที ต้องบันทึกผลด้วยมือ', 'C', '3', 'IT', 'เสร็จสิ้น'],
      [6, 'PCT-04 : ผลวิกฤติรายงานล่าช้า', 'ผลโพแทสเซียมสูงผิดปกติแจ้งหอผู้ป่วยหลังพบค่า 25 นาที', 'E', '3', 'PCT', 'รอดำเนินการ'],
      [9, 'IC-03 : พบการปนเปื้อนบนโต๊ะปฏิบัติงาน', 'ตรวจพบรอยหกของตัวอย่างบนโต๊ะ ไม่ได้เช็ดทำความสะอาดตามขั้นตอน', 'B', '2', 'IC', 'เสร็จสิ้น'],
      [12, 'HRD-01 : เจ้าหน้าที่ใหม่ยังไม่ผ่านการประเมินสมรรถนะ', 'เจ้าหน้าที่ใหม่ปฏิบัติงานเดี่ยวก่อนผ่านการประเมิน', 'D', '4', 'HRD', 'กำลังดำเนินการ'],
      [15, 'เวชระเบียน-05 : ใบสั่งตรวจชื่อไม่ตรงกับตัวอย่าง', 'ชื่อบนใบสั่งตรวจต่างจากฉลากตัวอย่าง แก้ไขก่อนรายงานผล', 'B', '1', 'เวชระเบียน', 'รอดำเนินการ']
    ];
    return items.map((x, i) => {
      const d = day(x[0]);
      return {
        id: 'R' + d.getFullYear() + pad(d.getMonth() + 1) + '-' + pad(i + 1, 4),
        createdAt: ymd(d) + 'T09:00:00', date: ymd(d), riskCode: '', subject: x[1], detail: x[2],
        clinicalLevel: x[3], supportLevel: x[4], relatedProgram: x[5],
        initialFix: 'แจ้งหัวหน้างานและบันทึกเหตุการณ์', fixPlan: 'ทบทวนขั้นตอนปฏิบัติงานและอบรมทีม',
        responsiblePerson: 'หัวหน้าห้องปฏิบัติการ', reporterName: 'ข้อมูลตัวอย่าง', status: x[6], updatedAt: '', updatedBy: ''
      };
    });
  }

  const demoDb = {
    users() {
      let u = store.get('nah_demo_users');
      if (!u) {
        u = [
          { username: 'admin', password: 'admin1234', role: 'admin', status: 'active', displayName: 'ผู้ดูแลระบบ' },
          { username: 'user', password: 'user1234', role: 'user', status: 'active', displayName: 'เจ้าหน้าที่ห้องปฏิบัติการ' }
        ];
        store.set('nah_demo_users', u);
      }
      return u;
    },
    reports() {
      let r = store.get('nah_demo_reports');
      if (!r) { r = seedReports(); store.set('nah_demo_reports', r); }
      return r;
    }
  };

  function demoApi(req, me) {
    const ok = d => Object.assign({ success: true }, d);
    const no = m => ({ success: false, message: m });
    const needAdmin = () => (me && me.role === 'admin') ? null : no('ต้องใช้สิทธิ์ผู้ดูแลระบบ');

    if (req.action === 'login') {
      const u = demoDb.users().find(x => x.username.toLowerCase() === String(req.username).toLowerCase());
      if (!u || u.password !== req.password) return no('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      if (u.status !== 'active') return no('บัญชีถูกระงับการใช้งาน');
      return ok({ token: 'demo-' + Date.now(), user: { username: u.username, role: u.role, displayName: u.displayName } });
    }
    if (!me) return { success: false, code: 'AUTH', message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' };

    switch (req.action) {
      case 'logout': return ok({});
      case 'listReports': return ok({ data: demoDb.reports().slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) });
      case 'saveReport': {
        const r = req.report, list = demoDb.reports();
        const now = new Date(), prefix = 'R' + now.getFullYear() + pad(now.getMonth() + 1) + '-';
        const seq = list.reduce((m, x) => x.id.indexOf(prefix) === 0 ? Math.max(m, Number(x.id.slice(prefix.length)) || 0) : m, 0) + 1;
        const rec = Object.assign({}, r, { id: prefix + pad(seq, 4), createdAt: nowIso(), reporterName: me.displayName, status: STATUS[0], updatedAt: '', updatedBy: '' });
        list.push(rec); store.set('nah_demo_reports', list);
        return ok({ message: 'บันทึกรายงานเรียบร้อย (' + rec.id + ')', data: rec });
      }
      case 'updateStatus': {
        const e = needAdmin(); if (e) return e;
        const list = demoDb.reports(), r = list.find(x => x.id === req.id);
        if (!r) return no('ไม่พบรายงานนี้');
        r.status = req.status; r.updatedAt = nowIso(); r.updatedBy = me.displayName;
        store.set('nah_demo_reports', list);
        return ok({ message: 'อัปเดตสถานะแล้ว', data: { id: r.id, status: r.status, updatedAt: r.updatedAt, updatedBy: r.updatedBy } });
      }
      case 'deleteReport': {
        const e = needAdmin(); if (e) return e;
        store.set('nah_demo_reports', demoDb.reports().filter(x => x.id !== req.id));
        return ok({ message: 'ลบรายงานแล้ว' });
      }
      case 'listUsers': {
        const e = needAdmin(); if (e) return e;
        return ok({ data: demoDb.users().map(u => ({ username: u.username, role: u.role, status: u.status, displayName: u.displayName })) });
      }
      case 'saveUser': {
        const e = needAdmin(); if (e) return e;
        const d = req.user, list = demoDb.users();
        if (!/^[A-Za-z0-9_.-]{3,30}$/.test(d.username || '')) return no('ชื่อผู้ใช้ต้องเป็นตัวอักษรอังกฤษ/ตัวเลข 3-30 ตัว (ใช้ _ . - ได้)');
        if (!d.displayName) return no('กรุณากรอกชื่อที่แสดง');
        const f = list.find(x => x.username.toLowerCase() === d.username.toLowerCase());
        if (d.isNew) {
          if (f) return no('มีชื่อผู้ใช้นี้อยู่แล้ว');
          if ((d.password || '').length < 6) return no('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
          list.push({ username: d.username, password: d.password, role: d.role, status: d.status, displayName: d.displayName });
        } else {
          if (!f) return no('ไม่พบผู้ใช้นี้');
          if (f.username === me.username && (d.role !== 'admin' || d.status !== 'active')) return no('ไม่สามารถลดสิทธิ์หรือระงับบัญชีของตัวเองได้');
          if (d.password && d.password.length < 6) return no('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
          Object.assign(f, { role: d.role, status: d.status, displayName: d.displayName });
          if (d.password) f.password = d.password;
        }
        store.set('nah_demo_users', list);
        return ok({ message: d.isNew ? 'เพิ่มผู้ใช้เรียบร้อย' : 'บันทึกข้อมูลผู้ใช้แล้ว' });
      }
      case 'deleteUser': {
        const e = needAdmin(); if (e) return e;
        if (req.username === me.username) return no('ไม่สามารถลบบัญชีของตัวเองได้');
        store.set('nah_demo_users', demoDb.users().filter(x => x.username !== req.username));
        return ok({ message: 'ลบผู้ใช้แล้ว' });
      }
      case 'resetData': {
        const e = needAdmin(); if (e) return e;
        if (req.confirm !== 'RESET CONFIRM') return no('คำยืนยันไม่ถูกต้อง');
        store.set('nah_demo_reports', []);
        return ok({ message: 'ลบรายการความเสี่ยงทั้งหมดแล้ว' });
      }
      default: return no('ไม่รู้จักคำสั่ง: ' + req.action);
    }
  }

  /* ---------------- Vue app ---------------- */
  Vue.createApp({
    data() {
      return {
        demo: DEMO, user: null, token: '', tab: 'dashboard',
        login: { username: '', password: '', show: false, error: '' },
        busy: { login: false, save: false, load: false, user: false, reset: false, status: false },
        reports: [], users: [],
        f: { q: '', status: '', program: '', sev: '', clinical: '', support: '' },
        form: blankForm(), errors: {},
        detail: null, detailStatus: '',
        userModal: { open: false, isNew: true, data: {} }, userErr: '',
        confirm: { open: false, title: '', message: '', okText: 'ยืนยัน', danger: false, resolve: null },
        resetText: '', toasts: [], toastSeq: 0, today: ymd(new Date()),
        STATUS, PROGRAMS, CLINICAL, SUPPORT
      };
    },

    computed: {
      isAdmin() { return !!this.user && this.user.role === 'admin'; },
      initial() { return this.user ? (this.user.displayName || '?').trim().charAt(0).toUpperCase() : ''; },
      tabs() {
        const t = [
          { id: 'dashboard', label: 'Dashboard', icon: 'fas fa-chart-pie' },
          { id: 'new', label: 'รายงานใหม่', icon: 'fas fa-file-circle-plus' },
          { id: 'list', label: 'รายการ', icon: 'fas fa-list-ul' }
        ];
        if (this.isAdmin) t.push({ id: 'users', label: 'ผู้ใช้', icon: 'fas fa-users' }, { id: 'reset', label: 'Reset', icon: 'fas fa-trash-can' });
        return t;
      },
      stats() {
        const r = this.reports, c = s => r.filter(x => x.status === s).length;
        const done = c(STATUS[2]);
        return {
          total: r.length, done, progress: c(STATUS[1]), pending: c(STATUS[0]),
          highPending: r.filter(x => x.status === STATUS[0] && this.sevOf(x) === 'high').length,
          donePct: r.length ? Math.round(done * 100 / r.length) : 0
        };
      },
      matrix() {
        const map = {}, cols = CLINICAL.map(() => 0);
        const keys = PROGRAMS.slice();
        this.reports.forEach(r => {
          const i = CLINICAL.findIndex(c => c.v === r.clinicalLevel);
          if (i < 0) return;
          const p = r.relatedProgram || '';
          if (p && keys.indexOf(p) < 0) keys.push(p);
          (map[p] = map[p] || CLINICAL.map(() => 0))[i]++;
          cols[i]++;
        });
        if (map['']) keys.push('');
        const rows = keys.map(p => {
          const cells = map[p] || CLINICAL.map(() => 0);
          return { program: p, label: p || 'ไม่ระบุโปรแกรม', cells, total: cells.reduce((a, b) => a + b, 0) };
        });
        const max = Math.max(1, ...rows.map(r => Math.max(...r.cells)));
        return { rows, cols, max };
      },
      supportCounts() {
        const o = {}; SUPPORT.forEach(s => { o[s.v] = this.reports.filter(r => r.supportLevel === s.v).length; }); return o;
      },
      recent() { return this.reports.slice(0, 5); },
      hasFilter() { return Object.keys(this.f).some(k => this.f[k]); },
      filtered() {
        const f = this.f, q = f.q.toLowerCase();
        return this.reports.filter(r =>
          (!f.status || r.status === f.status) &&
          (!f.program || r.relatedProgram === f.program) &&
          (!f.sev || this.sevOf(r) === f.sev) &&
          (!f.clinical || r.clinicalLevel === f.clinical) &&
          (!f.support || r.supportLevel === f.support) &&
          (!q || [r.id, r.subject, r.detail, r.reporterName, r.riskCode, r.responsiblePerson].join(' ').toLowerCase().indexOf(q) >= 0)
        );
      }
    },

    methods: {
      /* ---- display helpers ---- */
      sevOf(r) { return levelOf(r.clinicalLevel, r.supportLevel); },
      sevLabel(s) { return SEV_LABEL[s] || SEV_LABEL.none; },
      zoneOf(c) { const i = 'ABCDEFGHI'.indexOf(c); return i >= 4 ? 'z-high' : i >= 2 ? 'z-mid' : 'z-low'; },
      alpha(n) { return n ? (0.4 + 0.6 * n / this.matrix.max).toFixed(2) : 0; },
      pct(n) { return this.stats.total ? (n * 100 / this.stats.total).toFixed(1) : 0; },
      statusIdx(s) { const i = STATUS.indexOf(s); return i < 0 ? 0 : i; },
      statusIcon(s) { return ['fas fa-hourglass-half', 'fas fa-gears', 'fas fa-circle-check'][this.statusIdx(s)]; },
      fmtDate(s) {
        if (!s) return '-';
        const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return s;
        return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
      },
      fmtDateTime(s) {
        const m = String(s || '').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
        return m ? this.fmtDate(m[1]) + ' ' + m[2] + ' น.' : (s || '-');
      },
      toast(text, type) {
        const id = ++this.toastSeq;
        this.toasts.push({ id, text, type: type || 'ok' });
        setTimeout(() => { this.toasts = this.toasts.filter(t => t.id !== id); }, type === 'err' ? 6000 : 3500);
      },
      ask(o) {
        return new Promise(resolve => { this.confirm = Object.assign({ open: true, okText: 'ยืนยัน', danger: false, resolve }, o); });
      },
      answer(v) { const r = this.confirm.resolve; this.confirm.open = false; if (r) r(v); },

      /* ---- API ---- */
      async api(action, payload) {
        const body = Object.assign({ action, token: this.token }, payload || {});
        let res;
        if (DEMO) {
          await new Promise(r => setTimeout(r, 180));
          res = demoApi(body, this.user);
        } else {
          try {
            const r = await fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(body), redirect: 'follow' });
            res = await r.json();
          } catch (e) {
            res = { success: false, message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต และ API_URL ใน config.js (ต้อง Deploy แบบ Anyone)' };
          }
        }
        if (res && res.code === 'AUTH' && this.user) this.logout(res.message);
        return res;
      },

      /* ---- session ---- */
      saveSession(exp) { store.set('nah_session', { token: this.token, user: this.user, exp }); },
      async doLogin() {
        this.login.error = '';
        if (!this.login.username || !this.login.password) { this.login.error = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'; return; }
        this.busy.login = true;
        const res = await this.api('login', { username: this.login.username, password: this.login.password });
        this.busy.login = false;
        if (!res.success) { this.login.error = res.message; return; }
        this.token = res.token; this.user = res.user;
        this.saveSession(Date.now() + CFG.SESSION_HOURS * 3600 * 1000);
        this.login = { username: '', password: '', show: false, error: '' };
        this.tab = 'dashboard';
        this.refresh();
      },
      logout(msg) {
        const t = this.token;
        store.del('nah_session');
        this.user = null; this.token = '';
        if (t && !DEMO) fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify({ action: 'logout', token: t }) }).catch(() => {}); this.reports = []; this.users = []; this.detail = null;
        this.resetForm(); this.resetText = ''; this.clearFilters();
        if (typeof msg === 'string' && msg) this.login.error = msg;
      },

      /* ---- data ---- */
      async refresh() {
        await this.loadReports();
        if (this.isAdmin && this.tab === 'users') this.loadUsers();
      },
      async loadReports() {
        this.busy.load = true;
        const res = await this.api('listReports');
        this.busy.load = false;
        if (res.success) this.reports = res.data || [];
        else if (res.code !== 'AUTH') this.toast(res.message, 'err');
      },
      async loadUsers() {
        this.busy.load = true;
        const res = await this.api('listUsers');
        this.busy.load = false;
        if (res.success) this.users = res.data || [];
        else if (res.code !== 'AUTH') this.toast(res.message, 'err');
      },
      setTab(id) {
        this.tab = id;
        if (id === 'users') this.loadUsers();
        window.scrollTo({ top: 0 });
      },
      goList(filters) {
        this.f = Object.assign({ q: '', status: '', program: '', sev: '', clinical: '', support: '' }, filters);
        this.setTab('list');
      },
      clearFilters() { this.f = { q: '', status: '', program: '', sev: '', clinical: '', support: '' }; },

      /* ---- reports ---- */
      resetForm() { this.form = blankForm(); this.errors = {}; },
      validate() {
        const e = {}, f = this.form;
        if (!f.date) e.date = 'กรุณาเลือกวันที่เกิดเหตุ';
        else if (f.date > this.today) e.date = 'วันที่เกิดเหตุต้องไม่เป็นวันในอนาคต';
        if (!f.subject) e.subject = 'กรุณากรอก "รหัส : เรื่อง"';
        if (!f.detail) e.detail = 'กรุณากรอกรายละเอียดความเสี่ยง/อุบัติการณ์';
        this.errors = e;
        return !Object.keys(e).length;
      },
      async saveReport() {
        this.today = ymd(new Date());
        if (!this.validate()) { this.toast('กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบถ้วน', 'err'); return; }
        this.busy.save = true;
        const res = await this.api('saveReport', { report: clone(this.form) });
        this.busy.save = false;
        if (!res.success) { if (res.code !== 'AUTH') this.toast(res.message, 'err'); return; }
        this.toast(res.message);
        this.resetForm();
        await this.loadReports();
        this.clearFilters();
        this.setTab('list');
      },
      openDetail(r) { this.detail = r; this.detailStatus = r.status; },
      async updateStatus() {
        const d = this.detail;
        this.busy.status = true;
        const res = await this.api('updateStatus', { id: d.id, status: this.detailStatus });
        this.busy.status = false;
        if (!res.success) { if (res.code !== 'AUTH') this.toast(res.message, 'err'); return; }
        Object.assign(d, res.data);
        this.toast('อัปเดตสถานะเป็น "' + d.status + '" แล้ว');
      },
      async removeReport(r) {
        const yes = await this.ask({ title: 'ลบรายงาน', message: 'ต้องการลบรายงาน ' + r.id + ' ใช่หรือไม่? การลบไม่สามารถย้อนกลับได้', okText: 'ลบรายงาน', danger: true });
        if (!yes) return;
        const res = await this.api('deleteReport', { id: r.id });
        if (!res.success) { if (res.code !== 'AUTH') this.toast(res.message, 'err'); return; }
        this.detail = null;
        this.reports = this.reports.filter(x => x.id !== r.id);
        this.toast(res.message);
      },
      exportCsv() {
        const cols = [
          ['id', 'รหัสรายงาน'], ['date', 'วันที่เกิดเหตุ'], ['riskCode', 'รหัสความเสี่ยง'], ['subject', 'เรื่อง'], ['detail', 'รายละเอียด'],
          ['clinicalLevel', 'ระดับคลินิก'], ['supportLevel', 'ระดับสนับสนุน'], ['relatedProgram', 'โปรแกรม'],
          ['initialFix', 'การแก้ไขเบื้องต้น'], ['fixPlan', 'แผนแก้ไข'], ['responsiblePerson', 'ผู้รับผิดชอบ'],
          ['reporterName', 'ผู้รายงาน'], ['status', 'สถานะ'], ['createdAt', 'บันทึกเมื่อ']
        ];
        const esc = v => {
          let s = String(v == null ? '' : v);
          if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;           // กัน formula injection ใน Excel
          return '"' + s.replace(/"/g, '""') + '"';
        };
        const lines = [cols.map(c => esc(c[1])).join(',')]
          .concat(this.filtered.map(r => cols.map(c => esc(r[c[0]])).join(',')));
        const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'nah-risk-' + ymd(new Date()).replace(/-/g, '') + '.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        this.toast('ส่งออก ' + this.filtered.length + ' รายการแล้ว');
      },

      /* ---- users ---- */
      openUser(u) {
        this.userErr = '';
        this.userModal = u
          ? { open: true, isNew: false, data: { username: u.username, displayName: u.displayName, role: u.role, status: u.status, password: '' } }
          : { open: true, isNew: true, data: { username: '', displayName: '', role: 'user', status: 'active', password: '' } };
      },
      async saveUser() {
        this.userErr = '';
        this.busy.user = true;
        const res = await this.api('saveUser', { user: Object.assign({ isNew: this.userModal.isNew }, this.userModal.data) });
        this.busy.user = false;
        if (!res.success) { this.userErr = res.message; return; }
        this.userModal.open = false;
        this.toast(res.message);
        this.loadUsers();
      },
      async removeUser(u) {
        const yes = await this.ask({ title: 'ลบผู้ใช้', message: 'ต้องการลบผู้ใช้ "' + u.username + '" ใช่หรือไม่?', okText: 'ลบผู้ใช้', danger: true });
        if (!yes) return;
        const res = await this.api('deleteUser', { username: u.username });
        if (!res.success) { if (res.code !== 'AUTH') this.toast(res.message, 'err'); return; }
        this.toast(res.message);
        this.loadUsers();
      },

      /* ---- reset ---- */
      async doReset() {
        if (this.resetText !== 'RESET CONFIRM') { this.toast('กรุณาพิมพ์ยืนยันให้ถูกต้อง', 'err'); return; }
        const yes = await this.ask({ title: 'ยืนยันการ Reset', message: 'ลบรายการความเสี่ยงทั้งหมดถาวร ต้องการดำเนินการต่อหรือไม่?', okText: 'ลบทั้งหมด', danger: true });
        if (!yes) return;
        this.busy.reset = true;
        const res = await this.api('resetData', { confirm: this.resetText });
        this.busy.reset = false;
        if (!res.success) { if (res.code !== 'AUTH') this.toast(res.message, 'err'); return; }
        this.resetText = '';
        this.reports = [];
        this.toast(res.message);
      }
    },

    mounted() {
      const s = store.get('nah_session');
      if (s && s.token && s.user && s.exp > Date.now()) {
        this.token = s.token; this.user = s.user;
        this.refresh();
      } else if (s) {
        store.del('nah_session');
      }
      document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (this.confirm.open) this.answer(false);
        else if (this.userModal.open) this.userModal.open = false;
        else if (this.detail) this.detail = null;
      });
    }
  }).mount('#app');
})();
