// api/scheduled-duty.js

import { Client } from '@line/bot-sdk';
import { differenceInCalendarDays, addDays } from 'date-fns';

// — LINE SDK client setup (same as in webhook.js) —
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
// Reference date for rotation (1 ส.ค.2568)
const referenceDate = new Date(2025, 7, 1);
const rotation      = [3, 1, 2];

// Team officers data
const teamOfficers = {
  1: [
    { rank:'ร.ต.อ.', name:'สายัณห์ มาปะโท',    title:'รอง สว.สส.ฯ',    code:'ปค.412', phone:'062-3271588' },
    { rank:'ร.ต.ท.', name:'ฉัตรชัย คร่ำกระโทก', title:'รอง สว.สสฯ',     code:'ปค.416', phone:'081-9224175' },
    { rank:'ส.ต.ท.', name:'อัศนัย เรืองสาย',    title:'รอง ผบ.หมู่ สสฯ', code:'ปค.4116', phone:'099-1719842' },
  ],
  2: [
    { rank:'ร.ต.อ.', name:'จำเริญ ทิสมบูรณ์',   title:'รอง สว.สสฯ',    code:'ปค.411',  phone:'094-9692994' },
    { rank:'ร.ต.ท.', name:'สมคิด บัวมาศ',       title:'รอง สว.สสฯ',    code:'ปค.415',  phone:'083-1997055' },
    { rank:'ด.ต.',  name:'กฤษ บัติพิมาย',       title:'ผบ.หมู่ ป.ฯ',   code:'ปค.4112', phone:'098-6824652' },
    { rank:'ส.ต.อ.', name:'ชยันธร แยบกระโทก',  title:'ผบ.หมู่ ป.ฯ',   code:'ปค.4114', phone:'098-2845413' },
  ],
  3: [
    { rank:'ร.ต.อ.', name:'เกียรติศักดิ์ คำกุล', title:'รอง สว.สส.ฯ',   code:'ปค.413',  phone:'095-8165176' },
    { rank:'ส.ต.ท.', name:'ธีระ โฉมไธสง',       title:'ผบ.หมู่ ป.ฯ',   code:'ปค.4115', phone:'064-2066256' },
    { rank:'ส.ต.ท.', name:'ปภาวินทร์ ทิพย์ธรทอง', title:'ผบ.หมู่ ป.ฯ',  code:'ปค.4116', phone:'061-9296899' },
  ]
};

// Format a Date to Thai style
function fmtThai(dt) {
  return `${dt.getDate()} ${thaiMonths[dt.getMonth()]} ${dt.getFullYear() + 543}`;
}

// Build the “duty” message for a given date
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

// Handler for the Vercel Scheduled Function
export default async function handler(req, res) {
  // 1) Log trigger time
  const now = new Date().toISOString();
  console.log(`[Scheduled] Trigger at ${now}`);

  try {
    const today   = new Date();   // UTC time
    const dutyMsg = await makeDutyMessageForDate(today);

    // 2) Log selected team
    const teamLine = dutyMsg.text.match(/● ชุดปฏิบัติการ สืบสวนที่ \d/)[0];
    console.log(`[Scheduled] ${teamLine}`);

    await client.broadcast([ dutyMsg ]);

    // 3) Confirm success
    console.log('[Scheduled] Broadcast success');
    return res.status(200).json({ ok: true });
  } catch (err) {
    // 4) Error handling log
    console.error('[Scheduled] Error sending duty message:', err);
    return res.status(500).json({ error: 'failed' });
  }
}
