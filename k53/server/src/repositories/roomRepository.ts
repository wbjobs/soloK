import { Room, Member } from '@prisma/client';
import { prisma } from './prismaClient.js';
import { GraphData } from '../types/index.js';

interface CreateRoomParams {
  name: string;
  passwordHash: string | null;
  createdBy: string;
  parentRoomId?: string | null;
  forkedFromSnapshotId?: string | null;
  initialState?: GraphData;
}

interface AddMemberParams {
  userId: string;
  userName: string;
  color: string;
}

interface UpdateCurrentStateParams {
  currentState: GraphData;
}

export const roomRepository = {
  async create({ name, passwordHash, createdBy, parentRoomId, forkedFromSnapshotId, initialState }: CreateRoomParams): Promise<Room> {
    return prisma.room.create({
      data: {
        name,
        passwordHash,
        createdBy,
        parentRoomId: parentRoomId || null,
        forkedFromSnapshotId: forkedFromSnapshotId || null,
        currentState: initialState ? (initialState as any) : {},
      },
    });
  },

  async findById(id: string): Promise<Room | null> {
    return prisma.room.findUnique({
      where: { id },
    });
  },

  async list(): Promise<Room[]> {
    return prisma.room.findMany({
      orderBy: { createdAt: 'desc' },
    });
  },

  async delete(id: string): Promise<Room> {
    return prisma.room.delete({
      where: { id },
    });
  },

  async addMember(roomId: string, { userId, userName, color }: AddMemberParams): Promise<Member> {
    return prisma.member.create({
      data: {
        roomId,
        userId,
        userName,
        color,
      },
    });
  },

  async findMemberByUserId(roomId: string, userId: string): Promise<Member | null> {
    return prisma.member.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId,
        },
      },
    });
  },

  async findMemberById(memberId: string): Promise<Member | null> {
    return prisma.member.findUnique({
      where: { id: memberId },
    });
  },

  async listMembers(roomId: string): Promise<Member[]> {
    return prisma.member.findMany({
      where: { roomId },
      orderBy: { joinedAt: 'asc' },
    });
  },

  async listOnlineMembers(roomId: string): Promise<Member[]> {
    return prisma.member.findMany({
      where: {
        roomId,
        isOnline: true,
      },
      orderBy: { lastActiveAt: 'desc' },
    });
  },

  async updateMemberOnline(memberId: string, isOnline: boolean): Promise<Member> {
    return prisma.member.update({
      where: { id: memberId },
      data: {
        isOnline,
        lastActiveAt: new Date(),
      },
    });
  },

  async updateMemberLastActive(memberId: string): Promise<Member> {
    return prisma.member.update({
      where: { id: memberId },
      data: {
        lastActiveAt: new Date(),
      },
    });
  },

  async updateCurrentState(roomId: string, { currentState }: UpdateCurrentStateParams): Promise<Room> {
    return prisma.room.update({
      where: { id: roomId },
      data: {
        currentState: currentState as any,
        updatedAt: new Date(),
      },
    });
  },

  async updateName(roomId: string, name: string): Promise<Room> {
    return prisma.room.update({
      where: { id: roomId },
      data: {
        name,
        updatedAt: new Date(),
      },
    });
  },

  async getOperationCount(roomId: string): Promise<number> {
    return prisma.operation.count({
      where: { roomId },
    });
  },

  async getMemberCount(roomId: string): Promise<number> {
    return prisma.member.count({
      where: { roomId },
    });
  },

  async findBranches(parentRoomId: string): Promise<Room[]> {
    return prisma.room.findMany({
      where: { parentRoomId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async findParentRoom(roomId: string): Promise<Room | null> {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
    });
    if (!room?.parentRoomId) return null;
    return prisma.room.findUnique({
      where: { id: room.parentRoomId },
    });
  },
};
