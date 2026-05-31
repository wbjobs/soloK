import { operationRepository } from '../repositories/operationRepository.js';
import { roomRepository } from '../repositories/roomRepository.js';
import { AppError, validateRequiredFields, parseDate } from '../utils/index.js';
import { config } from '../config/index.js';
import {
  CRDTOperation,
  ReplayOperationsRequest,
  ReplayOperationsResponse,
  ReplayFrame,
  ListOperationsResponse,
  SaveOperationResponse,
  Operation,
} from '../types/index.js';

interface ListOperationsParams {
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
  memberId?: string;
  operationType?: string;
}

export const operationService = {
  async listOperations(roomId: string, { from, to, limit, offset, memberId, operationType }: ListOperationsParams): Promise<ListOperationsResponse> {
    const room = await roomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const { operations, total } = await operationRepository.listByRoomId(roomId, {
      from: parseDate(from),
      to: parseDate(to),
      limit,
      offset,
      memberId,
      operationType,
    });

    return { operations: operations as unknown as Operation[], total };
  },

  async replayOperations(roomId: string, { fromOperationId, toOperationId, fromTime, toTime }: ReplayOperationsRequest): Promise<ReplayOperationsResponse> {
    const room = await roomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const operations = await operationRepository.findForReplay(roomId, {
      fromOperationId,
      toOperationId,
      fromTime: parseDate(fromTime),
      toTime: parseDate(toTime),
      limit: config.maxOperationsPerReplay,
    });

    if (operations.length === 0) {
      return {
        frames: [],
        totalFrames: 0,
      };
    }

    const memberMap = new Map<string, string>();
    const frames: ReplayFrame[] = operations.map((op, index) => {
      const member = (op as any).member;
      const memberName = member?.userName || memberMap.get(op.memberId);
      if (member) {
        memberMap.set(op.memberId, member.userName);
      }

      return {
        frame: index,
        operationId: op.id,
        operationType: op.operationType,
        crdtData: op.crdtData,
        timestamp: op.createdAt.getTime(),
        memberId: op.memberId,
        memberName,
      };
    });

    const timeRange = operations.length > 0 ? {
      start: operations[0].createdAt.getTime(),
      end: operations[operations.length - 1].createdAt.getTime(),
    } : undefined;

    return {
      frames,
      totalFrames: frames.length,
      timeRange,
    };
  },

  async saveOperation(roomId: string, operation: CRDTOperation): Promise<SaveOperationResponse> {
    const validationError = validateRequiredFields(
      { roomId, operationType: operation.type, memberId: operation.memberId, version: operation.version },
      ['roomId', 'operationType', 'memberId', 'version']
    );
    if (validationError) {
      throw new AppError(validationError, 400, 'VALIDATION_ERROR');
    }

    const room = await roomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const member = await roomRepository.findMemberByUserId(roomId, operation.memberId);
    if (!member) {
      throw new AppError('Member not found in room', 404, 'MEMBER_NOT_FOUND');
    }

    const saved = await operationRepository.create({
      roomId,
      memberId: member.id,
      operationType: operation.type,
      crdtData: operation.payload,
      version: operation.version,
    });

    return { operationId: saved.id };
  },

  async saveOperations(roomId: string, operations: CRDTOperation[]): Promise<{ savedCount: number }> {
    const room = await roomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const memberCache = new Map<string, string>();
    const createParams = [];

    for (const op of operations) {
      let memberDbId = memberCache.get(op.memberId);
      if (!memberDbId) {
        const member = await roomRepository.findMemberByUserId(roomId, op.memberId);
        if (!member) {
          continue;
        }
        memberDbId = member.id;
        memberCache.set(op.memberId, memberDbId);
      }

      createParams.push({
        roomId,
        memberId: memberDbId,
        operationType: op.type,
        crdtData: op.payload,
        version: op.version,
      });
    }

    const savedCount = await operationRepository.createMany(createParams);
    return { savedCount };
  },

  async getOperation(operationId: string): Promise<{ operation: any }> {
    const operation = await operationRepository.findById(operationId);
    if (!operation) {
      throw new AppError('Operation not found', 404, 'OPERATION_NOT_FOUND');
    }

    return { operation };
  },

  async getOperationStats(roomId: string): Promise<{
    totalOperations: number;
    operationTypes: string[];
    versionRange: { min: number; max: number };
    timeRange: { start: number; end: number } | null;
  }> {
    const room = await roomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const [totalOperations, operationTypes, versionRange, timeRange] = await Promise.all([
      operationRepository.getOperationCount(roomId),
      operationRepository.getOperationTypes(roomId),
      operationRepository.getVersionRange(roomId),
      operationRepository.getTimeRange(roomId),
    ]);

    return {
      totalOperations,
      operationTypes,
      versionRange,
      timeRange: timeRange ? {
        start: timeRange.start.getTime(),
        end: timeRange.end.getTime(),
      } : null,
    };
  },

  async getOperationsByVersion(roomId: string, version: number): Promise<{ operation: any }> {
    const room = await roomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const operation = await operationRepository.getByVersion(roomId, version);
    if (!operation) {
      throw new AppError('No operation found for this version', 404, 'VERSION_NOT_FOUND');
    }

    return { operation };
  },
};
