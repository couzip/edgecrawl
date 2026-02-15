#!/usr/bin/env node
// src/cli.mjs
// CLI entry point

import { Command } from "commander";
import { readFileSync, writeFileSync, existsSync } from "fs";

async function loadPipeline() {
  return await import("./pipeline.mjs");
}

const program = new Command();

program
  .name("edgecrawl")
  .description("Local AI-powered web scraper — extract structured JSON using on-device ONNX LLMs")
  .version("0.3.0");

// ---- Repeatable option helper ----
function collect(val, memo) {
  memo.push(val);
  return memo;
}

// ---- Browser options ----
function addBrowserOptions(cmd) {
  return cmd
    .option("--headful", "Show browser window (for debugging)")
    .option("--user-agent <ua>", "Custom User-Agent string")
    .option("--timeout <ms>", "Page load timeout in milliseconds", "30000")
    .option("--no-block-media", "Disable blocking of images/fonts/media")
    .option("--viewport <WxH>", "Viewport size (e.g. 1920x1080)", "1280x800")
    .option("--wait-until <event>", "Navigation wait condition (load/domcontentloaded/networkidle)", "load")
    .option("--proxy <url>", "Proxy server URL")
    .option("--cookie <cookie>", "Cookie in name=value format (repeatable)", collect, [])
    .option("--extra-header <header>", "HTTP header in Key:Value format (repeatable)", collect, [])
    .option("--scroll", "Scroll to bottom (for lazy-loaded content)")
    .option("--wait <selector>", "Wait for CSS selector to appear");
}

// ---- Common options (LLM + browser) ----
function addCommonOptions(cmd) {
  cmd = cmd
    .option("-p, --preset <preset>", "Model preset (light/balanced/quality)", "balanced")
    .option("-d, --device <device>", "Inference device (webgpu/wasm)", "webgpu")
    .option("-s, --schema <file>", "Custom schema JSON file")
    .option("-o, --output <file>", "Output file (default: stdout)")
    .option("-t, --max-tokens <n>", "Max input tokens for LLM", "2048")
    .option("--selector <selector>", "CSS selector to narrow target content");
  return addBrowserOptions(cmd);
}

function buildBrowserOptions(opts) {
  return {
    headless: !opts.headful,
    ...(opts.proxy && { proxy: opts.proxy }),
  };
}

function buildScrapeOptions(opts) {
  const [vw, vh] = (opts.viewport || "1280x800").split("x").map(Number);
  return {
    scrollToBottom: opts.scroll,
    waitForSelector: opts.wait,
    userAgent: opts.userAgent,
    timeout: parseInt(opts.timeout || "30000"),
    blockMedia: opts.blockMedia,
    waitUntil: opts.waitUntil,
    viewportWidth: vw || 1280,
    viewportHeight: vh || 800,
    cookies: opts.cookie || [],
    extraHeaders: opts.extraHeader || [],
  };
}

function outputResult(result, opts) {
  const json = JSON.stringify(result, null, 2);
  if (opts.output) {
    writeFileSync(opts.output, json);
    console.error(`Result saved to ${opts.output}`);
  } else {
    console.log(json);
  }
}

// ---- Single URL extraction ----
addCommonOptions(
  program
    .command("extract <url>")
    .description("Extract structured JSON data from a URL")
).action(async (url, opts) => {
  try {
    const { scrapeAndExtract, cleanup } = await loadPipeline();
    const schema = opts.schema ? JSON.parse(readFileSync(opts.schema, "utf-8")) : undefined;

    console.error(`Scraping: ${url}`);
    console.error(`Model: ${opts.preset} / Device: ${opts.device}`);

    const result = await scrapeAndExtract(url, {
      schema,
      preset: opts.preset,
      device: opts.device,
      maxTokens: parseInt(opts.maxTokens),
      selector: opts.selector,
      browserOptions: buildBrowserOptions(opts),
      scrapeOptions: buildScrapeOptions(opts),
    });

    outputResult(result, opts);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  } finally {
    const { cleanup } = await loadPipeline();
    await cleanup();
  }
});

// ---- Batch processing ----
addCommonOptions(
  program
    .command("batch <file>")
    .description("Batch extract from a URL list file (one URL per line)")
    .option("-c, --concurrency <n>", "Concurrent scraping limit", "3")
).action(async (file, opts) => {
  try {
    const { batchScrapeAndExtract } = await loadPipeline();
    if (!existsSync(file)) {
      console.error(`File not found: ${file}`);
      process.exit(1);
    }

    const urls = readFileSync(file, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));

    console.error(`Processing ${urls.length} URLs...`);

    const schema = opts.schema ? JSON.parse(readFileSync(opts.schema, "utf-8")) : undefined;

    const results = await batchScrapeAndExtract(urls, {
      schema,
      preset: opts.preset,
      device: opts.device,
      concurrency: parseInt(opts.concurrency),
      browserOptions: buildBrowserOptions(opts),
      scrapeOptions: buildScrapeOptions(opts),
    });

    const outFile = opts.output || "results.json";
    writeFileSync(outFile, JSON.stringify(results, null, 2));
    console.error(`Done. ${results.length} results saved to ${outFile}`);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  } finally {
    const { cleanup } = await loadPipeline();
    await cleanup();
  }
});

// ---- Custom query ----
addCommonOptions(
  program
    .command("query <url> <prompt>")
    .description("Ask a custom question about a page's content")
).action(async (url, prompt, opts) => {
  try {
    const { scrapeAndQuery, cleanup } = await loadPipeline();
    console.error(`Scraping: ${url}`);
    const result = await scrapeAndQuery(url, prompt, {
      preset: opts.preset,
      device: opts.device,
      browserOptions: buildBrowserOptions(opts),
      scrapeOptions: buildScrapeOptions(opts),
    });

    outputResult(result, opts);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  } finally {
    const { cleanup } = await loadPipeline();
    await cleanup();
  }
});

// ---- Markdown conversion only (no LLM) ----
addBrowserOptions(
  program
    .command("md <url>")
    .description("Convert HTML to Markdown (no LLM)")
    .option("-o, --output <file>", "Output file")
    .option("--selector <selector>", "CSS selector to narrow target content")
).action(async (url, opts) => {
    try {
      const { fetchPage, launchBrowser } = await import("./scraper.mjs");
      const { htmlToMarkdown, cleanMarkdown } = await import("./html2md.mjs");

      await launchBrowser(buildBrowserOptions(opts));
      const { html, url: finalUrl } = await fetchPage(url, buildScrapeOptions(opts));

      const { markdown, title } = htmlToMarkdown(html, finalUrl, { selector: opts.selector });
      const cleaned = cleanMarkdown(markdown);

      console.error(`Markdown: ${markdown.length} chars -> cleaned: ${cleaned.length} chars (${Math.round((1 - cleaned.length / markdown.length) * 100)}% reduction)`);

      const output = `# ${title}\n\nSource: ${finalUrl}\n\n---\n\n${cleaned}`;

      if (opts.output) {
        writeFileSync(opts.output, output);
        console.error(`Saved to ${opts.output}`);
      } else {
        console.log(output);
      }
    } catch (err) {
      console.error("Error:", err.message);
      process.exit(1);
    } finally {
      const { closeBrowser } = await import("./scraper.mjs");
      await closeBrowser();
    }
  });

program.parse();
