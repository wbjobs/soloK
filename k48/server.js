const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const { Packet, PacketType, createAckPacket } = require('./packet');
const { RTTManager, RetransmissionManager } = require('./rtt');
const { SlidingWindow } = require('./congestion');
const { PriorityLevel } = require('./scheduler');

const CHUNK_SIZE = 1024;
const DEFAULT_PORT = 6969;
const OUTPUT_DIR = path.join(__dirname, 'received');

class FileTransferState {
  constructor(fileId, clientKey, rinfo, fileInfo, startSeq) {
    this.fileId = fileId;
    this.clientKey = clientKey;
    this.clientAddress = rinfo.address;
    this.clientPort = rinfo.port;
    
    this.filename = fileInfo.filename;
    this.fileSize = fileInfo.fileSize;
    this.expectedMd5 = fileInfo.md5;
    this.priority = fileInfo.priority || PriorityLevel.NORMAL;
    
    this.expectedChunks = Math.ceil(this.fileSize / CHUNK_SIZE);
    this.receivedChunks = new Set();
    
    for (let i = 0; i < startSeq; i++) {
      this.receivedChunks.add(i);
    }
    
    this.outputPath = path.join(OUTPUT_DIR, this.filename);
    this.startTime = Date.now();
    this.lastActivity = Date.now();
    
    this.totalPackets = 0;
    this.bytesReceived = 0;
    this.duplicatePackets = 0;
    this.crcErrors = 0;
    
    this.rttManager = new RTTManager();
    this.retransManager = new RetransmissionManager(this.rttManager);
    this.slidingWindow = new SlidingWindow(16);
    this.slidingWindow.reset(startSeq);
    
    this.isComplete = false;
    this.isFinAcked = false;
  }

  handleData(packet) {
    const seqNum = packet.seqNum;
    this.lastActivity = Date.now();
    
    if (this.receivedChunks.has(seqNum)) {
      this.duplicatePackets++;
      return seqNum;
    }
    
    this.receivedChunks.add(seqNum);
    this.totalPackets++;
    this.bytesReceived += packet.data.length;
    
    this.writeChunk(seqNum, packet.data);
    
    return this.getCumulativeAck();
  }

  writeChunk(seqNum, data) {
    const offset = seqNum * CHUNK_SIZE;
    
    try {
      let fd;
      if (!fs.existsSync(this.outputPath)) {
        fd = fs.openSync(this.outputPath, 'w');
        const totalSize = this.fileSize;
        fs.ftruncateSync(fd, totalSize);
      } else {
        fd = fs.openSync(this.outputPath, 'r+');
      }
      fs.writeSync(fd, data, 0, data.length, offset);
      fs.closeSync(fd);
    } catch (err) {
      console.error(`Error writing chunk ${seqNum} for ${this.filename}:`, err.message);
    }
  }

  getCumulativeAck() {
    let ack = -1;
    for (let i = 0; i < this.expectedChunks; i++) {
      if (this.receivedChunks.has(i)) {
        ack = i;
      } else {
        break;
      }
    }
    return ack;
  }

  getProgress() {
    return (this.receivedChunks.size / this.expectedChunks * 100).toFixed(1);
  }

  isAllReceived() {
    return this.receivedChunks.size >= this.expectedChunks;
  }

  getStats() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const throughput = elapsed > 0 ? (this.bytesReceived / 1024 / 1024 / elapsed).toFixed(3) : 0;
    
    return {
      fileId: this.fileId,
      filename: this.filename,
      fileSize: this.fileSize,
      progress: this.getProgress(),
      chunksReceived: this.receivedChunks.size,
      totalChunks: this.expectedChunks,
      bytesReceived: this.bytesReceived,
      totalPackets: this.totalPackets,
      duplicatePackets: this.duplicatePackets,
      crcErrors: this.crcErrors,
      throughput,
      elapsed: elapsed.toFixed(2),
      priority: this.priority,
      isComplete: this.isComplete
    };
  }
}

class UDPServer {
  constructor(port = DEFAULT_PORT) {
    this.port = port;
    this.socket = dgram.createSocket('udp4');
    this.fileTransfers = new Map();
    this.nextFileId = 1;
    this.statsInterval = null;
  }

