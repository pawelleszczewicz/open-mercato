import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { RegistryStore } from '../registry/store'
import { formatTaskId, parseTaskId } from '../registry/id'

describe('formatTaskId', () => {
  it('formats single-digit numbers with zero padding', () => {
    expect(formatTaskId(1)).toBe('HCK-0001')
    expect(formatTaskId(9)).toBe('HCK-0009')
  })

  it('formats multi-digit numbers', () => {
    expect(formatTaskId(42)).toBe('HCK-0042')
    expect(formatTaskId(100)).toBe('HCK-0100')
    expect(formatTaskId(9999)).toBe('HCK-9999')
  })

  it('handles numbers beyond 4 digits', () => {
    expect(formatTaskId(10000)).toBe('HCK-10000')
  })
})

describe('parseTaskId', () => {
  it('parses valid task IDs', () => {
    expect(parseTaskId('HCK-0001')).toBe(1)
    expect(parseTaskId('HCK-0042')).toBe(42)
    expect(parseTaskId('HCK-10000')).toBe(10000)
  })

  it('returns null for invalid IDs', () => {
    expect(parseTaskId('INVALID')).toBeNull()
    expect(parseTaskId('HCK-')).toBeNull()
    expect(parseTaskId('HCK-abc')).toBeNull()
    expect(parseTaskId('')).toBeNull()
  })
})

describe('RegistryStore', () => {
  let tmpDirs: string[] = []

  function freshRegistryPath(): string {
    const dir = mkdtempSync(join(tmpdir(), 'hackonctl-test-'))
    tmpDirs.push(dir)
    return join(dir, 'registry.json')
  }

  afterAll(() => {
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('creates empty registry when file does not exist', () => {
    const store = new RegistryStore(freshRegistryPath())
    expect(store.getAll()).toHaveLength(0)
    expect(store.nextTaskNumber).toBe(1)
  })

  it('creates a task and auto-increments ID', () => {
    const store = new RegistryStore(freshRegistryPath())

    const task1 = store.createTask({
      source: { type: 'github_issue', id: '123', title: 'Fix login bug' },
      lane: 'simple_bugs',
      riskZone: 'green',
      branchName: 'fix/hackon/hck-0001-login-bug',
      expectedClasses: ['bugfix'],
      duplicateRisk: 'none',
    })

    expect(task1.taskId).toBe('HCK-0001')
    expect(task1.lane).toBe('simple_bugs')
    expect(task1.prNumber).toBeNull()
    expect(task1.abandoned).toBe(false)

    const task2 = store.createTask({
      source: { type: 'repo_signal', id: 'TESTSIG-001', title: 'Missing test' },
      lane: 'tests',
      riskZone: 'green',
      branchName: 'test/hackon/hck-0002-missing-test',
      expectedClasses: ['tests'],
      duplicateRisk: 'none',
    })

    expect(task2.taskId).toBe('HCK-0002')
    expect(store.getAll()).toHaveLength(2)
  })

  it('persists to disk and reloads', () => {
    const registryPath = freshRegistryPath()
    const store1 = new RegistryStore(registryPath)
    store1.createTask({
      source: { type: 'github_issue', id: '456', title: 'Test task' },
      lane: 'docs',
      riskZone: 'green',
      branchName: 'docs/hackon/hck-0001-test',
      expectedClasses: ['docs'],
      duplicateRisk: 'none',
    })

    const store2 = new RegistryStore(registryPath)
    expect(store2.getAll()).toHaveLength(1)
    expect(store2.getAll()[0].taskId).toBe('HCK-0001')
    expect(store2.nextTaskNumber).toBe(2)
  })

  it('updates task fields', () => {
    const store = new RegistryStore(freshRegistryPath())
    store.createTask({
      source: { type: 'github_issue', id: '789', title: 'Bug' },
      lane: 'simple_bugs',
      riskZone: 'green',
      branchName: 'fix/hackon/hck-0001-bug',
      expectedClasses: ['bugfix'],
      duplicateRisk: 'none',
    })

    const updated = store.updateTask('HCK-0001', { prNumber: 42 })
    expect(updated.prNumber).toBe(42)

    const abandoned = store.updateTask('HCK-0001', { abandoned: true })
    expect(abandoned.abandoned).toBe(true)
  })

  it('filters by lane', () => {
    const store = new RegistryStore(freshRegistryPath())
    store.createTask({
      source: { type: 'repo_signal', id: 'a', title: 'A' },
      lane: 'tests',
      riskZone: 'green',
      branchName: 'test/a',
      expectedClasses: ['tests'],
      duplicateRisk: 'none',
    })
    store.createTask({
      source: { type: 'repo_signal', id: 'b', title: 'B' },
      lane: 'docs',
      riskZone: 'green',
      branchName: 'docs/b',
      expectedClasses: ['docs'],
      duplicateRisk: 'none',
    })
    store.createTask({
      source: { type: 'repo_signal', id: 'c', title: 'C' },
      lane: 'tests',
      riskZone: 'green',
      branchName: 'test/c',
      expectedClasses: ['tests'],
      duplicateRisk: 'none',
    })

    expect(store.getByLane('tests')).toHaveLength(2)
    expect(store.getByLane('docs')).toHaveLength(1)
    expect(store.getByLane('simple_bugs')).toHaveLength(0)
  })

  it('excludes abandoned tasks from getByLane and getActive', () => {
    const store = new RegistryStore(freshRegistryPath())
    store.createTask({
      source: { type: 'repo_signal', id: 'x', title: 'X' },
      lane: 'tests',
      riskZone: 'green',
      branchName: 'test/x',
      expectedClasses: ['tests'],
      duplicateRisk: 'none',
    })
    store.updateTask('HCK-0001', { abandoned: true })

    expect(store.getByLane('tests')).toHaveLength(0)
    expect(store.getActive()).toHaveLength(0)
    expect(store.getAll()).toHaveLength(1)
  })

  it('adds notes with timestamp', () => {
    const store = new RegistryStore(freshRegistryPath())
    store.createTask({
      source: { type: 'github_issue', id: '1', title: 'T' },
      lane: 'docs',
      riskZone: 'green',
      branchName: 'docs/t',
      expectedClasses: ['docs'],
      duplicateRisk: 'none',
    })

    store.addNote('HCK-0001', 'Manual review needed')
    const task = store.getById('HCK-0001')
    expect(task?.notes).toHaveLength(1)
    expect(task?.notes[0]).toContain('Manual review needed')
  })

  it('throws on update/addNote for unknown task', () => {
    const store = new RegistryStore(freshRegistryPath())
    expect(() => store.updateTask('HCK-9999', { prNumber: 1 })).toThrow('Task not found')
    expect(() => store.addNote('HCK-9999', 'note')).toThrow('Task not found')
  })

  it('looks up by PR number', () => {
    const store = new RegistryStore(freshRegistryPath())
    store.createTask({
      source: { type: 'github_issue', id: '1', title: 'T' },
      lane: 'docs',
      riskZone: 'green',
      branchName: 'docs/t',
      expectedClasses: ['docs'],
      duplicateRisk: 'none',
    })
    store.updateTask('HCK-0001', { prNumber: 1234 })

    expect(store.getByPrNumber(1234)?.taskId).toBe('HCK-0001')
    expect(store.getByPrNumber(9999)).toBeUndefined()
  })
})
