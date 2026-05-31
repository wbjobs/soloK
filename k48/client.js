const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const { Packet, PacketType, createSynPacket, createDataPacket, createFinPacket, createAckPacket } = require('./packet');
const { md5File } = require('./checksum');
const { RTTManager, RetransmissionManager } = require('./rtt');
const { SlidingWindow } = require('./congestion');
const { PriorityLevel, MultiFileScheduler } = require('./scheduler');

const CHUNK_SIZE = 1024;
const DEFAULT_PORT = 6969;
const DEFAULT_HOST = '127.0.0.1';

class SingleFileTransfer {
  constructor(fileId, filePath, priority, host, port, socket, scheduler) {
    this.fileId = fileId;
    this.filePath = filePath;
    this.priority = priority;
    this.host = host;
    this.port = port;
    this.socket = socket;
    this.scheduler = scheduler;
    
    this.rttManager = new RTTManager();
    this.retransManager = new RetransmissionManager(this.rttManager);
    this.slidingWindow = new SlidingWindow(16);
    
    this.fileSize = 0;
    this.totalChunks = 0;
    this.fileMd5 = null;
    
    this.startSeq = 0;
    this.sentCount = 0;
    this.totalDataSent = 0;
    this.startTime = 0;
    this.synAcked = false;
    this.finAcked = false;
    this.isTransferring = false;
    this.isComplete = false;
    this.error = null;
    
    this.synRetries = 0;
    this.maxSynRetries = 5;
  }

  async initialize(resume = false) {
    if (!fs.existsSync(this.filePath)) {
      throw new Error(`File not found: ${this.filePath}`);
    }

    const stats = fs.statSync(this.filePath);
    this.fileSize = stats.size;
    this.totalChunks = Math.ceil(this.fileSize / CHUNK_SIZE);
    this.fileMd5 = await md5File(this.filePath);
    
    if (resume) {
      this.startSeq = await this.negotiateResume();
    }
    
    this.scheduler.registerFile(this.filePath, this.priority, this.fileSize);
    this.slidingWindow.reset(this.startSeq);
  }

