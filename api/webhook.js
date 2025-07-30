// api/webhook.js
import { Client, middleware } from '@line/bot-sdk';
import { differenceInCalendarDays, addDays } from 'date-fns';
import { getSheetData } from '../modules/googleSheets.js';
import OpenAI from 'openai';
import { extractTextFromImage } from '../modules/googleVision.js';
import { translateText, formatReport } from '../modules/translator.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const config = {
  channelAccessToken: process.env.LINE_TOKEN,
  channelSecret: process.env.LINE_SECRET,
};
const client = new Client(config);

// Google Sheets
const SHEET_ID     = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const POLICE_RANGE = `'Police'!A2:G100`;  // แท็บชื่อ "Police"

// เดือนภาษาไทย → ดัชนี 0–11
const monthMap = {
  '1':0,'01':0,'มกราคม':0,'ม.ค.':0,'ม.ค':0,
  '2':1,'02':1,'กุมภาพันธ์':1,'ก.พ.':1,'ก.พ':1,
  '3':2,'03':2,'มีนาคม':2,'มี.ค.':2,'มี.ค':2,
  '4':3,'04':3,'เมษายน':3,'เม.ย.':3,'เม.ย':3,
  '5':4,'05':4,'พฤษภาคม':4,'พ.ค.':4,'พ.ค':4,
  '6':5,'06':5,'มิถุนายน':5,'มิ.ย.':5,'มิ.ย':5,
  '7':6,'07':6,'กรกฎาคม':6,'ก.ค.':6,'ก.ค':6,
  '8':7,'08':7,'สิงหาคม':7,'ส.ค.':7,'ส.ค':7,
  '9':8,'09':8,'กันยายน':8,'ก.ย.':8,'ก.ย':8,
  '10':9,'ตุลาคม':9,'ต.ค.':9,'ต.ค':9,
  '11':10,'พฤศจิกายน':10,'พ.ย.':10,'พ.ย':10,
  '12':11,'ธันวาคม':11,'ธ.ค.':11,'ธ.ค':11,
};
const thaiMonths = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
];

// เวรอ้างอิง 1 ส.ค.2568 → วนชุด [3,1,2]
const referenceDate = new Date(2025, 7, 1);
const rotation      = [3,1,2];

// ข้อมูลชุดสืบสวน
const teamOfficers = {
  1: [
    { rank:'ร.ต.อ.', name:'สายัณห์ มาปะโท',    title:'รอง สว.สส.ฯ',    code:'ปค.412',  phone:'062-3271588' },
    { rank:'ร.ต.ท.', name:'ฉัตรชัย คร่ำกระโทก', title:'รอง สว.สสฯ',     code:'ปค.416',  phone:'081-9224175' },
    { rank:'ส.ต.ท.', name:'อัศนัย เรืองสาย',     title:'รอง ผบ.หมู่ สสฯ', code:'ปค.4116', phone:'099-1719842' },
  ],
  2: [
    { rank:'ร.ต.อ.', name:'จำเริญ ทิสมบูรณ์',   title:'รอง สว.สสฯ',    code:'ปค.411',  phone:'094-9692994' },
    { rank:'ร.ต.ท.', name:'สมคิด บัวมาศ',       title:'รอง สว.สสฯ',    code:'ปค.415',  phone:'083-1997055' },
    { rank:'ด.ต.', name:'กฤษ บัติพิมาย',      title:'ผบ.หมู่ ป.ฯ',   code:'ปค.4112', phone:'098-6824652' },
    { rank:'ส.ต.อ.', name:'ชยันธร แยบกระโทก',   title:'ผบ.หมู่ ป.ฯ',   code:'ปค.4114', phone:'098-2845413' },
  ],
  3: [
    { rank:'ร.ต.อ.', name:'เกียรติศักดิ์ คำกุล',  title:'รอง สว.สส.ฯ',   code:'ปค.413',  phone:'095-8165176' },
    { rank:'ส.ต.ท.', name:'ธีระ โฉมไธสง',        title:'ผบ.หมู่ ป.ฯ',   code:'ปค.4115', phone:'064-2066256' },
    { rank:'ส.ต.ท.', name:'ปภาวินทร์ ทิพย์ธรทอง', title:'ผบ.หมู่ ป.ฯ',   code:'ปค.4116', phone:'061-9296899' },
  ]
};

