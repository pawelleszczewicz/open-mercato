import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import * as appResolver from '../appResolver'
import { bootstrapFromAppRoot, loadBootstrapData } from '../dynamicLoader'
import * as entityIdsRegistry from '../../encryption/entityIds'

type TempApp = {
  appRoot: string
  generatedDir: string
  tempDir: string
}

type DynamicLoaderTestGlobal = typeof globalThis & {
  __entityIdsRegistered?: boolean
}

const originalRegisterEntityIds = entityIdsRegistry.registerEntityIds
const runtimeGlobal = globalThis as DynamicLoaderTestGlobal
const compiledExtension = process.env.JEST_WORKER_ID ? '.cjs' : '.mjs'

function writeFile(filePath: string, contents: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents)
}

function createPrecompiledModule(exportsBody: string): string {
  if (compiledExtension === '.cjs') {
    return exportsBody.replace(/^export const /gm, 'exports.')
  }
  return exportsBody
}

function touchFile(filePath: string, mtimeMs: number) {
  const timestamp = new Date(mtimeMs)
  fs.utimesSync(filePath, timestamp, timestamp)
}

function createCompiledApp(options: {
  includeSearch?: boolean
  precompiled?: boolean
  moduleId?: string
  searchId?: string
} = {}): TempApp {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-mercato-dynamic-loader-'))
  const appRoot = path.join(tempDir, 'apps', 'mercato')
  const generatedDir = path.join(appRoot, '.mercato', 'generated')

  writeFile(path.join(appRoot, 'next.config.ts'), 'export default {}')
  writeFile(path.join(appRoot, 'src', 'fixtures', 'modules.ts'), `export const moduleId = ${JSON.stringify(options.moduleId ?? 'alias-resolved-module')}`)
  writeFile(path.join(generatedDir, 'entities.ids.generated.ts'), `export const E = ${JSON.stringify({ demo: { Example: 'demo.example' } })}`)
  writeFile(
    path.join(generatedDir, 'modules.cli.generated.ts'),
    [
      "import { moduleId } from '@/src/fixtures/modules'",
      'const entityIdsRegistered = Boolean((globalThis as { __entityIdsRegistered?: boolean }).__entityIdsRegistered)',
      "export const modules = [{ id: entityIdsRegistered ? moduleId : 'entity-ids-missing' }]",
    ].join('\n'),
  )
  writeFile(path.join(generatedDir, 'entities.generated.ts'), "export const entities = ['entity-from-ts']")
  writeFile(path.join(generatedDir, 'di.generated.ts'), 'export const diRegistrars = [undefined]')

  if (options.includeSearch) {
    writeFile(
      path.join(generatedDir, 'search.generated.ts'),
      `export const searchModuleConfigs = ${JSON.stringify([{ id: options.searchId ?? 'search-from-ts' }])}`,
    )
  }

  if (options.precompiled) {
    writeFile(
      path.join(generatedDir, `entities.ids.generated${compiledExtension}`),
      createPrecompiledModule("export const E = { demo: { Example: 'precompiled.example' } }"),
    )
    writeFile(
      path.join(generatedDir, `modules.cli.generated${compiledExtension}`),
      createPrecompiledModule(`export const modules = [{ id: ${JSON.stringify(options.moduleId ?? 'precompiled-module')} }]`),
    )
    writeFile(
      path.join(generatedDir, `entities.generated${compiledExtension}`),
      createPrecompiledModule("export const entities = ['entity-from-precompiled']"),
    )
    writeFile(
      path.join(generatedDir, `di.generated${compiledExtension}`),
      createPrecompiledModule('export const diRegistrars = [undefined]'),
    )

    if (options.includeSearch) {
      writeFile(
        path.join(generatedDir, `search.generated${compiledExtension}`),
        createPrecompiledModule(
          `export const searchModuleConfigs = ${JSON.stringify([{ id: options.searchId ?? 'search-from-mjs' }])}`,
        ),
      )
    }

    const olderTimestamp = Date.now() - 10_000
    const newerTimestamp = Date.now()
    touchFile(path.join(generatedDir, 'entities.ids.generated.ts'), olderTimestamp)
    touchFile(path.join(generatedDir, 'modules.cli.generated.ts'), olderTimestamp)
    touchFile(path.join(generatedDir, 'entities.generated.ts'), olderTimestamp)
    touchFile(path.join(generatedDir, 'di.generated.ts'), olderTimestamp)
    touchFile(path.join(generatedDir, `entities.ids.generated${compiledExtension}`), newerTimestamp)
    touchFile(path.join(generatedDir, `modules.cli.generated${compiledExtension}`), newerTimestamp)
    touchFile(path.join(generatedDir, `entities.generated${compiledExtension}`), newerTimestamp)
    touchFile(path.join(generatedDir, `di.generated${compiledExtension}`), newerTimestamp)

    if (options.includeSearch) {
      touchFile(path.join(generatedDir, 'search.generated.ts'), olderTimestamp)
      touchFile(path.join(generatedDir, `search.generated${compiledExtension}`), newerTimestamp)
    }
  }

  return {
    appRoot,
    generatedDir,
    tempDir,
  }
}