  async negotiateResume() {
    const outputPath = path.join(__dirname, 'received', path.basename(this.filePath));
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      const existingChunks = Math.floor(stats.size / CHUNK_SIZE);
      return existingChunks;
    }
    return 0;
  }

  sendSyn() {
    return new Promise((resolve, reject) => {
      const fileInfo = {
        filename: path.basename(this.filePath),
        fileSize: this.fileSize,
        md5: this.fileMd5,
        resumeFrom: this.startSeq,
        priority: this.priority
      };

      const synPacket = createSynPacket(this.fileId, 0, fileInfo);
      
      const sendSynFn = () => {
        this.sendPacketDirect(synPacket);
      };

      const synTimer = setInterval(() => {
        this.synRetries++;
        if (this.synRetries >= this.maxSynRetries) {
          clearInterval(synTimer);
          this.cleanupSynHandler();
          reject(new Error(`SYN timeout for ${path.basename(this.filePath)}`));
          return;
        }
        console.log(`  [fileId=${this.fileId}] Retrying SYN... (${this.synRetries}/${this.maxSynRetries})`);
        sendSynFn();
      }, 1000);

      this.synHandler = (msg, rinfo) => {
        const packet = Packet.fromBuffer(msg);
        if (packet && packet.type === PacketType.ACK && 
            packet.fileId === this.fileId && 
            packet.seqNum === this.startSeq - 1) {
          clearInterval(synTimer);
          this.cleanupSynHandler();
          this.synAcked = true;
          this.startTime = Date.now();
          this.isTransferring = true;
          resolve();
        }
      };

      this.socket.on('message', this.synHandler);
      sendSynFn();
      
      console.log(`  [fileId=${this.fileId}] SYN sent for ${path.basename(this.filePath)} (${(this.fileSize/1024/1024).toFixed(2)} MB, priority=${this.getPriorityName()})`);
    });
  }

  cleanupSynHandler() {
    if (this.synHandler) {
      this.socket.removeListener('message', this.synHandler);
      this.synHandler = null;
    }
  }

  getPriorityName() {
    return Object.keys(PriorityLevel).find(k => PriorityLevel[k] === this.priority) || 'NORMAL';
  }

  processData() {
    if (!this.isTransferring || this.isComplete) return;

    while (this.slidingWindow.canSend() && 
           this.slidingWindow.nextSeqNum < this.totalChunks) {
      const seqNum = this.slidingWindow.getNextSeqNum();
      this.queueDataPacket(seqNum);
    }

    if (this.slidingWindow.base >= this.totalChunks && 
        this.retransManager.getUnackedCount() === 0) {
      this.sendFin();
    }
  }

  queueDataPacket(seqNum) {
    const offset = seqNum * CHUNK_SIZE;
    const chunkSize = Math.min(CHUNK_SIZE, this.fileSize - offset);
    
    const buffer = Buffer.alloc(chunkSize);
    const fd = fs.openSync(this.filePath, 'r');
    fs.readSync(fd, buffer, 0, chunkSize, offset);
    fs.closeSync(fd);

    const dataPacket = createDataPacket(this.fileId, seqNum, buffer);
    
    const sendFn = (packet) => {
      this.scheduler.queuePacket(this.fileId, packet, packet.data.length + 11);
      this.sentCount++;
      this.totalDataSent += packet.data.length;
    };

    this.retransManager.addPacket(seqNum, dataPacket, (pkt) => {
      this.scheduler.queuePacket(this.fileId, pkt, pkt.data.length + 11);
      this.scheduler.recordRetransmit(this.fileId);
    });
    
    sendFn(dataPacket);
  }

  handleAck(ackNum) {
    if (!this.isTransferring || this.isComplete) return false;

    if (ackNum >= this.totalChunks - 1) {
      this.finAcked = true;
      return true;
    }

    if (ackNum >= this.slidingWindow.base - 1) {
      let hasSpurious = false;
      for (let i = this.slidingWindow.base; i <= ackNum; i++) {
        const result = this.retransManager.ackPacket(i);
        if (result && result.acked) {
          this.slidingWindow.ack(i);
          if (result.isSpurious) {
            hasSpurious = true;
          }
        }
      }
      
      if (hasSpurious) {
        this.slidingWindow.onSpuriousRetransmit();
      }
      return true;
    }
    return false;
  }

  sendFin() {
    if (this.isComplete) return;
    
    this.isTransferring = false;
    const finPacket = createFinPacket(this.fileId, this.totalChunks, this.fileMd5);
    
    let finRetries = 0;
    const maxFinRetries = 10;
    
    const sendFin = () => {
      this.scheduler.queuePacket(this.fileId, finPacket, 32 + 11);
      finRetries++;
    };

    const finTimer = setInterval(() => {
      if (this.finAcked || finRetries >= maxFinRetries) {
        clearInterval(finTimer);
        this.isComplete = true;
        this.retransManager.clearAll();
        this.scheduler.unregisterFile(this.fileId);
      } else {
        sendFin();
      }
    }, 500);

    sendFin();
  }

  getProgress() {
    return ((this.slidingWindow.base / this.totalChunks) * 100).toFixed(1);
  }

  getStats() {
    const elapsed = this.startTime > 0 ? (Date.now() - this.startTime) / 1000 : 0;
    const throughput = elapsed > 0 ? (this.totalDataSent / 1024 / 1024 / elapsed).toFixed(3) : 0;
    const totalRetransmits = this.retransManager.getTotalRetransmits();
    const retransmitRate = this.sentCount > 0 ? ((totalRetransmits / this.sentCount) * 100).toFixed(2) : '0.00';
    
    return {
      fileId: this.fileId,
      filename: path.basename(this.filePath),
      fileSize: this.fileSize,
      progress: this.getProgress(),
      totalChunks: this.totalChunks,
      sentCount: this.sentCount,
      totalDataSent: this.totalDataSent,
      totalRetransmits,
      retransmitRate,
      throughput,
      elapsed: elapsed.toFixed(2),
      priority: this.getPriorityName(),
      window: this.slidingWindow.getStats().effectiveWindow,
      inflight: this.slidingWindow.getStats().inflightCount,
      avgRtt: this.rttManager.getAverageRtt().toFixed(0),
      isComplete: this.isComplete,
      isTransferring: this.isTransferring
    };
  }

  sendPacketDirect(packet) {
    const buffer = packet.toBuffer();
    this.socket.send(buffer, this.port, this.host);
  }

  cleanup() {
    this.cleanupSynHandler();
    this.retransManager.clearAll();
    this.isTransferring = false;
  }
}

