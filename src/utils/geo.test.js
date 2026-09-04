import { getDistanceKm } from './geo';

describe('getDistanceKm', () => {
  test('returns 0 for identical coordinates', () => {
    expect(getDistanceKm(-34.6037, -58.3816, -34.6037, -58.3816)).toBeCloseTo(0);
  });

  test('returns the known distance between Buenos Aires and Córdoba (~650km)', () => {
    const dist = getDistanceKm(-34.6037, -58.3816, -31.4201, -64.1888);
    expect(dist).toBeGreaterThan(600);
    expect(dist).toBeLessThan(700);
  });
});
