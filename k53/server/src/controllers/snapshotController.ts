import { Request, Response } from 'express';
import { snapshotService } from '../services/snapshotService.js';
import { handleError, parseNumber } from '../utils/index.js';
import { AuthRequest } from '../middleware/auth.js';

export const snapshotController = {
  async createSnapshot(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;
      const { name, description } = req.body;
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const result = await snapshotService.createSnapshot(String(roomId), { name, description }, userId);
      res.status(201).json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async listSnapshots(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;
      const { limit, offset } = req.query;
      const result = await snapshotService.listSnapshots(
        String(roomId),
        parseNumber(limit),
        parseNumber(offset)
      );
      res.json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async getSnapshot(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { snapshotId } = req.params;
      const result = await snapshotService.getSnapshot(String(snapshotId));
      res.json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async restoreSnapshot(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { snapshotId } = req.params;
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const result = await snapshotService.restoreSnapshot(String(snapshotId), userId);
      res.json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async exportSnapshot(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { snapshotId } = req.params;
      const result = await snapshotService.exportSnapshot(String(snapshotId));
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=snapshot-${snapshotId}.json`);
      res.json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async deleteSnapshot(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { snapshotId } = req.params;
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const result = await snapshotService.deleteSnapshot(String(snapshotId), userId);
      res.json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async updateSnapshot(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { snapshotId } = req.params;
      const { name, description } = req.body;
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const result = await snapshotService.updateSnapshot(String(snapshotId), userId, { name, description });
      res.json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async queryGraphData(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { snapshotId } = req.params;
      const { nodeId, edgeId, metadataKey } = req.query;
      const result = await snapshotService.queryGraphData(String(snapshotId), {
        nodeId: nodeId as string,
        edgeId: edgeId as string,
        metadataKey: metadataKey as string,
      });
      res.json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async searchSnapshots(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        res.status(400).json({ error: 'Search query required' });
        return;
      }
      const result = await snapshotService.searchSnapshots(String(roomId), q);
      res.json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async getLatestSnapshot(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;
      const result = await snapshotService.getLatestSnapshot(String(roomId));
      res.json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },
};
