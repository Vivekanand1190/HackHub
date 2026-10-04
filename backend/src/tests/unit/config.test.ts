import { config } from '../../config';

describe('Unit Test: Backend Config', () => {
  it('should have standard configuration keys defined', () => {
    expect(config).toBeDefined();
    expect(config.port).toBeDefined();
    expect(Array.isArray(config.corsOrigins)).toBe(true);
    expect(config.jwtSecret).toBeDefined();
    expect(config.jwtSecret.length).toBeGreaterThan(0);
  });

  it('should include localhost:3000 in CORS origins by default', () => {
    expect(config.corsOrigins).toContain('http://localhost:3000');
  });
});
