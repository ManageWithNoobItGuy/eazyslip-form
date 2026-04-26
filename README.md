# 📝 EazySlip — ระบบลงทะเบียนคอร์สพร้อมตรวจสลิปอัตโนมัติ

ระบบรับลงทะเบียนคอร์สออนไลน์ที่ตรวจสอบสลิปโอนเงินผ่าน EasySlip API อัตโนมัติ บันทึกข้อมูลลง Google Sheets และส่งอีเมลยืนยันให้ผู้สมัครและเจ้าของคอร์ส

## ✨ ฟีเจอร์

- ฟอร์มลงทะเบียนดึงรายการคอร์สและราคาจาก Google Sheets อัตโนมัติ
- ตรวจสลิปโอนเงินด้วย EasySlip API (ตรวจยอด + บัญชีผู้รับ + กันสลิปซ้ำ)
- บันทึกข้อมูลผู้สมัครลง Google Sheets
- ส่งอีเมลยืนยันให้ผู้สมัครและเจ้าของคอร์สอัตโนมัติ

## 🏗️ สถาปัตยกรรม

```
[Frontend HTML บน Netlify]
        ↓ GET  — ดึงรายการคอร์ส
[Google Apps Script] ←→ [Google Sheets]
        ↑ POST — บันทึกการลงทะเบียน

[Frontend HTML บน Netlify]
        ↓ POST
[Netlify Function /register]
        ├─→ EasySlip API (ตรวจสลิป)
        ├─→ Apps Script (บันทึก Sheet)
        └─→ Gmail SMTP (ส่งเมลยืนยัน)
```

---

## 🚀 วิธีติดตั้ง (Step-by-Step)

### สิ่งที่ต้องเตรียม

