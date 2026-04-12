import path from 'node:path'
import type { ModuleEntry, PackageInfo, PackageResolver } from '../../resolver'
import { createResolver } from '../../resolver'
import { collectUmesData } from '../collector'

const REPO_ROOT = path.resolve(__dirname, '../../../../../../')

function createStandaloneCoreResolver(enabledModules: ModuleEntry[]): PackageResolver {
  const appDir = path.join(REPO_ROOT, 'apps/mercato')
  const coreRoot = path.join(REPO_ROOT, 'packages/core')
  const coreDistModules = path.join(coreRoot, 'dist/modules')
  const noPackages: PackageInfo[] = []

  return {
    isMonorepo: () => false,
    getRootDir: () => REPO_ROOT,
    getAppDir: () => appDir,
    getOutputDir: () => path.join(appDir, '.mercato/generated'),
    getModulesConfigPath: () => path.join(appDir, 'src/modules.ts'),
    discoverPackages: () => noPackages,
    loadEnabledModules: () => enabledModules,
    getModulePaths: (entry) => ({
      appBase: path.join(appDir, 'src/modules', entry.id),
      pkgBase: path.join(coreDistModules, entry.id),
    }),
    getModuleImportBase: (entry) => ({
      appBase: `@/modules/${entry.id}`,
      pkgBase: `@open-mercato/core/modules/${entry.id}`,
    }),
    getPackageOutputDir: () => path.join(coreRoot, 'generated'),
    getPackageRoot: () => coreRoot,
  }
}

describe('collectUmesData', () => {
  it('collects translation manager widgets in monorepo mode', () => {
    const resolver = createResolver(REPO_ROOT)
    const translations = collectUmesData(resolver).find((moduleData) => moduleData.moduleId === 'translations')

    expect(translations?.extensions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'injection-widget',
        id: 'translations.injection.translation-manager',
        target: 'crud-form:catalog.product:header',
      }),
      expect.objectContaining({
        type: 'injection-widget',
        id: 'translations.injection.translation-manager',
        target: 'crud-form:resources.resource:header',
      }),
    ]))
  })

  it('collects translation manager widgets from dist modules without runtime registry side effects', () => {
    const resolver = createStandaloneCoreResolver([
      { id: 'catalog', from: '@open-mercato/core' },
      { id: 'translations', from: '@open-mercato/core' },
    ])
    const translations = collectUmesData(resolver).find((moduleData) => moduleData.moduleId === 'translations')

    expect(translations?.extensions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'injection-widget',
        id: 'translations.injection.translation-manager',
        target: 'crud-form:catalog.catalog_product:header',
      }),
      expect.objectContaining({
        type: 'injection-widget',
        id: 'translations.injection.translation-manager',
        target: 'crud-form:catalog.product:header',
      }),
    ]))
  })
})
