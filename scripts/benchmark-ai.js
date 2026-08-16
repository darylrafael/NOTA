const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function runBenchmark() {
  console.log('--- NOTA V2 AI EXTRACTION BENCHMARK ---');
  
  const testImagesDir = path.join(__dirname, '..', 'test-assets');
  if (!fs.existsSync(testImagesDir)) {
    console.log(`Test directory not found: ${testImagesDir}. Creating dummy for demonstration.`);
    fs.mkdirSync(testImagesDir);
    fs.writeFileSync(path.join(testImagesDir, 'dummy.txt'), 'Please place test JPEGs here.');
    console.log('Please place a test receipt JPEG in the test-assets directory to run the full benchmark.');
    return;
  }

  const files = fs.readdirSync(testImagesDir).filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'));
  
  if (files.length === 0) {
    console.log('No JPEGs found in test-assets. Benchmark skipped.');
    return;
  }

  const deviceId = crypto.randomUUID();
  const PORT = process.env.PORT || 3000;
  const API_URL = `http://localhost:${PORT}/api/extract`;
  
  console.log(`Using Proxy URL: ${API_URL}`);
  console.log(`Device ID: ${deviceId}\n`);

  for (const file of files) {
    console.log(`Evaluating image: ${file}`);
    const filePath = path.join(testImagesDir, file);
    const buffer = fs.readFileSync(filePath);
    const base64Image = buffer.toString('base64');
    
    console.log(`- Payload size: ${(base64Image.length / 1024).toFixed(2)} KB`);
    
    const startTime = Date.now();
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': deviceId
        },
        body: JSON.stringify({ base64Image })
      });
      
      const duration = Date.now() - startTime;
      
      if (!response.ok) {
        console.error(`- ❌ Error: ${response.status} ${await response.text()} (${duration}ms)`);
        continue;
      }
      
      const data = await response.json();
      console.log(`- ✅ Success in ${duration}ms`);
      console.log(`- Merchant: ${data.merchantName || 'Unknown'}`);
      console.log(`- Total Items Extracted: ${data.items ? data.items.length : 0}`);
    } catch (err) {
      const duration = Date.now() - startTime;
      console.error(`- ❌ Network/Connection Error: ${err.message} (${duration}ms)`);
      console.log('Ensure the proxy server is running (npm run dev in server directory).');
    }
    console.log('---');
  }
}

runBenchmark();
