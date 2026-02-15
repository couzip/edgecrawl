// src/html2md.mjs
// HTML -> clean Markdown conversion
// CSS selector-based HTML cleaning + node-html-markdown

import { JSDOM } from "jsdom";
import { NodeHtmlMarkdown } from "node-html-markdown";

// ---- CSS selector-based HTML cleaning ----

// Elements to remove: nav, footer, sidebar, ads, modals, social, etc.
const REMOVE_SELECTORS = [
  // Nav, header, footer
  "header", "footer", "nav",
  ".header", ".top", ".navbar", "#header",
  ".footer", ".bottom", "#footer",
  // Sidebar
  "aside",
  ".sidebar", ".side", ".aside", "#sidebar",
  // Ads
  ".ad", ".ads", ".advert", "#ad",
  "[class*='ad-']", "[class*='ads-']", "[id*='ad-']",
  // Modals, popups
  ".modal", ".popup", "#modal", ".overlay",
  // Social, share
  ".social", ".social-media", ".social-links", "#social",
  ".share", "#share",
  // Nav, menu, breadcrumbs
  ".menu", ".navigation", "#nav",
  ".breadcrumbs", "#breadcrumbs", ".breadcrumb",
  // Widgets, cookie banners
  ".widget", "#widget",
  ".cookie", "#cookie", ".cookie-banner",
  // Language selectors
  ".lang-selector", ".language", "#language-selector",
];

// Protected elements: do not remove if they contain or are contained by these
const PROTECT_SELECTORS = [
  "#main", "#content", "main", "article",
  "[role='main']", "[role='article']",
];

/**
 * Remove unwanted noise elements from HTML using CSS selectors
 * @param {Document} document - JSDOM document
 */
function removeUnwantedElements(document) {
  // 0. Remove <head> — title and meta description are extracted beforehand
  const head = document.querySelector("head");
  if (head) head.remove();

  // 1. Remove script, style, noscript, iframe, svg, canvas, template
  for (const tag of ["script", "style", "noscript", "iframe", "svg", "canvas", "template"]) {
    for (const el of document.querySelectorAll(tag)) {
      el.remove();
    }
  }

  // 2. Strip style attributes, event handlers, and data-* attributes
  for (const el of document.querySelectorAll("*")) {
    const attrs = Array.from(el.attributes || []);
    for (const attr of attrs) {
      if (
        attr.name === "style" ||
        attr.name.startsWith("on") ||
        attr.name.startsWith("data-")
      ) {
        el.removeAttribute(attr.name);
      }
    }
  }

  // 3. Remove hidden elements
  for (const el of document.querySelectorAll("[hidden], [aria-hidden='true']")) {
    el.remove();
  }

  // 4. Collect protected elements
  const protectedElements = new Set();
  for (const sel of PROTECT_SELECTORS) {
    try {
      for (const el of document.querySelectorAll(sel)) {
        protectedElements.add(el);
      }
    } catch { /* invalid selector */ }
  }

  function isProtected(el) {
    for (const p of protectedElements) {
      if (p.contains(el) || el.contains(p)) return true;
    }
    return false;
  }

  // 5. Remove noise elements by CSS selector
  for (const sel of REMOVE_SELECTORS) {
    try {
      for (const el of document.querySelectorAll(sel)) {
        if (!isProtected(el)) el.remove();
      }
    } catch { /* invalid selector */ }
  }

  // 6. Remove empty elements
  for (const tag of ["div", "span", "p", "section"]) {
    for (const el of document.querySelectorAll(tag)) {
      if (!el.textContent.trim() && !el.querySelector("img, video")) {
        el.remove();
      }
    }
  }
}

/**
 * Convert relative URLs to absolute URLs
 * @param {Document} document
 * @param {string} baseUrl
 */
function absolutifyURLs(document, baseUrl) {
  try {
    const base = new URL(baseUrl);

    for (const img of document.querySelectorAll("img[src]")) {
      try {
        img.setAttribute("src", new URL(img.getAttribute("src"), base).href);
      } catch { /* invalid URL */ }
    }

    for (const a of document.querySelectorAll("a[href]")) {
      try {
        const href = a.getAttribute("href");
        if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
          a.setAttribute("href", new URL(href, base).href);
        }
      } catch { /* invalid URL */ }
    }
  } catch { /* invalid baseUrl */ }
}

