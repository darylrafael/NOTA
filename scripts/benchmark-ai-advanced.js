const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const RESOLUTIONS = [null, 1536, 1280, 1024, 768]; 
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

async function runBenchmark() {
  console.log(`--- NOTA V2 AI IMAGE PIPELINE BENCHMARK (${MODEL.toUpperCase()}) ---`);
  
  if (!API_KEY) {
    console.error('Missing GEMINI_API_KEY in .env');
    return;
  }

  const testImagesDir = path.join(__dirname, '..', 'test-assets');
  if (!fs.existsSync(testImagesDir)) return;
  const files = fs.readdirSync(testImagesDir).filter(f => f.match(/\.(jpg|jpeg|png)$/i));

  console.log('\n| File | Resolution | Quality | Payload Size | AI Latency | Merchant | Items Extracted | Result |');
  console.log('|---|---|---|---|---|---|---|---|');

  for (const file of files) {
    const filePath = path.join(testImagesDir, file);
    const originalBuffer = fs.readFileSync(filePath);
    
    for (const res of RESOLUTIONS) {
      let buffer = originalBuffer;
      let jpegQuality = 100;

      if (res !== null) {
        jpegQuality = 70;
        buffer = await sharp(originalBuffer).resize(res, null, { withoutEnlargement: true }).jpeg({ quality: jpegQuality }).toBuffer();
      }

      const base64Image = buffer.toString('base64');
      const payloadSizeKB = (base64Image.length / 1024).toFixed(1);
      
      const startTime = Date.now();
      try {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: base64Image } }, { text: 'Extract receipt items' }] }]
          })
        });
        
        const duration = Date.now() - startTime;
        
        if (!response.ok) {
           console.log(`| ${file} | ${res || 'Original'} | ${jpegQuality}% | ${payloadSizeKB} KB | ${duration}ms | ERROR | 0 | ❌ HTTP ${response.status} |`);
           continue;
        }
        
        console.log(`| ${file} | ${res || 'Original'} | ${jpegQuality}% | ${payloadSizeKB} KB | ${duration}ms | - | - | ✅ OK |`);
      } catch (err) {
        console.log(`| ${file} | ${res || 'Original'} | ${jpegQuality}% | ${payloadSizeKB} KB | - | ERROR | 0 | ❌ Network Error |`);
      }
      
      // Delay to avoid Gemini API free-tier quotas (15 RPM)
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
  }
}

runBenchmark();
