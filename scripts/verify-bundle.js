const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

console.log('--- NOTA V2 SECURITY VERIFICATION ---');
console.log('Generating Expo export bundle for inspection...');

let outDir = null;

try {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nota-bundle-verify-'));
  
  // Force android platform to avoid react-native-web dependency errors
  execSync(`npx expo export --platform android --output-dir "${outDir}"`, { stdio: 'inherit' });
  
  console.log('\nScanning generated bundle for leaked API keys...');
  
  const filesToScan = [];
  
  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        scanDir(fullPath);
      } else if (fullPath.endsWith('.js') || fullPath.endsWith('.json') || fullPath.endsWith('.html')) {
        filesToScan.push(fullPath);
      }
    }
  }
  
  scanDir(outDir);
  
  let leakFound = false;
  
  let actualKey = process.env.GEMINI_API_KEY;
  if (!actualKey) {
    try {
      const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
      const match = envContent.match(/^GEMINI_API_KEY=(.*)$/m);
      if (match) actualKey = match[1].trim();
    } catch (e) {}
  }

  // A test key segment to search for, or generic identifier
  const searchPattern = /GEMINI_API_KEY/i;
  
  for (const file of filesToScan) {
    const content = fs.readFileSync(file, 'utf8');
    if (searchPattern.test(content)) {
      // It is normal for the string "GEMINI_API_KEY" to appear as a dictionary key or type,
      // but the actual secret string should NOT appear.
      if (actualKey && content.includes(actualKey)) {
        console.error(`\n[CRITICAL FAILURE] Secret API key found in bundle: ${file}`);
        leakFound = true;
      }
    }
  }
  
  if (leakFound) {
    console.error('\n❌ Security audit failed! API key was detected by static inspection in the client bundle.');
    process.exitCode = 1;
  } else {
    console.log('\n✅ Security audit passed. The automated static bundle inspection did NOT find the Gemini API key in the client bundle.');
  }
} catch (error) {
  console.error('\nError during verification:', error.message);
  process.exitCode = 1;
} finally {
  if (outDir && fs.existsSync(outDir)) {
    try {
      fs.rmSync(outDir, { recursive: true, force: true });
      console.log(`Cleaned up temporary directory: ${outDir}`);
    } catch (e) {
      console.error(`Failed to clean up temporary directory ${outDir}:`, e.message);
    }
  }
}
