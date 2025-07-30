// api/scheduled-duty.js

import { Client } from '@line/bot-sdk';
import { differenceInCalendarDays, addDays } from 'date-fns';

// — LINE SDK client setup —
const config = {
  channelAccessToken: process.env.LINE_TOKEN,
  channelSecret: process.env.LINE_SECRET,
};
const client = new Client(config);

// — Thai month names and duty rotation data —
const thaiMonths = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
];
const referenceDate = new Date(2025, 7, 1);  // 1 ส.ค.2568
const rotation      = [3, 1, 2];

// ข้อมูลทีมสืบสวน
const teamOfficers = {
  1: [ /* ข้อมูลชุดที่ 1 */ ],
  2: [ /* ข้อมูลชุดที่ 2 */ ],
  3: [ /* ข้อมูลชุดที่ 3 */ ],
};

// ฟอร์แมตวันที่เป็นไทย
function fmtThai(dt) {
  return `${dt.getDate()} ${thaiMonths[dt.getMonth()]} ${dt.getFullYear() + 543}`;
}

// สร้างข้อความ duty สำหรับวันปัจจุบัน
async function makeDutyMessageForDate(date) {
  const idx  = ((differenceInCalendarDays(date, referenceDate) % 3) + 3) % 3;
  const team = rotation[idx];
  const next = addDays(date, 1);

  const lines = [
    'สภ.ปากคลองรังสิต ภ.จว.ปทุมธานี',
    '__________________',
    '',
    'เรียน ผู้บังคับบัญชา',
    `   วันที่ ${fmtThai(date)}`,
    '',
    `● ชุดปฏิบัติการ สืบสวนที่ ${team}`,
    ...teamOfficers[team].flatMap(o => [
      `${o.rank}${o.name}`,
      `${o.title} (${o.code})`,
      `โทร.${o.phone}`,
    ]),
    '',
    '● ปฏิบัติหน้าที่ เวรสืบสวนประจำวันนี้',
    `ตั้งแต่วันที่ ${fmtThai(date)}`,
    'เวลา 08.00 น.',
    `ถึงวันที่ ${fmtThai(next)}`,
    'เวลา 08.00 น.',
    '__________________',
    '',
    '    จึงเรียนมาเพื่อโปรดทราบ'
  ];

  return { type: 'text', text: lines.join('\n') };
}

export default async function handler(req, res) {
  // 1) Log trigger timestamp
  const now = new Date().toISOString();
  console.log(`[Scheduled] Trigger at ${now}`);

  // 2) Group IDs
  const groupIds = [
    'C32d917c1534d7e9585ac61f9639954d2', // Exclusive ปากคลอง
    'C04233de8ae6cdb71cbd581778bacf4f4'  // สืบสวนปากคลอง
  ];

  if (!groupIds.length) {
    console.error('[Scheduled] No group IDs – skipping send');
    return res.status(200).json({ ok: true, skipped: true });
  }

  try {
    // 3) Generate duty message
    const today   = new Date();
    const dutyMsg = await makeDutyMessageForDate(today);

    // 4) Log selected team for debugging
    const match = dutyMsg.text.match(/● ชุดปฏิบัติการ สืบสวนที่ \d/);
    if (match) console.log(`[Scheduled] ${match[0]}`);

    // 5) Send to groups
    await client.multicast(groupIds, [ dutyMsg ]);
    console.log('[Scheduled] Multicast success to groups:', groupIds);
    return res.status(200).json({ ok: true });
  } catch (err) {
    // 6) Error handling with stack trace
    console.error('[Scheduled] Error sending duty message:', err);
    console.error(err.stack);
    return res.status(500).json({ error: 'failed' });
  }
}
