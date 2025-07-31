export default function handler(req, res) {
  // แค่ตอบกลับ 200 เพื่อให้ฟังก์ชันไม่งีบ
  res.status(200).send('ok');
}