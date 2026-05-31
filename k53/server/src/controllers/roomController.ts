import { Request, Response } from 'express';
import { roomService } from '../services/roomService.js';
import { handleError } from '../utils/index.js';
import { AuthRequest } from '../middleware/auth.js';

export const roomController = {
  async createRoom(req: Request, res: Response): Promise<void> {
    try {
      const { name, password, userId, userName } = req.body;
      const result = await roomService.createRoom({ name, password, userId, userName });
      res.status(201).json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async joinRoom(req: Request, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;
      const { userId, userName, password } = req.body;
      const result = await roomService.joinRoom(String(roomId), { userId, userName, password });
      res.json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async getRoom(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;
      const userId = req.user?.userId;
      const result = await roomService.getRoom(String(roomId), userId);
      res.json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async listRooms(req: Request, res: Response): Promise<void> {
    try {
      const result = await roomService.listRooms();
      res.json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async leaveRoom(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const result = await roomService.leaveRoom(String(roomId), userId);
      res.json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async deleteRoom(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const result = await roomService.deleteRoom(String(roomId), userId);
      res.json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async getRoomStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;
      const result = await roomService.getRoomStats(String(roomId));
      res.json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async forkRoom(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;
      const { name, userId, userName, snapshotId, description } = req.body;
      const result = await roomService.forkRoom(String(roomId), { name, userId, userName, snapshotId, description });
      res.status(201).json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async listBranches(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;
      const result = await roomService.listBranches(String(roomId));
      res.json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },
};
