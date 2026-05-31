import { roomRepository } from '../repositories/roomRepository.js';
import { snapshotRepository } from '../repositories/snapshotRepository.js';
import bcrypt from 'bcryptjs';
import { generateToken, getRandomColor, validateRequiredFields, AppError, deepClone } from '../utils/index.js';
import { CreateRoomRequest, CreateRoomResponse, JoinRoomRequest, JoinRoomResponse, GetRoomResponse, ListRoomsResponse, Room, ForkRoomRequest, ForkRoomResponse, BranchInfo, ListBranchesResponse, GraphData } from '../types/index.js';

export const roomService = {
  async createRoom({ name, password, userId, userName }: CreateRoomRequest): Promise<CreateRoomResponse> {
    const validationError = validateRequiredFields({ name, userId, userName }, ['name', 'userId', 'userName']);
    if (validationError) {
      throw new AppError(validationError, 400, 'VALIDATION_ERROR');
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const room = await roomRepository.create({
      name,
      passwordHash,
      createdBy: userId,
    });

    const member = await roomRepository.addMember(room.id, {
      userId,
      userName,
      color: getRandomColor(),
    });

    const token = generateToken(room.id, userId);

    return {
      roomId: room.id,
      token,
      room: room as unknown as Room,
      member,
    };
  },

  async joinRoom(roomId: string, { userId, userName, password }: JoinRoomRequest): Promise<JoinRoomResponse> {
    const validationError = validateRequiredFields({ roomId, userId, userName }, ['roomId', 'userId', 'userName']);
    if (validationError) {
      throw new AppError(validationError, 400, 'VALIDATION_ERROR');
    }

    const room = await roomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    if (room.passwordHash) {
      if (!password) {
        throw new AppError('Password required', 401, 'PASSWORD_REQUIRED');
      }
      const isPasswordValid = await bcrypt.compare(password, room.passwordHash);
      if (!isPasswordValid) {
        throw new AppError('Invalid password', 401, 'INVALID_PASSWORD');
      }
    }

    let member = await roomRepository.findMemberByUserId(roomId, userId);
    if (!member) {
      member = await roomRepository.addMember(roomId, {
        userId,
        userName,
        color: getRandomColor(),
      });
    } else {
      member = await roomRepository.updateMemberOnline(member.id, true);
    }

    const members = await roomRepository.listMembers(roomId);
    const token = generateToken(roomId, userId);

    return {
      token,
      room: room as unknown as Room,
      members,
    };
  },

  async getRoom(roomId: string, userId?: string): Promise<GetRoomResponse> {
    const room = await roomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    if (userId) {
      const member = await roomRepository.findMemberByUserId(roomId, userId);
      if (member) {
        await roomRepository.updateMemberLastActive(member.id);
      }
    }

    const members = await roomRepository.listMembers(roomId);

    return {
      room: room as unknown as Room,
      members,
    };
  },

  async listRooms(): Promise<ListRoomsResponse> {
    const rooms = await roomRepository.list();
    return { rooms: rooms as unknown as Room[] };
  },

  async leaveRoom(roomId: string, userId: string): Promise<{ success: boolean }> {
    const member = await roomRepository.findMemberByUserId(roomId, userId);
    if (member) {
      await roomRepository.updateMemberOnline(member.id, false);
    }
    return { success: true };
  },

  async deleteRoom(roomId: string, userId: string): Promise<{ success: boolean }> {
    const room = await roomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    if (room.createdBy !== userId) {
      throw new AppError('Only the room creator can delete the room', 403, 'PERMISSION_DENIED');
    }

    await roomRepository.delete(roomId);
    return { success: true };
  },

  async getRoomStats(roomId: string): Promise<{
    operationCount: number;
    memberCount: number;
    onlineMemberCount: number;
  }> {
    const room = await roomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const [operationCount, memberCount, onlineMembers] = await Promise.all([
      roomRepository.getOperationCount(roomId),
      roomRepository.getMemberCount(roomId),
      roomRepository.listOnlineMembers(roomId),
    ]);

    return {
      operationCount,
      memberCount,
      onlineMemberCount: onlineMembers.length,
    };
  },

  async forkRoom(roomId: string, { name, userId, userName, snapshotId, description }: ForkRoomRequest): Promise<ForkRoomResponse> {
    const validationError = validateRequiredFields({ roomId, name, userId, userName }, ['roomId', 'name', 'userId', 'userName']);
    if (validationError) {
      throw new AppError(validationError, 400, 'VALIDATION_ERROR');
    }

    const room = await roomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    let graphData = room.currentState;

    if (snapshotId) {
      const snapshot = await snapshotRepository.findById(snapshotId);
      if (!snapshot) {
        throw new AppError('Snapshot not found', 404, 'SNAPSHOT_NOT_FOUND');
      }
      if (snapshot.roomId !== roomId) {
        throw new AppError('Snapshot does not belong to this room', 400, 'INVALID_SNAPSHOT');
      }
      graphData = snapshot.graphData;
    }

    const forkedRoom = await roomRepository.create({
      name,
      passwordHash: null,
      createdBy: userId,
      parentRoomId: roomId,
      forkedFromSnapshotId: snapshotId || null,
      initialState: deepClone(graphData) as unknown as GraphData,
    });

    const member = await roomRepository.addMember(forkedRoom.id, {
      userId,
      userName,
      color: getRandomColor(),
    });

    if (description) {
      await snapshotRepository.create({
        roomId: forkedRoom.id,
        name: `Fork initial state`,
        description,
        graphData: deepClone(graphData) as unknown as GraphData,
        createdBy: userId,
        operationCount: 0,
      });
    } else {
      await snapshotRepository.create({
        roomId: forkedRoom.id,
        name: `Fork initial state`,
        description: `Forked from room "${room.name}"`,
        graphData: deepClone(graphData) as unknown as GraphData,
        createdBy: userId,
        operationCount: 0,
      });
    }

    const token = generateToken(forkedRoom.id, userId);

    return {
      roomId: forkedRoom.id,
      token,
      room: forkedRoom as unknown as Room,
      member,
    };
  },

  async listBranches(roomId: string): Promise<ListBranchesResponse> {
    const room = await roomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const branchRooms = await roomRepository.findBranches(roomId);

    const branches: BranchInfo[] = await Promise.all(
      branchRooms.map(async (branch) => {
        const memberCount = await roomRepository.getMemberCount(branch.id);
        return {
          id: branch.id,
          name: branch.name,
          createdBy: branch.createdBy,
          forkedFromSnapshotId: branch.forkedFromSnapshotId,
          createdAt: branch.createdAt,
          memberCount,
        };
      })
    );

    return { branches };
  },
};