  start() {
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    this.socket.on('message', this.handleMessage.bind(this));
    this.socket.on('error', (err) => {
      console.error('Socket error:', err);
    });

    this.socket.bind(this.port, () => {
      console.log(`UDP Server listening on port ${this.port}`);
      console.log(`Files will be saved to: ${OUTPUT_DIR}`);
      console.log(`支持多文件并发传输，按优先级分配带宽`);
      console.log('='.repeat(60));
    });

    this.statsInterval = setInterval(() => this.printStats(), 2000);
  }

  handleMessage(msg, rinfo) {
    const clientKey = `${rinfo.address}:${rinfo.port}`;
    const packet = Packet.fromBuffer(msg);
    
    if (!packet) {
      console.log('Invalid packet received');
      return;
    }

    if (!packet.isValid()) {
      const fileState = this.getFileState(clientKey, packet.fileId);
      if (fileState) fileState.crcErrors++;
      console.log(`Packet CRC check failed for fileId=${packet.fileId}`);
      return;
    }

    switch (packet.type) {
      case PacketType.SYN:
        this.handleSyn(packet, rinfo, clientKey);
        break;
      case PacketType.DATA:
        this.handleData(packet, rinfo, clientKey);
        break;
      case PacketType.FIN:
        this.handleFin(packet, rinfo, clientKey);
        break;
    }
  }

  getFileState(clientKey, fileId) {
    const transferKey = `${clientKey}:${fileId}`;
    return this.fileTransfers.get(transferKey);
  }

  setFileState(clientKey, fileId, state) {
    const transferKey = `${clientKey}:${fileId}`;
    this.fileTransfers.set(transferKey, state);
  }

  removeFileState(clientKey, fileId) {
    const transferKey = `${clientKey}:${fileId}`;
    this.fileTransfers.delete(transferKey);
  }

  handleSyn(packet, rinfo, clientKey) {
    let fileInfo;
    try {
      fileInfo = JSON.parse(packet.data.toString());
    } catch (e) {
      console.log('Invalid SYN packet data');
      return;
    }

    const fileId = this.nextFileId++;
    let startSeq = 0;
    const outputPath = path.join(OUTPUT_DIR, fileInfo.filename);

    if (fileInfo.resumeFrom !== undefined && fileInfo.resumeFrom > 0) {
      startSeq = fileInfo.resumeFrom;
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        const existingChunks = Math.floor(stats.size / CHUNK_SIZE);
        startSeq = Math.max(startSeq, existingChunks);
        console.log(`Resuming transfer for ${fileInfo.filename}, starting from chunk ${startSeq}`);
      }
    }

    const fileState = new FileTransferState(fileId, clientKey, rinfo, fileInfo, startSeq);
    this.setFileState(clientKey, fileId, fileState);

    const ackPacket = createAckPacket(fileId, startSeq - 1);
    this.sendPacket(ackPacket, rinfo.address, rinfo.port);

