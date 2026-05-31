import { Request, Response } from 'express';
import { operationService } from '../services/operationService.js';
import { handleError, parseNumber, parseString } from '../utils/index.js';
import { AuthRequest } from '../middleware/auth.js';

export const operationController = {
  async listOperations(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;
      const { from, to, limit, offset, memberId, operationType } = req.query;
      const result = await operationService.listOperations(String(roomId), {
        from: parseNumber(from),
        to: parseNumber(to),
        limit: parseNumber(limit),
        offset: parseNumber(offset),
        memberId: memberId as string,
        operationType: operationType as string,
      });
      res.json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async replayOperations(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;
      const { fromOperationId, toOperationId, fromTime, toTime } = req.body;
      const result = await operationService.replayOperations(String(roomId), {
        fromOperationId,
        toOperationId,
        fromTime,
        toTime,
      });
      res.json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async saveOperation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;
      const { operation } = req.body;
      if (!operation) {
        res.status(400).json({ error: 'Operation data required' });
        return;
      }
      const result = await operationService.saveOperation(String(roomId), operation);
      res.status(201).json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async saveOperations(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;
      const { operations } = req.body;
      if (!Array.isArray(operations)) {
        res.status(400).json({ error: 'Operations array required' });
        return;
      }
      const result = await operationService.saveOperations(String(roomId), operations);
      res.status(201).json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async getOperation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { operationId } = req.params;
      const result = await operationService.getOperation(String(operationId));
      res.json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async getOperationStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;
      const result = await operationService.getOperationStats(String(roomId));
      res.json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },

  async getOperationsByVersion(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { roomId, version } = req.params;
      const versionNum = parseNumber(Array.isArray(version) ? version[0] : version);
      if (versionNum === undefined) {
        res.status(400).json({ error: 'Valid version number required' });
        return;
      }
      const result = await operationService.getOperationsByVersion(String(roomId), versionNum);
      res.json(result);
    } catch (error) {
      const { statusCode, body } = handleError(error);
      res.status(statusCode).json(body);
    }
  },
};
