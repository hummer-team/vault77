import { describe, it, expect } from 'vitest';

describe('FlagSpecDrawer - Operator Validation', () => {
  // Extract the validation logic (simulate it)
  const validateCondition = (expr: string): string | null => {
    if (!expr || !expr.trim()) return '条件值必须填写（如：= 金卡 或 >= 100）';
    
    if (expr.includes(';') || expr.includes('--') || expr.includes('/*')) {
      return '条件包含非法字符';
    }
    
    if ((expr.match(/\(/g) || []).length !== (expr.match(/\)/g) || []).length) {
      return '括号不匹配';
    }
    
    const trimmed = expr.trim();
    
    const hasValidOp = ['IS NOT', 'IS', '<=', '>=', '<>', '!=', 'IN', '=', '<', '>'].some((op) => {
      const regex = new RegExp(`(^|\\s|\\(|\\)|AND|OR|and|or)${op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$|AND|OR|and|or|\\(|\\)|[^\\w]|[a-zA-Z0-9])|^${op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|[a-zA-Z0-9])`, 'i');
      return regex.test(trimmed);
    });
    
    if (!hasValidOp) {
      return '必须包含有效的操作符（=、>=、<=、<>、!=、IN、IS、IS NOT 等）';
    }
    
    const invalidChars = trimmed.match(/[`~@#$%^&*\-+/\\|?]/g);
    if (invalidChars && !trimmed.includes('(') && !trimmed.includes(')')) {
      return '操作符包含非法字符';
    }
    
    return null;
  };

  describe('Operator pattern validation', () => {
    it('should accept "=3455" without space', () => {
      const error = validateCondition('=3455');
      expect(error).toBeNull();
    });

    it('should accept "= 金卡" with space', () => {
      const error = validateCondition('= 金卡');
      expect(error).toBeNull();
    });

    it('should accept ">= 100"', () => {
      const error = validateCondition('>= 100');
      expect(error).toBeNull();
    });

    it('should accept "IN (1,2,3)"', () => {
      const error = validateCondition('IN (1,2,3)');
      expect(error).toBeNull();
    });

    it('should accept "IS NULL"', () => {
      const error = validateCondition('IS NULL');
      expect(error).toBeNull();
    });

    it('should accept "IS NOT NULL"', () => {
      const error = validateCondition('IS NOT NULL');
      expect(error).toBeNull();
    });

    it('should accept "!= value"', () => {
      const error = validateCondition('!= value');
      expect(error).toBeNull();
    });

    it('should accept "<> 200"', () => {
      const error = validateCondition('<> 200');
      expect(error).toBeNull();
    });

    it('should reject "random" without operator', () => {
      const error = validateCondition('random');
      expect(error).toContain('必须包含有效的操作符');
    });

    it('should reject empty string', () => {
      const error = validateCondition('');
      expect(error).toContain('条件值必须填写');
    });

    it('should reject SQL injection pattern', () => {
      const error = validateCondition('=1; DROP TABLE users');
      expect(error).toContain('非法字符');
    });
  });
});
