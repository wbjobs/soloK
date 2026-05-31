import { snapshotRepository } from '../repositories/snapshotRepository.js';
import { roomRepository } from '../repositories/roomRepository.js';
import { operationRepository } from '../repositories/operationRepository.js';
import { AppError, validateRequiredFields, deepClone } from '../utils/index.js';
import { GraphData, CreateSnapshotRequest, CreateSnapshotResponse, ListSnapshotsResponse, GetSnapshotResponse, RestoreSnapshotResponse, ExportSnapshotResponse, Snapshot } from '../types/index.js';

export const snapshotService = {
  async createSnapshot(roomId: string, { name, description }: CreateSnapshotRequest, userId: string): Promise<CreateSnapshotResponse> {
    const validationError = validateRequiredFields({ roomId, name, userId }, ['roomId', 'name', 'userId']);
    if (validationError) {
      throw new AppError(validationError, 400, 'VALIDATION_ERROR');
    }

    const room = await roomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const operationCount = await operationRepository.getOperationCount(roomId);

    const graphData = room.currentState as unknown as GraphData;

    const snapshot = await snapshotRepository.create({
      roomId,
      name,
      description,
      graphData,
      createdBy: userId,
      operationCount,
    });

    return {
      snapshotId: snapshot.id,
      snapshot: snapshot as unknown as Snapshot,
    };
  },

  async listSnapshots(roomId: string, limit?: number, offset?: number): Promise<ListSnapshotsResponse> {
    const room = await roomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const snapshots = await snapshotRepository.listByRoomId(roomId, limit, offset);
    return { snapshots: snapshots as unknown as Snapshot[] };
  },

  async getSnapshot(snapshotId: string): Promise<GetSnapshotResponse> {
    const snapshot = await snapshotRepository.findById(snapshotId);
    if (!snapshot) {
      throw new AppError('Snapshot not found', 404, 'SNAPSHOT_NOT_FOUND');
    }

    return {
      snapshot: snapshot as unknown as Snapshot,
      data: snapshot.graphData,
    };
  },

  async restoreSnapshot(snapshotId: string, userId: string): Promise<RestoreSnapshotResponse> {
    const snapshot = await snapshotRepository.findById(snapshotId);
    if (!snapshot) {
      throw new AppError('Snapshot not found', 404, 'SNAPSHOT_NOT_FOUND');
    }

    const graphData = snapshot.graphData as unknown as GraphData;
    await roomRepository.updateCurrentState(snapshot.roomId, { currentState: graphData });

    const newSnapshot = await snapshotRepository.create({
      roomId: snapshot.roomId,
      name: `${snapshot.name} (restored)`,
      description: `Restored from snapshot ${snapshotId} by user ${userId}`,
      graphData,
      createdBy: userId,
      operationCount: snapshot.operationCount,
    });

    return {
      success: true,
      newSnapshotId: newSnapshot.id,
    };
  },

  async exportSnapshot(snapshotId: string): Promise<ExportSnapshotResponse> {
    const snapshot = await snapshotRepository.findById(snapshotId);
    if (!snapshot) {
      throw new AppError('Snapshot not found', 404, 'SNAPSHOT_NOT_FOUND');
    }

    return {
      id: snapshot.id,
      name: snapshot.name,
      description: snapshot.description ?? undefined,
      graphData: deepClone(snapshot.graphData),
      createdAt: snapshot.createdAt,
      createdBy: snapshot.createdBy,
      version: '1.0',
    };
  },

  async deleteSnapshot(snapshotId: string, userId: string): Promise<{ success: boolean }> {
    const snapshot = await snapshotRepository.findById(snapshotId);
    if (!snapshot) {
      throw new AppError('Snapshot not found', 404, 'SNAPSHOT_NOT_FOUND');
    }

    if (snapshot.createdBy !== userId) {
      throw new AppError('Only the snapshot creator can delete it', 403, 'PERMISSION_DENIED');
    }

    await snapshotRepository.delete(snapshotId);
    return { success: true };
  },

  async updateSnapshot(snapshotId: string, userId: string, updates: { name?: string; description?: string }): Promise<{ snapshot: any }> {
    const snapshot = await snapshotRepository.findById(snapshotId);
    if (!snapshot) {
      throw new AppError('Snapshot not found', 404, 'SNAPSHOT_NOT_FOUND');
    }

    if (snapshot.createdBy !== userId) {
      throw new AppError('Only the snapshot creator can update it', 403, 'PERMISSION_DENIED');
    }

    const updated = await snapshotRepository.update(snapshotId, updates);
    return { snapshot: updated };
  },

  async queryGraphData(snapshotId: string, query: { nodeId?: string; edgeId?: string; metadataKey?: string }): Promise<any> {
    const snapshot = await snapshotRepository.findById(snapshotId);
    if (!snapshot) {
      throw new AppError('Snapshot not found', 404, 'SNAPSHOT_NOT_FOUND');
    }

    return snapshotRepository.queryGraphData(snapshotId, query);
  },

  async searchSnapshots(roomId: string, searchTerm: string): Promise<ListSnapshotsResponse> {
    const room = await roomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const snapshots = await snapshotRepository.searchByName(roomId, searchTerm);
    return { snapshots: snapshots as unknown as Snapshot[] };
  },

  async getLatestSnapshot(roomId: string): Promise<GetSnapshotResponse | null> {
    const room = await roomRepository.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const snapshot = await snapshotRepository.getLatest(roomId);
    if (!snapshot) return null;

    return {
      snapshot: snapshot as unknown as Snapshot,
      data: snapshot.graphData,
    };
  },
};
