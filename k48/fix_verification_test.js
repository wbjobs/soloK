const { RTTManager, RetransmissionManager } = require('./rtt');
const { CongestionControl, SlidingWindow } = require('./congestion');

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
console.log('修复验证测试');
console.log('='.repeat(60));

console.log('\n1. Karn算法测试 - 重传包的RTT样本不参与RTT估计');
{
  const rtt = new RTTManager(100, 0.125, 0.25);
  
  rtt.update(50, false);
  const estimatedAfterFirst = rtt.estimatedRtt;
  
  rtt.update(500, true);
  const estimatedAfterRetrans = rtt.estimatedRtt;
  
  assert(estimatedAfterFirst === estimatedAfterRetrans, 
         `重传包不影响RTT估计 (${estimatedAfterFirst} === ${estimatedAfterRetrans})`);
  
  rtt.update(80, false);
  const estimatedAfterNew = rtt.estimatedRtt;
  assert(estimatedAfterNew !== estimatedAfterFirst, 
         `正常包更新RTT估计 (${estimatedAfterFirst} -> ${estimatedAfterNew})`);
}

console.log('\n2. RTT尖峰检测测试 - 检测RTT突变并快速调整');
{
  const rtt = new RTTManager(50, 0.125, 0.25);
  
  for (let i = 0; i < 10; i++) {
    rtt.update(50 + Math.random() * 10, false);
  }
  const devBefore = rtt.devRtt;
  
  rtt.update(500, false);
  
  assert(rtt.spikeCount >= 1, `检测到RTT尖峰 (spikeCount=${rtt.spikeCount})`);
  assert(rtt.devRtt > devBefore * 1.5, `devRtt快速增加 (${devBefore.toFixed(2)} -> ${rtt.devRtt.toFixed(2)})`);
}

console.log('\n3. 指数退避测试 - 重传时RTO倍增');
{
  const rtt = new RTTManager(100, 0.125, 0.25);
  const baseRto = rtt.getTimeout();
  const baseMult = rtt.currentRtoMultiplier;
  
  rtt.increaseRtoMultiplier();
  const rtoAfter1 = rtt.getTimeout();
  const multAfter1 = rtt.currentRtoMultiplier;
  
  assert(multAfter1 === baseMult * 2, `RTO倍增 (${baseMult} -> ${multAfter1})`);
  
  rtt.increaseRtoMultiplier();
  rtt.increaseRtoMultiplier();
  const multAfter3 = rtt.currentRtoMultiplier;
  assert(multAfter3 === 8, `最多倍增到8倍 (${multAfter3})`);
  
  rtt.resetRtoMultiplier();
  assert(rtt.currentRtoMultiplier === 1, `收到ACK后重置RTO乘数`);
}

console.log('\n4. 虚假重传检测测试 - Eifel检测');
{
  const rtt = new RTTManager(50, 0.125, 0.25);
  
  for (let i = 0; i < 10; i++) {
    rtt.update(50 + Math.random() * 5, false);
  }
  
  const isSpurious = rtt.checkForSpuriousRecovery(600, true);
  assert(isSpurious, `检测到虚假重传 (600ms > 预期RTT+4*devRtt)`);
  
  const isNotSpurious = rtt.checkForSpuriousRecovery(55, true);
  assert(!isNotSpurious, `正常RTT(55ms)不判定为虚假重传`);
  
  const isNotSpurious2 = rtt.checkForSpuriousRecovery(55, false);
  assert(!isNotSpurious2, `未重传的包不判定为虚假重传`);
}

console.log('\n5. Eifel响应测试 - 虚假重传后恢复cwnd');
{
  const cc = new CongestionControl(10, 64, 128);
  
  for (let i = 0; i < 30; i++) {
    cc.onAck(i);
  }
  const cwndBefore = cc.cwnd;
  
  cc.onTimeout();
  const cwndAfterTimeout = cc.cwnd;
  const ssthreshAfterTimeout = cc.ssthresh;
  
  assert(cwndAfterTimeout < cwndBefore, `超时后cwnd降低 (${cwndBefore} -> ${cwndAfterTimeout})`);
  
  cc.onSpuriousRetransmit();
  const cwndAfterRecovery = cc.cwnd;
  const ssthreshAfterRecovery = cc.ssthresh;
  
  assert(cwndAfterRecovery > cwndAfterTimeout, 
         `虚假重传后cwnd恢复 (${cwndAfterTimeout} -> ${cwndAfterRecovery})`);
  assert(ssthreshAfterRecovery >= ssthreshAfterTimeout, 
         `虚假重传后ssthresh不降低 (${ssthreshAfterTimeout} -> ${ssthreshAfterRecovery})`);
}

