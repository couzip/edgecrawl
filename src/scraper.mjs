// src/scraper.mjs
// Playwright headless browser scraping

import { chromium } from "playwright";

let browser = null;

/**
 * Launch browser
 * @param {object} options
 * @param {boolean} options.headless - Headless mode (default: true)
 * @param {string}  options.proxy    - Proxy server URL
 */
export async function launchBrowser(options = {}) {
  if (browser) return;

  const { headless = true, proxy } = options;

  browser = await chromium.launch({
    headless,
    ...(proxy && { proxy: { server: proxy } }),
  });
}

/**
 * Create browser context (shared helper)
 * Sets Cookie, extra headers, UserAgent, Viewport
 */
async function createContext(options = {}, targetUrl = null) {
  const {
    userAgent = null,
    viewportWidth,
    viewportHeight,
    cookies = [],
    extraHeaders = [],
  } = options;

  const context = await browser.newContext({
    ...(userAgent && { userAgent }),
    ...(viewportWidth && viewportHeight && {
      viewport: { width: viewportWidth, height: viewportHeight },
    }),
  });

  // Set cookies
  if (cookies.length > 0 && targetUrl) {
    const parsed = cookies.map((c) => {
      const [name, ...rest] = c.split("=");
      return { name, value: rest.join("="), url: targetUrl };
    });
    await context.addCookies(parsed);
  }

  // Set extra HTTP headers
  if (extraHeaders.length > 0) {
    const headers = {};
    for (const h of extraHeaders) {
      const idx = h.indexOf(":");
      if (idx > 0) {
        headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
      }
    }
    await context.setExtraHTTPHeaders(headers);
  }

  return context;
}

/**
 * Fetch HTML from a URL
 * @param {string} url
 * @param {object} options
 * @returns {{ html: string, url: string, status: number }}
 */
export async function fetchPage(url, options = {}) {
  if (!browser) await launchBrowser();

  const {
    waitUntil = "load",
    timeout = 30000,
    waitForSelector = null,
    scrollToBottom = false,
    blockMedia = true,
  } = options;

  const context = await createContext(options, url);
  const page = await context.newPage();

  // Block images, fonts, media for faster loading
  if (blockMedia) {
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font"].includes(type)) {
        return route.abort();
      }
      return route.continue();
    });
  }

  try {
    const response = await page.goto(url, { waitUntil, timeout });

    // Wait for dynamic content
    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 10000 });
    }

    // SPA support: wait for DOM to stabilize
    await waitForDOMStable(page);

    // Lazy-loading: scroll to bottom
    if (scrollToBottom) {
      await autoScroll(page);
    }

    const html = await page.content();

    return {
      html,
      url: page.url(), // URL after redirects
      status: response?.status() || 0,
    };
  } finally {
    await context.close();
  }
}

/**
 * Fetch multiple URLs in parallel
 * @param {string[]} urls
 * @param {object} options
 * @param {number} concurrency - Concurrency limit
 */
export async function fetchPages(urls, options = {}, concurrency = 3) {
  const results = [];
  const queue = [...urls];

  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      try {
        const result = await fetchPage(url, options);
        results.push({ url, ...result, error: null });
      } catch (error) {
        results.push({ url, html: null, status: 0, error: error.message });
      }
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Wait for DOM to stabilize (SPA support)
 * Uses MutationObserver to detect when DOM changes settle
 */
async function waitForDOMStable(page, stableMs = 1000, timeoutMs = 10000) {
  await page.evaluate(({ stableMs, timeoutMs }) => {
    return new Promise((resolve) => {
      let timer = null;
      const observer = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          observer.disconnect();
          resolve();
        }, stableMs);
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
      timer = setTimeout(() => {
        observer.disconnect();
        resolve();
      }, stableMs);
      setTimeout(() => {
        observer.disconnect();
        resolve();
      }, timeoutMs);
    });
  }, { stableMs, timeoutMs });
}

/**
 * Auto-scroll to bottom of page (for lazy-loaded content)
 */
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(timer);
        resolve();
      }, 10000);
    });
  });
}

/**
 * Close browser
 */
export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
