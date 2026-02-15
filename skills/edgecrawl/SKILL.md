---
name: edgecrawl
description: Local AI-powered web scraper using on-device ONNX LLMs. Use when scraping websites, extracting structured JSON from web pages, converting HTML to Markdown, or querying page content with natural language. Triggers on tasks involving web scraping, data extraction from URLs, HTML processing, or using the edgecrawl CLI/library.
---

# edgecrawl

Local AI web scraper — extract structured JSON from any URL using Qwen3 ONNX models. No API keys, no cloud.

## Quick Start

### CLI
```bash
npx edgecrawl extract https://example.com --selector '#article' -s schema.json -o result.json
```

### Library
```javascript
import { scrapeAndExtract, cleanup } from "edgecrawl";

const result = await scrapeAndExtract("https://example.com", {
  schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Title" },
      summary: { type: "string", description: "Summary" },
    },
    required: ["title", "summary"],
  },
  preset: "balanced",
  selector: "#article",
});
console.log(result.extracted);
await cleanup();
```

## Key Concepts

- **Schema**: JSON Schema format with `type`, `properties`, `description`, `required`.
- **Selector**: CSS selector to narrow HTML before processing. Critical for large pages.
- **Preset**: `light` (0.6B, fast), `balanced` (1.7B, default), `quality` (4B, best accuracy)
- **Device**: `webgpu` (default, GPU) or `wasm` (CPU fallback)
- **Pipeline**: HTML → selector filter → Markdown → cleanMarkdown → LLM extraction

## Tips

- Always use `--selector` to target the article/content area. Reduces noise and improves extraction quality.
- `light` (0.6B) struggles with Japanese and complex schemas. Use `balanced` or higher.
- Always call `cleanup()` after using the library API.
- Save results with `-o result.json` in CLI.

## Full API Reference

See [references/api_reference.md](references/api_reference.md) for complete CLI options, library API, and model details.
