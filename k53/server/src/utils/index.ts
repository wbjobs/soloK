import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { JWTPayload } from '../types/index.js';
import { randomUUID } from 'crypto';

export function generateId(): string {
  return randomUUID();
}

export function generateShortId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function getRandomColor(): string {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];
  return colors[Math.floor(Math.random() * colors.length)];
}

export function isValidRoomId(roomId: string): boolean {
  return typeof roomId === 'string' && roomId.length > 0;
}

export function isValidUserId(userId: string): boolean {
  return typeof userId === 'string' && userId.length > 0;
}

export function generateToken(roomId: string, userId: string): string {
  const payload: JWTPayload = { roomId, userId };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn as any });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.split(' ')[1];
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly details?: any;

  constructor(message: string, statusCode: number = 500, code?: string, details?: any) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function handleError(error: unknown): { statusCode: number; body: { error: string; code?: string; details?: any } } {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: error.message,
        code: error.code,
        details: error.details,
      },
    };
  }

  if (error instanceof Error) {
    return {
      statusCode: 500,
      body: {
        error: error.message,
      },
    };
  }

  return {
    statusCode: 500,
    body: {
      error: 'An unexpected error occurred',
    },
  };
}

export function validateRequiredFields(data: Record<string, any>, requiredFields: string[]): string | null {
  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      return `Missing required field: ${field}`;
    }
  }
  return null;
}

export function parseDate(timestamp: number | string | undefined): Date | undefined {
  if (timestamp === undefined || timestamp === null) {
    return undefined;
  }
  const date = new Date(timestamp);
  return isNaN(date.getTime()) ? undefined : date;
}

export function parseNumber(value: string | number | undefined | any): number | undefined {
  if (value === undefined || value === null || typeof value === 'object') {
    return undefined;
  }
  const num = Number(value);
  return isNaN(num) ? undefined : num;
}

export function parseString(value: string | undefined | any): string | undefined {
  if (value === undefined || value === null || typeof value !== 'string') {
    return undefined;
  }
  return value;
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function formatDate(date: Date): string {
  return date.toISOString();
}

export function getCurrentTimestamp(): number {
  return Date.now();
}
