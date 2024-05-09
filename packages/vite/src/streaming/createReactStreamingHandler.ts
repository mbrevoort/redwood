import path from 'path'

import { Response } from '@whatwg-node/fetch'
import type Router from 'find-my-way'
import type { HTTPMethod } from 'find-my-way'
import isbot from 'isbot'
import type { ViteDevServer } from 'vite'

import { middlewareDefaultAuthProviderState } from '@redwoodjs/auth'
import type { RouteSpec, RWRouteManifestItem } from '@redwoodjs/internal'
import { getAppRouteHook, getConfig, getPaths } from '@redwoodjs/project-config'
import { matchPath } from '@redwoodjs/router'
import type { TagDescriptor } from '@redwoodjs/web'

import { invoke } from '../middleware/invokeMiddleware.js'
import { MiddlewareResponse } from '../middleware/MiddlewareResponse.js'
import type { Middleware } from '../middleware/types.js'
import type { EntryServer } from '../types.js'
import { makeFilePath, ssrLoadEntryServer } from '../utils.js'

import { reactRenderToStreamResponse } from './streamHelpers.js'
import { loadAndRunRouteHooks } from './triggerRouteHooks.js'

interface CreateReactStreamingHandlerOptions {
  routes: RWRouteManifestItem[]
  clientEntryPath: string
  getStylesheetLinks: (route?: RWRouteManifestItem | RouteSpec) => string[]
  getMiddlewareRouter: () => Promise<Router.Instance<any>>
}

const checkUaForSeoCrawler = isbot.spawn()
checkUaForSeoCrawler.exclude(['chrome-lighthouse'])

export const createReactStreamingHandler = async (
  {
    routes,
    clientEntryPath,
    getStylesheetLinks,
    getMiddlewareRouter,
  }: CreateReactStreamingHandlerOptions,
  viteDevServer?: ViteDevServer,
) => {
  const rwPaths = getPaths()
  const rwConfig = getConfig()
  const isProd = !viteDevServer
  const middlewareRouter: Router.Instance<any> = await getMiddlewareRouter()
  let entryServerImport: EntryServer
  let fallbackDocumentImport: Record<string, any>
  const rscEnabled = rwConfig.experimental?.rsc?.enabled

  // Load the entries for prod only once, not in each handler invocation
  // Dev is the opposite, we load it every time to pick up changes
  if (isProd) {
    if (rscEnabled) {
      entryServerImport = await import(
        makeFilePath(rwPaths.web.distRscEntryServer)
      )
    } else {
      entryServerImport = await import(
        makeFilePath(rwPaths.web.distEntryServer)
      )
    }

    fallbackDocumentImport = await import(
      makeFilePath(rwPaths.web.distDocumentServer)
    )
  }

  // @NOTE: we are returning a FetchAPI handler
  return async (req: Request) => {
    let mwResponse = MiddlewareResponse.next()
    let decodedAuthState = middlewareDefaultAuthProviderState
    // @TODO: Make the currentRoute 404?
    let currentRoute: RWRouteManifestItem | undefined
    let parsedParams: any = {}

    const currentUrl = new URL(req.url)

    // @TODO validate this is correct
    for (const route of routes) {
      const { match, ...rest } = matchPath(
        route.pathDefinition,
        currentUrl.pathname,
      )
      if (match) {
        currentRoute = route
        parsedParams = rest
        break
      }
    }

    // ~~~ Middleware Handling ~~~
    if (middlewareRouter) {
      const matchedMw = middlewareRouter.find(req.method as HTTPMethod, req.url)
      ;[mwResponse, decodedAuthState = middlewareDefaultAuthProviderState] =
        await invoke(req, matchedMw?.handler as Middleware | undefined, {
          route: currentRoute,
          cssPaths: getStylesheetLinks(currentRoute),
          params: matchedMw?.params,
          viteDevServer,
        })

      // If mwResponse is a redirect, short-circuit here, and skip React rendering
      // If the response has a body, no need to render react.
      if (mwResponse.isRedirect() || mwResponse.body) {
        return mwResponse.toResponse()
      }
    }

    // ~~~ Middleware Handling ~~~

    if (!currentRoute) {
      throw new Error('404 handling not implemented')
    }

    if (currentRoute.redirect) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: currentRoute.redirect.to,
        },
      })
    }

    // Do this inside the handler for **dev-only**.
    // This makes sure that changes to entry-server are picked up on refresh
    if (!isProd) {
      entryServerImport = await ssrLoadEntryServer(viteDevServer)
      fallbackDocumentImport = await viteDevServer.ssrLoadModule(
        rwPaths.web.document,
      )
    }

    const ServerEntry =
      entryServerImport.ServerEntry || entryServerImport.default

    const FallbackDocument =
      fallbackDocumentImport.Document || fallbackDocumentImport.default

    let metaTags: TagDescriptor[] = []

    let routeHookPath = currentRoute.routeHooks

    if (isProd) {
      routeHookPath = currentRoute.routeHooks
        ? path.join(rwPaths.web.distRouteHooks, currentRoute.routeHooks)
        : null
    }

    // @TODO can we load the route hook outside the handler?
    const routeHookOutput = await loadAndRunRouteHooks({
      paths: [getAppRouteHook(isProd), routeHookPath],
      reqMeta: {
        req,
        parsedParams,
      },
      viteDevServer,
    })

    metaTags = routeHookOutput.meta

    // @MARK @TODO(RSC_DC): the entry path for RSC will be different,
    // because we don't want to inject a full bundle, just a slice of it
    // I'm not sure what though....
    const jsBundles = [
      clientEntryPath, // @NOTE: must have slash in front
      currentRoute.bundle && '/' + currentRoute.bundle,
    ].filter(Boolean) as string[]

    const isSeoCrawler = checkUaForSeoCrawler(
      req.headers.get('user-agent') || '',
    )

    // Using a function to get the CSS links because we need to wait for the
    // vite dev server to analyze the module graph
    const cssLinks = getStylesheetLinks(currentRoute)

    const reactResponse = await reactRenderToStreamResponse(
      mwResponse,
      {
        ServerEntry,
        FallbackDocument,
        currentUrl,
        metaTags,
        cssLinks,
        isProd,
        jsBundles,
        authState: decodedAuthState,
      },
      {
        waitForAllReady: isSeoCrawler,
        onError: (err) => {
          if (!isProd && viteDevServer) {
            viteDevServer.ssrFixStacktrace(err)
          }

          console.error(err)
        },
      },
    )

    return reactResponse
  }
}
