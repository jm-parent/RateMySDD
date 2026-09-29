import { describe, expect, it, vi } from 'vitest';
import {
  getDiagnosticEvents,
  isDiagnosticsAuthorized,
  recordDiagnosticEvent,
} from '../../src/server/diagnostics.js';

function diagnosticEvent(index: number, message: string) {
  return {
    timestamp: new Date(Date.UTC(2026, 8, 29, 10, 0, index)).toISOString(),
    requestId: `diagnostic-test-${index}`,
    source: 'request' as const,
    errorType: 'Error',
    message,
  };
}

describe('runtime diagnostics', () => {
  it('authorizes only an exact non-empty diagnostics token', () => {
    expect(isDiagnosticsAuthorized('admin-token', 'admin-token')).toBe(true);
    expect(isDiagnosticsAuthorized('wrong-token', 'admin-token')).toBe(false);
    expect(isDiagnosticsAuthorized('', 'admin-token')).toBe(false);
    expect(isDiagnosticsAuthorized('admin-token', '')).toBe(false);
  });

  it('redacts secret environment values and retains only the latest 20 events', () => {
    const redisToken = 'redis-secret-used-in-error';
    const encryptionKey = 'ab'.repeat(32);
    const diagnosticsToken = 'diagnostics-secret-used-in-error';
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', redisToken);
    vi.stubEnv('SESSION_ENCRYPTION_KEY', encryptionKey);
    vi.stubEnv('DIAGNOSTICS_TOKEN', diagnosticsToken);

    recordDiagnosticEvent(
      diagnosticEvent(
        0,
        `provider error ${redisToken} ${encryptionKey} ${diagnosticsToken}`,
      ),
    );
    for (let index = 1; index <= 20; index += 1) {
      recordDiagnosticEvent(diagnosticEvent(index, `failure ${index}`));
    }

    const events = getDiagnosticEvents();
    expect(events).toHaveLength(20);
    expect(events[0]?.requestId).toBe('diagnostic-test-1');
    expect(events.at(-1)?.requestId).toBe('diagnostic-test-20');
    expect(JSON.stringify(events)).not.toContain(redisToken);
    expect(JSON.stringify(events)).not.toContain(encryptionKey);
    expect(JSON.stringify(events)).not.toContain(diagnosticsToken);
  });
});