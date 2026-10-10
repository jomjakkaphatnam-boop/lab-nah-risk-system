/**
 * ระบบรายงานความเสี่ยง NAH — Backend (Google Apps Script Web App / JSON API)
 *
 * วิธีใช้งานอย่างย่อ
 *  1) วางไฟล์นี้ใน Apps Script  2) รันฟังก์ชัน setup() หนึ่งครั้ง (อนุญาตสิทธิ์)
 *  3) Deploy > New deployment > Web app
 *       Execute as: Me   |   Who has access: Anyone
 *  4) คัดลอก Web app URL ไปใส่ใน config.js (API_URL) ของหน้าเว็บบน GitHub Pages
 *
 * หมายเหตุ: ทุกครั้งที่แก้ไขโค้ดนี้ต้อง Deploy > Manage deployments > Edit > New version
 */

const SPREADSHEET_ID = '1EpaKPx8j4g_g-pCnS5DC-KKttoWNvE_-kWJ8OPDMVPI';

const SHEET_USERS = 'Users';
const SHEET_REPORTS = 'Reports';

// คอลัมน์ชีต Users ใช้ลำดับเดิม: A=username, B=password, C=role, D=status, E=displayName
const USER_HEADERS = ['username', 'password', 'role', 'status', 'displayName'];
const REPORT_HEADERS = [
  'id', 'createdAt', 'date', 'riskCode', 'subject', 'detail',
  'clinicalLevel', 'supportLevel', 'relatedProgram',
  'initialFix', 'fixPlan', 'responsiblePerson', 'reporterName',
  'status', 'updatedAt', 'updatedBy'
];

const STATUSES = ['รอดำเนินการ', 'กำลังดำเนินการ', 'เสร็จสิ้น'];
const PROGRAMS = ['PCT', 'IC', 'PTC', 'ENV', 'HRD', 'Lab', 'ETHIC', 'IT', 'เวชระเบียน', 'อื่นๆ'];
const CLINICAL_LEVELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
const SUPPORT_LEVELS = ['1', '2', '3', '4', '5'];

const SESSION_TTL = 6 * 60 * 60;   // วินาที (สูงสุดของ CacheService คือ 6 ชม.)
const MAX_LOGIN_FAILS = 5;         // ใส่รหัสผิดได้กี่ครั้ง
const LOCK_SECONDS = 5 * 60;       // ล็อกชั่วคราวหลังใส่ผิดเกินกำหนด
const PASSWORD_SALT = 'NAH-RISK::';

/* ------------------------------------------------------------------ */
/*  Entry points                                                       */
/* ------------------------------------------------------------------ */

function doGet() {
  return json_({ success: true, message: 'NAH Risk API is running', time: new Date().toISOString() });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_(fail_('รูปแบบคำขอไม่ถูกต้อง'));
  }
  try {
    return json_(route_(req));
  } catch (err) {
    console.error(err);
    return json_(fail_('เกิดข้อผิดพลาดที่เซิร์ฟเวอร์: ' + (err && err.message ? err.message : err)));
  }
}

