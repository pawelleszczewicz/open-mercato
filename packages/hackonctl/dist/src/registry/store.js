import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { formatTaskId } from "./id.js";
class RegistryStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = this.load();
  }
  load() {
    if (!existsSync(this.filePath)) {
      return { version: 1, nextTaskNumber: 1, tasks: [] };
    }
    try {
      const content = readFileSync(this.filePath, "utf-8");
      return JSON.parse(content);
    } catch {
      return { version: 1, nextTaskNumber: 1, tasks: [] };
    }
  }
  save() {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2) + "\n");
  }
  getAll() {
    return this.data.tasks;
  }
  getById(taskId) {
    return this.data.tasks.find((t) => t.taskId === taskId);
  }
  getByPrNumber(prNumber) {
    return this.data.tasks.find((t) => t.prNumber === prNumber);
  }
  getByLane(lane) {
    return this.data.tasks.filter((t) => t.lane === lane && !t.abandoned);
  }
  getActive() {
    return this.data.tasks.filter((t) => !t.abandoned);
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
    this.data.tasks.push(task);
    this.save();
    return task;
  }
  updateTask(taskId, updates) {
    const task = this.getById(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    Object.assign(task, updates);
    this.save();
    return task;
  }
  addNote(taskId, note) {
    const task = this.getById(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    task.notes.push(`[${(/* @__PURE__ */ new Date()).toISOString()}] ${note}`);
    this.save();
  }
  get nextTaskNumber() {
    return this.data.nextTaskNumber;
  }
}
export {
  RegistryStore
};
//# sourceMappingURL=store.js.map
