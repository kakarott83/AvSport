/**
 * Jest auto-mock for @/services/supabaseClient.
 *
 * Usage in tests:
 *   jest.mock('@/services/supabaseClient');
 *
 * Then import `supabase` as normal — every method is a jest.fn().
 * Override individual calls in the test body:
 *
 *   import { supabase } from '@/services/supabaseClient';
 *   (supabase.auth.getUser as jest.Mock).mockResolvedValueOnce({
 *     data: { user: { id: 'abc' } },
 *   });
 */

const chainable = () => {
  const c: Record<string, jest.Mock> = {};
  const methods = ['select', 'eq', 'neq', 'gte', 'lte', 'lt', 'gt',
                   'order', 'limit', 'contains', 'single', 'maybeSingle',
                   'insert', 'update', 'upsert', 'delete'];
  for (const m of methods) {
    c[m] = jest.fn().mockReturnThis();
  }
  // Terminal calls resolve to a default empty-success response
  c['single']      = jest.fn().mockResolvedValue({ data: null, error: null });
  c['maybeSingle'] = jest.fn().mockResolvedValue({ data: null, error: null });
  // Non-terminal calls still need to return a thenable for direct awaiting
  const thenable = { ...c, then: undefined };
  return thenable;
};

export const supabase = {
  auth: {
    getUser:  jest.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } } }),
    signOut:  jest.fn().mockResolvedValue({ error: null }),
    getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
  },
  from: jest.fn(() => chainable()),
  storage: {
    from: jest.fn(() => ({ upload: jest.fn(), getPublicUrl: jest.fn() })),
  },
};
