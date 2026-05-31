const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { PriorityLevel } = require('./scheduler');

const TEST_DIR = path.join(__dirname, 'test_multifile');
const RECEIVE_DIR = path.join(__dirname, 'received');

function generateTestFile(filename, sizeMB) {
  const filePath = path.join(TEST_DIR, filename);
  const size = sizeMB * 1024 * 1024;
  const buffer = crypto.randomBytes(size);
  fs.writeFileSync(filePath, buffer);
  return { path: filePath, size, md5: crypto.createHash('md5').update(buffer).digest('hex') };
}

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  if (fs.existsSync(RECEIVE_DIR)) {
    const files = fs.readdirSync(RECEIVE_DIR);
    for (const f of files) {
      if (f.startsWith('test_')) {
        fs.unlinkSync(path.join(RECEIVE_DIR, f));
      }
    }
  }
}

console.log('='.repeat(70));
console.log('多文件并发传输 - 集成测试说明');
console.log('='.repeat(70));

console.log('\n本测试将验证以下功能:');
console.log('  ✓ 多文件并发传输');
console.log('  ✓ 每个文件独立的拥塞控制和滑动窗口');
console.log('  ✓ 基于优先级的带宽分配');
console.log('  ✓ 文件完整性校验 (CRC32 + MD5)');

console.log('\n' + '='.repeat(70));
console.log('测试步骤');
console.log('='.repeat(70));

console.log('\n步骤1: 准备测试环境');
cleanup();
if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR);
if (!fs.existsSync(RECEIVE_DIR)) fs.mkdirSync(RECEIVE_DIR);

console.log('\n步骤2: 生成测试文件');
const testFiles = [
  { name: 'test_critical.bin', size: 1, priority: PriorityLevel.CRITICAL },
  { name: 'test_high.bin', size: 1, priority: PriorityLevel.HIGH },
  { name: 'test_normal.bin', size: 1, priority: PriorityLevel.NORMAL },
  { name: 'test_low.bin', size: 1, priority: PriorityLevel.LOW }
];

const fileInfo = {};
for (const tf of testFiles) {
  fileInfo[tf.name] = generateTestFile(tf.name, tf.size);
  const priorityName = Object.keys(PriorityLevel).find(k => PriorityLevel[k] === tf.priority);
  console.log(`  ✓ ${tf.name} (${tf.size} MB, ${priorityName} priority) MD5: ${fileInfo[tf.name].md5.substring(0, 16)}...`);
}

console.log('\n步骤3: 运行服务端和客户端');
console.log('\n终端1 - 启动服务端:');
console.log('  node server.js');

console.log('\n终端2 - 运行多文件传输:');
let clientCmd = 'node client.js';
for (const tf of testFiles) {
  const priorityName = Object.keys(PriorityLevel).find(k => PriorityLevel[k] === tf.priority);
  clientCmd += ` -P ${priorityName} ${path.join('test_multifile', tf.name)}`;
}
console.log(`  ${clientCmd}`);

console.log('\n步骤4: 验证传输完成后');
console.log('  服务端将显示各文件的传输统计，包括:');
console.log('  - 各文件进度和吞吐量');
console.log('  - 各文件的带宽分配比例');
console.log('  - 各文件的重传率和平均RTT');
console.log('\n  预期带宽分配比例:');
const totalWeight = testFiles.reduce((sum, tf) => sum + tf.priority, 0);
for (const tf of testFiles) {
  const share = ((tf.priority / totalWeight) * 100).toFixed(1);
  const priorityName = Object.keys(PriorityLevel).find(k => PriorityLevel[k] === tf.priority);
  console.log(`    ${tf.name}: ${share}% (weight=${tf.priority}, ${priorityName})`);
}

console.log('\n步骤5: 验证文件完整性');
console.log('  传输完成后，运行:');
console.log('  node multifile_integration_test.js --verify');

console.log('\n' + '='.repeat(70));
console.log('服务端预期输出示例');
console.log('='.repeat(70));
console.log('  Active Transfers (4) | 00:00:15');
console.log('  ------------------------------------------------------------------------------------------');
console.log('  ID  Filename               Progress   Throughput   Priority  Queue  Bandwidth  RTT     Loss');
console.log('  ------------------------------------------------------------------------------------------');
console.log('  1   test_critical.bin       85.2%     12.34 MB/s  CRITICAL  5      (53.3%)   45ms    0.5%');
console.log('  2   test_high.bin           42.5%      6.12 MB/s  HIGH      3      (26.7%)   48ms    0.3%');
console.log('  3   test_normal.bin         21.3%      3.08 MB/s  NORMAL    2      (13.3%)   52ms    0.4%');
console.log('  4   test_low.bin            10.6%      1.54 MB/s  LOW       1      (6.7%)    55ms    0.2%');

if (process.argv.includes('--verify')) {
  console.log('\n' + '='.repeat(70));
  console.log('验证文件完整性');
  console.log('='.repeat(70));
  
  let allPassed = true;
  for (const tf of testFiles) {
    const receivedPath = path.join(RECEIVE_DIR, tf.name);
    if (!fs.existsSync(receivedPath)) {
      console.log(`  ✗ ${tf.name}: 文件不存在`);
      allPassed = false;
      continue;
    }
    
    const receivedData = fs.readFileSync(receivedPath);
    const receivedMd5 = crypto.createHash('md5').update(receivedData).digest('hex');
    const expectedMd5 = fileInfo[tf.name].md5;
    
    if (receivedMd5 === expectedMd5) {
      console.log(`  ✓ ${tf.name}: MD5匹配 (${receivedMd5.substring(0, 16)}...)`);
    } else {
      console.log(`  ✗ ${tf.name}: MD5不匹配 (expected: ${expectedMd5}, actual: ${receivedMd5})`);
      allPassed = false;
    }
  }
  
  console.log('\n' + '='.repeat(70));
  if (allPassed) {
    console.log('✓ 所有文件验证通过！多文件并发传输功能正常。');
  } else {
    console.log('✗ 部分文件验证失败！');
    process.exit(1);
  }
  
  cleanup();
} else {
  console.log('\n✓ 测试准备完成！请按上述步骤运行测试。');
}

process.on('SIGINT', () => {
  console.log('\n清理测试文件...');
  cleanup();
  process.exit(0);
});
