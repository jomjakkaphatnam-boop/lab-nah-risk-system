/** สร้างชีตสรุปรายเดือน — คัดลอกรูปแบบจากชีตเดือนที่มีอยู่ (Template) และเชื่อมข้อมูลกับชีต Reports ด้วยสูตร
 *  (แก้ไข/เพิ่มรายงานแล้วชีตเดือนอัปเดตเอง)
 *  ต้องมีใน Code.gs: case 'createMonthSheet': return requireAdmin_(user) || createMonthSheet_(req);
 */
const MONTHS_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                   'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

const TEMPLATE_SHEET_NAME = 'พฤศจิกายน';  // ชีตแม่แบบ ('' = ใช้เดือนก่อนหน้าอัตโนมัติ)
const MONTH_COLS = 36;                     // A..AJ
const LINK_MIN_ROWS = 60;                  // จำนวนแถวข้อมูลขั้นต่ำที่เตรียมสูตรไว้
const HELPER_COL = 38;                     // AL = วันที่, AM = id, AN = เลขแถวใน Reports (ซ่อนไว้)

function createMonthSheet_(req) {
  const ym = String(req.ym || ''), overwrite = !!req.overwrite;
  if (!/^\d{4}-\d{2}$/.test(ym)) return fail_('รูปแบบเดือนไม่ถูกต้อง');
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  if (m < 1 || m > 12) return fail_('เดือนไม่ถูกต้อง');
  const name = MONTHS_TH[m - 1];

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const existing = ss.getSheetByName(name);
    if (existing && !overwrite) return fail_('มีชีต "' + name + '" อยู่แล้ว (ติ๊กสร้างทับ หรือเปลี่ยนชื่อชีตเดิมก่อน)');

    const count = countMonthReports_(ym);
    const nRows = Math.max(LINK_MIN_ROWS, count + 10);
    const title = 'รายงานสรุป ความเสี่ยง/อุบัติการณ์ ของรพ.ค่ายสมเด็จพระนเรศวรมหาราช ปีงบ ' + ((m >= 10 ? y + 1 : y) + 543);
    const subtitle = 'เดือน ' + name + ' ' + (y + 543);

    let sh, pos, usedTpl = '';
    const tpl = findMonthTemplate_(ss, m);
    const lay = tpl ? monthLayout_(tpl) : null;
    if (tpl && lay) {
      sh = tpl.copyTo(ss);                  // คัดลอกก่อนลบชีตเดิม เผื่อสร้างทับเดือนที่เป็นแม่แบบเอง
      if (existing) ss.deleteSheet(existing);
      sh.setName(name);
      pos = prepareFromTemplate_(sh, lay, nRows, title, subtitle);
      usedTpl = tpl.getName();
    } else {
      if (existing) ss.deleteSheet(existing);
      sh = ss.insertSheet(name);
      pos = buildMonthScratch_(sh, nRows, title, subtitle);
      usedTpl = '(แบบมาตรฐาน)';
    }
    linkMonthData_(sh, ym, pos.first, pos.sumRow);
    try { ss.setActiveSheet(sh); ss.moveActiveSheet(ss.getNumSheets()); } catch (e) {}

    return { success: true, data: { sheetName: name, count: count, template: usedTpl,
      url: ss.getUrl() + '#gid=' + sh.getSheetId() } };
  } finally {
    lock.releaseLock();
  }
}

function countMonthReports_(ym) {
  return readRows_(getSheet_(SHEET_REPORTS, REPORT_HEADERS), REPORT_HEADERS)
    .filter(r => String(r.date).slice(0, 7) === ym).length;
}

/* ---------- เชื่อมข้อมูลด้วยสูตร ---------- */

/** อ้างอิงคอลัมน์ของชีต Reports ตามชื่อหัวคอลัมน์ เช่น {detail: "Reports!$F:$F"} */
function reportColRefs_() {
  const sh = getSheet_(SHEET_REPORTS, REPORT_HEADERS);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const refs = {};
  head.forEach((h, i) => {
    if (!h || refs[h]) return;
    const L = colLetter_(i + 1);
    refs[h] = SHEET_REPORTS + '!$' + L + ':$' + L;
  });
  return refs;
}

