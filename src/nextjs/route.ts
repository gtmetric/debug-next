/**
 * Builds the App Router POST handler that receives client error events
 * from `registerClientCapture` and appends them to the app's log file
 * as terminal-style blocks.
 */

import { appendRaw } from './file-writer'

export type TCreateDebugNextRouteOptions = {
    appName: string
    logDir?: string
}

const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })

const isoTs = (): string => new Date().toISOString()

const truncate = (s: string, max: number): string =>
    s.length > max ? s.slice(0, max) : s

const asString = (v: unknown, max: number): string | undefined =>
    typeof v === 'string' ? truncate(v, max) : undefined

const CLIENT_SOURCES = new Set(['client-error', 'client-rejection', 'global-error'])

type TClientPayload = {
    appName?: unknown
    source?: unknown
    level?: unknown
    message?: unknown
    stack?: unknown
    digest?: unknown
    scope?: unknown
    meta?: unknown
    ts?: unknown
}

const formatClientEvent = (raw: unknown, fallbackAppName: string): string | null => {
    if (!raw || typeof raw !== 'object') return null
    const p = raw as TClientPayload

    const source =
        typeof p.source === 'string' && CLIENT_SOURCES.has(p.source)
            ? p.source
            : 'client-error'
    const ts = asString(p.ts, 64) ?? isoTs()
    const appName = asString(p.appName, 128) ?? fallbackAppName
    const level = asString(p.level, 32) ?? 'logError'
    const message = asString(p.message, 4000) ?? ''
    const stack = asString(p.stack, 16_000)
    const scope = asString(p.scope, 256)
    const digest = asString(p.digest, 256)

    const header = [`[${ts}]`, `[${appName}]`, level, source]
        .concat(scope ? [scope] : [])
        .concat(digest ? [`digest=${digest}`] : [])
        .join(' ')

    const lines: string[] = [`${header} — ${message}`]
    if (stack) lines.push(stack)
    if (Array.isArray(p.meta) && p.meta.length > 0) {
        try {
            lines.push(`meta: ${JSON.stringify(p.meta)}`)
        } catch {
            // ignore unserialisable meta
        }
    }
    return `${lines.join('\n')}\n\n`
}

/**
 * Usage — `app/api/_debug-next/route.ts`:
 * ```ts
 * import { createDebugNextRoute } from 'debug-next/nextjs/route'
 * export const runtime = 'nodejs'
 * export const { POST } = createDebugNextRoute({ appName: 'dashboard' })
 * ```
 */
export const createDebugNextRoute = (opts: TCreateDebugNextRouteOptions) => {
    const POST = async (request: Request): Promise<Response> => {
        let body: unknown
        try {
            body = await request.json()
        } catch {
            return jsonResponse({ ok: false, error: 'invalid_json' }, 400)
        }

        const formatted = formatClientEvent(body, opts.appName)
        if (!formatted) {
            return jsonResponse({ ok: false, error: 'invalid_payload' }, 400)
        }

        appendRaw(formatted, opts)
        return jsonResponse({ ok: true })
    }

    return { POST }
}