/**
 * Resolve img srcset to the largest image URL
 * @param {Document} document
 * @param {string} baseUrl
 */
function resolveSrcset(document, baseUrl) {
  for (const img of document.querySelectorAll("img[srcset]")) {
    try {
      const srcset = img.getAttribute("srcset");
      const candidates = srcset.split(",").map((s) => {
        const parts = s.trim().split(/\s+/);
        const url = parts[0];
        const descriptor = parts[1] || "1x";
        const size = parseFloat(descriptor) || 1;
        return { url, size };
      });
      candidates.sort((a, b) => b.size - a.size);
      if (candidates.length > 0) {
        const resolved = new URL(candidates[0].url, baseUrl).href;
        img.setAttribute("src", resolved);
      }
      img.removeAttribute("srcset");
    } catch { /* parse error */ }
  }
}

/**
 * Main HTML-to-Markdown conversion
 * CSS selector-based HTML cleaning -> node-html-markdown
 * @param {string} html - Raw HTML
 * @param {string} url  - Source URL
 * @param {object} options
 * @param {string} options.selector - CSS selector to narrow target content
 * @returns {{ markdown: string, title: string, excerpt: string }}
 */
export function htmlToMarkdown(html, url = "https://example.com", options = {}) {
  const { selector } = options;
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;

  // Extract title and meta description first
  const title = document.title || "";
  const metaDesc = document.querySelector('meta[name="description"]');
  const excerpt = metaDesc ? metaDesc.getAttribute("content") || "" : "";

  // If selector specified, replace body with target element
  if (selector) {
    const target = document.querySelector(selector);
    if (target) {
      document.body.innerHTML = target.outerHTML;
    }
  }

  // HTML cleaning
  removeUnwantedElements(document);
  absolutifyURLs(document, url);
  resolveSrcset(document, url);

  // Convert cleaned HTML to Markdown via node-html-markdown
  const bodyHtml = document.body?.innerHTML || "";
  if (!bodyHtml.trim()) {
    return { markdown: "", title, excerpt };
  }

  const markdown = NodeHtmlMarkdown.translate(bodyHtml, {
    maxConsecutiveNewlines: 2,
  }).trim();

  return { markdown, title, excerpt };
}

/**
 * Markdown post-processing: generic noise reduction for LLM input
 * Algorithm-based, no site-specific rules
 * @param {string} md - Raw Markdown
 * @param {object} options
 * @param {boolean} options.removeImages - Remove image references (default: false)
 * @returns {string} Cleaned Markdown
 */
export function cleanMarkdown(md, options = {}) {
  const { removeImages = false } = options;

  let result = md;

  // 1. Remove lines containing javascript: links
  result = result.replace(/^.*\[.*\]\(javascript:.*\).*$/gm, "");

  // 2. Remove empty links and alt-less images
  result = result
    .replace(/\[\s*\]\([^)]*\)/g, "")          // [](url) or [ ](url)
    .replace(/!\[\]\([^)]*\)/g, "");            // ![](url) alt-less image

  // 3. Hash-only links -> keep text only
  result = result.replace(/\[([^\]]+)\]\(#[^)]*\)/g, "$1");

  // 4. Overly long URL links -> keep text only
  result = result.replace(/\[([^\]]+)\]\([^)]{150,}\)/g, "$1");

  // 5. Normalize extra whitespace in link text
  result = result.replace(/\[([^\]]*)\]/g, (_, t) => `[${t.replace(/\s+/g, " ").trim()}]`);

  // 6. Remove lines containing template variables (${var}, %var%)
  result = result.replace(/^.*\$\{[^}]+\}.*$/gm, "");
  result = result.replace(/^\s*%[a-zA-Z]\w*%\s*$/gm, "");

  // 7. Remove JSON-like lines (escaped included: {" or {\\" patterns)
  result = result.replace(/^\s*\{\\?".*[\w_]+\\?"\s*:.*\}\s*$/gm, "");

  // 8. Remove images (optional)
  if (removeImages) {
    result = result.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  }

  // 9. Collapse consecutive blank lines
  return result
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Truncate Markdown to fit within LLM token limits
 * Rough estimate: 1 token ~ 3 characters
 */
export function truncateForLLM(markdown, maxTokens = 2048) {
  const approxMaxChars = maxTokens * 3;
  if (markdown.length <= approxMaxChars) return markdown;

  return markdown.slice(0, approxMaxChars) + "\n\n[... truncated]";
}