function route_(req) {
  if (req.action === 'login') return login_(req);

  const user = getSession_(req.token);
  if (!user) return { success: false, code: 'AUTH', message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' };

  switch (req.action) {
    case 'logout':       return logout_(req);
    case 'listReports':  return listReports_();
    case 'saveReport':   return saveReport_(req, user);
    case 'updateStatus': return requireAdmin_(user) || updateStatus_(req, user);
    case 'deleteReport': return requireAdmin_(user) || deleteReport_(req);
    case 'listUsers':    return requireAdmin_(user) || listUsers_();
    case 'saveUser':     return requireAdmin_(user) || saveUser_(req, user);
    case 'deleteUser':   return requireAdmin_(user) || deleteUser_(req, user);
    case 'resetData':    return requireAdmin_(user) || resetData_(req);
    default:             return fail_('ไม่รู้จักคำสั่ง: ' + req.action);
  }
}

/* ------------------------------------------------------------------ */
/*  Auth                                                               */
/* ------------------------------------------------------------------ */

function login_(req) {
  const username = String(req.username || '').trim();
  const password = String(req.password || '');
  if (!username || !password) return fail_('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');

  const cache = CacheService.getScriptCache();
  const failKey = 'fail:' + username.toLowerCase();
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_LOGIN_FAILS) return fail_('ใส่รหัสผ่านผิดหลายครั้งเกินไป กรุณารอ 5 นาทีแล้วลองใหม่');

  const sh = getSheet_(SHEET_USERS, USER_HEADERS);
  const u = readRows_(sh, USER_HEADERS).find(x => x.username.toLowerCase() === username.toLowerCase());

  let ok = false;
  if (u && u.password) {
    if (/^[0-9a-f]{64}$/.test(u.password)) {
      ok = u.password === hash_(password);
    } else if (u.password === password) {
      // รหัสผ่านเดิมเป็นข้อความธรรมดา -> แปลงเป็น hash ให้อัตโนมัติ
      ok = true;
      sh.getRange(u._row, 2).setNumberFormat('@').setValue(hash_(password));
    }
  }
  if (!ok) {
    cache.put(failKey, String(fails + 1), LOCK_SECONDS);
    return fail_('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }
  if (String(u.status).toLowerCase() !== 'active') return fail_('บัญชีถูกระงับการใช้งาน');

  cache.remove(failKey);
  const user = {
    username: u.username,
    role: String(u.role).toLowerCase() === 'admin' ? 'admin' : 'user',
    displayName: u.displayName || u.username
  };
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('sess:' + token, JSON.stringify(user), SESSION_TTL);
  return { success: true, user: user, token: token, expiresIn: SESSION_TTL };
}

function logout_(req) {
  CacheService.getScriptCache().remove('sess:' + req.token);
  return { success: true };
}

function getSession_(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get('sess:' + token);
  return raw ? JSON.parse(raw) : null;
}

function requireAdmin_(user) {
  return user.role === 'admin' ? null : fail_('ต้องใช้สิทธิ์ผู้ดูแลระบบ');
}

/* ------------------------------------------------------------------ */
/*  Reports                                                            */
/* ------------------------------------------------------------------ */

function listReports_() {
  const rows = readRows_(getSheet_(SHEET_REPORTS, REPORT_HEADERS), REPORT_HEADERS)
    .map(stripRow_)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { success: true, data: rows };
}

function saveReport_(req, user) {
  const r = req.report || {};
  const date = String(r.date || '').trim();
  const subject = clean_(r.subject, 300);
  const detail = clean_(r.detail, 5000);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail_('รูปแบบวันที่ไม่ถูกต้อง');
  if (!subject) return fail_('กรุณากรอก "รหัส : เรื่อง"');
  if (!detail) return fail_('กรุณากรอกรายละเอียดความเสี่ยง/อุบัติการณ์');

  const clinicalLevel = String(r.clinicalLevel || '');
  const supportLevel = String(r.supportLevel || '');
  const relatedProgram = String(r.relatedProgram || '');
  if (clinicalLevel && CLINICAL_LEVELS.indexOf(clinicalLevel) < 0) return fail_('ระดับความรุนแรงด้านคลินิกไม่ถูกต้อง');
  if (supportLevel && SUPPORT_LEVELS.indexOf(supportLevel) < 0) return fail_('ระดับความรุนแรงด้านสนับสนุนไม่ถูกต้อง');
  if (relatedProgram && PROGRAMS.indexOf(relatedProgram) < 0) return fail_('โปรแกรมความเสี่ยงไม่ถูกต้อง');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet_(SHEET_REPORTS, REPORT_HEADERS);
    const tz = Session.getScriptTimeZone();
    const now = new Date();
    const prefix = 'R' + Utilities.formatDate(now, tz, 'yyyyMM') + '-';

    let maxSeq = 0;
    readRows_(sh, REPORT_HEADERS).forEach(x => {
      if (x.id.indexOf(prefix) === 0) maxSeq = Math.max(maxSeq, Number(x.id.slice(prefix.length)) || 0);
    });

    const report = {
      id: prefix + ('0000' + (maxSeq + 1)).slice(-4),
      createdAt: Utilities.formatDate(now, tz, "yyyy-MM-dd'T'HH:mm:ss"),
      date: date,
      riskCode: clean_(r.riskCode, 100),
      subject: subject,
      detail: detail,
      clinicalLevel: clinicalLevel,
      supportLevel: supportLevel,
      relatedProgram: relatedProgram,
      initialFix: clean_(r.initialFix, 3000),
      fixPlan: clean_(r.fixPlan, 3000),
      responsiblePerson: clean_(r.responsiblePerson, 200),
      reporterName: user.displayName,
      status: STATUSES[0],
      updatedAt: '',
      updatedBy: ''
    };

    const row = sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, REPORT_HEADERS.length)
      .setNumberFormat('@')
      .setValues([REPORT_HEADERS.map(h => report[h])]);
    return { success: true, message: 'บันทึกรายงานเรียบร้อย (' + report.id + ')', data: report };
  } finally {
    lock.releaseLock();
  }
}

