import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { getCurrentWeekRange, getPreviousWeekRange } from '../lib/date';

describe('Weekly Pulse Date Boundaries', () => {
  it('handles mid-week (Wednesday)', () => {
    // 2026-09-02 is a Wednesday
    const ref = new Date(2026, 8, 2); 
    const current = getCurrentWeekRange(ref);
    assert.strictEqual(current.start, '2026-08-31'); // Monday
    assert.strictEqual(current.end, '2026-09-02'); // Today
    
    const prev = getPreviousWeekRange(ref);
    assert.strictEqual(prev.start, '2026-08-24'); // Previous Monday
    assert.strictEqual(prev.end, '2026-08-30'); // Previous Sunday
  });

  it('handles Monday boundary', () => {
    // 2026-08-31 is a Monday
    const ref = new Date(2026, 7, 31); 
    const current = getCurrentWeekRange(ref);
    assert.strictEqual(current.start, '2026-08-31');
    assert.strictEqual(current.end, '2026-08-31');
    
    const prev = getPreviousWeekRange(ref);
    assert.strictEqual(prev.start, '2026-08-24');
    assert.strictEqual(prev.end, '2026-08-30');
  });

  it('handles Sunday boundary', () => {
    // 2026-09-06 is a Sunday
    const ref = new Date(2026, 8, 6); 
    const current = getCurrentWeekRange(ref);
    assert.strictEqual(current.start, '2026-08-31');
    assert.strictEqual(current.end, '2026-09-06');
    
    const prev = getPreviousWeekRange(ref);
    assert.strictEqual(prev.start, '2026-08-24');
    assert.strictEqual(prev.end, '2026-08-30');
  });

  it('handles Month boundary', () => {
    // 2026-09-01 is Tuesday
    const ref = new Date(2026, 8, 1); 
    const current = getCurrentWeekRange(ref);
    assert.strictEqual(current.start, '2026-08-31');
    assert.strictEqual(current.end, '2026-09-01');
    
    const prev = getPreviousWeekRange(ref);
    assert.strictEqual(prev.start, '2026-08-24');
    assert.strictEqual(prev.end, '2026-08-30');
  });

  it('handles Year boundary', () => {
    // 2026-01-01 is Thursday
    const ref = new Date(2026, 0, 1); 
    const current = getCurrentWeekRange(ref);
    assert.strictEqual(current.start, '2025-12-29'); // Monday
    assert.strictEqual(current.end, '2026-01-01'); // Today
    
    const prev = getPreviousWeekRange(ref);
    assert.strictEqual(prev.start, '2025-12-22');
    assert.strictEqual(prev.end, '2025-12-28');
  });
});



