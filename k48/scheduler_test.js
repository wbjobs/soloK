const { PriorityLevel, WeightedRoundRobin, MultiFileScheduler } = require('./scheduler');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.log(`  ✗ ${testName}`);
    failed++;
  }
}

console.log('='.repeat(60));
console.log('调度器单元测试');
console.log('='.repeat(60));

console.log('\n1. 优先级权重测试');
{
  assert(PriorityLevel.LOW === 1, 'LOW = 1');
  assert(PriorityLevel.NORMAL === 2, 'NORMAL = 2');
  assert(PriorityLevel.HIGH === 4, 'HIGH = 4');
  assert(PriorityLevel.CRITICAL === 8, 'CRITICAL = 8');
}

console.log('\n2. 加权轮询 - 基本入队出队');
{
  const wrr = new WeightedRoundRobin();
  
  wrr.addQueue(1, PriorityLevel.NORMAL);
  wrr.enqueue(1, { seq: 1 }, 1024);
  wrr.enqueue(1, { seq: 2 }, 1024);
  
  assert(wrr.getQueueSize(1) === 2, '队列大小=2');
  assert(wrr.hasPackets() === true, '有待发送包');
  
  const pkt1 = wrr.dequeue();
  assert(pkt1 !== null, '出队成功');
  assert(pkt1.fileId === 1, 'fileId正确');
  assert(pkt1.packet.seq === 1, 'seq正确');
  
  const pkt2 = wrr.dequeue();
  assert(pkt2.packet.seq === 2, 'FIFO顺序正确');
  
  assert(wrr.hasPackets() === false, '队列已空');
  assert(wrr.dequeue() === null, '空队列返回null');
}

console.log('\n3. 加权轮询 - 多队列优先级调度');
{
  const wrr = new WeightedRoundRobin();
  
  wrr.addQueue(1, PriorityLevel.LOW);
  wrr.addQueue(2, PriorityLevel.HIGH);
  
  for (let i = 0; i < 100; i++) {
    wrr.enqueue(1, { from: 'low', seq: i }, 1000);
    wrr.enqueue(2, { from: 'high', seq: i }, 1000);
  }
  
  let highCount = 0;
  let lowCount = 0;
  
  for (let i = 0; i < 100; i++) {
    const pkt = wrr.dequeue();
    if (pkt) {
      if (pkt.packet.from === 'high') highCount++;
      else lowCount++;
    }
  }
  
  console.log(`    HIGH: ${highCount}, LOW: ${lowCount}`);
  assert(highCount > lowCount, '高优先级队列获得更多带宽');
  const ratio = highCount / (highCount + lowCount);
  assert(ratio > 0.7, `高优先级至少70%带宽 (实际: ${(ratio*100).toFixed(1)}%)`);
}

console.log('\n4. 加权轮询 - 带宽分配比例');
{
  const wrr = new WeightedRoundRobin();
  
  wrr.addQueue(1, PriorityLevel.LOW);
  wrr.addQueue(2, PriorityLevel.NORMAL);
  wrr.addQueue(3, PriorityLevel.HIGH);
  
  const stats = wrr.getStats();
  const totalWeight = 1 + 2 + 4;
  
  assert(stats[1].bandwidthShare === ((1/totalWeight)*100).toFixed(1), 'LOW占1/7带宽');
  assert(stats[2].bandwidthShare === ((2/totalWeight)*100).toFixed(1), 'NORMAL占2/7带宽');
  assert(stats[3].bandwidthShare === ((4/totalWeight)*100).toFixed(1), 'HIGH占4/7带宽');
}

console.log('\n5. 加权轮询 - 动态调整优先级');
{
  const wrr = new WeightedRoundRobin();
  
  wrr.addQueue(1, PriorityLevel.NORMAL);
  wrr.addQueue(2, PriorityLevel.NORMAL);
  
  let stats = wrr.getStats();
  assert(stats[1].bandwidthShare === '50.0', '初始各占50%');
  
  wrr.setPriority(1, PriorityLevel.HIGH);
  const totalWeightAfter = 4 + 2;
  stats = wrr.getStats();
  
  assert(stats[1].weight === 4, '优先级更新为HIGH');
  assert(stats[1].bandwidthShare === ((4/totalWeightAfter)*100).toFixed(1), '带宽比例更新');
  assert(stats[2].bandwidthShare === ((2/totalWeightAfter)*100).toFixed(1), '另一队列比例也更新');
}

