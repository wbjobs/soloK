const { RTTManager, RetransmissionManager } = require('./rtt');
const { CongestionControl, SlidingWindow } = require('./congestion');

console.log('='.repeat(70));
console.log('RTT Spike Test - 模拟RTT从50ms突增到500ms');
console.log('='.repeat(70));

function runTest(testName, simulateSpike, enableFixes) {
  console.log(`\n--- ${testName} ---`);
  
  const rttManager = new RTTManager(50, 0.125, 0.25);
  const retransManager = new RetransmissionManager(rttManager);
  const slidingWindow = new SlidingWindow(16);
  
  rttManager.minRto = 100;
  rttManager.maxRto = 5000;
  
  const results = {
    timeouts: 0,
    retransmits: 0,
    spuriousRecoveries: 0,
    minCwnd: Infinity,
    maxCwnd: 0,
    finalCwnd: 0,
    finalRto: 0,
    avgThroughput: 0
  };
  
  let currentRtt = 50;
  let spikeOccurred = false;
  let packetsSent = 0;
  
  for (let i = 0; i < 200; i++) {
    if (simulateSpike && i === 50 && !spikeOccurred) {
      currentRtt = 500;
      spikeOccurred = true;
      console.log(`  [时间 ${i}] RTT 突增: 50ms -> ${currentRtt}ms`);
    }
    
    if (simulateSpike && i === 150 && spikeOccurred) {
      currentRtt = 50;
      console.log(`  [时间 ${i}] RTT 恢复: ${currentRtt}ms`);
    }
    
    const seqNum = i;
    const sendFn = (packet) => {
      packetsSent++;
    };
    
    const simulatedPacket = { seqNum, data: Buffer.alloc(1024) };
    
    if (slidingWindow.canSend()) {
      const nextSeq = slidingWindow.getNextSeqNum();
      retransManager.addPacket(nextSeq, simulatedPacket, sendFn);
      
      const ackDelay = currentRtt + Math.random() * 20 - 10;
      
      if (currentRtt > 400 && i < 100) {
        const baseRto = rttManager.estimatedRtt + 4 * rttManager.devRtt;
        if (ackDelay > baseRto * rttManager.currentRtoMultiplier) {
          results.timeouts++;
          results.retransmits++;
          slidingWindow.onTimeout();
          
          if (enableFixes) {
            rttManager.increaseRtoMultiplier();
          }
        }
      }
      
      setTimeout(() => {
        const wasRetransmitted = retransManager.getRetransmitCount(nextSeq) > 0;
        const result = retransManager.ackPacket(nextSeq);
        
        if (result && result.acked) {
          slidingWindow.ack(nextSeq);
          
          if (result.isSpurious) {
            results.spuriousRecoveries++;
            if (enableFixes) {
              slidingWindow.onSpuriousRetransmit();
            }
          }
        }
      }, ackDelay);
    }
    
    const cwnd = slidingWindow.getStats().congestion.cwnd;
    results.minCwnd = Math.min(results.minCwnd, parseFloat(cwnd));
    results.maxCwnd = Math.max(results.maxCwnd, parseFloat(cwnd));
    
    if (i % 20 === 0) {
      const stats = slidingWindow.getStats();
      const rttStats = rttManager.getStats();
      console.log(`  [时间 ${i}] cwnd=${stats.congestion.cwnd} ssthresh=${stats.congestion.ssthresh} RTO=${rttStats.timeout}ms state=${stats.congestion.state}`);
    }
  }
  
  results.finalCwnd = parseFloat(slidingWindow.getStats().congestion.cwnd);
  results.finalRto = rttManager.getTimeout();
  results.avgThroughput = packetsSent / 200;
  
  console.log(`\n  结果:`);
  console.log(`    超时次数: ${results.timeouts}`);
  console.log(`    重传次数: ${results.retransmits}`);
  console.log(`    虚假恢复: ${results.spuriousRecoveries}`);
  console.log(`    最小cwnd: ${results.minCwnd.toFixed(2)}`);
  console.log(`    最大cwnd: ${results.maxCwnd.toFixed(2)}`);
  console.log(`    最终cwnd: ${results.finalCwnd.toFixed(2)}`);
  console.log(`    最终RTO: ${results.finalRto.toFixed(0)}ms`);
  console.log(`    平均吞吐: ${results.avgThroughput.toFixed(2)} 包/时间单位`);
  
  return results;
}

console.log('\n测试1: 无RTT突增（基准）');
const baseline = runTest('无RTT突增', false, true);

console.log('\n\n测试2: RTT突增 - 修复前（无Karn，无退避，无Eifel）');
const beforeFix = runTest('修复前 - RTT突增', true, false);

console.log('\n\n测试3: RTT突增 - 修复后（Karn + 指数退避 + Eifel）');
const afterFix = runTest('修复后 - RTT突增', true, true);

console.log('\n' + '='.repeat(70));
console.log('对比分析');
console.log('='.repeat(70));
console.log(`  指标                修复前        修复后        改善`);
console.log(`  ${'─'.repeat(62)}`);
console.log(`  超时次数            ${beforeFix.timeouts.toString().padEnd(13)} ${afterFix.timeouts.toString().padEnd(13)} ${(beforeFix.timeouts - afterFix.timeouts)}`);
console.log(`  重传次数            ${beforeFix.retransmits.toString().padEnd(13)} ${afterFix.retransmits.toString().padEnd(13)} ${(beforeFix.retransmits - afterFix.retransmits)}`);
console.log(`  虚假恢复            ${beforeFix.spuriousRecoveries.toString().padEnd(13)} ${afterFix.spuriousRecoveries.toString().padEnd(13)} ${(afterFix.spuriousRecoveries - beforeFix.spuriousRecoveries)}`);
console.log(`  最小cwnd            ${beforeFix.minCwnd.toFixed(2).padEnd(13)} ${afterFix.minCwnd.toFixed(2).padEnd(13)} +${(afterFix.minCwnd - beforeFix.minCwnd).toFixed(2)}`);
console.log(`  最终cwnd            ${beforeFix.finalCwnd.toFixed(2).padEnd(13)} ${afterFix.finalCwnd.toFixed(2).padEnd(13)} +${(afterFix.finalCwnd - beforeFix.finalCwnd).toFixed(2)}`);
console.log(`  最终RTO(ms)         ${beforeFix.finalRto.toFixed(0).padEnd(13)} ${afterFix.finalRto.toFixed(0).padEnd(13)} ${(afterFix.finalRto - beforeFix.finalRto).toFixed(0)}`);
console.log(`  平均吞吐            ${beforeFix.avgThroughput.toFixed(2).padEnd(13)} ${afterFix.avgThroughput.toFixed(2).padEnd(13)} +${(afterFix.avgThroughput - beforeFix.avgThroughput).toFixed(2)}`);

console.log('\n' + '='.repeat(70));
console.log('关键修复点说明:');
console.log('='.repeat(70));
console.log('1. Karn算法: 重传包的RTT样本不参与RTT估计，避免污染');
console.log('2. 指数退避: 每次重传RTO倍增(最大8倍)，防止雪崩式重传');
console.log('3. RTT尖峰检测: 检测到RTT突增时快速调整估计值');
console.log('4. Eifel检测: 识别虚假重传（RTT突增导致的误判）');
console.log('5. Eifel响应: 虚假重传后恢复cwnd，避免吞吐量骤降');
console.log('6. 温和降窗: 超时时cwnd降为50%（原100%），ssthresh降为70%（原50%）');
console.log('='.repeat(70));