function fmtThai(dt) {
  return `${dt.getDate()} ${thaiMonths[dt.getMonth()]} ${dt.getFullYear() + 543}`;
}

// สร้างข้อความ duty สำหรับวันนั้นๆ
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

// คำสั่งต่าง ๆ ของ @น้องอีฟ
const commands = [
  // 1) แสดงคำสั่งทั้งหมด
  {
    name: 'capabilities',
    keywords: ['ทำอะไรได้บ้าง','ทำไรได้','คำสั่ง','เช็ค'],
    replyText:
`สวัสดีค่ะพี่ๆ หนูน้องอีฟนะคะ
นี้เป็นคำสั่งที่พี่ๆ สั่งให้หนูทำได้ค่ะ
__________________
1. เช็ควันเข้าเวร
   - เวร (ตามด้วยวันเดือนปี)

2. พนักงานสอบสวน
   - พงส / สอบสวน

3. เวรอำนวยการผู้ใหญ่
   - เวรอำนวยการ

4. เจ้าหน้าที่ตำรวจปากคลองทั้งหมด
   - ตำรวจปากคลอง

5. สรุปการประชุมประจำอาทิตย์
   - สรุปประชุม

6. งานที่ยังค้างส่ง , การตรวจค้น
   - งานค้าง / ตรวจค้น

7. หนูเต้นให้พี่ๆผ่อนคลาย
   - เต้น

8.ให้หนูแปลข้อความประจำวัน
   (อยู่ระหว่างพัฒนานะคะ)
   - แปลหน่อย / ช่วยหน่อย
__________________
หากพี่อยากให้หนูทำอย่างอื่น... ทักหนูส่วนตัวมานะคะ ❤️`
  },

// 2) เวรอำนวยการผู้ใหญ่ (ส่งเป็นภาพ)
{
  name: 'supervisorDuty',
  keywords: ['เวรอำนวยการ','เวรอำนวยการผู้ใหญ่'],
  handler: async () => {
    return [
      {
        type: 'image',
        originalContentUrl: 'https://res.cloudinary.com/df5hopefn/image/upload/v1753715451/venoom-7-68_fqmrjt.jpg',
        previewImageUrl:  'https://res.cloudinary.com/df5hopefn/image/upload/v1753715451/venoom-7-68_fqmrjt.jpg'
      }
    ];
  }
},

  // 3) เช็ควันเข้าเวร
  {
    name: 'duty',
    match: text => text.includes('เวร'),
    handler: async text => {
      const m = text.match(/เวร(?:วันที่)?\s*(\d{1,2})\s*(?:เดือน\s*)?([^\s\d]+|\d{1,2})\s*(?:ปี\s*)?(\d{2,4})/);
      if (!m) return null;
      const [, d, mth, y] = m;
      const day = +d;
      const monthIndex = monthMap[mth] ?? (+mth - 1);
      const be = +y < 1000 ? +y + 2500 : +y;
      const ce = be - 543;
      const date = new Date(ce, monthIndex, day);
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
      return { type:'text', text: lines.join('\n') };
    }
  },

  // 4) พนักงานสอบสวน
  {
    name: 'investigators',
    keywords: ['พงส','สอบสวน'],
    replyText:
`พนักงานสอบสวน สภ.ปากคลองรังสิต
เบอร์โทร 02-501 2298
02-501 2892
FAX 02-501 2951
__________________

พ.ต.ท.เนติ รุ่งฟ้าแสงอรุณ
รอง ผกก.(สอบสวน)
โทร.094-1653616
(หัวหน้า พงส.)

พ.ต.ท.วุฒิ พระเดชวงษ์
สว.(สอบสวน)ฯ
โทร.063-7698029
(หัวหน้างานคดี)

พ.ต.ท.กวี ช่วยสร้าง
สว.(สอบสวน)ฯ
โทร.086-5141000

พ.ต.ท.สุวัฒน์ โพธิ์รี
สว.(สอบสวน)ฯ
โทร.089-1142213

พ.ต.ต.หญิง อัจฉรา กระเตื้องงาน
สว.(สอบสวน)ฯ
โทร.081-5195559

ร.ต.ท.พิสิษฐ์ จองจารุวงศ์
รอง สว.(สอบสวน)ฯ
โทร.086-3466493

ร.ต.ท.พงศธร แลเลิศ
รอง สว.(สอบสวน)ฯ
โทร.065-9981462

ร.ต.ท.หญิง วสุกัญญา ธชีพันธ์
รอง สว.(สอบสวน)ฯ
โทร.091-0287794
__________________

    จึงเรียนมาเพื่อโปรดทราบ`
  },

// 5) สรุปประชุม
{
  name: 'meetingSummary',
  keywords: ['สรุปประชุม','ประชุม'],
  handler: async () => {
    // อ่านทุกแถวจากคอลัมน์ A–G
    const rows = await getSheetData(SHEET_ID, "'Meet'!A2:G100");

    // ตัด cell ที่ว่าง แล้ว join ด้วย space
    const lines = rows.map(r =>
      r
        .filter(cell => cell !== null && cell !== '')
        .join(' ')
    );

    return {
      type: 'text',
      text: `สรุปการประชุมประจำสัปดาห์นี้:\n${lines.join('\n')}`
    };
  }
},

// 6) งานค้าง / ตรวจค้น (1 คอลัมน์ = 1 ข้อความ)
{
  name: 'backlog',
  keywords: ['งานค้าง','ตรวจค้น'],
  handler: async () => {
    // ดึงข้อมูลจากแท็บ "Work" (ปรับ range ตามจริงได้)
    const rows = await getSheetData(SHEET_ID, "'Work'!A2:Z100");
    // หาเลขคอลัมน์สูงสุด
    const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);

    const messages = [];
    for (let col = 0; col < maxCols; col++) {
      // เก็บเฉพาะค่าไม่ว่างของคอลัมน์นี้
      const items = rows
        .map(r => r[col])
        .filter(cell => cell != null && cell !== '');

      if (items.length === 0) continue;  // ข้ามถ้าคอลัมน์เปล่า

      // ใส่ header แค่คอลัมน์แรก
      const header = col === 0 ? 'งานค้างและการตรวจค้น:\n\n' : '';
      // join ด้วยบรรทัดว่าง
      const text = header + items.join('\n\n');

      messages.push({ type:'text', text });
    }

    return messages;
  }
},

