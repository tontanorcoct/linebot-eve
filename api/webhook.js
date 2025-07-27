// api/webhook.js
import { Client, middleware } from '@line/bot-sdk';

const config = {
  channelAccessToken: process.env.LINE_TOKEN,
  channelSecret: process.env.LINE_SECRET,
};
const client = new Client(config);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // ตรวจสอบ signature
  try {
    await middleware(config)(req, res, () => Promise.resolve());
  } catch (err) {
    console.error('Signature validation failed', err);
    return res.status(401).end();
  }

  const events = req.body.events || [];
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      // ตัด @น้องอีฟ ออกก่อน
      const userText = event.message.text.replace(/@น้องอีฟ\s*/, '');
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `น้องอีฟได้ยินว่า: ${userText}`,
      });
    }
  }
  res.status(200).end();
}
