const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PriorityLevel } = require('./scheduler');

function generateTestFile(filename, sizeMB) {
  const size = sizeMB * 1024 * 1024;
  const buffer = crypto.randomBytes(size);
  fs.writeFileSync(filename, buffer);
  console.log(`✓ Generated ${filename} (${sizeMB} MB)`);
  return filename;
}

function cleanup(files) {
  for (const file of files) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }
  const receivedDir = path.join(__dirname, 'received');
  if (fs.existsSync(receivedDir)) {
    for (const file of files) {
      const receivedPath = path.join(receivedDir, path.basename(file));
      if (fs.existsSync(receivedPath)) {
        fs.unlinkSync(receivedPath);
      }
    }
  }
}

console.log('='.repeat(70));
console.log('多文件并发传输测试');
console.log('='.repeat(70));

console.log('\n测试说明:');
console.log('  本脚本将生成4个测试文件，展示如何使用多文件传输功能');
console.log('  包括不同优先级的带宽分配效果');
console.log('\n生成测试文件...');

const testFiles = [
  { file: 'critical_log.bin', size: 1, priority: PriorityLevel.CRITICAL },
  { file: 'important_data.iso', size: 2, priority: PriorityLevel.HIGH },
  { file: 'regular_file.zip', size: 2, priority: PriorityLevel.NORMAL },
  { file: 'background_archive.tar', size: 1, priority: PriorityLevel.LOW }
];

const generatedFiles = [];
for (const tf of testFiles) {
  generatedFiles.push(generateTestFile(tf.file, tf.size));
}

const totalSize = testFiles.reduce((sum, tf) => sum + tf.size, 0);
const totalWeight = testFiles.reduce((sum, tf) => sum + tf.priority, 0);

console.log('\n' + '='.repeat(70));
console.log('预期带宽分配 (基于优先级权重)');
console.log('='.repeat(70));
console.log(`  总大小: ${totalSize} MB, 总权重: ${totalWeight}`);
console.log();

for (const tf of testFiles) {
  const share = ((tf.priority / totalWeight) * 100).toFixed(1);
  const priorityName = Object.keys(PriorityLevel).find(k => PriorityLevel[k] === tf.priority);
  console.log(`  ${tf.file.padEnd(25)} ${priorityName.padEnd(8)} weight=${tf.priority}  bandwidth=${share}%`);
}

console.log('\n' + '='.repeat(70));
console.log('使用方法');
console.log('='.repeat(70));

console.log('\n终端1 - 启动服务端:');
console.log('  node server.js');

console.log('\n终端2 - 并发传输多个文件 (不同优先级):');
let clientCmd = 'node client.js';
for (const tf of testFiles) {
  const priorityName = Object.keys(PriorityLevel).find(k => PriorityLevel[k] === tf.priority);
  clientCmd += ` -P ${priorityName} ${tf.file}`;
}
console.log(`  ${clientCmd}`);

console.log('\n终端2 - 其他示例:');
console.log('  # 两个HIGH优先级文件平分带宽');
console.log('  node client.js -P HIGH file1.bin -P HIGH file2.bin');
console.log('  # CRITICAL占8/11, HIGH占2/11, LOW占1/11');
console.log('  node client.js -P CRITICAL big.iso -P HIGH normal.zip -P LOW small.txt');
console.log('  # 限制总带宽为50MB/s');
console.log('  node client.js -b 50 file1.bin file2.bin');
console.log('  # 为某些文件启用断点续传');
console.log('  node client.js -r large_file1.iso --no-resume small_file2.bin');

console.log('\n' + '='.repeat(70));
console.log('优先级说明');
console.log('='.repeat(70));
console.log('  CRITICAL (8): 最高优先级，分配最多带宽');
console.log('  HIGH     (4): 高优先级');
console.log('  NORMAL   (2): 普通优先级（默认）');
console.log('  LOW      (1): 低优先级，分配最少带宽');

console.log('\n' + '='.repeat(70));
console.log('服务端输出示例');
console.log('='.repeat(70));
console.log('  Active Transfers (4) | HH:MM:SS');
console.log('  ------------------------------------------------------------------------------------------');
console.log('  ID  Filename               Progress   Throughput   Priority  Queue  Bandwidth');
console.log('  ------------------------------------------------------------------------------------------');
console.log('  1   critical_log.bin         45.2%     12.34 MB/s  CRITICAL  5      (57.1%)');
console.log('  2   important_data.iso       28.1%      6.12 MB/s  HIGH      3      (28.6%)');
console.log('  3   regular_file.zip         14.5%      3.08 MB/s  NORMAL    2      (14.3%)');
console.log('  4   background_archive.tar    7.8%      1.54 MB/s  LOW       1      (7.1%)');

console.log('\n' + '='.repeat(70));
console.log('清理测试文件');
console.log('='.repeat(70));
console.log('  运行以下命令清理测试文件:');
console.log(`  node -e "['${testFiles.map(f => f.file).join("','")}'].forEach(f => require('fs').existsSync(f) && require('fs').unlinkSync(f))"`);

console.log('\n✓ 测试准备完成！现在可以按上述步骤运行多文件传输测试。');

process.on('SIGINT', () => {
  console.log('\n清理测试文件...');
  cleanup(generatedFiles);
  process.exit(0);
});

if (process.argv.includes('--cleanup')) {
  cleanup(generatedFiles);
  console.log('✓ 测试文件已清理');
}