- Google Account (Gmail ส่วนตัว แนะนำให้แยกจาก Workspace)
- [Netlify](https://netlify.com) account (ฟรี)
- [EasySlip](https://developer.easyslip.com) API Key (ฟรีมีโควต้า)

---

### ขั้นที่ 1 — เตรียม Google Sheets

1. สร้าง Google Sheet ใหม่
2. สร้างแท็บชื่อ **`รายละเอียดคอร์ส`** และใส่ข้อมูล:

   | A (ชื่อคอร์ส) | B (ราคา) |
   |---|---|
   | ชื่อคอร์ส | ราคา |
   | คอร์สที่ 1 | 500 |
   | คอร์สที่ 2 | 800 |

---

### ขั้นที่ 2 — ตั้งค่า Google Apps Script

1. ใน Google Sheet → **ส่วนขยาย → Apps Script**
2. ลบโค้ดเดิมทั้งหมด วางโค้ดจากไฟล์ `Code.gs` ในโปรเจกต์นี้
3. เปิด **Project Settings** (⚙️) → ติ๊ก **"Show appsscript.json manifest file"**
4. แก้ไฟล์ `appsscript.json` ให้มีเนื้อหาดังนี้:
   ```json
   {
     "timeZone": "Asia/Bangkok",
     "dependencies": {},
     "exceptionLogging": "STACKDRIVER",
     "runtimeVersion": "V8",
     "oauthScopes": [
       "https://www.googleapis.com/auth/spreadsheets"
     ]
   }
   ```
5. กด **Deploy → New deployment**
   - Type: `Web app`
   - Execute as: `Me`
   - Who has access: `Anyone`
6. อนุญาตสิทธิ์ → Copy **Web App URL** ที่ได้

---

### ขั้นที่ 3 — ตั้งค่า Gmail App Password

> ใช้สำหรับส่งอีเมลยืนยัน ถ้าไม่ต้องการส่งเมล ข้ามขั้นตอนนี้ได้

1. เปิด [myaccount.google.com/security](https://myaccount.google.com/security)
2. เปิดใช้ **2-Step Verification**
3. ไปที่ [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
4. สร้าง App Password ชื่อ `EasySlip Form` → ได้รหัส 16 ตัว

---

### ขั้นที่ 4 — Fork และแก้ไขโค้ด

1. กด **Fork** ที่มุมขวาบนของ GitHub repo นี้
2. เปิดไฟล์ `index.html` ใน repo ของคุณ → กด ✏️ แก้ไข
3. แก้บรรทัดนี้:
   ```js
   const APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL_HERE';
   ```
   ใส่ URL จากขั้นที่ 2
4. กด **Commit changes**

---

### ขั้นที่ 5 — Deploy ขึ้น Netlify (ผ่านเว็บ ไม่ต้องใช้ Terminal)

1. ไปที่ [app.netlify.com](https://app.netlify.com) → สมัคร/login
2. กด **"Add new site"** → **"Import an existing project"**
3. เลือก **"Deploy with GitHub"** → อนุญาตให้ Netlify เข้าถึง GitHub
4. เลือก repo **eazyslip-form** ที่ Fork ไว้
5. ในหน้า Build settings:
   - **Branch to deploy:** `main`
   - **Base directory:** _(เว้นว่าง)_
   - **Build command:** _(เว้นว่าง)_
   - **Publish directory:** `.`
6. กด **"Deploy eazyslip-form"**
7. รอ 1-2 นาที → ได้ URL เว็บไซต์ของคุณ 🎉

---

### ขั้นที่ 6 — ตั้งค่า Environment Variables ใน Netlify

1. ใน Netlify Dashboard → เลือก site ของคุณ
2. ไปที่ **Site configuration → Environment variables**
3. กด **"Add a variable"** แล้วเพิ่มทีละตัว:

| Key | Value | จำเป็น |
|---|---|---|
| `EASYSLIP_API_KEY` | API Key จาก EasySlip | ✅ |
| `APPS_SCRIPT_URL` | Web App URL จากขั้นที่ 2 | ✅ |
| `RECEIVER_ACCOUNT` | เลขบัญชีผู้รับเงิน (ไม่มีขีด เช่น `1234567890`) | ✅ |
| `OWNER_EMAIL` | อีเมลเจ้าของที่รับแจ้งเตือนเมื่อมีคนสมัคร | ✅ |
| `GMAIL_USER` | Gmail ที่ใช้ส่งเมลยืนยัน | ➖ ถ้าต้องการส่งเมล |
| `GMAIL_APP_PASSWORD` | App Password 16 ตัวจากขั้นที่ 3 | ➖ ถ้าต้องการส่งเมล |

4. หลังใส่ครบ → ไปที่ **Deploys** → กด **"Trigger deploy"** → **"Deploy site"**

---

### ✅ เสร็จแล้ว!

เปิด URL ของ Netlify ทดสอบกรอกฟอร์มและอัปโหลดสลิปได้เลย

---

## 🤖 วิธีใช้กับ Claude Code (สำหรับนักพัฒนา)

ถ้ามี [Claude Code](https://claude.ai/code) ติดตั้งแล้ว สามารถให้ Claude ช่วย setup ได้อัตโนมัติ:

```bash
# 1. Clone โปรเจกต์
git clone https://github.com/ManageWithNoobItGuy/eazyslip-form.git
cd eazyslip-form

# 2. เปิด Claude Code
claude
```

**จากนั้นบอก Claude ว่า:**

> "ช่วย setup โปรเจกต์นี้ให้หน่อย โดยมีข้อมูลดังนี้:
> - Apps Script URL: `https://script.google.com/...`
> - EasySlip API Key: `xxx`
> - เลขบัญชีผู้รับเงิน: `XXXXXXXXXX`
> - อีเมลเจ้าของคอร์ส: `xxx@email.com`
> - Gmail สำหรับส่งเมล: `xxx@gmail.com`
> - Gmail App Password: `xxxx xxxx xxxx xxxx`
>
> ให้ตั้งค่า env vars ใน Netlify และ deploy ขึ้น production ให้ด้วย"

Claude Code จะจัดการ update config, ตั้ง env vars และ deploy ให้อัตโนมัติ

---

## 📁 โครงสร้างไฟล์

```
├── Code.gs                    # Google Apps Script (อ่าน/เขียน Sheet)
├── index.html                 # หน้าฟอร์มลงทะเบียน
├── netlify.toml               # Netlify config
├── package.json               # Node.js dependencies
├── .env.example               # ตัวอย่าง environment variables
└── netlify/
    └── functions/
        └── register.mjs       # Netlify Function (ตรวจสลิป + บันทึก + เมล)
```

## 📄 License

MIT
