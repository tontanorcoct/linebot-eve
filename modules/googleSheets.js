import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config();

// ใช้งานด้วย API Key
export async function getSheetData(spreadsheetId, range) {
  const sheets = google.sheets({
    version: 'v4',
    auth: process.env.GOOGLE_API_KEY,
  });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    key: process.env.GOOGLE_API_KEY,
  });
  return res.data.values || [];
}
