import path from 'node:path'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { vi } from 'vitest'

import {
  middlewareDefaultAuthProviderState,
  // type ServerAuthState,
} from '@redwoodjs/auth'
import { authDecoder } from '@redwoodjs/auth-supabase-api'
import {
  MiddlewareRequest,
  MiddlewareResponse,
} from '@redwoodjs/vite/middleware'

import createSupabaseAuthMiddleware from '../index'
import type { SupabaseAuthMiddlewareOptions } from '../index'
const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../../../../../__fixtures__/example-todo-main',
)

vi.mock('jsonwebtoken', () => {
  return {
    default: {
      verify: vi.fn(() => {
        return {
          sub: 'abc123',
        }
      }),
      decode: vi.fn(),
    },
  }
})

// })

vi.mock('@redwoodjs/auth-supabase-api', () => {
  return {
    authDecoder: vi.fn(() => {
      return {
        sub: 'abc123',
      }
    }),
  }
})

beforeAll(() => {
  process.env.RWJS_CWD = FIXTURE_PATH
  // the default cookie name in the Supabase client is based on the url
  // will always be in the format:
  // sb-<project_ref>-auth-token (e.g. sb-example-auth-token )
  // so, the cookie name is based on the project ref and will be
  // sb-example-auth-token
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_KEY = 'fake-key'
  process.env.SUPABASE_JWT_SECRET = 'fake-jwt-secret'
})

afterAll(() => {
  delete process.env.RWJS_CWD
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_KEY
  delete process.env.SUPABASE_JWT_SECRET
})

const options: SupabaseAuthMiddlewareOptions = {
  getCurrentUser: async () => {
    return {
      id: 1,
      email: 'user-1@example.com',
    }
  },
}

