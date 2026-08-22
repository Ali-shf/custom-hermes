import { useQuery } from '@tanstack/react-query'

import { queryClient, writeCache } from '@/lib/query-client'
import { getRutileaConfigRecord } from '@/rutilea'
import { normalizeProfileKey } from '@/store/profile'
import type { RutileaConfigRecord } from '@/types/rutilea'

// One shared cache for the whole profile config record (`GET /api/config`).
// Every settings surface (MCP, model, config) reads and writes through this key
// so a save in one shows in the others, and revisiting a tab paints the cache
// instead of blanking on a fresh fetch.
//
// Distinct from session/hooks/use-rutilea-config.ts, which is side-effecting —
// it pushes personality/cwd/voice/… into the session stores for live chat.
export const RUTILEA_CONFIG_KEY = ['rutilea-config-record'] as const

// Per-profile cache key. The base key (no profile suffix) is the app-wide
// active profile, unchanged for every caller that passes nothing. An explicit
// profile — the Capabilities profile-scope selector configuring ANOTHER
// profile — gets its own suffixed key so switching the selector refetches and
// never paints stale cross-profile config (the AGENTS.md scope-in-key rule).
export const rutileaConfigKey = (profile?: null | string) =>
  profile == null ? RUTILEA_CONFIG_KEY : ([...RUTILEA_CONFIG_KEY, normalizeProfileKey(profile)] as const)

// staleTime 0 → serve cache instantly, background-revalidate on every mount.
// `profile` scopes both the query key and the fetch; omitting it preserves the
// exact app-wide behavior (base key, `profileScoped(undefined)` fallback).
export const useRutileaConfigRecord = (profile?: null | string) =>
  useQuery({
    queryKey: rutileaConfigKey(profile),
    // null/undefined both mean "no override" → fetch with undefined so
    // profileScoped falls back to the app-wide active profile (passing null
    // would wrongly target the primary backend).
    queryFn: () => getRutileaConfigRecord(profile ?? undefined),
    staleTime: 0
  })

// setRutileaConfigCache writes the app-wide (base-key) record. Pass a profile to
// write the suffixed per-profile cache instead — keeps the selector's optimistic
// write-through landing on the same key its query reads.
export const setRutileaConfigCache = writeCache<RutileaConfigRecord>(RUTILEA_CONFIG_KEY)
export const rutileaConfigCacheWriter = (profile?: null | string) =>
  writeCache<RutileaConfigRecord>(rutileaConfigKey(profile))

export const invalidateRutileaConfig = (profile?: null | string) =>
  queryClient.invalidateQueries({ queryKey: rutileaConfigKey(profile) })
