# edgecrawl API Reference

## CLI Commands

### `edgecrawl extract <url>`
Extract structured JSON from a URL.
```bash
edgecrawl extract https://example.com -p balanced --selector '#main' -s schema.json -o result.json
```

### `edgecrawl batch <file>`
Batch extract from URL list file (one URL per line).
```bash
edgecrawl batch urls.txt -c 5 -o results.json
```

### `edgecrawl query <url> <prompt>`
Ask a custom question about page content.
```bash
edgecrawl query https://example.com "What products are listed?" -o answer.json
```

### `edgecrawl md <url>`
Convert HTML to Markdown only (no LLM).
```bash
edgecrawl md https://example.com --selector 'article' -o page.md
```

## CLI Options

### LLM Options
| Option | Description | Default |
|--------|-------------|---------|
| `-p, --preset <preset>` | `light` / `balanced` / `quality` | `balanced` |
| `-d, --device <device>` | `webgpu` / `wasm` | `webgpu` |
| `-s, --schema <file>` | Custom schema JSON file | built-in |
| `-o, --output <file>` | Output file path | stdout |
| `-t, --max-tokens <n>` | Max input tokens | `2048` |
| `--selector <selector>` | CSS selector to narrow content | - |

### Batch Options
| Option | Description | Default |
|--------|-------------|---------|
| `-c, --concurrency <n>` | Concurrent scraping limit | `3` |

### Browser Options
| Option | Description | Default |
|--------|-------------|---------|
| `--headful` | Show browser window | `false` |
| `--user-agent <ua>` | Custom User-Agent | - |
| `--timeout <ms>` | Page load timeout | `30000` |
| `--proxy <url>` | Proxy server URL | - |
| `--cookie <cookie>` | Cookie `name=value` (repeatable) | - |
| `--extra-header <header>` | HTTP header `Key:Value` (repeatable) | - |
| `--viewport <WxH>` | Viewport size | `1280x800` |
| `--wait-until <event>` | `load` / `domcontentloaded` / `networkidle` | `load` |
| `--no-block-media` | Disable blocking images/fonts/media | `false` |
| `--scroll` | Scroll to bottom for lazy-loaded content | `false` |
| `--wait <selector>` | Wait for CSS selector to appear | - |

## Library API

### High-level Functions

```javascript
import { scrapeAndExtract, batchScrapeAndExtract, scrapeAndQuery, cleanup } from "edgecrawl";
```

#### `scrapeAndExtract(url, options?) → Promise<object>`
```javascript
const result = await scrapeAndExtract("https://example.com", {
  schema: { title: "Article title (string)", summary: "Summary (string)" },
  preset: "balanced",
  device: "webgpu",
  selector: "#article",
  browserOptions: { headless: true },
  scrapeOptions: { scrollToBottom: true, timeout: 30000 },
});
// Returns: { url, status, title, excerpt, markdown_length, cleaned_length, extraction_source, extracted }
```

#### `batchScrapeAndExtract(urls, options?) → Promise<object[]>`
```javascript
const results = await batchScrapeAndExtract(
  ["https://example.com/1", "https://example.com/2"],
  { schema, preset: "balanced", concurrency: 3 }
);
```

#### `scrapeAndQuery(url, prompt, options?) → Promise<object>`
```javascript
const result = await scrapeAndQuery("https://example.com", "What products are listed?", {
  preset: "balanced",
});
// Returns: { url, answer }
```

#### `cleanup() → Promise<void>`
Close browser. Always call after scraping.

### Low-level APIs

```javascript
import { launchBrowser, fetchPage, fetchPages, closeBrowser } from "edgecrawl/scraper";
import { htmlToMarkdown, cleanMarkdown, truncateForLLM } from "edgecrawl/html2md";
import { initLLM, extractStructured, queryLLM, MODEL_PRESETS } from "edgecrawl/llm";
```

## Model Presets

| Preset | Model | Size | Best for |
|--------|-------|------|----------|
| `light` | Qwen3-0.6B | ~0.4 GB | Simple English pages, speed priority |
| `balanced` | Qwen3-1.7B | ~1.2 GB | General use (default) |
| `quality` | Qwen3-4B | ~2.5 GB | Complex pages, best accuracy |

Notes:
- `light` (0.6B) struggles with Japanese content and complex schemas
- `balanced` (1.7B) handles most tasks well including Japanese
- All models run locally via ONNX Runtime, first run downloads to `.model-cache/`

## Schema Format

Simple key-value object where keys are field names and values describe what to extract:

```json
{
  "title": "Article headline (string)",
  "summary": "Summary in 3-5 sentences (string)",
  "topics": "Main topics covered (array of strings)"
}
```

Use `--selector` to narrow HTML to the relevant section before extraction. This improves quality and speed.
