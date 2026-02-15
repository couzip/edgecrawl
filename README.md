# edgecrawl

Local AI-powered web scraper. Extract structured JSON from any website using on-device ONNX LLMs. No API keys, no cloud, no Python.

## Features

- **100% Local AI** — Runs Qwen3 ONNX models on your machine via Transformers.js v4 (WebGPU/WASM)
- **Zero API Keys** — No OpenAI, no Anthropic, no cloud bills. Everything runs on-device
- **Structured JSON Output** — Define a schema, get clean JSON back
- **Smart Extraction** — Tries JSON-LD/Open Graph first, falls back to LLM only when needed
- **CLI + Library** — Use from the command line or import into your Node.js app

## Architecture

```
Playwright (headless browser)
  |
  v
JSDOM + node-html-markdown -> Clean Markdown
  |
  v
Qwen3 ONNX (Transformers.js v4) -> Structured JSON
```

## Quick Start

### Install from npm

```bash
npm install edgecrawl
npx playwright install chromium
```

### Install from source

```bash
git clone https://github.com/couzip/edgecrawl.git
cd edgecrawl
npm install
npx playwright install chromium
```

Models are downloaded automatically on first run:
- LLM: Qwen3 ONNX (0.4-2.5 GB depending on preset)

### CLI

```bash
# Extract structured data from a URL
edgecrawl extract https://example.com

# With custom schema
edgecrawl extract https://example.com -s schemas/product.json -o result.json

# Light model on WASM
edgecrawl extract https://example.com -p light -d wasm

# Convert to Markdown only (no LLM)
edgecrawl md https://example.com
```

### Library

```javascript
import { scrapeAndExtract, cleanup } from "edgecrawl";

const result = await scrapeAndExtract("https://example.com", {
  preset: "balanced",
});

console.log(result.extracted);
await cleanup();
```

## CLI Commands

### `extract <url>` — Structured extraction

```bash
# Default (balanced model, WebGPU)
edgecrawl extract https://example.com

# Light model on WASM
edgecrawl extract https://example.com -p light -d wasm

# Custom schema + output file
edgecrawl extract https://example.com -s schemas/product.json -o result.json

# Target a specific section
edgecrawl extract https://example.com --selector "main article"
```

### `batch <file>` — Batch processing

```bash
# Process URL list (one URL per line)
edgecrawl batch urls.txt -o results.json

# With concurrency control
edgecrawl batch urls.txt -c 5
```

### `query <url> <prompt>` — Custom question

```bash
# Ask a question about page content
edgecrawl query https://example.com "What are the main products?"
```

### `md <url>` — Markdown conversion only (no LLM)

```bash
edgecrawl md https://example.com
edgecrawl md https://example.com -o page.md --scroll
```

## CLI Options

### Common Options (extract, batch, query)

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --preset <preset>` | Model preset: `light` / `balanced` / `quality` | `balanced` |
| `-d, --device <device>` | Inference device: `webgpu` / `wasm` | `webgpu` |
| `-s, --schema <file>` | Custom schema JSON file | built-in default |
| `-o, --output <file>` | Output file path | stdout |
| `-t, --max-tokens <n>` | Max input tokens for LLM | `2048` |
| `--selector <selector>` | CSS selector to narrow target content | - |

### Batch Options

| Option | Description | Default |
|--------|-------------|---------|
| `-c, --concurrency <n>` | Concurrent scraping limit | `3` |

### Browser Options (all commands)

| Option | Description | Default |
|--------|-------------|---------|
| `--headful` | Show browser window (for debugging) | `false` |
| `--user-agent <ua>` | Custom User-Agent string | - |
| `--timeout <ms>` | Page load timeout in milliseconds | `30000` |
| `--proxy <url>` | Proxy server URL | - |
| `--cookie <cookie>` | Cookie in `name=value` format (repeatable) | - |
| `--extra-header <header>` | HTTP header in `Key:Value` format (repeatable) | - |
| `--viewport <WxH>` | Viewport size | `1280x800` |
| `--wait-until <event>` | Navigation wait condition: `load` / `domcontentloaded` / `networkidle` | `load` |
| `--no-block-media` | Disable blocking of images/fonts/media | `false` |
| `--scroll` | Scroll to bottom (for lazy-loaded content) | `false` |
| `--wait <selector>` | Wait for CSS selector to appear | - |

## Library Usage

### High-level Pipeline

```javascript
import {
  scrapeAndExtract,
  batchScrapeAndExtract,
  scrapeAndQuery,
  cleanup,
} from "edgecrawl";

// Basic extraction
const result = await scrapeAndExtract("https://example.com");

// Custom schema
const product = await scrapeAndExtract("https://shop.example.com/item", {
  schema: {
    title: "Product name (string)",
    price: "Current price (string)",
    features: "Key features (array of strings)",
  },
});

// Batch processing
const results = await batchScrapeAndExtract(
  ["https://example.com/1", "https://example.com/2"],
  { concurrency: 3 }
);

// Custom query
const answer = await scrapeAndQuery(
  "https://example.com",
  "What are the main products?",
  { preset: "quality" }
);

await cleanup();
```

### Low-level APIs

```javascript
// Use individual modules
import { htmlToMarkdown, cleanMarkdown } from "edgecrawl/html2md";
import { launchBrowser, fetchPage, closeBrowser } from "edgecrawl/scraper";
import { initLLM, extractStructured } from "edgecrawl/llm";

// HTML to Markdown only
await launchBrowser();
const { html } = await fetchPage("https://example.com");
const { markdown, title } = htmlToMarkdown(html, "https://example.com");
const cleaned = cleanMarkdown(markdown);
await closeBrowser();

// Or use the root export
import { htmlToMarkdown, cleanMarkdown, fetchPage } from "edgecrawl";
```

## Custom Schemas

Define what data to extract by providing a JSON schema file:

```json
{
  "title": "Product name (string)",
  "price": "Current price (string)",
  "currency": "Currency code (string)",
  "description": "Product description (string)",
  "features": "Key features (array of strings)",
  "availability": "In stock or out of stock (string)"
}
```

```bash
edgecrawl extract https://shop.example.com/product -s schema.json
```

See the `schemas/` directory for more examples.

## Model Presets

| Preset | Model | Size | Speed | Quality |
|--------|-------|------|-------|---------|
| `light` | Qwen3-0.6B | ~0.4 GB | Fast | Good for simple pages |
| `balanced` | Qwen3-1.7B | ~1.2 GB | Medium | Best balance (default) |
| `quality` | Qwen3-4B | ~2.5 GB | Slower | Best accuracy |

All models run locally via ONNX Runtime. First run downloads the model to `.model-cache/`.

## Tech Stack

| Component | Library | Role |
|-----------|---------|------|
| Browser | Playwright | Headless scraping |
| HTML -> Markdown | JSDOM + node-html-markdown | Content cleaning + Markdown conversion |
| LLM | Transformers.js v4 + Qwen3 ONNX | Local structured extraction |
| CLI | Commander.js | Command-line interface |

## Requirements

- Node.js >= 20.0.0
- Chromium (installed via `npx playwright install chromium`)
- ~1-3 GB disk space for models (downloaded on first run)
- GPU recommended for WebGPU mode (falls back to WASM/CPU)

## License

MIT