console.log('\n6. MultiFileScheduler - 注册和管理文件');
{
  const scheduler = new MultiFileScheduler(10 * 1024 * 1024);
  
  const fileId1 = scheduler.registerFile('/path/to/file1', PriorityLevel.HIGH, 5 * 1024 * 1024);
  const fileId2 = scheduler.registerFile('/path/to/file2', PriorityLevel.LOW, 2 * 1024 * 1024);
  
  assert(fileId1 === 1, '第一个fileId=1');
  assert(fileId2 === 2, '第二个fileId=2');
  assert(scheduler.getActiveFileCount() === 2, '活跃文件数=2');
  
  const stats1 = scheduler.getFileStats(fileId1);
  assert(stats1 !== null, '能获取文件状态');
  assert(stats1.priority === PriorityLevel.HIGH, '优先级正确');
  assert(stats1.fileSize === 5 * 1024 * 1024, '文件大小正确');
}

console.log('\n7. MultiFileScheduler - 带宽限制');
{
  const bandwidth = 50 * 1024;
  const scheduler = new MultiFileScheduler(bandwidth);
  const fileId = scheduler.registerFile('test.bin', PriorityLevel.NORMAL, 10 * 1024 * 1024);
  
  for (let i = 0; i < 20; i++) {
    scheduler.queuePacket(fileId, { seq: i }, 4096);
  }
  
  let sentCount = 0;
  let pkt;
  while ((pkt = scheduler.getNextPacket()) !== null) {
    sentCount++;
  }
  
  console.log(`    令牌桶限制下发送了 ${sentCount} 个包`);
  assert(sentCount > 0, '能发送一些包');
  assert(sentCount < 20, '受带宽限制不能一次性发完');
}

console.log('\n8. MultiFileScheduler - 记录重传');
{
  const scheduler = new MultiFileScheduler(10 * 1024 * 1024);
  const fileId = scheduler.registerFile('test.bin', PriorityLevel.NORMAL, 1024);
  
  scheduler.recordRetransmit(fileId);
  scheduler.recordRetransmit(fileId);
  
  const stats = scheduler.getFileStats(fileId);
  assert(stats.retransmits === 2, '重传计数正确');
}

console.log('\n9. MultiFileScheduler - 暂停/恢复');
{
  const scheduler = new MultiFileScheduler(10 * 1024 * 1024);
  const fileId = scheduler.registerFile('test.bin', PriorityLevel.NORMAL, 1024);
  
  scheduler.pauseFile(fileId);
  const queued = scheduler.queuePacket(fileId, { seq: 1 }, 1024);
  assert(queued === false, '暂停后不能入队');
  
  scheduler.resumeFile(fileId);
  const queued2 = scheduler.queuePacket(fileId, { seq: 1 }, 1024);
  assert(queued2 === true, '恢复后可以入队');
}

console.log('\n10. MultiFileScheduler - 优先级调度');
{
  const scheduler = new MultiFileScheduler(100 * 1024 * 1024);
  
  const lowId = scheduler.registerFile('low.bin', PriorityLevel.LOW, 10 * 1024 * 1024);
  const highId = scheduler.registerFile('high.bin', PriorityLevel.HIGH, 10 * 1024 * 1024);
  
  for (let i = 0; i < 100; i++) {
    scheduler.queuePacket(lowId, { from: 'low', seq: i }, 1024);
    scheduler.queuePacket(highId, { from: 'high', seq: i }, 1024);
  }
  
  let highCount = 0;
  let lowCount = 0;
  
  for (let i = 0; i < 100; i++) {
    const item = scheduler.getNextPacket();
    if (item && item.packet) {
      if (item.packet.from === 'high') highCount++;
      else lowCount++;
    }
  }
  
  console.log(`    HIGH: ${highCount}, LOW: ${lowCount}`);
  const ratio = highCount / (highCount + lowCount);
  assert(ratio > 0.7, `高优先级获得超过70%带宽 (实际: ${(ratio*100).toFixed(1)}%)`);
}

console.log('\n' + '='.repeat(60));
console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
console.log('='.repeat(60));

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\n✓ 调度器功能正常！');
}
