import { updateSession } from '@/utils/middleware'
import { type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - API routes (/api)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * - public machine-readable files (see below)
     *
     * The last group exists because anything this matcher catches is run
     * through the Supabase session check, which 307s unauthenticated callers
     * to `/`. That's right for app pages and wrong for files whose entire
     * audience is unauthenticated: crawlers reading robots/sitemap/llms.txt,
     * and integrators importing the OpenAPI spec the docs page links to.
     * They were silently redirected to the homepage.
     *
     * Listed explicitly rather than by extension — a blanket `.yaml`/`.txt`
     * exclusion would also un-gate any such file added later by accident.
     */
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|openapi.yaml|llms.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