function colLetter_(n) {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** เขียนสูตรเชื่อม Reports ลงชีตเดือน (แถว first .. sumRow-1) พร้อมสูตรสรุปรวม */
function linkMonthData_(sh, ym, first, sumRow) {
  const R = reportColRefs_();
  ['id', 'date', 'riskCode', 'subject', 'detail', 'clinicalLevel', 'supportLevel', 'relatedProgram',
   'initialFix', 'fixPlan', 'responsiblePerson', 'reporterName', 'fixStatus', 'result', 'hn']
    .forEach(k => { if (!R[k]) throw new Error('ชีต Reports ไม่มีคอลัมน์ ' + k); });

  if (sh.getMaxColumns() < HELPER_COL + 2) sh.insertColumnsAfter(sh.getMaxColumns(), HELPER_COL + 2 - sh.getMaxColumns());
  const rows = sumRow - first;
  const HL = colLetter_(HELPER_COL), HI = colLetter_(HELPER_COL + 1), HN = colLetter_(HELPER_COL + 2);

  // ล้างคอลัมน์ช่วยและข้อมูลเดิม
  sh.getRange(first, 1, rows, MONTH_COLS).clearContent();
  sh.getRange(first, HELPER_COL, Math.max(sh.getMaxRows() - first + 1, 1), 3).clearContent();

  // รายการ (วันที่, id) ของเดือนนี้ เรียงตามวันที่เกิดเหตุแล้วตาม id
  const dateRng = SHEET_REPORTS + '!' + rngOf_(R.date), idRng = SHEET_REPORTS + '!' + rngOf_(R.id);
  sh.getRange(first, HELPER_COL).setFormula(
    '=IFERROR(SORT(FILTER({' + dateRng + ',' + idRng + '},ARRAYFORMULA(LEFT(' + dateRng + ',7))="' + ym + '"),1,TRUE,2,TRUE),"")');

  const F = [];
  for (let r = first; r < sumRow; r++) {
    const ix = n => 'INDEX(' + R[n] + ',$' + HN + r + ')';
    const g = f => '=IF($' + HN + r + '="","",' + f + ')';
    const row = new Array(MONTH_COLS).fill('');
    row[0] = g('ROW()-' + (first - 1));
    row[1] = '=IF($' + HI + r + '="","",$' + HL + r + ')';
    row[2] = g(ix('riskCode') + '&""');
    row[3] = g(ix('subject') + '&""');
    row[4] = g(ix('detail') + '&""&IF(AND(' + ix('hn') + '&""<>"",ISERROR(SEARCH(' + ix('hn') + '&"",' + ix('detail') + '&""))),CHAR(10)&"HN: "&' + ix('hn') + ',"")');
    CLINICAL_LEVELS.forEach((c, i) => { row[5 + i] = g('IF(UPPER(TRIM(' + ix('clinicalLevel') + '&""))="' + c + '",1,"")'); });
    SUPPORT_LEVELS.forEach((s, i) => { row[14 + i] = g('IF(TRIM(' + ix('supportLevel') + '&"")="' + s + '",1,"")'); });
    PROGRAMS.forEach((p, i) => {
      row[19 + i] = g('IF(ISNUMBER(SEARCH(", ' + p + ',",", "&' + ix('relatedProgram') + '&",")),1,"")');
    });
    row[29] = g('IF(' + ix('fixStatus') + '&""="' + FIX_STATUSES[0] + '",1,"")');
    row[30] = g('IF(AND(' + ix('fixStatus') + '&""<>"",' + ix('fixStatus') + '&""<>"' + FIX_STATUSES[0] + '"),1,"")');
    row[31] = g(ix('initialFix') + '&""');
    row[32] = g(ix('fixPlan') + '&""');
    row[33] = g(ix('responsiblePerson') + '&""');
    row[34] = g(ix('reporterName') + '&""');
    row[35] = g(ix('result') + '&""');
    F.push(row);
  }
  sh.getRange(first, 1, rows, MONTH_COLS).setFormulas(F);

  // คอลัมน์ช่วย AN = ลำดับแถวใน Reports (เขียนทีหลังเพราะ AL:AM เป็นผลลัพธ์ของสูตรข้างบน)
  const hn = [];
  for (let r = first; r < sumRow; r++) {
    hn.push(['=IFERROR(IF($' + HI + r + '="","",MATCH($' + HI + r + ',' + R.id + ',0)),"")']);
  }
  sh.getRange(first, HELPER_COL + 2, rows, 1).setFormulas(hn);
  try { sh.hideColumns(HELPER_COL, 3); } catch (e) {}

  // สรุปรวม
  for (let col = 6; col <= 31; col++) {
    const a = sh.getRange(first, col, rows, 1).getA1Notation();
    sh.getRange(sumRow, col).setFormula('=SUM(' + a + ')');
  }
  SpreadsheetApp.flush();
  try { sh.autoResizeRows(first, rows); } catch (e) {}
}

/** "Reports!$F:$F" -> "$F$2:$F" */
function rngOf_(ref) {
  const L = ref.split('$')[1].replace(':', '');
  return '$' + L + '$2:$' + L;
}

/* ---------- แม่แบบ ---------- */

/** หาแถวหัวตาราง ("ลำดับ"), แถวข้อมูลแรก และแถว "สรุปรวม"; คืน null ถ้าไม่ใช่แบบรายงาน */
function monthLayout_(s) {
  if (s.getLastColumn() < MONTH_COLS || s.getLastRow() < 7) return null;
  const top = s.getRange(1, 1, Math.min(10, s.getLastRow()), 1).getValues();
  let hr = 0;
  for (let i = 0; i < top.length; i++) if (String(top[i][0]).trim() === 'ลำดับ') { hr = i + 1; break; }
  if (!hr) return null;
  if (String(s.getRange(hr + 1, 6).getValue()).trim() !== 'A') return null;
  const first = hr + 2, last = s.getLastRow();
  if (last < first) return null;
  const vals = s.getRange(first, 1, last - first + 1, 5).getValues();
  let sumRow = 0;
  for (let i = 0; i < vals.length; i++) {
    if (vals[i].some(v => String(v).trim() === 'สรุปรวม')) { sumRow = first + i; break; }
  }
  return sumRow ? { hr: hr, first: first, sumRow: sumRow } : null;
}

function findMonthTemplate_(ss, m) {
  const pick = n => { const s = n && ss.getSheetByName(n); return s && monthLayout_(s) ? s : null; };
  let s = pick(TEMPLATE_SHEET_NAME);
  if (s) return s;
  s = pick(MONTHS_TH[(m + 10) % 12]);
  if (s) return s;
  for (let i = 0; i < 12; i++) { s = pick(MONTHS_TH[i]); if (s) return s; }
  return null;
}

/** ปรับชีตที่คัดลอกมา: ตั้งชื่อรายงาน และให้มีแถวข้อมูลอย่างน้อย nRows แถว; คืนตำแหน่งแถวข้อมูลแรก/แถวสรุป */
function prepareFromTemplate_(sh, lay, nRows, title, subtitle) {
  const first = lay.first;
  let sumRow = lay.sumRow;
  const capacity = sumRow - first;
  if (capacity > 0) sh.getRange(first, 1, capacity, MONTH_COLS).clearContent();
  if (nRows > capacity) {
    const add = nRows - capacity;
    sh.insertRowsBefore(sumRow, add);
    sh.getRange(first, 1, 1, MONTH_COLS)
      .copyTo(sh.getRange(sumRow, 1, add, MONTH_COLS), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    sumRow += add;
  }
  sh.getRange('A1').setValue(title);
  sh.getRange('A2').setValue(subtitle);
  return { first: first, sumRow: sumRow };
}

/* ---------- แบบมาตรฐาน (เมื่อไม่มีชีตเดือนไหนเป็นแม่แบบ) ---------- */

function buildMonthScratch_(sh, nRows, title, subtitle) {
  const NC = MONTH_COLS, FIRST = 6, sumRow = FIRST + nRows;
  sh.getRange('A1').setValue(title);
  sh.getRange('A2').setValue(subtitle);
  sh.getRange('A3').setValue('หน่วยงาน…...........พยาธิวิทยา........................');
  [1, 2, 3].forEach(r => sh.getRange(r, 1, 1, NC).merge());

  ['ลำดับ','วันเดือนปี','รหัสความเสี่ยง','รหัส : เรื่อง','ความเสี่ยง/อุบัติการณ์'].forEach((t, i) => {
    sh.getRange(4, i + 1).setValue(t); sh.getRange(4, i + 1, 2, 1).merge(); });
  [[6,9,'ระดับความรุนแรงด้านคลินิก'],[15,5,'ระดับความรุนแรงด้านสนับสนุน'],
   [20,10,'โปรแกรมความเสี่ยงที่เกี่ยวข้อง'],[30,2,'แก้ไข']]
    .forEach(g => sh.getRange(4, g[0], 1, g[1]).merge().setValue(g[2]));
  ['การแก้ไขเบื้องต้น','แผนแก้ไข','ผู้รับผิดชอบระดับหน่วยงาน','ผู้รายงาน','ผลลัพธ์'].forEach((t, i) => {
    sh.getRange(4, 32 + i).setValue(t); sh.getRange(4, 32 + i, 2, 1).merge(); });
  sh.getRange(5, 6, 1, 26).setValues([CLINICAL_LEVELS.concat(SUPPORT_LEVELS, PROGRAMS, ['ได้', 'ไม่ได้'])]);
  sh.getRange(sumRow, 5).setValue('สรุปรวม');

  sh.getRange(1, 1, 3, 1).setFontWeight('bold');
  sh.getRange(4, 1, 2, NC).setBackground('#3b4d23').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.getRange(4, 1, sumRow - 3, NC).setBorder(true, true, true, true, true, true);
  sh.getRange(FIRST, 1, nRows, NC).setVerticalAlignment('top').setWrap(true);
  sh.getRange(FIRST, 6, nRows + 1, 26).setHorizontalAlignment('center');
  sh.getRange(sumRow, 1, 1, NC).setFontWeight('bold').setBackground('#eef1e6');
  sh.setColumnWidth(1, 50); sh.setColumnWidth(2, 90); sh.setColumnWidth(3, 110);
  sh.setColumnWidth(4, 80); sh.setColumnWidth(5, 320);
  sh.setColumnWidths(6, 26, 38);
  [32, 33, 34, 35, 36].forEach(c => sh.setColumnWidth(c, 160));
  sh.setFrozenRows(5);
  return { first: FIRST, sumRow: sumRow };
}

/* ---------- เชื่อมชีตเดือนที่มีอยู่แล้ว (รันจาก Apps Script editor) ---------- */

/** ตัวอย่าง: relinkMonthSheet('2026-10') — เขียนสูตรเชื่อม Reports ทับข้อมูลในพื้นที่แถวข้อมูลของชีต "ตุลาคม" */
function relinkMonthSheet(ym) {
  ym = String(ym || '');
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error('ใช้รูปแบบ yyyy-mm เช่น relinkMonthSheet("2026-10")');
  const m = +ym.slice(5, 7);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(MONTHS_TH[m - 1]);
  if (!sh) throw new Error('ไม่พบชีต ' + MONTHS_TH[m - 1]);
  const lay = monthLayout_(sh);
  if (!lay) throw new Error('ชีตนี้ไม่ใช่แบบรายงานรายเดือน');
  const need = Math.max(LINK_MIN_ROWS, countMonthReports_(ym) + 10);
  let sumRow = lay.sumRow;
  if (need > sumRow - lay.first) {
    const add = need - (sumRow - lay.first);
    sh.insertRowsBefore(sumRow, add);
    sh.getRange(lay.first, 1, 1, MONTH_COLS)
      .copyTo(sh.getRange(sumRow, 1, add, MONTH_COLS), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    sumRow += add;
  }
  linkMonthData_(sh, ym, lay.first, sumRow);
}