// 7) ตำรวจปากคลองทั้งหมด
{
  name: 'allPolice',
  keywords: ['ตำรวจปากคลอง'],
  handler: async () => {
    const rows = await getSheetData(SHEET_ID, POLICE_RANGE);

    // แยกเป็น sections ตามหัวข้อแผนก
    const sections = [];
    let current = null;
    for (const r of rows) {
      const [col0, col1, , col3, col4, col5] = r;
      if (col0 && !col1 && !col3 && !col4 && !col5) {
        current = [`● ${col0.trim()}`];
        sections.push(current);
      } else if (col0 && col1 && current) {
        const name     = r.slice(1,3).filter(Boolean).join(' ');
        const pos      = col3 || '-';
        const callSign = col4 || '';
        const phone    = col5 ? `โทร.${col5}` : '';

        let entry = `${col0}. ${name}\n   ตำแหน่ง : ${pos}\n`;
        if (callSign) entry += `   ${callSign}\n`;
        if (phone)    entry += `   ${phone}`;
        current.push(entry);
      }
    }

    // แบ่งเป็นก้อน ไม่เกิน 5 ข้อความ
    const header = 'สภ.ปากคลองรังสิต ภ.จว.ปทุมธานี\n__________________';
    const chunks = [];
    let buf = header;
    for (const sect of sections) {
      const text = '\n' + sect.join('\n');
      // ถ้าเกิน 1500 ตัวอักษร หรือเกิน 5 ก้อน ให้เริ่มใหม่
      if (buf.length + text.length > 1500 || chunks.length >= 4) {
        chunks.push(buf);
        buf = header + text;
      } else {
        buf += text;
      }
    }
    chunks.push(buf);

    // ตัดให้ไม่เกิน 5 ก้อน
    return chunks.slice(0, 5).map(t => ({ type:'text', text: t }));
  }
},

  // 8) เต้น
  {
    name: 'dance',
    keywords: ['เต้น'],
    handler: () => ({
      type: 'image',
      originalContentUrl: 'https://res.cloudinary.com/df5hopefn/image/upload/v1753664460/evedance_opnkib.gif',
      previewImageUrl:  'https://res.cloudinary.com/df5hopefn/image/upload/v1753664460/evedance_opnkib.gif'
    })
  },

  // 9) ทักทาย
  {
    name: 'greet',
    keywords: ['สวัสดี','ดีค่ะ','ดีจ๊ะ','ดีคับ'],
    replyText: 'สวัสดีค่า น้องอีฟมาแล้วค่ะ ❤️'
  },

