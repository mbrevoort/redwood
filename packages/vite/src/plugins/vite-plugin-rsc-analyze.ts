import path from 'node:path'

import * as swc from '@swc/core'
import type { Plugin } from 'vite'
import { normalizePath } from 'vite'

import { getPaths } from '@redwoodjs/project-config'

export function rscAnalyzePlugin(
  clientEntryCallback: (id: string) => void,
  serverEntryCallback: (id: string) => void,
  componentImportsCallback: (id: string, importId: readonly string[]) => void,
): Plugin {
  const clientEntryIdSet = new Set<string>()
  const webSrcPath = getPaths().web.src

  return {
    name: 'redwood-rsc-analyze-plugin',
    transform(code, id) {
      const ext = path.extname(id)

      if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
        const mod = swc.parseSync(code, {
          syntax: ext === '.ts' || ext === '.tsx' ? 'typescript' : 'ecmascript',
          tsx: ext === '.tsx',
        })

        for (const item of mod.body) {
          if (
            item.type === 'ExpressionStatement' &&
            item.expression.type === 'StringLiteral'
          ) {
            if (item.expression.value === 'use client') {
              clientEntryCallback(id)
              clientEntryIdSet.add(id)
            } else if (item.expression.value === 'use server') {
              serverEntryCallback(id)
            }
          }
        }
      }

      return code
    },
    moduleParsed(moduleInfo) {
      // TODO: Maybe this is not needed?
      if (moduleInfo.id.startsWith(normalizePath(webSrcPath))) {
        componentImportsCallback(moduleInfo.id, moduleInfo.importedIds)
      }
    },
  }
}
