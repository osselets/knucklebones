export interface ApiErrorBody {
  error: {
    code: string
    message: string
    requestId: string
    retryable: boolean
  }
}

interface ApiErrorOptions {
  status: number
  code: string
  message: string
  requestId: string
  retryable?: boolean
}

export function apiError({
  status,
  code,
  message,
  requestId,
  retryable = false
}: ApiErrorOptions): Response {
  return Response.json(
    {
      error: {
        code,
        message,
        requestId,
        retryable
      }
    } satisfies ApiErrorBody,
    {
      status,
      headers: { 'X-Request-Id': requestId }
    }
  )
}

export function withRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers)
  headers.set('X-Request-Id', requestId)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
    webSocket: response.webSocket
  })
}

export function sanitizeRequestForSentry(
  request: Request,
  requestId: string
): Request {
  const url = new URL(request.url)
  url.search = ''

  const headers = new Headers({ 'X-Request-Id': requestId })
  const safeHeaderNames = ['Accept', 'Content-Type', 'User-Agent', 'CF-Ray']

  safeHeaderNames.forEach((headerName) => {
    const value = request.headers.get(headerName)
    if (value !== null) {
      headers.set(headerName, value)
    }
  })

  return new Request(url, {
    method: request.method,
    headers
  })
}
