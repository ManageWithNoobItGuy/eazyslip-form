import nodemailer from 'nodemailer';

const RECEIVER_ACCOUNT = process.env.RECEIVER_ACCOUNT || '';
const OWNER_EMAIL = process.env.OWNER_EMAIL || '';


export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return resp(405, { success: false, message: 'Method not allowed' });
  }

  try {
    const body = JSON.parse(event.body);
    const { name, phone, email, product, price, slipBase64 } = body;

    if (!name || !phone || !email || !product || !price || !slipBase64) {
      return resp(200, { success: false, message: 'ข้อมูลไม่ครบถ้วน' });
    }

    // 1. ตรวจสลิปผ่าน EasySlip
    const slip = await verifySlip(slipBase64);
    if (!slip.success) return resp(200, { success: false, message: slip.message });
    const d = slip.data;

    // 2. ตรวจยอดเงิน
    const slipAmount = Number(d.amount && d.amount.amount);
    if (slipAmount !== Number(price)) {
      return resp(200, {
        success: false,
        message: `ยอดโอนไม่ตรงกับราคาคอร์ส (สลิป ${slipAmount} บาท / ต้องโอน ${price} บาท)`
      });
    }

    // 3. ตรวจบัญชีผู้รับ
    const receiverAcct = ((d.receiver && d.receiver.account && d.receiver.account.bank && d.receiver.account.bank.account) || '').replace(/\D/g, '');
    const expectedLast4 = RECEIVER_ACCOUNT.slice(-4);
    if (receiverAcct && !receiverAcct.includes(expectedLast4)) {
      return resp(200, { success: false, message: 'สลิปนี้ไม่ได้โอนเข้าบัญชีที่กำหนด' });
    }

    const transRef = d.transRef || d.payload || '';
    const senderName = (d.sender && d.sender.account && d.sender.account.name && (d.sender.account.name.th || d.sender.account.name.en)) || '';

    // 4. บันทึก Sheet ผ่าน Apps Script
    const saveResult = await saveToSheet({
      name, phone, email, product, price,
      slipAmount, transRef,
      slipDate: d.date || '', senderName
    });

    if (!saveResult.success) {
      if (saveResult.error === 'duplicate_slip') {
        return resp(200, { success: false, message: 'สลิปนี้ถูกใช้ลงทะเบียนไปแล้ว ไม่สามารถใช้ซ้ำได้' });
      }
      return resp(200, { success: false, message: 'บันทึกข้อมูลไม่สำเร็จ: ' + (saveResult.error || 'unknown') });
    }

    // 5. ส่งเมล (ถ้าตั้งค่า Gmail ไว้แล้ว)
    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      try {
        await sendEmails({ name, phone, email, product, price, transRef });
        return resp(200, { success: true, message: 'ลงทะเบียนสำเร็จ! ระบบส่งอีเมลยืนยันให้แล้ว' });
      } catch (emailErr) {
        console.error('Email error:', emailErr.message);
        return resp(200, { success: true, message: 'ลงทะเบียนสำเร็จ! (ส่งอีเมลไม่ได้ ทีมงานจะติดต่อกลับ)' });
      }
    }

    return resp(200, { success: true, message: 'ลงทะเบียนสำเร็จ! ทีมงานจะติดต่อกลับโดยเร็วที่สุด' });

  } catch (err) {
    return resp(500, { success: false, message: 'เกิดข้อผิดพลาด: ' + err.message });
  }
};


async function verifySlip(base64) {
  try {
    const r = await fetch('https://developer.easyslip.com/api/v1/verify', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.EASYSLIP_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ image: base64 })
    });
    const result = await r.json();
    if (result.status !== 200 || !result.data) {
      return { success: false, message: translateError(result.message) };
    }
    return { success: true, data: result.data };
  } catch (e) {
    return { success: false, message: 'เชื่อมต่อ EasySlip ไม่สำเร็จ: ' + e.message };
  }
}

