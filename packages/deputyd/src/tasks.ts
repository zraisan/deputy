/**
 * Delegation bookkeeping.
 *
 * The state names are A2A's, deliberately. A2A models exactly the two things a
 * browser agent hits constantly and other protocols have no word for: "I need a
 * decision from you" and "I need you to go and log in". Carrying its vocabulary
 * means the A2A face is a serialisation detail rather than a second model.
 */

export type TaskState =
  | 'submitted'
  | 'working'
  | 'input_required'
  | 'auth_required'
  | 'completed'
  | 'failed'
  | 'canceled';

export type Task = {
  id: string;
  goal: string;
  state: TaskState;
  steps: string[];
  createdAt: number;
  updatedAt: number;
  tabId?: number;
  /** Set while interrupted. */
  question?: string;
  resumeUrl?: string;
  answers: string[];
  artifact?: unknown;
  error?: string;
};

const TERMINAL: ReadonlySet<TaskState> = new Set(['completed', 'failed', 'canceled']);
const INTERRUPTED: ReadonlySet<TaskState> = new Set(['input_required', 'auth_required']);

export const isTerminal = (s: TaskState) => TERMINAL.has(s);
export const isInterrupted = (s: TaskState) => INTERRUPTED.has(s);

export class TaskStore {
  private tasks = new Map<string, Task>();
  private readonly max: number;

  constructor(opts: { max?: number } = {}) {
    this.max = opts.max ?? 200;
  }

  create(goal: string, tabId?: number): Task {
    const task: Task = {
      id: `t_${Math.random().toString(36).slice(2, 10)}`,
      goal,
      state: 'submitted',
      steps: [],
      answers: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tabId,
    };
    this.tasks.set(task.id, task);
    this.evict();
    return task;
  }

  get(id: string): Task | null {
    return this.tasks.get(id) ?? null;
  }

  private live(id: string): Task {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`No task ${id}. It may have finished long ago and been evicted.`);
    if (isTerminal(task.state)) {
      throw new Error(`Task ${id} already ${task.state}; it cannot be changed.`);
    }
    return task;
  }

  progress(id: string, step: string) {
    const task = this.live(id);
    task.state = 'working';
    task.steps.push(step);
    task.updatedAt = Date.now();
  }

  needsInput(id: string, question: string) {
    const task = this.live(id);
    task.state = 'input_required';
    task.question = question;
    task.updatedAt = Date.now();
  }

  needsAuth(id: string, question: string, resumeUrl?: string) {
    const task = this.live(id);
    task.state = 'auth_required';
    task.question = question;
    task.resumeUrl = resumeUrl;
    task.updatedAt = Date.now();
  }

  answer(id: string, answer: string) {
    const task = this.live(id);
    if (!isInterrupted(task.state)) {
      throw new Error(`Task ${id} is not waiting for anything (it is ${task.state}).`);
    }
    task.answers.push(answer);
    task.state = 'working';
    task.question = undefined;
    task.resumeUrl = undefined;
    task.updatedAt = Date.now();
  }

  complete(id: string, artifact: unknown) {
    const task = this.live(id);
    task.state = 'completed';
    task.artifact = artifact;
    task.updatedAt = Date.now();
    this.evict();
  }

  fail(id: string, error: string) {
    const task = this.live(id);
    task.state = 'failed';
    task.error = error;
    task.updatedAt = Date.now();
    this.evict();
  }

  cancel(id: string) {
    const task = this.live(id);
    task.state = 'canceled';
    task.updatedAt = Date.now();
    this.evict();
  }

  /** Drop the oldest *finished* tasks. A running task is never evicted. */
  private evict() {
    const finished = [...this.tasks.values()]
      .filter((t) => isTerminal(t.state))
      .sort((a, b) => a.updatedAt - b.updatedAt);
    let excess = finished.length - this.max;
    for (const task of finished) {
      if (excess-- <= 0) break;
      this.tasks.delete(task.id);
    }
  }
}
