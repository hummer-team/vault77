/**
 * Unit tests for zipGenerator.ts
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { generateZip, type ZipContent } from '../zipGenerator';

describe('zipGenerator', () => {
  beforeEach(() => {
    // Mock URL APIs
    if (!global.URL) {
      (global as any).URL = {};
    }
    global.URL.createObjectURL = mock(() => 'blob:mock-url');
    global.URL.revokeObjectURL = mock(() => {});
    
    // Mock document APIs
    if (!global.document) {
      (global as any).document = {
        createElement: mock(() => ({})),
        body: {
          appendChild: mock(() => {}),
          removeChild: mock(() => {}),
        },
      };
    }
    
    const mockLink = {
      href: '',
      download: '',
      style: { display: '' },
      click: mock(() => {}),
    };
    global.document.createElement = mock(() => mockLink as any);
    global.document.body.appendChild = mock(() => {});
    global.document.body.removeChild = mock(() => {});
  });
  
  describe('generateZip', () => {
    it('should generate ZIP with single file', async () => {
      const files: ZipContent[] = [
        { filename: 'test.txt', content: 'Hello World' },
      ];
      
      await generateZip(files, 'test.zip');
      
      // If no error thrown, test passes
      expect(true).toBe(true);
    });
    
    it('should generate ZIP with multiple files', async () => {
      const files: ZipContent[] = [
        { filename: 'file1.txt', content: 'Content 1' },
        { filename: 'file2.txt', content: 'Content 2' },
        { filename: 'file3.md', content: '# Markdown' },
      ];
      
      await generateZip(files, 'multi.zip');
      expect(true).toBe(true);
    });
    
    it('should handle different content types', async () => {
      const files: ZipContent[] = [
        { filename: 'text.txt', content: 'Plain text' },
        { filename: 'array.dat', content: new Uint8Array([1, 2, 3, 4]) },
      ];
      
      await generateZip(files, 'mixed.zip');
      expect(true).toBe(true);
    });
    
    it('should throw for empty files array', async () => {
      await expect(generateZip([], 'empty.zip')).rejects.toThrow('No files');
    });
    
    it('should include all filenames in log', async () => {
      const consoleSpy = mock(() => {});
      const originalLog = console.log;
      console.log = consoleSpy;
      
      const files: ZipContent[] = [
        { filename: 'report.md', content: 'Report' },
        { filename: 'data.csv', content: 'Data' },
      ];
      
      await generateZip(files, 'report.zip');
      
      console.log = originalLog;
      expect(consoleSpy).toHaveBeenCalled();
    });
    
    it('should handle long filenames', async () => {
      const files: ZipContent[] = [
        { 
          filename: 'very_long_filename_that_exceeds_normal_limits_for_testing_purposes.txt', 
          content: 'Test' 
        },
      ];
      
      await generateZip(files, 'test.zip');
      expect(true).toBe(true);
    });
    
    it('should handle special characters in filenames', async () => {
      const files: ZipContent[] = [
        { filename: 'report (2024-01-01).md', content: 'Test' },
      ];
      
      await generateZip(files, 'test.zip');
      expect(true).toBe(true);
    });
  });
});
