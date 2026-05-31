import { Operation } from '@prisma/client';
import { prisma } from './prismaClient.js';

interface CreateOperationParams {
  roomId: string;
  memberId: string;
  operationType: string;
  crdtData: any;
  version: number;
  snapshotId?: string;
}

interface ListOperationsParams {
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
  memberId?: string;
  operationType?: string;
}

interface FindForReplayParams {
  fromOperationId?: string;
  toOperationId?: string;
  fromTime?: Date;
  toTime?: Date;
  limit?: number;
}

interface GetOperationCountParams {
  from?: Date;
  to?: Date;
  memberId?: string;
  operationType?: string;
}

export const operationRepository = {
  async create({ roomId, memberId, operationType, crdtData, version, snapshotId }: CreateOperationParams): Promise<Operation> {
    return prisma.operation.create({
      data: {
        roomId,
        memberId,
        operationType,
        crdtData,
        version,
        snapshotId,
      },
    });
  },

  async createMany(operations: CreateOperationParams[]): Promise<number> {
    const result = await prisma.operation.createMany({
      data: operations,
    });
    return result.count;
  },

  async findById(id: string): Promise<Operation | null> {
    return prisma.operation.findUnique({
      where: { id },
      include: {
        member: {
          select: {
            id: true,
            userId: true,
            userName: true,
            color: true,
          },
        },
      },
    });
  },

  async listByRoomId(roomId: string, { from, to, limit, offset, memberId, operationType }: ListOperationsParams): Promise<{ operations: Operation[]; total: number }> {
    const where: any = { roomId };

    if (from) {
      where.createdAt = { ...where.createdAt, gte: from };
    }
    if (to) {
      where.createdAt = { ...where.createdAt, lte: to };
    }
    if (memberId) {
      where.memberId = memberId;
    }
    if (operationType) {
      where.operationType = operationType;
    }

    const [operations, total] = await Promise.all([
      prisma.operation.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
        include: {
          member: {
            select: {
              id: true,
              userId: true,
              userName: true,
              color: true,
            },
          },
        },
      }),
      prisma.operation.count({ where }),
    ]);

    return { operations, total };
  },

  async findForReplay(roomId: string, { fromOperationId, toOperationId, fromTime, toTime, limit }: FindForReplayParams): Promise<Operation[]> {
    const where: any = { roomId };

    if (fromTime) {
      where.createdAt = { ...where.createdAt, gte: fromTime };
    }
    if (toTime) {
      where.createdAt = { ...where.createdAt, lte: toTime };
    }

    let operations = await prisma.operation.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        member: {
          select: {
            id: true,
            userId: true,
            userName: true,
            color: true,
          },
        },
      },
    });

    if (fromOperationId) {
      const fromIndex = operations.findIndex(op => op.id === fromOperationId);
      if (fromIndex !== -1) {
        operations = operations.slice(fromIndex);
      } else {
        const fromOp = await prisma.operation.findUnique({
          where: { id: fromOperationId },
          select: { createdAt: true },
        });
        if (fromOp) {
          operations = operations.filter(op => op.createdAt >= fromOp.createdAt);
        }
      }
    }

    if (toOperationId) {
      const toIndex = operations.findIndex(op => op.id === toOperationId);
      if (toIndex !== -1) {
        operations = operations.slice(0, toIndex + 1);
      } else {
        const toOp = await prisma.operation.findUnique({
          where: { id: toOperationId },
          select: { createdAt: true },
        });
        if (toOp) {
          operations = operations.filter(op => op.createdAt <= toOp.createdAt);
        }
      }
    }

    return operations;
  },

  async getOperationCount(roomId: string, { from, to, memberId, operationType }: GetOperationCountParams = {}): Promise<number> {
    const where: any = { roomId };

    if (from) {
      where.createdAt = { ...where.createdAt, gte: from };
    }
    if (to) {
      where.createdAt = { ...where.createdAt, lte: to };
    }
    if (memberId) {
      where.memberId = memberId;
    }
    if (operationType) {
      where.operationType = operationType;
    }

    return prisma.operation.count({ where });
  },

  async getOperationTypes(roomId: string): Promise<string[]> {
    const operations = await prisma.operation.findMany({
      where: { roomId },
      select: { operationType: true },
      distinct: ['operationType'],
    });
    return operations.map(op => op.operationType);
  },

  async getLatestVersion(roomId: string): Promise<number> {
    const latest = await prisma.operation.findFirst({
      where: { roomId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return latest?.version || 0;
  },

  async getByVersion(roomId: string, version: number): Promise<Operation | null> {
    return prisma.operation.findFirst({
      where: {
        roomId,
        version,
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  async getVersionRange(roomId: string): Promise<{ min: number; max: number }> {
    const [minOp, maxOp] = await Promise.all([
      prisma.operation.findFirst({
        where: { roomId },
        orderBy: { version: 'asc' },
        select: { version: true },
      }),
      prisma.operation.findFirst({
        where: { roomId },
        orderBy: { version: 'desc' },
        select: { version: true },
      }),
    ]);

    return {
      min: minOp?.version || 0,
      max: maxOp?.version || 0,
    };
  },

  async getBySnapshotId(snapshotId: string): Promise<Operation[]> {
    return prisma.operation.findMany({
      where: { snapshotId },
      orderBy: { createdAt: 'asc' },
    });
  },

  async updateSnapshotId(operationId: string, snapshotId: string): Promise<Operation> {
    return prisma.operation.update({
      where: { id: operationId },
      data: { snapshotId },
    });
  },

  async deleteByRoomId(roomId: string): Promise<number> {
    const result = await prisma.operation.deleteMany({
      where: { roomId },
    });
    return result.count;
  },

  async getTimeRange(roomId: string): Promise<{ start: Date; end: Date } | null> {
    const [first, last] = await Promise.all([
      prisma.operation.findFirst({
        where: { roomId },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      prisma.operation.findFirst({
        where: { roomId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    if (!first || !last) return null;

    return {
      start: first.createdAt,
      end: last.createdAt,
    };
  },
};
