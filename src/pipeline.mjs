// src/pipeline.mjs
// Scraping -> Markdown conversion -> LLM structured extraction pipeline

import {
  fetchPage,
  fetchPages,
  launchBrowser,
  closeBrowser,
} from "./scraper.mjs";
import { htmlToMarkdown, cleanMarkdown, truncateForLLM } from "./html2md.mjs";
import { initLLM, extractStructured, queryLLM } from "./llm.mjs";

/**
 * Default schema definition
 */
const DEFAULT_SCHEMA = {
  title: "Page title (string)",
  description: "Page summary in 1-2 sentences (string)",
  main_topics: "List of main topics (array of strings)",
  key_facts: "Important facts and data points (array of strings)",
  entities: "People, organizations, and product names mentioned (array of strings)",
  language: "Content language (string, e.g. 'ja', 'en')",
};

/**
 * Scrape a single URL and extract structured data
 * @param {string} url
 * @param {object} options
 */
export async function scrapeAndExtract(url, options = {}) {
  const {
    schema = DEFAULT_SCHEMA,
    preset = "balanced",
    device = "webgpu",
    maxTokens = 2048,
    selector,
    browserOptions = {},
    scrapeOptions = {},
  } = options;

  await launchBrowser(browserOptions);

  const { html, url: finalUrl, status } = await fetchPage(url, scrapeOptions);
  if (!html) return { url, error: "Failed to fetch page", status };

  const { markdown, title, excerpt } = htmlToMarkdown(html, finalUrl, { selector });
  const llmInput = cleanMarkdown(markdown);
  const metadata = {
    url: finalUrl, status, title, excerpt,
    markdown_length: markdown.length,
    cleaned_length: llmInput.length,
    extraction_source: "llm",
  };

  // LLM structured extraction
  await initLLM(preset, device);
  const extracted = await extractStructured(llmInput, schema);

  return { ...metadata, extracted };
}

/**
 * Batch process multiple URLs
 */
export async function batchScrapeAndExtract(urls, options = {}) {
  const {
    schema = DEFAULT_SCHEMA,
    preset = "balanced",
    device = "webgpu",
    maxTokens = 2048,
    concurrency = 3,
    browserOptions = {},
    scrapeOptions = {},
  } = options;

  await initLLM(preset, device);
  await launchBrowser(browserOptions);

  const results = [];
  const pages = await fetchPages(urls, scrapeOptions, concurrency);

  for (const page of pages) {
    if (page.error || !page.html) {
      results.push({ url: page.url, error: page.error || "Empty response", extracted: null });
      continue;
    }

    const { markdown, title } = htmlToMarkdown(page.html, page.url);
    const truncated = truncateForLLM(cleanMarkdown(markdown), maxTokens);

    try {
      const extracted = await extractStructured(truncated, schema);
      results.push({ url: page.url, status: page.status, title, extraction_source: "llm", extracted });
    } catch (error) {
      results.push({ url: page.url, error: error.message, extracted: null });
    }
  }

  return results;
}

/**
 * Custom prompt query against page content
 */
export async function scrapeAndQuery(url, prompt, options = {}) {
  const {
    preset = "balanced",
    device = "webgpu",
    maxTokens = 2048,
    browserOptions = {},
    scrapeOptions = {},
  } = options;

  await launchBrowser(browserOptions);

  const { html, url: finalUrl } = await fetchPage(url, scrapeOptions);
  if (!html) return { url, error: "Failed to fetch" };

  const { markdown } = htmlToMarkdown(html, finalUrl);
  const content = truncateForLLM(cleanMarkdown(markdown), maxTokens);

  await initLLM(preset, device);

  const answer = await queryLLM(
    "You are a helpful assistant analyzing web content. Answer based only on the provided content.",
    `${prompt}\n\n---\nContent:\n${content}`
  );

  return { url, answer };
}

/**
 * Cleanup (close browser)
 */
export async function cleanup() {
  await closeBrowser();
}

export { DEFAULT_SCHEMA };
