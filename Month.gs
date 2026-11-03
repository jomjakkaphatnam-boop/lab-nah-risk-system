/** สร้างชีตสรุปรายเดือน — ไฟล์ใหม่ วางเพิ่มข้างๆ Code.gs
 *  ต้องมีใน Code.gs: case 'createMonthSheet': return requireAdmin_(user) || createMonthSheet_(req);
 */
const MONTHS_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                   'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

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
    let sh = ss.getSheetByName(name);
    if (sh) {
      if (!overwrite) return fail_('มีชีต "' + name + '" อยู่แล้ว (ติ๊กสร้างทับ หรือเปลี่ยนชื่อชีตเดิมก่อน)');
      ss.deleteSheet(sh);
    }
    sh = ss.insertSheet(name);

    const rows = readRows_(getSheet_(SHEET_REPORTS, REPORT_HEADERS), REPORT_HEADERS)
      .filter(r => String(r.date).slice(0, 7) === ym)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

    const NC = 36, FIRST = 6;
    const out = rows.map((r, i) => {
      const o = new Array(NC).fill('');
      let detail = r.detail || '';
      const hn = String(r.hn || '').trim();
      if (hn && detail.indexOf(hn) < 0) detail += '\nHN: ' + hn;
      o[0] = i + 1; o[1] = r.date; o[2] = r.riskCode; o[3] = r.subject; o[4] = detail;
      const c = CLINICAL_LEVELS.indexOf(String(r.clinicalLevel).trim().toUpperCase()); if (c >= 0) o[5 + c] = 1;
      const s = SUPPORT_LEVELS.indexOf(String(r.supportLevel).trim()); if (s >= 0) o[14 + s] = 1;
      String(r.relatedProgram).split(',').map(x => x.trim()).forEach(pg => {
        const k = PROGRAMS.indexOf(pg); if (k >= 0) o[19 + k] = 1; });
      if (r.fixStatus === FIX_STATUSES[0]) o[29] = 1; else if (r.fixStatus) o[30] = 1;
      o[31] = r.initialFix; o[32] = r.fixPlan; o[33] = r.responsiblePerson; o[34] = r.reporterName; o[35] = r.result;
      return o;
    });

    const fy = (m >= 10 ? y + 1 : y) + 543;
    sh.getRange('A1').setValue('รายงานสรุป ความเสี่ยง/อุบัติการณ์ ของรพ.ค่ายสมเด็จพระนเรศวรมหาราช ปีงบ ' + fy);
    sh.getRange('A2').setValue('เดือน ' + name + ' ' + (y + 543));
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

    if (out.length) sh.getRange(FIRST, 1, out.length, NC).setValues(out);
    const sumRow = FIRST + out.length, end = Math.max(sumRow - 1, FIRST);
    sh.getRange(sumRow, 5).setValue('สรุปรวม');
    for (let col = 6; col <= 31; col++) {
      sh.getRange(sumRow, col).setFormula('=SUM(' + sh.getRange(FIRST, col, end - FIRST + 1, 1).getA1Notation() + ')');
    }

    sh.getRange(1, 1, 3, 1).setFontWeight('bold');
    sh.getRange(4, 1, 2, NC).setBackground('#3b4d23').setFontColor('#ffffff').setFontWeight('bold')
      .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
    sh.getRange(4, 1, sumRow - 3, NC).setBorder(true, true, true, true, true, true);
    sh.getRange(FIRST, 1, Math.max(out.length, 1), NC).setVerticalAlignment('top').setWrap(true);
    sh.getRange(FIRST, 6, out.length + 1, 26).setHorizontalAlignment('center');
    sh.getRange(sumRow, 1, 1, NC).setFontWeight('bold').setBackground('#eef1e6');
    sh.setColumnWidth(1, 50); sh.setColumnWidth(2, 90); sh.setColumnWidth(3, 110);
    sh.setColumnWidth(4, 80); sh.setColumnWidth(5, 320);
    sh.setColumnWidths(6, 26, 38);
    [32, 33, 34, 35, 36].forEach(c => sh.setColumnWidth(c, 160));
    sh.setFrozenRows(5);

    return { success: true, data: { sheetName: name, count: out.length, url: ss.getUrl() + '#gid=' + sh.getSheetId() } };
  } finally {
    lock.releaseLock();
  }
}
