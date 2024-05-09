import { build as viteBuild } from 'vite'
import { cjsInterop } from 'vite-plugin-cjs-interop'

import { getPaths } from '@redwoodjs/project-config'

import { rscRoutesAutoLoader } from '../plugins/vite-plugin-rsc-routes-auto-loader'

export async function buildForStreamingServer({
  verbose = false,
  rscEnabled = false,
}: {
  verbose?: boolean
  rscEnabled?: boolean
}) {
  console.log('Starting streaming server build...\n')
  const rwPaths = getPaths()

  if (!rwPaths.web.viteConfig) {
    throw new Error('Vite config not found')
  }

  await viteBuild({
    configFile: rwPaths.web.viteConfig,
    plugins: [
      cjsInterop({
        dependencies: ['@redwoodjs/**'],
      }),
      rscEnabled && rscRoutesAutoLoader(),
    ],
    build: {
      // TODO (RSC): Remove `minify: false` when we don't need to debug as often
      minify: false,
      outDir: rwPaths.web.distServer,
      ssr: true,
      emptyOutDir: true,
    },
    envFile: false,
    logLevel: verbose ? 'info' : 'warn',
  })
}
