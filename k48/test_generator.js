const fs = require('fs');
const crypto = require('crypto');

function generateTestFile(filename, sizeMB) {
  const size = sizeMB * 1024 * 1024;
  const buffer = crypto.randomBytes(size);
  fs.writeFileSync(filename, buffer);
  console.log(`Generated ${filename} (${sizeMB} MB)`);
}

const args = process.argv.slice(2);
const filename = args[0] || 'testfile.bin';
const sizeMB = args[1] ? parseInt(args[1]) : 5;

generateTestFile(filename, sizeMB);