function translateError(code) {
  const map = {
    'invalid_image': 'รูปสลิปไม่ถูกต้อง กรุณาแนบรูปสลิปที่ชัดเจน',
    'image_size_too_large': 'ขนาดรูปใหญ่เกินไป',
    'invalid_payload': 'ไม่พบข้อมูลใน QR code ของสลิป',
    'qrcode_not_found': 'ไม่พบ QR code บนสลิป',
    'application_expired': 'API EasySlip หมดอายุการใช้งาน',
    'quota_exceeded': 'เกินโควต้าการตรวจสลิปต่อเดือน',
    'access_denied': 'API key ไม่ถูกต้อง'
  };
  return map[code] || ('EasySlip: ' + (code || 'ไม่ทราบสาเหตุ'));
}


async function saveToSheet(data) {
  try {
    const r = await fetch(process.env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      redirect: 'follow'
    });
    return await r.json();
  } catch (e) {
    return { success: false, error: e.message };
  }
}


async function sendEmails({ name, phone, email, product, price, transRef }) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });

  const priceFmt = Number(price).toLocaleString('th-TH');
  const from = `"ระบบลงทะเบียนคอร์ส" <${process.env.GMAIL_USER}>`;

  // เมลยืนยันไปยังผู้สมัคร
  await transporter.sendMail({
    from,
    to: email,
    subject: `[ยืนยันการสมัคร] ${product}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;">
        <h2 style="color:#5b6cf5;">✅ ขอบคุณสำหรับการสมัครคอร์ส</h2>
        <p>สวัสดีคุณ <b>${name}</b>,</p>
        <p>ระบบได้รับการลงทะเบียนของคุณเรียบร้อยแล้ว</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <tr><td style="padding:10px;border:1px solid #eee;background:#f8f9fa;width:35%;"><b>คอร์ส</b></td><td style="padding:10px;border:1px solid #eee;">${product}</td></tr>
          <tr><td style="padding:10px;border:1px solid #eee;background:#f8f9fa;"><b>ราคา</b></td><td style="padding:10px;border:1px solid #eee;">${priceFmt} บาท</td></tr>
          <tr><td style="padding:10px;border:1px solid #eee;background:#f8f9fa;"><b>เบอร์ติดต่อ</b></td><td style="padding:10px;border:1px solid #eee;">${phone}</td></tr>
          <tr><td style="padding:10px;border:1px solid #eee;background:#f8f9fa;"><b>เลขอ้างอิงสลิป</b></td><td style="padding:10px;border:1px solid #eee;">${transRef}</td></tr>
        </table>
        <p style="margin-top:24px;">ทีมงานจะติดต่อกลับเพื่อให้รายละเอียดคอร์สโดยเร็วที่สุดครับ/ค่ะ</p>
        <p style="color:#888;font-size:12px;margin-top:32px;border-top:1px solid #eee;padding-top:12px;">อีเมลฉบับนี้ส่งจากระบบอัตโนมัติ</p>
      </div>
    `
  });

  // เมลแจ้งเจ้าของคอร์ส
  await transporter.sendMail({
    from,
    to: OWNER_EMAIL,
    subject: `[สมัครใหม่] ${product} — ${name}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;">
        <h2 style="color:#2e7d32;">🎉 มีผู้สมัครคอร์สใหม่</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:10px;border:1px solid #eee;background:#f8f9fa;width:35%;"><b>ชื่อ</b></td><td style="padding:10px;border:1px solid #eee;">${name}</td></tr>
          <tr><td style="padding:10px;border:1px solid #eee;background:#f8f9fa;"><b>เบอร์</b></td><td style="padding:10px;border:1px solid #eee;">${phone}</td></tr>
          <tr><td style="padding:10px;border:1px solid #eee;background:#f8f9fa;"><b>อีเมล</b></td><td style="padding:10px;border:1px solid #eee;">${email || '-'}</td></tr>
          <tr><td style="padding:10px;border:1px solid #eee;background:#f8f9fa;"><b>คอร์ส</b></td><td style="padding:10px;border:1px solid #eee;">${product}</td></tr>
          <tr><td style="padding:10px;border:1px solid #eee;background:#f8f9fa;"><b>ราคา</b></td><td style="padding:10px;border:1px solid #eee;">${priceFmt} บาท</td></tr>
          <tr><td style="padding:10px;border:1px solid #eee;background:#f8f9fa;"><b>เลขอ้างอิงสลิป</b></td><td style="padding:10px;border:1px solid #eee;">${transRef}</td></tr>
        </table>
      </div>
    `
  });
}


function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function resp(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    body: JSON.stringify(body)
  };
}
