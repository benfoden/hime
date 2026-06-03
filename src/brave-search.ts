// Brave Search transport for hime.
//
// Isolated module (mirrors the provider-class pattern in src/providers/) so all
// Brave-specific fetch logic stays out of background.ts. A single authenticated
// GET against the Brave web-search endpoint, mapping web.results[] → SearchResult[]
// with URLs carried verbatim (SERP-02) and failures classified via the Plan-01
// classifyBraveError taxonomy (429→search_quota, 401/403→auth, network→network).
//
// SECURITY (T-08-03): never log the apiKey, the header object, or the URL with the
// token. No console output here. The query param is set via URL.searchParams.set,
// which encodes automatically — no manual interpolation of user input (T-08-04).

import type { SearchResult } from './types.js';
import { classifyBraveError } from './errors.js';

export const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

// Raw Brave web result item shape (subset we consume). Not exported — internal.
interface BraveWebResult {
  title: string;
  url: string;
  description?: string;
  meta_url?: { hostname?: string; favicon?: string };
  profile?: { img?: string };
}

export class BraveSearchClient {
  async search(
    query: string,
    apiKey: string,
    opts: { count?: number; searchLang?: string } = {},
  ): Promise<SearchResult[]> {
    const url = new URL(BRAVE_ENDPOINT);
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(opts.count ?? 10));
    // 'web' filter suppresses news/videos/etc. (RESEARCH Pitfall 6).
    url.searchParams.set('result_filter', 'web');
    if (opts.searchLang) url.searchParams.set('search_lang', opts.searchLang);
    // NOTE: text_decorations is intentionally NOT set — Brave's default leaves
    // <strong> tags in description; Phase 8 returns raw, Phase 9 strips (Pitfall 2).

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
        signal: controller.signal,
      });
    } catch (err) {
      // AbortError (timeout) or TypeError (offline) → network.
      const c = classifyBraveError(err);
      const e = new Error(c.message);
      (e as Error & { kind?: string }).kind = c.kind;
      throw e;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      // No documented 429 body shape; tolerate a non-JSON / empty body.
      const body = await response.json().catch(() => ({}));
      const bodyMessage = (body as { message?: string })?.message;
      // NEVER auto-retry on 429 (D-07) — classify and throw.
      const c = classifyBraveError(null, { status: response.status, bodyMessage });
      const e = new Error(c.message);
      (e as Error & { kind?: string; status?: number }).kind = c.kind;
      (e as Error & { kind?: string; status?: number }).status = response.status;
      throw e;
    }

    const data = await response.json();
    const items: BraveWebResult[] = data?.web?.results ?? [];
    return items.map(mapBraveResult);
  }
}

function mapBraveResult(r: BraveWebResult): SearchResult {
  return {
    title: r.title,
    // Verbatim — never reassign or encode (SERP-02).
    url: r.url,
    description: r.description ?? '',
    hostname: r.meta_url?.hostname ?? new URL(r.url).hostname,
    faviconUrl: r.meta_url?.favicon ?? r.profile?.img,
  };
}