// 10) พูดคุย OpenAI
{
  name: 'askAI',
  keywords: ['แปลหน่อย','AI','ช่วยหน่อย'],
  handler: async (text) => {
    try {
      const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: text }]
      });
      return { type:'text', text: resp.choices[0].message.content };
    } catch (err) {
      console.error('OpenAI error:', err);
      if (err.code === 'insufficient_quota' || err.status === 429) {
        return {
          type: 'text',
          text: 'ขอโทษนะคะ โควต้าของ OpenAI หมดแล้ว รอหนูหน่อยนะคะพี่ๆ 😭'
        };
      }
      return {
        type: 'text',
        text: 'ขอโทษค่ะ หนูยังเรียก AI ไม่ได้ ไว้ลองใหม่อีกครั้งนะคะ'
      };
    }
  }
},

{
  name: 'translateReport',
  match: (text, ev) => ev.message.type === 'image' && text.includes('แปล'),
  handler: async (text, ev) => {
    const stream = await client.getMessageContent(ev.message.id);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    const ocr = await extractTextFromImage(buffer);
    if (!ocr) return { type:'text', text:'ไม่พบข้อความในภาพ กรุณาลองใหม่' };

    const translated = await translateText(ocr);

    // หาหัวหน้าชุดเวร ช่วงนี้สมมติเป็น teamOfficers[1][0]
    const lead = teamOfficers[1][0];

    const report = await formatReport(translated, lead);
    return { type:'text', text: report };
  }
},

  // 11) คุณชื่ออะไร
  {
    name: 'whoami',
    keywords: ['คุณชื่ออะไร','ชื่อไร','ชื่อ','ใคร'],
    replyText: 'หนูชื่อ น้องอีฟ ค่ะ 😊'
  },

  // 11) fallback
  {
    name: 'fallback',
    keywords: [],
    replyText: 'ค่าาาพี่ เรียกหนูหรอคะ พี่ลองพิมพ์ @น้องอีฟ ทำอะไรได้บ้าง ดูนะคะ 😊'
  }
];

// ────────────────────────────────────────────────────────────────────────────
// Webhook handler
export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    await middleware(config)(req, res, () => Promise.resolve());
  } catch {
    return res.status(401).end();
  }

  for (const ev of req.body.events || []) {
    // ① Logging ตรวจสอบ source ของ event
    console.log('>>> Received event source:', ev.source);
    if (ev.source.groupId) {
      console.log('>>> Group ID is:', ev.source.groupId);
    }

    if (ev.type !== 'message' || ev.message.type !== 'text') continue;
    const raw  = ev.message.text;
    if (!raw.includes('@น้องอีฟ')) continue;
    const text = raw.replace(/@น้องอีฟ/g, '').trim();

    let replied = false;
    for (const cmd of commands) {
      const ok = cmd.match
        ? cmd.match(text)
        : cmd.keywords.some(k => text.includes(k));
      if (!ok) continue;
      replied = true;

      if (cmd.replyText) {
        await client.replyMessage(ev.replyToken, { type:'text', text: cmd.replyText });
      } else if (cmd.handler) {
        const result = await cmd.handler(text);
        if (Array.isArray(result)) {
          await client.replyMessage(ev.replyToken, result);
        } else if (result) {
          await client.replyMessage(ev.replyToken, [ result ]);
        }
      }
      break;
    }

    if (!replied) {
      const fb = commands.find(c => c.name === 'fallback');
      await client.replyMessage(ev.replyToken, { type:'text', text: fb.replyText });
    }
  }

  return res.status(200).end();
}