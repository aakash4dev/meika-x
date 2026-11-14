// NASA CMR (Common Metadata Repository) collection search, used to point users at the
// full-resolution NASA products behind a variable. No key needed.
import { cachedJSON } from "./http";

export interface CmrCollection {
  shortName: string;
  title: string;
  version: string;
  link: string;
}

export const collectionsUrl = (keyword: string, limit = 4) =>
  `https://cmr.earthdata.nasa.gov/search/collections.json?keyword=${encodeURIComponent(keyword)}&page_size=${limit}&sort_key=-usage_score`;

export async function searchCollections(keyword: string, limit = 4): Promise<CmrCollection[]> {
  const url = collectionsUrl(keyword, limit);
  const data = await cachedJSON<{ feed: { entry: { short_name: string; title: string; version_id: string; id: string }[] } }>(
    url,
    { ttlSeconds: 7 * 86400, timeoutMs: 30000 },
  );
  return (data.feed?.entry ?? []).map((e) => ({
    shortName: e.short_name,
    title: e.title,
    version: e.version_id,
    link: `https://search.earthdata.nasa.gov/search?q=${encodeURIComponent(e.short_name)}`,
  }));
}
