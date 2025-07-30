// api/sheets.js
import { getSheetData } from '../modules/googleSheets.js';

export default async function handler(req, res) {
  // รองรับแค่ GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // รับพารามิเตอร์ spreadsheet ID และ range
  const { id, range } = req.query;
  if (!id || !range) {
    return res.status(400).json({ error: 'Missing query parameters: id or range' });
  }

  try {
    // เรียกโมดูล googleSheets ดึงข้อมูล
    const data = await getSheetData(id, range);
    // ส่งข้อมูลกลับในรูปแบบ JSON
    return res.status(200).json({ data });
  } catch (err) {
    console.error('Google Sheets API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
