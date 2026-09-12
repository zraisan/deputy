import { describe, expect, test } from 'bun:test';
import { TaskStore, isTerminal, isInterrupted } from '../src/tasks';

describe('task lifecycle', () => {
  test('a new task starts submitted and has an id', () => {
    const s = new TaskStore();
    const t = s.create('book a table');
    expect(t.state).toBe('submitted');
    expect(t.id).toMatch(/^t_[a-z0-9]+$/);
    expect(t.goal).toBe('book a table');
  });

  test('progress is recorded as a readable trail, not a blob', () => {
    const s = new TaskStore();
    const t = s.create('find a drill');
    s.progress(t.id, 'looking at the current page');
    s.progress(t.id, 'calling search_products');
    expect(s.get(t.id)!.state).toBe('working');
    expect(s.get(t.id)!.steps).toEqual(['looking at the current page', 'calling search_products']);
  });

  test('completing stores the artifact', () => {
    const s = new TaskStore();
    const t = s.create('x');
    s.complete(t.id, { found: 3 });
    expect(s.get(t.id)!.state).toBe('completed');
    expect(s.get(t.id)!.artifact).toEqual({ found: 3 });
  });

  test('failing stores a reason a human can act on', () => {
    const s = new TaskStore();
    const t = s.create('x');
    s.fail(t.id, 'the tab was closed');
    expect(s.get(t.id)!.state).toBe('failed');
    expect(s.get(t.id)!.error).toBe('the tab was closed');
  });
});

describe('the states that make this a browser agent', () => {
  test('a decision only a human can make parks the task', () => {
    const s = new TaskStore();
    const t = s.create('buy it');
    s.needsInput(t.id, 'Confirm the £240 purchase?');
    expect(s.get(t.id)!.state).toBe('input_required');
    expect(s.get(t.id)!.question).toBe('Confirm the £240 purchase?');
  });

  test('a login wall is a distinct state from a question', () => {
    // A2A separates these, and so should we: one needs a decision,
    // the other needs the human to go and *do* something first.
    const s = new TaskStore();
    const t = s.create('check my orders');
    s.needsAuth(t.id, 'Sign in to continue', 'https://shop.test/login');
    expect(s.get(t.id)!.state).toBe('auth_required');
    expect(s.get(t.id)!.resumeUrl).toBe('https://shop.test/login');
  });

  test('answering an interrupted task puts it back to work', () => {
    const s = new TaskStore();
    const t = s.create('buy it');
    s.needsInput(t.id, 'Confirm?');
    s.answer(t.id, 'yes');
    expect(s.get(t.id)!.state).toBe('working');
    expect(s.get(t.id)!.answers).toEqual(['yes']);
  });

  test('answering a task that is not waiting is refused', () => {
    const s = new TaskStore();
    const t = s.create('x');
    expect(() => s.answer(t.id, 'yes')).toThrow(/not waiting/i);
  });

  test('a finished task cannot be resurrected', () => {
    const s = new TaskStore();
    const t = s.create('x');
    s.complete(t.id, 'done');
    expect(() => s.progress(t.id, 'more')).toThrow(/completed/i);
  });
});

describe('state classification', () => {
  test('terminal states are terminal', () => {
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('canceled')).toBe(true);
    expect(isTerminal('working')).toBe(false);
    expect(isTerminal('input_required')).toBe(false);
  });

  test('interrupted states are the ones a human unblocks', () => {
    expect(isInterrupted('input_required')).toBe(true);
    expect(isInterrupted('auth_required')).toBe(true);
    expect(isInterrupted('working')).toBe(false);
    expect(isInterrupted('completed')).toBe(false);
  });
});

describe('housekeeping', () => {
  test('unknown ids return null rather than throwing', () => {
    expect(new TaskStore().get('t_nope')).toBeNull();
  });

  test('cancelling works from any live state', () => {
    const s = new TaskStore();
    const t = s.create('x');
    s.needsInput(t.id, 'Confirm?');
    s.cancel(t.id);
    expect(s.get(t.id)!.state).toBe('canceled');
  });

  test('old finished tasks are evicted so the daemon does not grow forever', () => {
    const s = new TaskStore({ max: 3 });
    const ids = [1, 2, 3, 4].map((i) => { const t = s.create(`goal ${i}`); s.complete(t.id, i); return t.id; });
    expect(s.get(ids[0]!)).toBeNull();
    expect(s.get(ids[3]!)).not.toBeNull();
  });

  test('live tasks are never evicted, however old', () => {
    const s = new TaskStore({ max: 2 });
    const live = s.create('still going');
    for (let i = 0; i < 5; i++) { const t = s.create(`x${i}`); s.complete(t.id, i); }
    expect(s.get(live.id)).not.toBeNull();
  });
});
