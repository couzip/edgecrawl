// index.mjs — edgecrawl package entry point

// High-level pipeline functions
export {
  scrapeAndExtract,
  batchScrapeAndExtract,
  scrapeAndQuery,
  cleanup,
  DEFAULT_SCHEMA,
} from "./src/pipeline.mjs";

// LLM utilities
export { initLLM, extractStructured, queryLLM, MODEL_PRESETS } from "./src/llm.mjs";

// HTML-to-Markdown conversion
export { htmlToMarkdown, cleanMarkdown, truncateForLLM } from "./src/html2md.mjs";

// Structured data extraction (JSON-LD / Open Graph)
export { tryStructuredExtract } from "./src/structured-extract.mjs";

// Browser / scraping primitives
export { launchBrowser, fetchPage, fetchPages, closeBrowser } from "./src/scraper.mjs";
