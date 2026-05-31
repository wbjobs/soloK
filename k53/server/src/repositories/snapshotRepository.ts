import { Snapshot } from '@prisma/client';
import { prisma } from './prismaClient.js';
import { GraphData } from '../types/index.js';

interface CreateSnapshotParams {
  roomId: string;
  name: string;
  description?: string;
  graphData: GraphData;
  createdBy: string;
  operationCount?: number;
}

interface UpdateSnapshotParams {
  name?: string;
  description?: string;
  graphData?: GraphData;
}

interface QueryGraphDataParams {
  nodeId?: string;
  edgeId?: string;
  metadataKey?: string;
}

export const snapshotRepository = {
  async create({ roomId, name, description, graphData, createdBy, operationCount = 0 }: CreateSnapshotParams): Promise<Snapshot> {
    return prisma.snapshot.create({
      data: {
        roomId,
        name,
        description,
        graphData: graphData as any,
        createdBy,
        operationCount,
      },
    });
  },

  async findById(id: string): Promise<Snapshot | null> {
    return prisma.snapshot.findUnique({
      where: { id },
      include: {
        room: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  },

  async listByRoomId(roomId: string, limit?: number, offset?: number): Promise<Snapshot[]> {
    return prisma.snapshot.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  },

  async countByRoomId(roomId: string): Promise<number> {
    return prisma.snapshot.count({
      where: { roomId },
    });
  },

  async update(id: string, { name, description, graphData }: UpdateSnapshotParams): Promise<Snapshot> {
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (graphData !== undefined) data.graphData = graphData as any;

    return prisma.snapshot.update({
      where: { id },
      data,
    });
  },

  async delete(id: string): Promise<Snapshot> {
    return prisma.snapshot.delete({
      where: { id },
    });
  },

  async updateOperationCount(snapshotId: string, operationCount: number): Promise<Snapshot> {
    return prisma.snapshot.update({
      where: { id: snapshotId },
      data: { operationCount },
    });
  },

  async queryGraphData(snapshotId: string, { nodeId, edgeId, metadataKey }: QueryGraphDataParams): Promise<any> {
    const snapshot = await prisma.snapshot.findUnique({
      where: { id: snapshotId },
      select: { graphData: true },
    });

    if (!snapshot) return null;

    const graphData = snapshot.graphData as unknown as GraphData;

    if (nodeId) {
      return graphData.nodes?.[nodeId] || null;
    }

    if (edgeId) {
      return graphData.edges?.[edgeId] || null;
    }

    if (metadataKey) {
      return graphData.metadata?.[metadataKey as keyof typeof graphData.metadata] || null;
    }

    return graphData;
  },

  async getGraphDataField(snapshotId: string, fieldPath: string): Promise<any> {
    const snapshot = await prisma.snapshot.findUnique({
      where: { id: snapshotId },
      select: { graphData: true },
    });

    if (!snapshot) return null;

    const graphData = snapshot.graphData as any;
    const pathParts = fieldPath.split('.');
    let result = graphData;

    for (const part of pathParts) {
      if (result === undefined || result === null) {
        return null;
      }
      result = result[part];
    }

    return result;
  },

  async listByNodeId(roomId: string, nodeId: string): Promise<Snapshot[]> {
    const snapshots = await prisma.snapshot.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
    });

    return snapshots.filter(snapshot => {
      const graphData = snapshot.graphData as unknown as GraphData;
      return graphData.nodes?.[nodeId] !== undefined;
    });
  },

  async listByEdgeId(roomId: string, edgeId: string): Promise<Snapshot[]> {
    const snapshots = await prisma.snapshot.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
    });

    return snapshots.filter(snapshot => {
      const graphData = snapshot.graphData as unknown as GraphData;
      return graphData.edges?.[edgeId] !== undefined;
    });
  },

  async searchByName(roomId: string, searchTerm: string): Promise<Snapshot[]> {
    return prisma.snapshot.findMany({
      where: {
        roomId,
        name: {
          contains: searchTerm,
          mode: 'insensitive',
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async getLatest(roomId: string): Promise<Snapshot | null> {
    return prisma.snapshot.findFirst({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
    });
  },
};
