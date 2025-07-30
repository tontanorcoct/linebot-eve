import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function translateText(ocrText) {
  const fewShot = `
Input: "Victim: John Doe, aged 30."
Output: "ผู้เสียหาย: นาย จอห์น โด อายุ 30 ปี"

Input: "Stolen item: Black iPhone 11, IMEI 123456789012345"
Output: "ทรัพย์ที่ได้รับความเสียหาย: โทรศัพท์มือถือ iPhone 11 สีดำ IMEI 123456789012345"
`;
  const prompt = `
You are a professional translator. Translate the following text into fluent Thai, preserving names, dates, numbers exactly.

${fewShot}
Now translate:
${ocrText}
  `.trim();

  const resp = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'You translate text accurately preserving key details.' },
      { role: 'user', content: prompt }
    ]
  });
  return resp.choices[0].message.content;
}

export async function formatReport(translatedText, leadOfficer) {
  const { rank, name, title, code, phone } = leadOfficer;
  const prompt = `
You are an assistant that formats translated Thai text into a clean, numbered police report of exactly 10 points, following this strict template:

สภ.ปากคลองรังสิต ภ.จว.ปทุมธานี
__________________

เรียน ผู้บังคับบัญชาเพื่อโปรดทราบ
วันที่ [extract full date]
เวลา [extract time]

● ขอรายงานเหตุ : ลักทรัพย์ (จยย.หาย)ฯ

1. วัน เวลา ที่เกิดเหตุและรับแจ้งเหตุ
2. สถานที่เกิดเหตุ
3. ผู้เสียหาย / ผู้ร้องทุกข์
4. ทรัพย์ที่ได้รับความเสียหาย
5. ผู้ก่อเหตุ
6. อาวุธที่ใช้ในการกระทำผิด
7. พฤติการณ์แห่งคดี
8. หัวหน้าสถานีตำรวจ
   พ.ต.อ.พัฒนชัย ภมรพิบูลย์
   ผู้กำกับการ สภ.ปากคลองรังสิต
   โทรศัพท์ 094-949-7879
9. พนักงานสอบสวนผู้รับผิดชอบคดี
10. ผู้รายงาน
    ${rank}${name}
    ${title} ${code}
    โทรศัพท์ ${phone}
    (เวรสืบสวนรับผิดชอบคดี)
__________________

จึงเรียนมาเพื่อโปรดทราบ

Text:
${translatedText}
  `.trim();

  const resp = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'You format Thai text into a 10-point police report with exact field placement.' },
      { role: 'user', content: prompt }
    ]
  });
  return resp.choices[0].message.content;
}
