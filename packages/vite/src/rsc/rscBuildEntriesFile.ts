import fs from 'fs/promises'

import type { OutputChunk } from 'rollup'
import { normalizePath } from 'vite'

import { getPaths } from '@redwoodjs/project-config'

import { getEntries } from '../lib/entries.js'

import type { rscBuildClient } from './rscBuildClient.js'
import type { rscBuildForServer } from './rscBuildForServer.js'

/**
 * RSC build. Step 5.
 * Append a mapping of server asset names to client asset names to the
 * `web/dist/rsc/entries.js` file.
 * Only used by the RSC worker.
 */
// TODO(RSC_DC): This function should eventually be removed.
// The dev server will need this implemented as a Vite plugin,
// so worth waiting till implementation to swap out and just include the plugin for the prod build
export async function rscBuildEntriesMappings(
  clientBuildOutput: Awaited<ReturnType<typeof rscBuildClient>>,
  serverBuildOutput: Awaited<ReturnType<typeof rscBuildForServer>>,
  clientEntryFiles: Record<string, string>,
) {
  console.log('\n')
  console.log('5. rscBuildEntriesMapping')
  console.log('=========================\n')

  const rwPaths = getPaths()

  // RSC client component to client dist asset mapping
  const clientEntries: Record<string, string> = {}
  for (const item of clientBuildOutput) {
    const { name, fileName } = item

    const entryFile =
      name &&
      // TODO (RSC) Can't we just compare the names? `item.name === name`
      serverBuildOutput.find(
        (item) =>
          'moduleIds' in item &&
          item.moduleIds.includes(clientEntryFiles[name] as string),
      )?.fileName

    if (entryFile) {
      if (process.platform === 'win32') {
        // Prevent errors on Windows like
        // Error: No client entry found for D:/a/redwood/rsc-project/web/dist/server/assets/rsc0.js
        const entryFileSlash = entryFile.replaceAll('\\', '/')
        clientEntries[entryFileSlash] = fileName
      } else {
        clientEntries[entryFile] = fileName
      }
    }
  }

  console.log('clientEntries', clientEntries)
  await fs.appendFile(
    rwPaths.web.distRscEntries,
    '// client component mapping (dist/rsc -> dist/client)\n' +
      `export const clientEntries = ${JSON.stringify(clientEntries, undefined, 2)};\n\n`,
  )

  // Server component names to RSC server asset mapping
  const entries = getEntries()
  const serverEntries: Record<string, string> = {}
  for (const [name, sourceFile] of Object.entries(entries)) {
    const buildOutputItem = serverBuildOutput.find((item) => {
      return (item as OutputChunk).facadeModuleId === normalizePath(sourceFile)
    })

    if (buildOutputItem) {
      serverEntries[name] = buildOutputItem.fileName
    }
  }

  console.log('serverEntries', serverEntries)
  await fs.appendFile(
    rwPaths.web.distRscEntries,
    '// server component mapping (src -> dist/rsc)\n' +
      `export const serverEntries = ${JSON.stringify(serverEntries, undefined, 2)};\n\n`,
  )
}
