// src/structured-extract.mjs
// Extract structured data (JSON-LD, Open Graph) from HTML
// If schema match coverage is sufficient, return result without LLM

import { JSDOM } from "jsdom";

/**
 * Extract JSON-LD data from HTML
 * @param {string} html - Raw HTML
 * @returns {object[]} Array of JSON-LD objects
 */
function extractJsonLd(html) {
  const dom = new JSDOM(html);
  const scripts = dom.window.document.querySelectorAll('script[type="application/ld+json"]');
  const results = [];

  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      // Expand @graph if present
      if (data["@graph"] && Array.isArray(data["@graph"])) {
        results.push(...data["@graph"]);
      } else if (Array.isArray(data)) {
        results.push(...data);
      } else {
        results.push(data);
      }
    } catch {
      // Ignore JSON parse failures
    }
  }

  return results;
}

/**
 * Extract Open Graph meta tags from HTML
 * @param {string} html - Raw HTML
 * @returns {object} OG property dictionary { "og:title": "...", ... }
 */
function extractOpenGraph(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const og = {};

  // og:* meta tags
  const ogMetas = doc.querySelectorAll('meta[property^="og:"]');
  for (const meta of ogMetas) {
    const prop = meta.getAttribute("property");
    const content = meta.getAttribute("content");
    if (prop && content) {
      og[prop] = content;
    }
  }

  // twitter:* meta tags
  const twitterMetas = doc.querySelectorAll('meta[name^="twitter:"], meta[property^="twitter:"]');
  for (const meta of twitterMetas) {
    const prop = meta.getAttribute("name") || meta.getAttribute("property");
    const content = meta.getAttribute("content");
    if (prop && content) {
      og[prop] = content;
    }
  }

  // Basic meta tags
  const descMeta = doc.querySelector('meta[name="description"]');
  if (descMeta) og["meta:description"] = descMeta.getAttribute("content");

  const titleEl = doc.querySelector("title");
  if (titleEl) og["meta:title"] = titleEl.textContent.trim();

  return og;
}

/**
 * Flatten JSON-LD data into key-value pairs
 * Nested objects become "parent.child" format
 */
function flattenObject(obj, prefix = "") {
  const result = {};

  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith("@")) continue; // Skip @type, @context, etc.

    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }

  return result;
}

/**
 * Match structured data against a schema
 * For each schema key, find a corresponding value in structured data
 * @param {object} structuredData - Flattened structured data
 * @param {object} schema - User-defined schema
 * @returns {{ matched: object, coverage: number }} Match results and coverage ratio
 */
function matchToSchema(structuredData, schema) {
  const schemaKeys = Object.keys(schema);
  const matched = {};
  let matchCount = 0;

  // Key name alias map (common mapping patterns)
  const keyAliases = {
    title: ["name", "headline", "og:title", "twitter:title", "meta:title"],
    description: ["description", "abstract", "og:description", "twitter:description", "meta:description"],
    price: ["price", "offers.price", "offers.lowPrice"],
    currency: ["priceCurrency", "offers.priceCurrency"],
    image: ["image", "thumbnailUrl", "og:image", "twitter:image"],
    url: ["url", "mainEntityOfPage", "og:url"],
    author: ["author.name", "author", "creator"],
    date: ["datePublished", "dateCreated", "dateModified"],
    published: ["datePublished", "dateCreated"],
    brand: ["brand.name", "brand"],
    category: ["category", "articleSection"],
    rating: ["aggregateRating.ratingValue"],
    reviewCount: ["aggregateRating.reviewCount"],
    availability: ["offers.availability"],
    language: ["inLanguage"],
  };

  for (const schemaKey of schemaKeys) {
    const normalizedKey = schemaKey.toLowerCase().replace(/[_-]/g, "");

    // 1. Direct key match
    if (structuredData[schemaKey] !== undefined) {
      matched[schemaKey] = structuredData[schemaKey];
      matchCount++;
      continue;
    }

    // 2. Alias match
    let found = false;
    for (const [aliasGroup, aliases] of Object.entries(keyAliases)) {
      if (normalizedKey.includes(aliasGroup)) {
        for (const alias of aliases) {
          if (structuredData[alias] !== undefined) {
            matched[schemaKey] = structuredData[alias];
            matchCount++;
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }
    if (found) continue;

    // 3. Partial match (structured data key contains schema key or vice versa)
    for (const [dataKey, dataValue] of Object.entries(structuredData)) {
      const normalizedDataKey = dataKey.toLowerCase().replace(/[_.-]/g, "");
      if (normalizedDataKey.includes(normalizedKey) || normalizedKey.includes(normalizedDataKey)) {
        matched[schemaKey] = dataValue;
        matchCount++;
        break;
      }
    }
  }

  return {
    matched,
    coverage: schemaKeys.length > 0 ? matchCount / schemaKeys.length : 0,
  };
}

/**
 * Extract structured data from HTML and match against schema
 * Returns result if coverage meets threshold (no LLM needed)
 *
 * @param {string} html - Raw HTML
 * @param {object} schema - User-defined schema
 * @param {object} options
 * @param {number} options.minCoverage - Minimum coverage ratio (0-1, default: 0.5)
 * @returns {{ extracted: object, source: string, coverage: number } | null}
 */
export function tryStructuredExtract(html, schema, options = {}) {
  const { minCoverage = 0.5 } = options;

  // 1. Try extraction from JSON-LD
  const jsonLdItems = extractJsonLd(html);
  if (jsonLdItems.length > 0) {
    // Merge and flatten all JSON-LD items
    const merged = {};
    for (const item of jsonLdItems) {
      Object.assign(merged, flattenObject(item));
    }

    const { matched, coverage } = matchToSchema(merged, schema);
    if (coverage >= minCoverage) {
      return { extracted: matched, source: "json-ld", coverage };
    }
  }

  // 2. Try extraction from Open Graph
  const ogData = extractOpenGraph(html);
  if (Object.keys(ogData).length > 0) {
    const { matched, coverage } = matchToSchema(ogData, schema);
    if (coverage >= minCoverage) {
      return { extracted: matched, source: "open-graph", coverage };
    }
  }

  // 3. Merge JSON-LD + OG and retry
  if (jsonLdItems.length > 0 && Object.keys(ogData).length > 0) {
    const merged = {};
    for (const item of jsonLdItems) {
      Object.assign(merged, flattenObject(item));
    }
    Object.assign(merged, ogData);

    const { matched, coverage } = matchToSchema(merged, schema);
    if (coverage >= minCoverage) {
      return { extracted: matched, source: "json-ld+open-graph", coverage };
    }
  }

  // Coverage insufficient -> null (fallback to LLM)
  return null;
}
