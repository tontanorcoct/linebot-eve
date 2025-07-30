import vision from '@google-cloud/vision';
import Jimp from 'jimp';

const visionClient = new vision.ImageAnnotatorClient({
  credentials: JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS)
});

export async function extractTextFromImage(buffer) {
  const image = await Jimp.read(buffer);
  image.grayscale().contrast(0.5).normalize();
  const processed = await image.getBufferAsync(Jimp.MIME_JPEG);

  const [result] = await visionClient.textDetection({ image: { content: processed } });
  const annotations = result.textAnnotations || [];
  return annotations.map(a => a.description).join('\n');
}