function updateStatus_(req, user) {
  if (STATUSES.indexOf(req.status) < 0) return fail_('สถานะไม่ถูกต้อง');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet_(SHEET_REPORTS, REPORT_HEADERS);
    const found = readRows_(sh, REPORT_HEADERS).find(x => x.id === req.id);
    if (!found) return fail_('ไม่พบรายงานนี้');
    const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
    sh.getRange(found._row, REPORT_HEADERS.indexOf('status') + 1, 1, 1).setValue(req.status);
    sh.getRange(found._row, REPORT_HEADERS.indexOf('updatedAt') + 1, 1, 2).setNumberFormat('@').setValues([[now, user.displayName]]);
    return { success: true, message: 'อัปเดตสถานะแล้ว', data: { id: found.id, status: req.status, updatedAt: now, updatedBy: user.displayName } };
  } finally {
    lock.releaseLock();
  }
}

function deleteReport_(req) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet_(SHEET_REPORTS, REPORT_HEADERS);
    const found = readRows_(sh, REPORT_HEADERS).find(x => x.id === req.id);
    if (!found) return fail_('ไม่พบรายงานนี้');
    sh.deleteRow(found._row);
    return { success: true, message: 'ลบรายงานแล้ว' };
  } finally {
    lock.releaseLock();
  }
}

function resetData_(req) {
  if (req.confirm !== 'RESET CONFIRM') return fail_('คำยืนยันไม่ถูกต้อง');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet_(SHEET_REPORTS, REPORT_HEADERS);
    const last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, REPORT_HEADERS.length).clearContent();
    return { success: true, message: 'ลบรายการความเสี่ยงทั้งหมดแล้ว' };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/*  Users                                                              */
/* ------------------------------------------------------------------ */

function listUsers_() {
  const users = readRows_(getSheet_(SHEET_USERS, USER_HEADERS), USER_HEADERS).map(u => ({
    username: u.username,
    role: String(u.role).toLowerCase() === 'admin' ? 'admin' : 'user',
    status: String(u.status).toLowerCase() === 'active' ? 'active' : 'inactive',
    displayName: u.displayName
  }));
  return { success: true, data: users };
}