class MultiFileClient {
  constructor(host = DEFAULT_HOST, port = DEFAULT_PORT, totalBandwidth = 10 * 1024 * 1024) {
    this.host = host;
    this.port = port;
    this.socket = dgram.createSocket('udp4');
    this.scheduler = new MultiFileScheduler(totalBandwidth);
    this.transfers = new Map();
    this.nextFileId = 1;
    this.isRunning = false;
    this.sendLoopInterval = null;
    this.statsInterval = null;
  }

  async addFile(filePath, priority = PriorityLevel.NORMAL, resume = false) {
    const fileId = this.nextFileId++;
    const transfer = new SingleFileTransfer(
      fileId, filePath, priority, this.host, this.port, this.socket, this.scheduler
    );
    
    try {
      await transfer.initialize(resume);
      this.transfers.set(fileId, transfer);
      console.log(`✓ Added file #${fileId}: ${path.basename(filePath)}`);
      return fileId;
    } catch (err) {
      console.error(`✗ Failed to add ${filePath}:`, err.message);
      throw err;
    }
  }

  async start() {
    if (this.transfers.size === 0) {
      console.error('No files to transfer');
      return;
    }

    this.isRunning = true;
    console.log('\n' + '='.repeat(80));
    console.log(`Starting multi-file transfer to ${this.host}:${this.port}`);
    console.log(`Total files: ${this.transfers.size}`);
    console.log('='.repeat(80));

    for (const transfer of this.transfers.values()) {
      try {
        await transfer.sendSyn();
      } catch (err) {
        console.error(`Failed to start transfer for ${transfer.filePath}:`, err.message);
        transfer.error = err;
      }
    }

    this.socket.on('message', this.handleMessage.bind(this));
    this.socket.on('error', (err) => {
      console.error('Socket error:', err);
    });

    this.sendLoopInterval = setInterval(() => this.sendLoop(), 5);
    this.statsInterval = setInterval(() => this.printStats(), 1000);

    await this.waitForCompletion();
    this.stop();
    this.printFinalStats();
  }

  sendLoop() {
    for (const transfer of this.transfers.values()) {
      if (transfer.isTransferring && !transfer.isComplete) {
        transfer.processData();
      }
    }

    const item = this.scheduler.getNextPacket();
    if (item) {
      this.sendPacket(item.packet);
    }
  }

  handleMessage(msg, rinfo) {
    const packet = Packet.fromBuffer(msg);
    if (!packet || !packet.isValid()) return;

    if (packet.type === PacketType.ACK) {
      const transfer = this.transfers.get(packet.fileId);
      if (transfer) {
        transfer.handleAck(packet.seqNum);
      }
    }
  }

