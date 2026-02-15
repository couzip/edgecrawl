// examples/basic.mjs
// Basic usage examples for edgecrawl

import {
  scrapeAndExtract,
  scrapeAndQuery,
  cleanup,
} from "edgecrawl";

// ---- 1. Extract structured data ----
async function extract() {
  const result = await scrapeAndExtract("https://example.com", {
    preset: "balanced",
  });
  console.log("=== Extract ===");
  console.log(JSON.stringify(result, null, 2));
}

// ---- 2. Extract with custom schema ----
async function extractWithSchema() {
  const result = await scrapeAndExtract("https://example.com", {
    preset: "balanced",
    schema: {
      title: "Page title (string)",
      main_content: "Summary of main content (string)",
      links: "Important links found on the page (array of strings)",
    },
  });
  console.log("=== Custom Schema ===");
  console.log(JSON.stringify(result, null, 2));
}

// ---- 3. Custom query ----
async function customQuery() {
  const result = await scrapeAndQuery(
    "https://example.com",
    "What are the main topics covered on this page?"
  );
  console.log("=== Custom Query ===");
  console.log(result.answer);
}

// Run
try {
  await extract();
  // await extractWithSchema();
  // await customQuery();
} finally {
  await cleanup();
}
