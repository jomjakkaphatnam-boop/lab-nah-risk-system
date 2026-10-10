/**
 * ตั้งค่าหน้าเว็บ (แก้เฉพาะไฟล์นี้)
 *
 * API_URL : ใส่ Web app URL ที่ได้จาก Google Apps Script (ลงท้ายด้วย /exec)
 *           ถ้าเว้นว่าง ระบบจะทำงานใน "โหมดสาธิต" เก็บข้อมูลในเบราว์เซอร์นี้เท่านั้น
 * UNITS   : รายชื่อหน่วยงานในช่อง "ผู้รับผิดชอบระดับหน่วยงาน" (เพิ่ม/ลบได้)
 * SUBJECT_SUGGESTIONS : รหัสเรื่องที่อยากให้ขึ้นเป็นตัวเลือกในช่อง "รหัส : เรื่อง"
 */
window.NAH_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzTFu75Hl6EptXJqbiytBPSsLpoJ3EuY_cHouNVu8RTa2-FhJ_Oy1jaLp5M8ho_wE3pMA/exec',
  SESSION_HOURS: 6,
  UNITS: ['3A', '3B', 'ER', 'ICU', 'พิเศษ 5', 'พยาธิ', 'สาธารณูปโภค', 'OPD', 'ไตเทียม', 'MRI', 'ห้องเจาะเลือด'],
  SUBJECT_SUGGESTIONS: []
};