console.log('\n6. 温和降窗测试 - 超时时窗口降低更温和');
{
  const cc = new CongestionControl(32, 64, 128);
  const originalCwnd = cc.cwnd;
  const originalSsthresh = cc.ssthresh;
  
  cc.onTimeout();
  
  assert(cc.cwnd === Math.floor(originalCwnd * 0.5), 
         `cwnd降为原来的50% (${originalCwnd} -> ${cc.cwnd})`);
  assert(cc.ssthresh === Math.floor(originalCwnd * 0.7), 
         `ssthresh降为原来的70% (${originalSsthresh} -> ${cc.ssthresh})`);
}

console.log('\n7. RetransmissionManager集成测试');
{
  const rtt = new RTTManager(100, 0.125, 0.25);
  const rm = new RetransmissionManager(rtt);
  
  let sendCount = 0;
  const sendFn = (packet) => { sendCount++; };
  
  rm.addPacket(1, { seqNum: 1 }, sendFn);
  assert(rm.getUnackedCount() === 1, '添加后未确认包数=1');
  sendCount = 0;
  
  const result = rm.ackPacket(1);
  assert(result.acked === true, 'ACK成功');
  assert(result.isSpurious === false, '非虚假重传');
  assert(result.retransCount === 0, '重传次数为0');
  assert(rm.getUnackedCount() === 0, 'ACK后未确认包数=0');
  
  rm.addPacket(2, { seqNum: 2 }, sendFn);
  assert(rm.getRetransmitCount(2) === 0, '初始重传计数=0');
  
  rm.retransmit(2);
  assert(sendCount === 1, '重传调用sendFn 1次');
  assert(rm.getRetransmitCount(2) === 1, '重传后计数=1');
  
  rm.retransmit(2);
  assert(sendCount === 2, '第二次重传调用sendFn');
  assert(rm.getRetransmitCount(2) === 2, '第二次重传后计数=2');
  
  const result2 = rm.ackPacket(2);
  assert(result2.retransCount === 2, 'ACK时返回正确重传次数');
  assert(result2.isSpurious === false, '正常重传不标记为虚假');
}

console.log('\n8. SlidingWindow集成测试');
{
  const sw = new SlidingWindow(16);
  
  for (let i = 0; i < 20; i++) {
    if (sw.canSend()) {
      sw.getNextSeqNum();
    }
    sw.ack(i);
  }
  const cwndBefore = parseFloat(sw.getStats().congestion.cwnd);
  
  sw.onTimeout();
  const cwndAfterTimeout = parseFloat(sw.getStats().congestion.cwnd);
  
  sw.onSpuriousRetransmit();
  const cwndAfterRecovery = parseFloat(sw.getStats().congestion.cwnd);
  
  assert(cwndAfterRecovery > cwndAfterTimeout, 
         `滑动窗口虚假重传恢复 (${cwndAfterTimeout} -> ${cwndAfterRecovery})`);
  assert(cwndAfterRecovery <= cwndBefore, 
         `恢复后cwnd不超过原值 (${cwndAfterRecovery} <= ${cwndBefore})`);
}

console.log('\n9. RTT抖动（Jitter）计算');
{
  const rtt = new RTTManager(50, 0.125, 0.25);
  
  const samples = [50, 55, 45, 60, 40, 52, 48, 58, 42, 50];
  samples.forEach(s => rtt.update(s, false));
  
  const jitter = rtt.getJitter();
  assert(jitter > 0, `Jitter计算正确 (${jitter.toFixed(2)}ms)`);
}

console.log('\n' + '='.repeat(60));
console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
console.log('='.repeat(60));

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\n✓ 所有修复已正确实现！');
  console.log('\n修复摘要:');
  console.log('  1. Karn算法: 重传包不污染RTT估计 ✓');
  console.log('  2. RTT尖峰检测: 快速响应RTT突变 ✓');
  console.log('  3. 指数退避: RTO倍增避免雪崩 ✓');
  console.log('  4. Eifel检测: 识别虚假重传 ✓');
  console.log('  5. Eifel响应: 恢复cwnd避免吞吐下降 ✓');
  console.log('  6. 温和降窗: 超时降窗更合理 ✓');
}
