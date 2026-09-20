import { describe, test, expect, spyOn, beforeEach, afterEach } from 'bun:test';
import { logger } from '../../utils/logger';
import { logger } from '../logger';

describe('logger', () => {
  let consoleInfoSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;
  let consoleDebugSpy: any;

  beforeEach(() => {
    consoleInfoSpy = spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    consoleDebugSpy = spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  test('info should call console.info with formatted message', () => {
    logger.info('test message');
    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    const logStr = consoleInfoSpy.mock.calls[0][0];
    expect(logStr).toContain('INFO');
    expect(logStr).toContain('test message');
  });

  test('warn should call logger.warn(not console.info)', () => {
    logger.warn('warning message');
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleInfoSpy).not.toHaveBeenCalled();
    const logStr = consoleWarnSpy.mock.calls[0][0];
    expect(logStr).toContain('WARN');
    expect(logStr).toContain('warning message');
  });

  test('error should call logger.error(not console.info)', () => {
    logger.error('error message');
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleInfoSpy).not.toHaveBeenCalled();
    const logStr = consoleErrorSpy.mock.calls[0][0];
    expect(logStr).toContain('ERROR');
    expect(logStr).toContain('error message');
  });

  test('debug should call console.debug when in dev mode', () => {
    // import.meta.env.DEV is true in test environment
    logger.debug('debug message');
    expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
    expect(consoleInfoSpy).not.toHaveBeenCalled();
    const logStr = consoleDebugSpy.mock.calls[0][0];
    expect(logStr).toContain('DEBUG');
    expect(logStr).toContain('debug message');
  });

  test('should handle variadic args with objects', () => {
    logger.info('test', { key: 'value' });
    const logStr = consoleInfoSpy.mock.calls[0][0];
    expect(logStr).toContain('test');
    expect(logStr).toContain('{"key":"value"}');
  });

  test('should serialize Error objects to {message, stack}', () => {
    const error = new Error('test error');
    logger.error('caught error', error);
    const logStr = consoleErrorSpy.mock.calls[0][0];
    expect(logStr).toContain('caught error');
    expect(logStr).toContain('"message":"test error"');
    expect(logStr).toContain('"stack":');
  });

  test('should handle multiple variadic args', () => {
    logger.info('msg', 'arg1', 42, { x: 1 });
    const logStr = consoleInfoSpy.mock.calls[0][0];
    expect(logStr).toContain('msg');
    expect(logStr).toContain('arg1');
    expect(logStr).toContain('42');
    expect(logStr).toContain('{"x":1}');
  });

  test('backward compatible: single string argument', () => {
    logger.info('simple message');
    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    const logStr = consoleInfoSpy.mock.calls[0][0];
    expect(logStr).toContain('simple message');
  });
});
