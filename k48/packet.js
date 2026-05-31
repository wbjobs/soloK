const { crc32 } = require('./checksum');

const PacketType = {
  SYN: 0,
  DATA: 1,
  ACK: 2,
  FIN: 3,
  RESEND_REQ: 4
};

const HEADER_SIZE = 11;

class Packet {
  constructor(type, fileId, seqNum, data = Buffer.alloc(0)) {
    this.type = type;
    this.fileId = fileId;
    this.seqNum = seqNum;
    this.data = data;
    this.crc = 0;
  }

  static fromBuffer(buffer) {
    if (buffer.length < HEADER_SIZE) {
      return null;
    }

    const type = buffer.readUInt8(0);
    const fileId = buffer.readUInt16BE(1);
    const seqNum = buffer.readUInt32BE(3);
    const crc = buffer.readUInt32BE(7);
    const data = buffer.slice(HEADER_SIZE);

    const packet = new Packet(type, fileId, seqNum, data);
    packet.crc = crc;

    return packet;
  }

  toBuffer() {
    const header = Buffer.alloc(HEADER_SIZE);
    header.writeUInt8(this.type, 0);
    header.writeUInt16BE(this.fileId, 1);
    header.writeUInt32BE(this.seqNum, 3);
    
    const dataCrc = crc32(this.data);
    header.writeUInt32BE(dataCrc, 7);
    this.crc = dataCrc;

    return Buffer.concat([header, this.data]);
  }

  isValid() {
    return this.crc === crc32(this.data);
  }
}

function createSynPacket(fileId, seqNum, fileInfo) {
  const infoData = Buffer.from(JSON.stringify(fileInfo));
  return new Packet(PacketType.SYN, fileId, seqNum, infoData);
}

function createDataPacket(fileId, seqNum, data) {
  return new Packet(PacketType.DATA, fileId, seqNum, data);
}

function createAckPacket(fileId, ackNum) {
  return new Packet(PacketType.ACK, fileId, ackNum);
}

function createFinPacket(fileId, seqNum, md5Hash) {
  return new Packet(PacketType.FIN, fileId, seqNum, Buffer.from(md5Hash));
}

function createResendReqPacket(fileId, startSeq) {
  const data = Buffer.alloc(4);
  data.writeUInt32BE(startSeq, 0);
  return new Packet(PacketType.RESEND_REQ, fileId, 0, data);
}

module.exports = {
  PacketType,
  Packet,
  HEADER_SIZE,
  createSynPacket,
  createDataPacket,
  createAckPacket,
  createFinPacket,
  createResendReqPacket
};
