const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('--- NOTA V2 SECURITY VERIFICATION ---');
console.log('Generating Expo export bundle for inspection...');

try {
  const outDir = 'dist-verify';
  
  // Force android platform to avoid react-native-web dependency errors
  execSync(`npx expo export --platform android --output-dir ${outDir}`, { stdio: 'inherit' });
  
  console.log('\nScanning generated bundle for leaked API keys...');
  
  const distDir = path.join(__dirname, '..', 'dist-verify');
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
  
  scanDir(distDir);
  
  let leakFound = false;
  
  // A test key segment to search for, or generic identifier
  // The actual key starts with AQ.Ab8RN
  const searchPattern = /AQ\.Ab8RN|GEMINI_API_KEY/i;
  
  for (const file of filesToScan) {
    const content = fs.readFileSync(file, 'utf8');
    if (searchPattern.test(content)) {
      // It is normal for the string "GEMINI_API_KEY" to appear as a dictionary key or type,
      // but the actual secret string should NOT appear.
      if (content.includes('AQ.Ab8RN')) {
        console.error(`\n[CRITICAL FAILURE] Secret API key found in bundle: ${file}`);
        leakFound = true;
      }
    }
  }
  
  if (leakFound) {
    console.error('\n❌ Security audit failed! API key was detected by static inspection in the client bundle.');
    process.exit(1);
  } else {
    console.log('\n✅ Security audit passed. The automated static bundle inspection did NOT find the Gemini API key in the client bundle.');
  }
} catch (error) {
  console.error('\nError during verification:', error.message);
  process.exit(1);
}