describe('createSupabaseAuthMiddleware()', () => {
  it('creates middleware for Supabase SSR auth', async () => {
    const middleware = createSupabaseAuthMiddleware(options)
    const request = new Request('http://localhost:8911', {
      method: 'GET',
      headers: new Headers(),
    })
    const req = new MiddlewareRequest(request)
    const res = new MiddlewareResponse()

    const result = await middleware(req, res)

    expect(result).toBeDefined()
    expect(result).toHaveProperty('body', undefined)
    expect(result).toHaveProperty('status', 200)

    const serverAuthContext = req.serverAuthContext.get()
    expect(serverAuthContext).toEqual(middlewareDefaultAuthProviderState)
  })

  it('passes through non-authenticated requests', async () => {
    const middleware = createSupabaseAuthMiddleware(options)
    const request = new Request('http://localhost:8911', {
      method: 'GET',
      headers: new Headers(),
    })
    const req = new MiddlewareRequest(request)
    const res = new MiddlewareResponse('original response body')

    const result = await middleware(req, res)
    expect(result).toEqual(res)
    expect(result.body).toEqual('original response body')

    const serverAuthContext = req.serverAuthContext.get()
    expect(serverAuthContext).toEqual(middlewareDefaultAuthProviderState)
  })
  it('passes through when no auth-provider cookie', async () => {
    const middleware = createSupabaseAuthMiddleware(options)
    const request = new Request('http://localhost:8911', {
      method: 'GET',
      headers: new Headers({
        cookie: 'missing-the-auth-provider-cookie-header-name=supabase',
      }),
    })
    const req = new MiddlewareRequest(request)
    const res = new MiddlewareResponse(
      'original response body when no auth provider',
    )

    const result = await middleware(req, res)
    expect(result).toEqual(res)
    expect(result.body).toEqual('original response body when no auth provider')

    const serverAuthContext = req.serverAuthContext.get()
    expect(serverAuthContext).toEqual(middlewareDefaultAuthProviderState)
  })

  it('passes through when unsupported auth-provider', async () => {
    const middleware = createSupabaseAuthMiddleware(options)
    const request = new Request('http://localhost:8911', {
      method: 'GET',
      headers: new Headers({ cookie: 'auth-provider=unsupported' }),
    })
    const req = new MiddlewareRequest(request)
    const res = new MiddlewareResponse(
      'original response body for unsupported provider',
    )

    const result = await middleware(req, res)
    expect(result).toEqual(res)
    expect(result.body).toEqual(
      'original response body for unsupported provider',
    )
    const serverAuthContext = req.serverAuthContext.get()
    expect(serverAuthContext).toEqual(middlewareDefaultAuthProviderState)
  })

  it('handles current user GETs', async () => {
    const middleware = createSupabaseAuthMiddleware(options)
    const request = new Request(
      'http://localhost:8911/middleware/supabase/currentUser',
      {
        method: 'GET',
        headers: new Headers({ cookie: 'auth-provider=supabase' }),
      },
    )
    const req = new MiddlewareRequest(request)
    const res = new MiddlewareResponse()

    const result = await middleware(req, res)
    expect(result.body).toEqual(
      JSON.stringify({
        currentUser: { id: 1, email: 'user-1@example.com' },
      }),
    )

    expect(req.url).toContain('/middleware/supabase/currentUser')
    const serverAuthContext = req.serverAuthContext.get()
    expect(serverAuthContext).toEqual(middlewareDefaultAuthProviderState)
  })

  it('authenticated request sets currentUser', async () => {
    const middleware = createSupabaseAuthMiddleware(options)
    const request = new Request('http://localhost:8911/authenticated-request', {
      method: 'GET',
      headers: new Headers({
        cookie: 'auth-provider=supabase;sb_access_token=dummy_access_token',
      }),
    })
    const req = new MiddlewareRequest(request)
    const res = new MiddlewareResponse()

    const result = await middleware(req, res)
    expect(result).toBeDefined()
    expect(req).toBeDefined()

    const serverAuthContext = req.serverAuthContext.get()
    expect(serverAuthContext).toBeDefined()
    expect(serverAuthContext).toHaveProperty('currentUser')
    expect(serverAuthContext.isAuthenticated).toEqual(true)
    expect(serverAuthContext.currentUser).toEqual({
      id: 1,
      email: 'user-1@example.com',
    })
  })

  it('authenticated request sets userMetadata', async () => {
    const optionsWithUserMetadata: SupabaseAuthMiddlewareOptions = {
      getCurrentUser: async () => {
        return {
          id: 1,
          email: 'user-1@example.com',
          user_metadata: { favoriteColor: 'yellow' },
        }
      },
    }

    const middleware = createSupabaseAuthMiddleware(optionsWithUserMetadata)
    const request = new Request('http://localhost:8911/authenticated-request', {
      method: 'GET',
      headers: new Headers({
        cookie: 'auth-provider=supabase;sb_access_token=dummy_access_token',
      }),
    })
    const req = new MiddlewareRequest(request)
    const res = new MiddlewareResponse()

    const result = await middleware(req, res)
    expect(result).toBeDefined()
    expect(req).toBeDefined()

    expect(authDecoder).toHaveBeenCalledWith(
      'auth-provider=supabase;sb_access_token=dummy_access_token',
      'supabase',
      expect.anything(),
    )

    const serverAuthContext = req.serverAuthContext.get()
    expect(serverAuthContext).toBeDefined()
    expect(serverAuthContext).toHaveProperty('currentUser')
    expect(serverAuthContext.isAuthenticated).toEqual(true)
    expect(serverAuthContext.userMetadata).toEqual({
      favoriteColor: 'yellow',
    })
  })

  it('an exception when getting the currentUser clears out serverAuthContext and cookies', async () => {
    const optionsWithUserMetadata: SupabaseAuthMiddlewareOptions = {
      getCurrentUser: async () => {
        // this simulates a decoding error or some other issue like tampering with the cookie so the Supabase session is invalid
        // or an error in the getCurrentUser function
        throw new Error('Error getting current user')
      },
    }

    const middleware = createSupabaseAuthMiddleware(optionsWithUserMetadata)

    // the default cookie name will always be sb-<project_ref>-auth-token (e.g. sb-example-auth-token )
    const request = new Request('http://localhost:8911/authenticated-request', {
      method: 'GET',
      headers: new Headers({
        cookie:
          'auth-provider=supabase;sb-example-auth-token=dummy_access_token',
      }),
    })
    const req = new MiddlewareRequest(request)
    const res = new MiddlewareResponse()

    const result = await middleware(req, res)
    expect(result).toBeDefined()
    expect(req).toBeDefined()

    // when an exception is thrown, such as when tampering with the cookie,
    //the serverAuthContext should be cleared
    const serverAuthContext = req.serverAuthContext.get()
    expect(serverAuthContext).toBeNull()

    // the auth-provider cookie should be cleared from the response
    const authProviderCookie = res.cookies.get('auth-provider')
    const authProviderCookieDetails =
      res.cookies.getWithOptions('auth-provider')
    expect(authProviderCookie).toEqual('')
    expect(authProviderCookieDetails).toHaveProperty('options')
    expect(authProviderCookieDetails?.options).toHaveProperty(
      'expires',
      new Date(0),
    )

    // and the Supabase cookie should be cleared
    const supabaseCookie = res.cookies.get('sb-example-auth-token')
    const supabaseCookieDetails = res.cookies.getWithOptions(
      'sb-example-auth-token',
    )
    expect(supabaseCookie).toEqual('')
    expect(supabaseCookieDetails).toHaveProperty('options')
    expect(supabaseCookieDetails?.options).toHaveProperty(
      'expires',
      new Date(0),
    )
  })
})