    const priorityName = Object.keys(PriorityLevel).find(k => PriorityLevel[k] === fileState.priority) || 'NORMAL';
    console.log(`\n[SYN] New transfer: fileId=${fileId}, ${fileInfo.filename}`);
    console.log(`  Size: ${(fileInfo.fileSize / 1024 / 1024).toFixed(2)} MB, Priority: ${priorityName} (${fileState.priority})`);
    console.log(`  Chunks: ${fileState.expectedChunks}, Active transfers: ${this.getActiveTransferCount()}`);
  }

  handleData(packet, rinfo, clientKey) {
    const fileState = this.getFileState(clientKey, packet.fileId);
    if (!fileState || fileState.isComplete) return;

    const ackNum = fileState.handleData(packet);
    const ackPacket = createAckPacket(packet.fileId, ackNum);
    this.sendPacket(ackPacket, rinfo.address, rinfo.port);
  }

  handleFin(packet, rinfo, clientKey) {
    const fileState = this.getFileState(clientKey, packet.fileId);
    if (!fileState || fileState.isComplete) return;

    fileState.isComplete = true;
    const clientMd5 = packet.data.toString();
    const elapsedTime = (Date.now() - fileState.startTime) / 1000;
    
    console.log(`\n[FIN] File transfer complete: fileId=${fileState.fileId}, ${fileState.filename}`);
    console.log('='.repeat(60));
    
    setTimeout(async () => {
      const receivedMd5 = await this.calculateFileMd5(fileState.outputPath);
      const integrityOk = receivedMd5 === clientMd5;
      
      this.printFileStats(fileState, elapsedTime, receivedMd5, clientMd5, integrityOk);
      
      const ackPacket = createAckPacket(packet.fileId, packet.seqNum);
      this.sendPacket(ackPacket, rinfo.address, rinfo.port);
      
      this.removeFileState(clientKey, packet.fileId);
      console.log(`  Remaining active transfers: ${this.getActiveTransferCount()}`);
      console.log('='.repeat(60));
    }, 500);
  }

  async calculateFileMd5(filePath) {
    return new Promise((resolve) => {
      const { md5File } = require('./checksum');
      md5File(filePath).then(resolve).catch(() => resolve('error'));
    });
  }

  printFileStats(fileState, elapsedTime, receivedMd5, clientMd5, integrityOk) {
    const throughput = (fileState.bytesReceived / 1024 / 1024 / elapsedTime).toFixed(3);
    const fileSize = fs.existsSync(fileState.outputPath) 
      ? fs.statSync(fileState.outputPath).size 
      : 0;
    const retransmitRate = fileState.totalPackets > 0 
      ? ((fileState.duplicatePackets / fileState.totalPackets) * 100).toFixed(2)
      : '0.00';

    console.log(`  File ID: ${fileState.fileId}`);
    console.log(`  Filename: ${fileState.filename}`);
    console.log(`  File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Time elapsed: ${elapsedTime.toFixed(2)} seconds`);
    console.log(`  Throughput: ${throughput} MB/s`);
    console.log(`\n  Packet Statistics:`);
    console.log(`    Total packets: ${fileState.totalPackets}`);
    console.log(`    Duplicate packets: ${fileState.duplicatePackets}`);
    console.log(`    Retransmit rate: ${retransmitRate}%`);
    console.log(`    CRC errors: ${fileState.crcErrors}`);
    console.log(`\n  Integrity check:`);
    console.log(`    MD5 (client): ${clientMd5}`);
    console.log(`    MD5 (server): ${receivedMd5}`);
    console.log(`    Status: ${integrityOk ? '✓ PASSED' : '✗ FAILED'}`);
  }

  printStats() {
    const activeTransfers = [];
    for (const state of this.fileTransfers.values()) {
      if (!state.isComplete) {
        activeTransfers.push(state);
      }
    }

    if (activeTransfers.length === 0) return;

    const now = Date.now();
    console.log('\n' + '='.repeat(80));
    console.log(`Active Transfers (${activeTransfers.length}) | ${new Date().toLocaleTimeString()}`);
    console.log('-'.repeat(80));
    console.log(`  ID  Filename               Progress   Throughput   Priority  Queue`);
    console.log('-'.repeat(80));

    for (const state of activeTransfers) {
      const stats = state.getStats();
      const priorityName = Object.keys(PriorityLevel).find(k => PriorityLevel[k] === state.priority) || 'NORMAL';
      const displayName = stats.filename.padEnd(20).substring(0, 20);
      const queueSize = state.slidingWindow.getStats().inflightCount;
      
      console.log(`  ${stats.fileId.toString().padEnd(3)} ${displayName} ${stats.progress.padStart(6)}%   ${stats.throughput.padStart(6)} MB/s  ${priorityName.padEnd(8)}  ${queueSize}`);
    }

    console.log('='.repeat(80));
  }

  getActiveTransferCount() {
    let count = 0;
    for (const state of this.fileTransfers.values()) {
      if (!state.isComplete) count++;
    }
    return count;
  }

  sendPacket(packet, address, port) {
    const buffer = packet.toBuffer();
    this.socket.send(buffer, port, address);
  }

  stop() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
    }
    this.socket.close();
  }
}

const port = process.argv[2] ? parseInt(process.argv[2]) : DEFAULT_PORT;
const server = new UDPServer(port);
server.start();

process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.stop();
  process.exit(0);
});
