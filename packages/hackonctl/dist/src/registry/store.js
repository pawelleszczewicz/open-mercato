import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { formatTaskId } from "./id.js";
import { EMPTY_REGISTRY } from "./types.js";
class RegistryStore {
  constructor(basePath, registryFile) {
    this.registryPath = resolve(basePath, registryFile);
    this.data = this.load();
  }
  load() {
    if (!existsSync(this.registryPath)) {
      return { ...EMPTY_REGISTRY, tasks: {} };
    }
    const raw = readFileSync(this.registryPath, "utf-8");
    return JSON.parse(raw);
  }
  save() {
    const dir = dirname(this.registryPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.registryPath, JSON.stringify(this.data, null, 2) + "\n");
  }
  createTask(params) {
    const taskId = formatTaskId(this.data.nextTaskNumber);
    this.data.nextTaskNumber++;
    const task = {
      taskId,
      source: params.source,
      lane: params.lane,
      riskZone: params.riskZone,
      branchName: params.branchName,
      prNumber: null,
      expectedClasses: params.expectedClasses,
      duplicateRisk: params.duplicateRisk,
      abandoned: false,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      notes: []
    };
    this.data.tasks[taskId] = task;
    this.save();
    return task;
  }
  getTask(taskId) {
    return this.data.tasks[taskId];
  }
  getAllTasks() {
    return Object.values(this.data.tasks);
  }
  getActiveTasks() {
    return this.getAllTasks().filter((t) => !t.abandoned);
  }
  getActiveTasksByLane(lane) {
    return this.getActiveTasks().filter((t) => t.lane === lane);
  }
  updateTask(taskId, updates) {
    const task = this.data.tasks[taskId];
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    Object.assign(task, updates);
    this.save();
    return task;
  }
  addNote(taskId, note) {
    const task = this.data.tasks[taskId];
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    task.notes.push(note);
    this.save();
  }
  getNextTaskNumber() {
    return this.data.nextTaskNumber;
  }
  hasTaskForSource(sourceType, sourceId) {
    return this.getActiveTasks().some(
      (t) => t.source.type === sourceType && t.source.id === sourceId
    );
  }
}
export {
  RegistryStore
};
//# sourceMappingURL=store.js.map
