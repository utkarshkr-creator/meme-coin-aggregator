import { CONSTANTS } from '../config/constants';

export interface CursorData {
  offset: number;
  timestamp: number;
}

export function encodeCursor(data: CursorData): string {
  const json = JSON.stringify(data);
  return Buffer.from(json).toString('base64');
}

export function decodeCursor(cursor: string): CursorData {
  try {
    const json = Buffer.from(cursor, 'base64').toString('utf-8');
    return JSON.parse(json);
  } catch (error) {
    throw new Error('Invalid cursor format');
  }
}

export function validateLimit(limit?: number): number {
  if (!limit) return CONSTANTS.DEFAULT_PAGE_LIMIT;
  
  const parsed = parseInt(String(limit), 10);
  
  if (isNaN(parsed) || parsed < 1) {
    return CONSTANTS.DEFAULT_PAGE_LIMIT;
  }
  
  return Math.min(parsed, CONSTANTS.MAX_PAGE_LIMIT);
}
