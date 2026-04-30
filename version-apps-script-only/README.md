# 🧪 EasySlip Form — Apps Script Only Version

เวอร์ชันทดลองที่ใช้ **Google Apps Script เพียงอย่างเดียว** ทำหน้าที่ทุกอย่าง:
- Serve HTML ฟอร์ม
- เรียก EasySlip API ตรวจสลิป
- บันทึก Google Sheets
- ส่งอีเมลยืนยัน

**ข้อดี:** ไม่ต้องใช้ Netlify, ไม่ต้องจัดการ 2 ระบบ, deploy ครั้งเดียวจบ
**ข้อเสีย:** ใช้ scope ที่ Google ถือว่า "sensitive" — บัญชี Google บางตัวอาจโดน "This app is blocked"

---

## 🚀 วิธีติดตั้ง

### ขั้นที่ 1 — เตรียม Google Sheet

1. สร้าง Google Sheet ใหม่
2. สร้างแท็บ **`รายละเอียดคอร์ส`** ใส่ข้อมูล:

   | A | B |
   |---|---|
   | ชื่อคอร์ส | ราคา |
   | คอร์สที่ 1 | 500 |

---

### ขั้นที่ 2 — ตั้งค่า Apps Script

1. ใน Sheet → **ส่วนขยาย → Apps Script**
2. **ลบไฟล์ `Code.gs` เดิม** แล้ววางโค้ดจาก `Code.gs` ในโฟลเดอร์นี้
3. เปิด **Project Settings** (⚙️) → ติ๊ก ✅ **"Show appsscript.json manifest file"**
4. เปิดไฟล์ `appsscript.json` ใน editor → วางเนื้อหาจาก `appsscript.json` ในโฟลเดอร์นี้
5. ใน editor กดเครื่องหมาย **+** ข้าง Files → **HTML** → ชื่อ `index` → วางเนื้อหาจาก `index.html` ในโฟลเดอร์นี้

---

### ขั้นที่ 3 — ตั้งค่า Script Properties

ใน Apps Script editor:

1. **Project Settings** (⚙️) → ส่วน **Script properties** → กด **"Add script property"**
2. เพิ่มทีละตัว:

   | Property | Value |
   |---|---|
   | `EASYSLIP_API_KEY` | API key จาก easyslip.com |
   | `RECEIVER_ACCOUNT` | เลขบัญชีผู้รับเงิน (ไม่มีขีด) |
   | `OWNER_EMAIL` | อีเมลเจ้าของคอร์สที่จะรับแจ้งเตือน |

3. กด **Save script properties**

---

### ขั้นที่ 4 — Authorize ก่อน Deploy

> สำคัญ! ต้องรัน function เพื่อ trigger หน้า authorize ก่อน ไม่งั้น MailApp อาจไม่ได้สิทธิ์

1. ใน editor → เลือก function **`getProducts`** ในช่อง dropdown
2. กด ▶️ **Run**
3. หน้า "Authorization required" → **Review permissions** → เลือกบัญชี
4. ถ้าเห็น **"This app is blocked"** → ดูส่วน [Troubleshooting](#troubleshooting) ด้านล่าง
5. ถ้าเห็น **"Google hasn't verified"** → กด **Advanced → Go to (unsafe)** → **Allow**
6. ทำซ้ำกับ function **`submitRegistration`** ด้วย (ส่ง dummy data ไม่ต้องสนใจ error)
   หรือใช้วิธีง่ายๆ: เพิ่มฟังก์ชันทดสอบและรันมัน:
   ```js
   function authorizeAll() {
     // เรียกทุก service เพื่อ trigger scope
     SpreadsheetApp.getActiveSpreadsheet();
     UrlFetchApp.fetch('https://example.com');
     MailApp.getRemainingDailyQuota();
   }
   ```

---

### ขั้นที่ 5 — Deploy เป็น Web App

1. กด **Deploy → New deployment**
2. คลิกเฟือง ⚙️ ข้าง "Select type" → เลือก **Web app**
3. ตั้งค่า:
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
4. กด **Deploy**
5. Copy **Web App URL** ที่ได้
6. เปิด URL — จะเห็นฟอร์มลงทะเบียนพร้อมใช้งาน 🎉

---

## ❓ Troubleshooting

### "This app is blocked"
สาเหตุ: บัญชี Google ของคุณถูกจำกัดการ authorize app ที่ไม่ผ่านการ verify (พบบ่อยใน Google Workspace ของบริษัท/โรงเรียน)

**ทางแก้:**
- ลองใช้ **Gmail ส่วนตัว** (ไม่ใช่ของบริษัท/โรงเรียน)
- ถ้าใช้ Workspace → ขอ admin ปลด policy
- ถ้ายังไม่ได้ → ใช้เวอร์ชันหลัก (Netlify + Apps Script) แทน

### dropdown ไม่ขึ้นรายการคอร์ส
- เช็คว่าแท็บชื่อ `รายละเอียดคอร์ส` ถูกต้อง (สะกดเป๊ะ ไม่มี space เกิน)
- เช็คว่า column A มีชื่อคอร์ส, column B มีราคา
- เช็ค Apps Script log: **View → Logs**

### EasySlip ตรวจสลิปไม่ได้
- ตรวจ Script Property `EASYSLIP_API_KEY` ว่าถูกต้อง
- เช็คโควต้า EasySlip ที่ developer.easyslip.com

### เมลไม่ได้รับ
- เช็ค **Spam folder**
- เช็คโควต้า Gmail (Apps Script ส่งได้ ~100 ฉบับ/วัน สำหรับบัญชีฟรี)

---

## 🆚 เปรียบเทียบกับเวอร์ชันหลัก

| | Apps Script Only (เวอร์ชันนี้) | Netlify + Apps Script (เวอร์ชันหลัก) |
|---|---|---|
| Setup | ง่ายกว่า | ซับซ้อนกว่า |
| ระบบที่ต้องดูแล | 1 (Apps Script) | 2 (Netlify + Apps Script) |
| ความเสี่ยงโดน "This app is blocked" | สูง | ต่ำ (เพราะ Apps Script ไม่ใช้ MailApp) |
| ความเร็ว | ช้ากว่าเล็กน้อย (Apps Script execution) | เร็วกว่า |
| Custom domain | ทำไม่ได้ตรงๆ | ทำได้ |
