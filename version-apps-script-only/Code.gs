/**
 * EasySlip Form — Google Apps Script เวอร์ชันเดียวจบ
 * ทำทุกอย่างใน Apps Script: serve HTML + ตรวจสลิป + บันทึก Sheet + ส่งเมล
 *
 * ก่อนใช้งาน:
 * 1. ตั้งค่า Script Properties (Project Settings → Script properties)
 *    - EASYSLIP_API_KEY: API key จาก easyslip.com
 *    - RECEIVER_ACCOUNT: เลขบัญชีรับเงิน (ไม่มีขีด)
 *    - OWNER_EMAIL: อีเมลเจ้าของคอร์ส (รับแจ้งเตือน)
 * 2. สร้างแท็บ "รายละเอียดคอร์ส" ใน Sheet ใส่คอลัมน์: ชื่อคอร์ส | ราคา
 * 3. Deploy → Web app → Execute as: Me, Who has access: Anyone
 */

const COURSE_SHEET = 'รายละเอียดคอร์ส';
const REGISTRATION_SHEET = 'ลงทะเบียน';


// === Web App Entry Point ===
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('ลงทะเบียนคอร์สเรียน')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


// === ส่งรายการคอร์สให้ฟอร์ม (เรียกจาก google.script.run) ===
function getProducts() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(COURSE_SHEET);
    if (!sheet) return { products: [], error: 'ไม่พบแท็บ "' + COURSE_SHEET + '"' };
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { products: [] };
    const products = sheet.getRange(2, 1, lastRow - 1, 2).getValues()
      .filter(r => r[0] && r[1] !== '')
      .map(r => ({ name: String(r[0]).trim(), price: Number(r[1]) }));
    return { products };
  } catch (err) {
    return { products: [], error: err.message };
  }
}


// === รับฟอร์ม: ตรวจสลิป + บันทึก + ส่งเมล (เรียกจาก google.script.run) ===
function submitRegistration(payload) {
  try {
    const { name, phone, email, product, price, slipBase64 } = payload;

    if (!name || !phone || !email || !product || !price || !slipBase64) {
      return { success: false, message: 'ข้อมูลไม่ครบถ้วน' };
    }

    // 1. ตรวจสลิปผ่าน EasySlip
    const slip = verifySlip_(slipBase64);
    if (!slip.success) return { success: false, message: slip.message };
    const d = slip.data;

    // 2. ตรวจยอดเงิน
    const slipAmount = Number(d.amount && d.amount.amount);
    if (slipAmount !== Number(price)) {
      return {
        success: false,
        message: 'ยอดโอนไม่ตรง (สลิป ' + slipAmount + ' บาท / ต้องโอน ' + price + ' บาท)'
      };
    }

    // 3. ตรวจบัญชีผู้รับ
    const props = PropertiesService.getScriptProperties();
    const expectedAccount = props.getProperty('RECEIVER_ACCOUNT') || '';
    const receiverAcct = ((d.receiver && d.receiver.account && d.receiver.account.bank && d.receiver.account.bank.account) || '').replace(/\D/g, '');
    if (expectedAccount && receiverAcct && !receiverAcct.includes(expectedAccount.slice(-4))) {
      return { success: false, message: 'สลิปไม่ได้โอนเข้าบัญชีที่กำหนด' };
    }

    const transRef = d.transRef || d.payload || '';
    const senderName = (d.sender && d.sender.account && d.sender.account.name && (d.sender.account.name.th || d.sender.account.name.en)) || '';

    // 4. กันสลิปซ้ำ
    if (transRef && isDuplicateSlip_(transRef)) {
      return { success: false, message: 'สลิปนี้ถูกใช้ลงทะเบียนไปแล้ว' };
    }

    // 5. บันทึก Sheet
    saveRegistration_({
      name, phone, email, product, price,
      slipAmount, transRef, slipDate: d.date || '', senderName
    });

    // 6. ส่งเมล (ไม่ fail ทั้งระบบถ้าส่งไม่ได้)
    try {
      sendEmails_({ name, phone, email, product, price, transRef });
    } catch (emailErr) {
      Logger.log('Email error: ' + emailErr.message);
      return { success: true, message: 'ลงทะเบียนสำเร็จ! (ส่งเมลไม่ได้: ' + emailErr.message + ')' };
    }

    return { success: true, message: 'ลงทะเบียนสำเร็จ! ระบบส่งเมลยืนยันให้แล้ว' };

  } catch (err) {
    return { success: false, message: 'เกิดข้อผิดพลาด: ' + err.message };
  }
}