describe('dynamicLoader', () => {
  const tempDirs = new Set<string>()
  let previousCwd = process.cwd()
  let previousEntityIds = entityIdsRegistry.getEntityIds(false)

  beforeEach(() => {
    previousCwd = process.cwd()
    previousEntityIds = entityIdsRegistry.getEntityIds(false)
    delete runtimeGlobal.__entityIdsRegistered
  })

  afterEach(() => {
    process.chdir(previousCwd)
    originalRegisterEntityIds(previousEntityIds)
    delete runtimeGlobal.__entityIdsRegistered
    jest.restoreAllMocks()

    for (const tempDir of tempDirs) {
      fs.rmSync(tempDir, { recursive: true, force: true })
      tempDirs.delete(tempDir)
    }
  })

  it('loads bootstrap data from the nearest app root and registers entity IDs before modules load', async () => {
    const app = createCompiledApp()
    tempDirs.add(app.tempDir)

    const nestedDir = path.join(app.appRoot, 'src', 'modules', 'customers')
    fs.mkdirSync(nestedDir, { recursive: true })

    jest.spyOn(entityIdsRegistry, 'registerEntityIds').mockImplementation((entityIds) => {
      runtimeGlobal.__entityIdsRegistered = true
      originalRegisterEntityIds(entityIds)
    })

    process.chdir(nestedDir)

    const data = await loadBootstrapData()

    expect(data.modules).toEqual([{ id: 'alias-resolved-module' }])
    expect(data.entities).toEqual(['entity-from-ts'])
    expect(data.diRegistrars).toEqual([undefined])
    expect(data.entityIds).toEqual({ demo: { Example: 'demo.example' } })
    expect(data.searchModuleConfigs).toEqual([])
    expect(entityIdsRegistry.getEntityIds(false)).toEqual(data.entityIds)
  })

  it('uses the explicit app root and reuses newer precompiled output', async () => {
    const app = createCompiledApp({
      includeSearch: true,
      precompiled: true,
      moduleId: 'from-precompiled-js',
      searchId: 'search-from-precompiled-js',
    })
    tempDirs.add(app.tempDir)

    const findAppRootSpy = jest.spyOn(appResolver, 'findAppRoot')

    const data = await loadBootstrapData(app.appRoot)

    expect(findAppRootSpy).not.toHaveBeenCalled()
    expect(data.modules).toEqual([{ id: 'from-precompiled-js' }])
    expect(data.entities).toEqual(['entity-from-precompiled'])
    expect(data.entityIds).toEqual({ demo: { Example: 'precompiled.example' } })
    expect(data.searchModuleConfigs).toEqual([{ id: 'search-from-precompiled-js' }])
  })

  it('throws a helpful error when no app root can be resolved', async () => {
    jest.spyOn(appResolver, 'findAppRoot').mockReturnValue(null)

    await expect(loadBootstrapData()).rejects.toThrow(
      'Could not find app root with .mercato/generated directory.',
    )
  })

  it('bootstraps loaded data through the bootstrap factory in CLI context', async () => {
    const app = createCompiledApp({
      includeSearch: true,
      precompiled: true,
      moduleId: 'bootstrap-module',
      searchId: 'bootstrap-search',
    })
    tempDirs.add(app.tempDir)

    const bootstrap = jest.fn()
    const createBootstrap = jest.fn(() => bootstrap)
    const waitForAsyncRegistration = jest.fn().mockResolvedValue(undefined)

    jest.doMock(
      '../factory.js',
      () => ({
        createBootstrap,
        waitForAsyncRegistration,
      }),
      { virtual: true },
    )

    const data = await bootstrapFromAppRoot(app.appRoot)

    expect(createBootstrap).toHaveBeenCalledWith(data)
    expect(bootstrap).toHaveBeenCalledTimes(1)
    expect(waitForAsyncRegistration).toHaveBeenCalledTimes(1)
    expect(data.modules).toEqual([{ id: 'bootstrap-module' }])
    expect(data.searchModuleConfigs).toEqual([{ id: 'bootstrap-search' }])
  })
})
