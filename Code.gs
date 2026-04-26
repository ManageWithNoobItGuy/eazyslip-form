/**
 * Apps Script — รับข้อมูลฟอร์ม + เขียน Google Sheets เท่านั้น
 * การส่งเมลย้ายไปอยู่ที่ Netlify Function แล้ว
 */

const COURSE_SHEET = 'รายละเอียดคอร์ส';
const REGISTRATION_SHEET = 'ลงทะเบียน';


// GET — ส่งรายการคอร์สให้ฟอร์ม
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(COURSE_SHEET);
    const lastRow = sheet.getLastRow();
    const products = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, 2).getValues()
      .filter(r => r[0] && r[1] !== '')
      .map(r => ({ name: String(r[0]).trim(), price: Number(r[1]) }));
    return jsonResp({ products });
  } catch (err) {
    return jsonResp({ products: [], error: err.message });
  }
}


// POST — บันทึกการลงทะเบียน + เช็คสลิปซ้ำ
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.transRef && isDuplicateSlip_(data.transRef)) {
      return jsonResp({ success: false, error: 'duplicate_slip' });
    }

    const sheet = getRegistrationSheet_();
    sheet.appendRow([
      new Date(),
      data.name || '',
      data.phone || '',
      data.email || '',
      data.product || '',
      Number(data.price) || 0,
      Number(data.slipAmount) || 0,
      data.transRef || '',
      data.slipDate || '',
      data.senderName || '',
      'CONFIRMED'
    ]);

    return jsonResp({ success: true });

  } catch (err) {
    return jsonResp({ success: false, error: err.message });
  }
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
  const refs = sheet.getRange(2, 8, lastRow - 1, 1).getValues();
  return refs.some(row => row[0] === transRef);
}

function jsonResp(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