// === EasySlip API ===
function verifySlip_(base64) {
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('EASYSLIP_API_KEY');
    if (!apiKey) return { success: false, message: 'ยังไม่ได้ตั้ง EASYSLIP_API_KEY ใน Script Properties' };

    const response = UrlFetchApp.fetch('https://developer.easyslip.com/api/v1/verify', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + apiKey },
      payload: JSON.stringify({ image: base64 }),
      muteHttpExceptions: true
    });
    const result = JSON.parse(response.getContentText());
    if (result.status !== 200 || !result.data) {
      return { success: false, message: translateError_(result.message) };
    }
    return { success: true, data: result.data };
  } catch (err) {
    return { success: false, message: 'EasySlip error: ' + err.message };
  }
}

function translateError_(code) {
  const map = {
    'invalid_image': 'รูปสลิปไม่ถูกต้อง',
    'image_size_too_large': 'รูปใหญ่เกินไป',
    'invalid_payload': 'ไม่พบข้อมูลใน QR code',
    'qrcode_not_found': 'ไม่พบ QR code บนสลิป',
    'application_expired': 'API หมดอายุ',
    'quota_exceeded': 'เกินโควต้า',
    'access_denied': 'API key ไม่ถูกต้อง'
  };
  return map[code] || ('EasySlip: ' + (code || 'ไม่ทราบสาเหตุ'));
}


// === Google Sheets ===
function saveRegistration_(r) {
  const sheet = getRegistrationSheet_();
  sheet.appendRow([
    new Date(),
    r.name, r.phone, r.email,
    r.product, Number(r.price), Number(r.slipAmount),
    r.transRef, r.slipDate, r.senderName, 'CONFIRMED'
  ]);
}

function getRegistrationSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(REGISTRATION_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(REGISTRATION_SHEET);
    sheet.appendRow([
      'วันที่ลงทะเบียน', 'ชื่อ-นามสกุล', 'เบอร์ติดต่อ', 'อีเมล',
      'คอร์ส', 'ราคา (บาท)', 'ยอดโอน (บาท)', 'เลขอ้างอิงสลิป',
      'วันที่โอน', 'ชื่อผู้โอน', 'สถานะ'
    ]);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#f0f4ff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function isDuplicateSlip_(transRef) {
  const sheet = getRegistrationSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  return sheet.getRange(2, 8, lastRow - 1, 1).getValues().some(r => r[0] === transRef);
}


// === Email ===
function sendEmails_(p) {
  const ownerEmail = PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL') || '';
  const priceFmt = Number(p.price).toLocaleString('th-TH');

  // เมลถึงผู้สมัคร
  if (p.email) {
    MailApp.sendEmail({
      to: p.email,
      subject: '[ยืนยันการสมัคร] ' + p.product,
      htmlBody: emailUserHtml_(p, priceFmt)
    });
  }

  // เมลถึงเจ้าของคอร์ส
  if (ownerEmail) {
    MailApp.sendEmail({
      to: ownerEmail,
      subject: '[สมัครใหม่] ' + p.product + ' — ' + p.name,
      htmlBody: emailOwnerHtml_(p, priceFmt)
    });
  }
}

function emailUserHtml_(p, priceFmt) {
  return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;">' +
    '<h2 style="color:#5b6cf5;">✅ ขอบคุณสำหรับการสมัครคอร์ส</h2>' +
    '<p>สวัสดีคุณ <b>' + p.name + '</b>,</p>' +
    '<p>ระบบได้รับการลงทะเบียนของคุณเรียบร้อยแล้ว</p>' +
    '<table style="width:100%;border-collapse:collapse;margin-top:16px;">' +
    row_('คอร์ส', p.product) +
    row_('ราคา', priceFmt + ' บาท') +
    row_('เบอร์ติดต่อ', p.phone) +
    row_('เลขอ้างอิงสลิป', p.transRef) +
    '</table>' +
    '<p style="margin-top:24px;">ทีมงานจะติดต่อกลับเพื่อให้รายละเอียดคอร์สโดยเร็วที่สุดครับ/ค่ะ</p>' +
    '</div>';
}

function emailOwnerHtml_(p, priceFmt) {
  return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;">' +
    '<h2 style="color:#2e7d32;">🎉 มีผู้สมัครคอร์สใหม่</h2>' +
    '<table style="width:100%;border-collapse:collapse;">' +
    row_('ชื่อ', p.name) +
    row_('เบอร์', p.phone) +
    row_('อีเมล', p.email || '-') +
    row_('คอร์ส', p.product) +
    row_('ราคา', priceFmt + ' บาท') +
    row_('เลขอ้างอิงสลิป', p.transRef) +
    '</table></div>';
}

function row_(label, value) {
  return '<tr>' +
    '<td style="padding:10px;border:1px solid #eee;background:#f8f9fa;width:35%;"><b>' + label + '</b></td>' +
    '<td style="padding:10px;border:1px solid #eee;">' + value + '</td>' +
    '</tr>';
}