  async waitForCompletion() {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        let allComplete = true;
        for (const transfer of this.transfers.values()) {
          if (!transfer.isComplete) {
            allComplete = false;
            break;
          }
        }
        if (allComplete || !this.isRunning) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  printStats() {
    const activeTransfers = [];
    for (const transfer of this.transfers.values()) {
      if (!transfer.isComplete) {
        activeTransfers.push(transfer);
      }
    }

    if (activeTransfers.length === 0) return;

    console.log('\n' + '='.repeat(90));
    console.log(`Active Transfers (${activeTransfers.length}) | ${new Date().toLocaleTimeString()}`);
    console.log('-'.repeat(90));
    console.log(`  ID  Filename               Progress   Throughput   Window  Inflight  RTT   Priority`);
    console.log('-'.repeat(90));

    for (const transfer of activeTransfers) {
      const stats = transfer.getStats();
      const displayName = stats.filename.padEnd(20).substring(0, 20);
      const bwShare = this.scheduler.getFileStats(transfer.fileId)?.bandwidthShare || '0';
      
      console.log(`  ${stats.fileId.toString().padEnd(3)} ${displayName} ${stats.progress.padStart(6)}%   ${stats.throughput.padStart(6)} MB/s  ${stats.window.toString().padStart(4)}   ${stats.inflight.toString().padStart(5)}   ${stats.avgRtt.padStart(3)}ms  ${stats.priority.padEnd(8)} (${bwShare}%)`);
    }

    console.log('='.repeat(90));
  }

  printFinalStats() {
    console.log('\n\n' + '='.repeat(90));
    console.log('TRANSFER SUMMARY');
    console.log('='.repeat(90));

    let totalBytes = 0;
    let totalTime = 0;

    for (const transfer of this.transfers.values()) {
      const stats = transfer.getStats();
      totalBytes += transfer.totalDataSent;
      totalTime = Math.max(totalTime, parseFloat(stats.elapsed));

      console.log(`\n  File #${stats.fileId}: ${stats.filename}`);
      console.log(`    Size: ${(stats.fileSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`    Time: ${stats.elapsed}s | Throughput: ${stats.throughput} MB/s`);
      console.log(`    Retransmits: ${stats.totalRetransmits} (${stats.retransmitRate}%)`);
      console.log(`    Status: ${transfer.error ? '✗ FAILED - ' + transfer.error.message : '✓ COMPLETE'}`);
    }

    const overallThroughput = totalTime > 0 ? (totalBytes / 1024 / 1024 / totalTime).toFixed(3) : 0;
    console.log('\n' + '-'.repeat(90));
    console.log(`  Total: ${this.transfers.size} files | ${(totalBytes/1024/1024).toFixed(2)} MB | ${overallThroughput} MB/s avg`);
    console.log('='.repeat(90));
  }

  sendPacket(packet) {
    const buffer = packet.toBuffer();
    this.socket.send(buffer, this.port, this.host);
  }

  setFilePriority(fileId, priority) {
    const transfer = this.transfers.get(fileId);
    if (transfer) {
      transfer.priority = priority;
      this.scheduler.setFilePriority(fileId, priority);
    }
  }

  stop() {
    this.isRunning = false;
    if (this.sendLoopInterval) {
      clearInterval(this.sendLoopInterval);
    }
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
    }
    for (const transfer of this.transfers.values()) {
      transfer.cleanup();
    }
    this.socket.close();
  }
}

function parsePriority(str) {
  const upper = str.toUpperCase();
  if (PriorityLevel[upper] !== undefined) {
    return PriorityLevel[upper];
  }
  const num = parseInt(str);
  if (!isNaN(num) && num >= 1 && num <= 8) {
    return num;
  }
  return PriorityLevel.NORMAL;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    bandwidth: 10 * 1024 * 1024,
    files: []
  };

  let currentPriority = PriorityLevel.NORMAL;
  let currentResume = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-h':
      case '--host':
        options.host = args[++i];
        break;
      case '-p':
      case '--port':
        options.port = parseInt(args[++i]);
        break;
      case '-b':
      case '--bandwidth':
        options.bandwidth = parseInt(args[++i]) * 1024 * 1024;
        break;
      case '-P':
      case '--priority':
        currentPriority = parsePriority(args[++i]);
        break;
      case '-r':
      case '--resume':
        currentResume = true;
        break;
      case '--no-resume':
        currentResume = false;
        break;
      default:
        if (!args[i].startsWith('-')) {
          options.files.push({
            path: args[i],
            priority: currentPriority,
            resume: currentResume
          });
        }
    }
  }

  return options;
}

function printUsage() {
  console.log('Usage: node client.js [options] <file1> [--priority HIGH] <file2> ...');
  console.log('\nOptions:');
  console.log('  -h, --host <host>        Server host (default: 127.0.0.1)');
  console.log('  -p, --port <port>        Server port (default: 6969)');
  console.log('  -b, --bandwidth <MB/s>   Total bandwidth limit in MB/s (default: 10)');
  console.log('  -P, --priority <level>   Set priority for subsequent files');
  console.log('                           Levels: LOW(1), NORMAL(2), HIGH(4), CRITICAL(8)');
  console.log('  -r, --resume             Resume interrupted transfer for subsequent files');
  console.log('  --no-resume              Disable resume for subsequent files');
  console.log('\nExamples:');
  console.log('  node client.js file1.bin');
  console.log('  node client.js -P HIGH important.iso -P NORMAL other.bin');
  console.log('  node client.js -b 50 -r largefile1.iso largefile2.iso');
  console.log('  node client.js -P CRITICAL urgent.log -P LOW background.dat');
}

async function main() {
  const options = parseArgs();

  if (options.files.length === 0) {
    printUsage();
    process.exit(1);
  }

  const client = new MultiFileClient(options.host, options.port, options.bandwidth);

  for (const fileInfo of options.files) {
    try {
      await client.addFile(fileInfo.path, fileInfo.priority, fileInfo.resume);
    } catch (err) {
      console.error(`Skipping ${fileInfo.path}:`, err.message);
    }
  }

  if (client.transfers.size === 0) {
    console.error('No valid files to transfer');
    process.exit(1);
  }

  process.on('SIGINT', () => {
    console.log('\nStopping transfer...');
    client.stop();
    process.exit(0);
  });

  try {
    await client.start();
  } catch (err) {
    console.error('Transfer error:', err);
    client.stop();
    process.exit(1);
  }
}

main().catch(console.error);