function saveUser_(req, me) {
  const d = req.user || {};
  const username = String(d.username || '').trim();
  const displayName = clean_(d.displayName, 100);
  const role = d.role === 'admin' ? 'admin' : 'user';
  const status = d.status === 'inactive' ? 'inactive' : 'active';
  const password = String(d.password || '');

  if (!/^[A-Za-z0-9_.-]{3,30}$/.test(username)) return fail_('ชื่อผู้ใช้ต้องเป็นตัวอักษรอังกฤษ/ตัวเลข 3-30 ตัว (ใช้ _ . - ได้)');
  if (!displayName) return fail_('กรุณากรอกชื่อที่แสดง');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet_(SHEET_USERS, USER_HEADERS);
    const found = readRows_(sh, USER_HEADERS).find(x => x.username.toLowerCase() === username.toLowerCase());

    if (d.isNew) {
      if (found) return fail_('มีชื่อผู้ใช้นี้อยู่แล้ว');
      if (password.length < 6) return fail_('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      const row = sh.getLastRow() + 1;
      sh.getRange(row, 1, 1, 5).setNumberFormat('@').setValues([[username, hash_(password), role, status, displayName]]);
      return { success: true, message: 'เพิ่มผู้ใช้เรียบร้อย' };
    }

    if (!found) return fail_('ไม่พบผู้ใช้นี้');
    if (found.username.toLowerCase() === me.username.toLowerCase() && (role !== 'admin' || status !== 'active')) {
      return fail_('ไม่สามารถลดสิทธิ์หรือระงับบัญชีของตัวเองได้');
    }
    if (password && password.length < 6) return fail_('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');

    const range = sh.getRange(found._row, 2, 1, 4).setNumberFormat('@');
    range.setValues([[password ? hash_(password) : found.password, role, status, displayName]]);
    return { success: true, message: 'บันทึกข้อมูลผู้ใช้แล้ว' };
  } finally {
    lock.releaseLock();
  }
}

function deleteUser_(req, me) {
  const username = String(req.username || '').toLowerCase();
  if (username === me.username.toLowerCase()) return fail_('ไม่สามารถลบบัญชีของตัวเองได้');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet_(SHEET_USERS, USER_HEADERS);
    const found = readRows_(sh, USER_HEADERS).find(x => x.username.toLowerCase() === username);
    if (!found) return fail_('ไม่พบผู้ใช้นี้');
    sh.deleteRow(found._row);
    return { success: true, message: 'ลบผู้ใช้แล้ว' };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/*  Setup (รันครั้งเดียวจากเมนู Run)                                    */
/* ------------------------------------------------------------------ */

function setup() {
  const users = getSheet_(SHEET_USERS, USER_HEADERS);
  getSheet_(SHEET_REPORTS, REPORT_HEADERS);

  if (users.getLastRow() < 2) {
    users.getRange(2, 1, 1, 5).setNumberFormat('@')
      .setValues([['admin', hash_('admin1234'), 'admin', 'active', 'ผู้ดูแลระบบ']]);
    Logger.log('สร้างผู้ใช้เริ่มต้น admin / admin1234 แล้ว — กรุณาเข้าสู่ระบบและเปลี่ยนรหัสผ่านทันที');
  }
  Logger.log('พร้อมใช้งาน: ชีต Users และ Reports ถูกตรวจสอบเรียบร้อย');
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getSheet_(name, headers) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#3b4d23').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readRows_(sh, headers) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const tz = Session.getScriptTimeZone();
  return sh.getRange(2, 1, last - 1, headers.length).getValues()
    .map((row, i) => {
      const o = { _row: i + 2 };
      headers.forEach((h, j) => { o[h] = cell_(row[j], h, tz); });
      return o;
    })
    .filter(o => headers.some(h => o[h] !== ''));
}

function cell_(v, header, tz) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, tz, header === 'date' ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm:ss");
  }
  return String(v);
}

function stripRow_(o) {
  const c = {};
  Object.keys(o).forEach(k => { if (k !== '_row') c[k] = o[k]; });
  return c;
}

function clean_(v, max) {
  return String(v === null || v === undefined ? '' : v).trim().slice(0, max);
}

function hash_(password) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, PASSWORD_SALT + password, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function fail_(message) {
  return { success: false, message: message };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
