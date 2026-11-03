/** แสดงลิงก์และรูปตัวอย่างของรายงานในชีต Reports — ไฟล์ใหม่ วางเพิ่มข้างๆ Code.gs */
const IMG_SRC_HEADER  = 'images';
const LINK_HEADER     = 'ลิงก์รูปภาพ';
const PREVIEW_HEADERS = ['รูปที่ 1', 'รูปที่ 2', 'รูปที่ 3'];
const MAKE_PUBLIC     = true;   // true = ตั้งไฟล์เป็น "ทุกคนที่มีลิงก์ดูได้" เพื่อให้ =IMAGE() แสดงรูป (รูปอาจมีข้อมูลผู้ป่วย)
const PREVIEW_ROW_H   = 110;
const PREVIEW_COL_W   = 130;

function syncImagesToSheet_(rowNumber) {
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_REPORTS);
  const cols = ensureImageColumns_(sh);
  const raw = sh.getRange(rowNumber, cols.src).getValue();
  let files = [];
  try { files = raw ? JSON.parse(raw) : []; } catch (e) { files = []; }

  sh.getRange(rowNumber, cols.link).setValue(
    files.map(f => 'https://drive.google.com/file/d/' + f.id + '/view').join('\n'));

  PREVIEW_HEADERS.forEach((_, i) => {
    const cell = sh.getRange(rowNumber, cols.preview[i]);
    const f = files[i];
    if (!f) { cell.clearContent(); return; }
    if (MAKE_PUBLIC) {
      try { DriveApp.getFileById(f.id).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
      catch (e) { console.error('share fail', f.id, e); }
    }
    cell.setFormula('=IMAGE("https://drive.google.com/thumbnail?id=' + f.id + '&sz=w400")');
  });
  if (files.length) sh.setRowHeight(rowNumber, PREVIEW_ROW_H);
}

function ensureImageColumns_(sh) {
  let lastCol = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  const find = h => headers.indexOf(h) + 1;
  const src = find(IMG_SRC_HEADER);
  if (!src) throw new Error('ไม่พบคอลัมน์ ' + IMG_SRC_HEADER);

  [LINK_HEADER].concat(PREVIEW_HEADERS).forEach(h => {
    if (!find(h)) {
      lastCol++;
      sh.getRange(1, lastCol).setValue(h).setFontWeight('bold');
      headers.push(h);
    }
  });
  const link = find(LINK_HEADER);
  const preview = PREVIEW_HEADERS.map(find);
  sh.setColumnWidth(link, 260);
  preview.forEach(c => sh.setColumnWidth(c, PREVIEW_COL_W));
  sh.getRange(2, link, Math.max(sh.getMaxRows() - 1, 1), 1).setWrap(true);
  return { src, link, preview };
}

/** รันครั้งเดียวเพื่อเติมรูปของรายงานเก่าทั้งหมด */
function syncAllImages() {
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_REPORTS);
  const last = sh.getLastRow();
  for (let r = 2; r <= last; r++) syncImagesToSheet_(r);
  Logger.log('ซิงก์รูปภาพเสร็จแล้ว ' + Math.max(last - 1, 0) + ' แถว');
}

/** ซิงก์เฉพาะแถวที่มีรูปแต่ยังไม่มีลิงก์ (ใช้กับ trigger) */
function syncNewImages() {
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_REPORTS);
  const cols = ensureImageColumns_(sh);
  const last = sh.getLastRow();
  if (last < 2) return;
  const src  = sh.getRange(2, cols.src,  last - 1, 1).getValues();
  const link = sh.getRange(2, cols.link, last - 1, 1).getValues();
  for (let i = 0; i < src.length; i++) {
    if (src[i][0] && src[i][0] !== '[]' && !link[i][0]) syncImagesToSheet_(i + 2);
  }
}

/** รันครั้งเดียวเพื่อตั้งตัวตั้งเวลา (ทุก 1 นาที) เป็นสำรองเผื่อซิงก์ตอนบันทึกไม่ทัน */
function installImageTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncNewImages')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncNewImages').timeBased().everyMinutes(1).create();
}
