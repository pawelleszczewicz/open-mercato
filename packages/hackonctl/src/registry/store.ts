import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { TaskRecord, TaskRegistry } from './types'
import { EMPTY_REGISTRY } from './types'
import { formatTaskId } from './id'
import type { Lane } from '../config/schema'
import type { RiskZone, DuplicateRisk, TaskSource } from './types'

export class RegistryStore {
  private data: TaskRegistry

  constructor(private readonly filePath: string) {
    this.data = this.load()
  }

  private load(): TaskRegistry {
    if (!existsSync(this.filePath)) {
      return { version: 1, nextTaskNumber: 1, tasks: [] }
    }
    try {
      const content = readFileSync(this.filePath, 'utf-8')
      return JSON.parse(content) as TaskRegistry
    } catch {
      return { version: 1, nextTaskNumber: 1, tasks: [] }
    }
  }

  save(): void {
    const dir = dirname(this.filePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2) + '\n')
  }

  getAll(): readonly TaskRecord[] {
    return this.data.tasks
  }

  getById(taskId: string): TaskRecord | undefined {
    return this.data.tasks.find(t => t.taskId === taskId)
  }

  getByPrNumber(prNumber: number): TaskRecord | undefined {
    return this.data.tasks.find(t => t.prNumber === prNumber)
  }

  getByLane(lane: Lane): TaskRecord[] {
    return this.data.tasks.filter(t => t.lane === lane && !t.abandoned)
  }

  getActive(): TaskRecord[] {
    return this.data.tasks.filter(t => !t.abandoned)
  }

  createTask(params: {
    source: TaskSource
    lane: Lane
    riskZone: RiskZone
    branchName: string
    expectedClasses: string[]
    duplicateRisk: DuplicateRisk
  }): TaskRecord {
    const taskId = formatTaskId(this.data.nextTaskNumber)
    this.data.nextTaskNumber++

    const task: TaskRecord = {
      taskId,
      source: params.source,
      lane: params.lane,
      riskZone: params.riskZone,
      branchName: params.branchName,
      prNumber: null,
      expectedClasses: params.expectedClasses,
      duplicateRisk: params.duplicateRisk,
      abandoned: false,
      createdAt: new Date().toISOString(),
      notes: [],
    }

    this.data.tasks.push(task)
    this.save()
    return task
  }

  updateTask(taskId: string, updates: Partial<Pick<TaskRecord, 'prNumber' | 'abandoned' | 'notes' | 'duplicateRisk'>>): TaskRecord {
    const task = this.getById(taskId)
    if (!task) {
      throw new Error(`Task not found: ${taskId}`)
    }
    Object.assign(task, updates)
    this.save()
    return task
  }

  addNote(taskId: string, note: string): void {
    const task = this.getById(taskId)
    if (!task) {
      throw new Error(`Task not found: ${taskId}`)
    }
    task.notes.push(`[${new Date().toISOString()}] ${note}`)
    this.save()
  }

  get nextTaskNumber(): number {
    return this.data.nextTaskNumber
  }
}
