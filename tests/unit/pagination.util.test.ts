import { encodeCursor, decodeCursor, validateLimit } from '../../src/utils/pagination.util';

describe('Pagination Utils', () => {
  describe('encodeCursor and decodeCursor', () => {
    it('should encode and decode cursor', () => {
      const data = { offset: 20, timestamp: Date.now() };
      const encoded = encodeCursor(data);
      const decoded = decodeCursor(encoded);

      expect(decoded).toEqual(data);
    });

    it('should throw error for invalid cursor', () => {
      expect(() => decodeCursor('invalid')).toThrow('Invalid cursor format');
    });
  });

  describe('validateLimit', () => {
    it('should return default limit when undefined', () => {
      expect(validateLimit()).toBe(20);
    });

    it('should return parsed limit within bounds', () => {
      expect(validateLimit(50)).toBe(50);
    });

    it('should cap at max limit', () => {
      expect(validateLimit(200)).toBe(100);
    });

    it('should return default for invalid input', () => {
      expect(validateLimit(-5)).toBe(20);
      expect(validateLimit(NaN)).toBe(20);
    });
  });
});
