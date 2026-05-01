jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn((url: string, key: string, opts: any) => ({
    url,
    key,
    opts,
  })),
}))

describe('supabaseAdmin', () => {
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  afterEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey
    process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl
    jest.resetModules()
  })

  it('throws when service role key is missing', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = ''
    jest.isolateModules(() => {
      expect(() => require('../supabaseAdmin')).toThrow(
        /SUPABASE_SERVICE_ROLE_KEY/,
      )
    })
  })

  it('creates client with auth flags disabled', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    jest.isolateModules(() => {
      const { supabaseAdmin } = require('../supabaseAdmin')
      expect(supabaseAdmin.url).toBe('https://x.supabase.co')
      expect(supabaseAdmin.key).toBe('srv')
      expect(supabaseAdmin.opts.auth.autoRefreshToken).toBe(false)
      expect(supabaseAdmin.opts.auth.persistSession).toBe(false)
    })
  })
})
