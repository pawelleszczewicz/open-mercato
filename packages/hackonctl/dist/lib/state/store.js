import path from "node:path";
import { ensureDir, readJsonFile, withFileLock, writeJsonFileAtomic } from "../fs.js";
import { taskRecordSchema, stateMetaSchema } from "./model.js";
import { assertTransition } from "./transitions.js";
class StateStore {
  constructor(runtimePaths) {
    this.runtimePaths = runtimePaths;
  }
  async initialize() {
    await ensureDir(this.runtimePaths.stateDir);
    await ensureDir(this.runtimePaths.stateTasksDir);
    await ensureDir(this.runtimePaths.stateLocksDir);
    const meta = await this.readMeta();
    if (!meta) {
      await writeJsonFileAtomic(this.runtimePaths.stateMetaFilePath, { nextTaskNumber: 1 });
    }
  }
  async createTask(task) {
    await this.initialize();
    const lockPath = path.join(this.runtimePaths.stateLocksDir, `${task.taskId}.lock`);
    await withFileLock(lockPath, async () => {
      await this.writeTask(task);
    });
    return task;
  }
  async nextTaskId() {
    await this.initialize();
    const lockPath = path.join(this.runtimePaths.stateLocksDir, "sequence.lock");
    return withFileLock(lockPath, async () => {
      const current = await this.readMeta() ?? { nextTaskNumber: 1 };
      const taskId = `HCK-${String(current.nextTaskNumber).padStart(4, "0")}`;
      const nextMeta = { nextTaskNumber: current.nextTaskNumber + 1 };
      await writeJsonFileAtomic(this.runtimePaths.stateMetaFilePath, nextMeta);
      return taskId;
    });
  }
  async getTask(taskId) {
    const filePath = this.getTaskFilePath(taskId);
    const raw = await readJsonFile(filePath);
    if (!raw) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return taskRecordSchema.parse(raw);
  }
  async listTasks() {
    await this.initialize();
    const entries = await import("node:fs/promises").then((fs) => fs.readdir(this.runtimePaths.stateTasksDir, { withFileTypes: true }));
    const tasks = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const raw = await readJsonFile(path.join(this.runtimePaths.stateTasksDir, entry.name));
      if (!raw) continue;
      tasks.push(taskRecordSchema.parse(raw));
    }
    return tasks.sort((left, right) => left.taskId.localeCompare(right.taskId));
  }
  async transitionTask(taskId, nextState, options) {
    const lockPath = path.join(this.runtimePaths.stateLocksDir, `${taskId}.lock`);
    return withFileLock(lockPath, async () => {
      const task = await this.getTask(taskId);
      assertTransition(task.state, nextState);
      let nextTask = {
        ...task,
        state: nextState,
        lastCoordinatorDecision: options.decision ?? task.lastCoordinatorDecision,
        blockers: options.blockers ?? task.blockers,
        eventLog: [...task.eventLog, options.event],
        updatedAt: options.event.at
      };
      if (options.mutate) {
        nextTask = options.mutate(nextTask);
      }
      await this.writeTask(nextTask);
      return nextTask;
    });
  }
  async saveTask(task) {
    const lockPath = path.join(this.runtimePaths.stateLocksDir, `${task.taskId}.lock`);
    await withFileLock(lockPath, async () => {
      await this.writeTask(task);
    });
    return task;
  }
  async readMeta() {
    const raw = await readJsonFile(this.runtimePaths.stateMetaFilePath);
    return raw ? stateMetaSchema.parse(raw) : null;
  }
  async writeTask(task) {
    await ensureDir(this.runtimePaths.stateTasksDir);
    await writeJsonFileAtomic(this.getTaskFilePath(task.taskId), taskRecordSchema.parse(task));
  }
  getTaskFilePath(taskId) {
    return path.join(this.runtimePaths.stateTasksDir, `${taskId}.json`);
  }
}
export {
  StateStore
};
//# sourceMappingURL=store.js.map
