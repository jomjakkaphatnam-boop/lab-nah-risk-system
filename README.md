# ระบบรายงานความเสี่ยง LAB NAH

Medical Lab Risk Management System — หน้าเว็บ (โฮสต์บน GitHub Pages) + Google Sheets เป็นฐานข้อมูลผ่าน Google Apps Script

```
index.html · style.css · app.js · config.js   ← หน้าเว็บ (ขึ้น GitHub Pages)
icons/ · manifest.webmanifest                  ← ไอคอน NAH / ติดตั้งบนมือถือได้
Code.gs                                        ← วางใน Google Apps Script (ไม่ต้องอัปขึ้น GitHub ก็ได้)
```

## ลองใช้ทันที (โหมดสาธิต)
เปิด `index.html` โดยไม่ต้องตั้งค่าอะไร ระบบจะเก็บข้อมูลในเบราว์เซอร์
ผู้ดูแล `admin / admin1234` · ผู้ใช้ `user / user1234`

## 1) ตั้งค่า Google Sheets + Apps Script
1. เปิด Google Sheet ของคุณ → **Extensions → Apps Script** (หรือสร้างโปรเจกต์ใหม่)
2. ลบโค้ดเดิม วางเนื้อหาจาก `Code.gs` และตรวจ `SPREADSHEET_ID` ให้ตรงกับชีตของคุณ
3. เลือกฟังก์ชัน **`setup`** กด **Run** → อนุญาตสิทธิ์
   (สร้างชีต `Users` และ `Reports` พร้อมผู้ใช้เริ่มต้น `admin / admin1234`)
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. คัดลอก Web app URL (ลงท้าย `/exec`)

> ถ้าแก้ `Code.gs` ภายหลัง ต้อง Deploy → Manage deployments → Edit → **New version** ทุกครั้ง

## 2) เชื่อมหน้าเว็บ
แก้ `config.js`:
```js
window.NAH_CONFIG = { API_URL: 'https://script.google.com/macros/s/xxxxxxxx/exec', SESSION_HOURS: 6 };
```

## 3) ขึ้น GitHub Pages
1. สร้าง repo ใหม่ แล้วอัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้ (รวม `.nojekyll`)
2. **Settings → Pages → Branch: `main` / `/ (root)` → Save**
3. เปิด `https://<username>.github.io/<repo>/`

## 4) หลังเริ่มใช้งาน
- เข้าสู่ระบบด้วย `admin / admin1234` แล้วไปเมนู **ผู้ใช้ → แก้ไข** เพื่อ **เปลี่ยนรหัสผ่านทันที**
- รหัสผ่านถูกเก็บเป็น SHA-256 (รหัสเดิมที่เป็นข้อความธรรมดาในชีต `Users` จะถูกแปลงให้อัตโนมัติเมื่อผู้ใช้ล็อกอินครั้งแรก)
- ใส่รหัสผิด 5 ครั้งจะถูกล็อก 5 นาที · เซสชันหมดอายุใน 6 ชั่วโมง

## โครงสร้างข้อมูล
- `Users`: `username | password | role | status | displayName` (role = admin/user, status = active/inactive)
- `Reports`: `id, createdAt, date, riskCode, subject, detail, clinicalLevel, supportLevel, relatedProgram, initialFix, fixPlan, responsiblePerson, reporterName, status, updatedAt, updatedBy`

## เกณฑ์ระดับความเสี่ยง (ปรับได้ที่ฟังก์ชัน `levelOf` ใน `app.js`)
| ระดับ | คลินิก | สนับสนุน |
|---|---|---|
| ต่ำ | A–B | 1–2 |
| กลาง | C–D | 3 |
| สูง | E–I | 4–5 |
