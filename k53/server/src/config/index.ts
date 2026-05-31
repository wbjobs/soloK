import dotenv from 'dotenv';

dotenv.config();

interface Config {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  jwtSecret: string;
  jwtExpiresIn: string;
  databaseUrl: string;
  corsOrigin: string;
  wsPath: string;
  maxOperationsPerReplay: number;
  snapshotAutoSaveInterval: number;
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value !== undefined && value !== '') {
    return value;
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  throw new Error(`Environment variable ${key} is not set`);
}

function parsePort(portStr: string): number {
  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port number: ${portStr}`);
  }
  return port;
}

function parseNodeEnv(env: string): 'development' | 'production' | 'test' {
  if (env === 'development' || env === 'production' || env === 'test') {
    return env;
  }
  return 'development';
}

export const config: Config = {
  port: parsePort(getEnvVar('PORT', '3001')),
  nodeEnv: parseNodeEnv(getEnvVar('NODE_ENV', 'development')),
  jwtSecret: getEnvVar('JWT_SECRET', 'your-secret-key-here-change-in-production'),
  jwtExpiresIn: getEnvVar('JWT_EXPIRES_IN', '24h'),
  databaseUrl: getEnvVar('DATABASE_URL', 'postgresql://johndoe:randompassword@localhost:5432/mydb?schema=public'),
  corsOrigin: getEnvVar('CORS_ORIGIN', '*'),
  wsPath: getEnvVar('WS_PATH', '/ws'),
  maxOperationsPerReplay: parseInt(getEnvVar('MAX_OPERATIONS_PER_REPLAY', '10000'), 10),
  snapshotAutoSaveInterval: parseInt(getEnvVar('SNAPSHOT_AUTO_SAVE_INTERVAL', '300000'), 10),
};

export function validateConfig(): void {
  if (config.jwtSecret === 'your-secret-key-here-change-in-production' && config.nodeEnv === 'production') {
    console.warn('WARNING: Using default JWT secret in production environment!');
  }
  if (config.corsOrigin === '*' && config.nodeEnv === 'production') {
    console.warn('WARNING: Using permissive CORS in production environment!');
  }
}

validateConfig();
