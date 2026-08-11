import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyRoute, recordHttpRequest } from '../src/utils/observability'

describe('operational events', () => {
  afterEach(() => vi.restoreAllMocks())

  it('normalizes public identifiers out of route labels', () => {
    expect(
      classifyRoute('/v1/rooms/11111111-1111-4111-8111-111111111111/play')
    ).toBe('/v1/rooms/:roomKey/play')
    expect(
      classifyRoute(
        '/v1/identity/credentials/22222222-2222-4222-8222-222222222222'
      )
    ).toBe('/v1/identity/credentials/:credentialId')
    expect(classifyRoute('/v1/diagnostics/protocol')).toBe(
      '/v1/diagnostics/:type'
    )
  })

  it('logs structured outcomes without request secrets', () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    const request = new Request(
      'https://api.knucklebones.io/v1/rooms/11111111-1111-4111-8111-111111111111/play?ticket=secret-ticket',
      { headers: { Authorization: 'Bearer secret-credential' } }
    )
    const response = new Response(null, {
      status: 409,
      headers: { 'X-Knucklebones-Error-Code': 'STALE_REVISION' }
    })

    recordHttpRequest({
      request,
      response,
      requestId: '33333333-3333-4333-8333-333333333333',
      environment: 'staging',
      startedAt: Date.now()
    })

    expect(consoleLog).toHaveBeenCalledOnce()
    const serializedEvent = consoleLog.mock.calls[0][0] as string
    expect(JSON.parse(serializedEvent)).toMatchObject({
      environment: 'staging',
      event: 'http.request',
      route: '/v1/rooms/:roomKey/play',
      status: 409,
      error_code: 'STALE_REVISION'
    })
    expect(serializedEvent).not.toContain('secret-ticket')
    expect(serializedEvent).not.toContain('secret-credential')
    expect(serializedEvent).not.toContain(
      '11111111-1111-4111-8111-111111111111'
    )
  })

  it('keeps local test and development logs quiet', () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    recordHttpRequest({
      request: new Request('http://localhost:8787/players'),
      response: new Response(null, { status: 201 }),
      requestId: '33333333-3333-4333-8333-333333333333',
      environment: 'development',
      startedAt: Date.now()
    })
    expect(consoleLog).not.toHaveBeenCalled()
  })
})
