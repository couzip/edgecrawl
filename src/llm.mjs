// src/llm.mjs
// ONNX LLM wrapper using Transformers.js v4
// Runs on Node.js with WebGPU or WASM

import { pipeline, env } from "@huggingface/transformers";

const MODEL_PRESETS = {
  // NuExtract: 500M - specialized for structured extraction
  granite: {
    model: "onnx-community/granite-4.0-350m-ONNX-web",
    dtype: "fp16",
    maxNewTokens: 32768,
    type: "granite",
  },
  nuextract: {
    model: "onnx-community/NuExtract-1.5-tiny-ONNX",
    dtype: "q4",
    maxNewTokens: 32768,
    type: "nuextract",
  },
  qwen25: {
    model: "onnx-community/Qwen2.5-0.5B-Instruct-ONNX-MHA",
    dtype: "q4f16",
    maxNewTokens: 32768,
    type: "qwen25",
  },
  // Light: 0.6B - Qwen3
  light: {
    model: "onnx-community/Qwen3-0.6B-ONNX",
    dtype: "q4f16",
    maxNewTokens: 32768,
    type: "qwen3",
  },
  // Balanced: 1.7B - Qwen3
  balanced: {
    model: "onnx-community/Qwen3-1.7B-ONNX",
    dtype: "q4f16",
    maxNewTokens: 32768,
    type: "qwen3",
  },
  // Quality: 4B - Qwen3
  quality: {
    model: "onnx-community/Qwen3-4B-ONNX",
    dtype: "q4f16",
    maxNewTokens: 32768,
    type: "qwen3",
  },
};

let generator = null;
let currentPreset = null;

/**
 * Initialize the LLM
 */
export async function initLLM(preset = "balanced", device = "webgpu") {
  if (generator && currentPreset === preset) return;

  const config = MODEL_PRESETS[preset];
  if (!config) throw new Error(`Unknown preset: ${preset}. Available: ${Object.keys(MODEL_PRESETS).join(", ")}`);

  console.log(`Loading model: ${config.model} (${config.dtype}, ${device})...`);

  env.cacheDir = "./.model-cache";

  generator = await pipeline("text-generation", config.model, {
    dtype: config.dtype,
    device,
  });
  currentPreset = preset;

  console.log("Model loaded.");
}

/**
 * Generate a template object from a JSON Schema
 * NuExtract expects an empty output template, not a JSON Schema
 */
function schemaToTemplate(schema) {
  if (!schema.properties) return schema;

  const template = {};
  for (const [key, def] of Object.entries(schema.properties)) {
    if (def.type === "array") {
      if (def.items?.properties) {
        const item = {};
        for (const [k, v] of Object.entries(def.items.properties)) {
          item[k] = "";
        }
        template[key] = [item];
      } else {
        template[key] = [];
      }
    } else if (def.type === "object" && def.properties) {
      template[key] = schemaToTemplate(def);
    } else {
      template[key] = "";
    }
  }
  return template;
}

/**
 * Extract structured data (JSON) from Markdown content
 */
export async function extractStructured(markdown, schema) {
  if (!generator) throw new Error("LLM not initialized. Call initLLM() first.");

  const config = MODEL_PRESETS[currentPreset];

  if (config.type === "nuextract") {
    return extractWithNuExtract(markdown, schema, config);
  } else if (config.type === "qwen25" || config.type === "granite") {
    return extractWithQwen25(markdown, schema, config);
  } else {
    return extractWithQwen3(markdown, schema, config);
  }
}

/**
 * NuExtract-specific extraction
 */
async function extractWithNuExtract(markdown, schema, config) {
  const template = schemaToTemplate(schema);
  const templateStr = JSON.stringify(template, null, 2);

  const prompt = `<|input|>\n### Template:\n${templateStr}\n### Text:\n${markdown}\n\n<|output|>\n`;

  const output = await generator(prompt, {
    max_new_tokens: config.maxNewTokens,
    do_sample: false,
  });

  const raw = output[0].generated_text.slice(prompt.length).trim();
  return parseJSONSafe(raw);
}

/**
 * Qwen2.5-specific extraction (no thinking mode)
 */
async function extractWithQwen25(markdown, schema, config) {
  const schemaStr = JSON.stringify(schema, null, 2);

  const messages = [
    {
      role: "system",
      content: `You are a data extraction assistant. Extract structured information from the given content and return ONLY valid JSON matching the provided JSON Schema. No explanation, no markdown fences, just raw JSON.`,
    },
    {
      role: "user",
      content: `Extract data from the content below according to this JSON Schema:\n\n${schemaStr}\n\n---\nContent:\n${markdown}\n---\n\nReturn ONLY a valid JSON object matching the schema above.`,
    },
  ];

  const output = await generator(messages, {
    max_new_tokens: config.maxNewTokens,
    temperature: 0.7,
    top_p: 0.8,
    top_k: 20,
    do_sample: true,
    repetition_penalty: 1.2,
  });

  const raw = output[0].generated_text.at(-1).content;
  return normalizeExtracted(parseJSONSafe(raw));
}

/**
 * Qwen3-specific extraction
 */
async function extractWithQwen3(markdown, schema, config) {
  const schemaStr = JSON.stringify(schema, null, 2);

  const messages = [
    {
      role: "system",
      content: `You are a data extraction assistant. Extract structured information from the given content and return ONLY valid JSON matching the provided JSON Schema. No explanation, no markdown fences, no thinking, just raw JSON.`,
    },
    {
      role: "user",
      content: `Extract data from the content below according to this JSON Schema:\n\n${schemaStr}\n\n---\nContent:\n${markdown}\n---\n\nReturn ONLY a valid JSON object matching the schema above.`,
    },
  ];

  const output = await generator(messages, {
    max_new_tokens: config.maxNewTokens,
    temperature: 0,
    do_sample: false,
    repetition_penalty: 1.05,
    enable_thinking: false,
  });

  const raw = output[0].generated_text.at(-1).content;
  return normalizeExtracted(parseJSONSafe(raw));
}

/**
 * Call LLM with a custom prompt
 */
export async function queryLLM(systemPrompt, userPrompt, options = {}) {
  if (!generator) throw new Error("LLM not initialized. Call initLLM() first.");

  const config = MODEL_PRESETS[currentPreset];
  const { noThink = true } = options;

  const finalSystemPrompt = noThink
    ? `${systemPrompt} /no_think`
    : systemPrompt;

  const messages = [
    { role: "system", content: finalSystemPrompt },
    { role: "user", content: userPrompt },
  ];

  const output = await generator(messages, {
    max_new_tokens: config.maxNewTokens,
    do_sample: false,
  });

  return output[0].generated_text.at(-1).content;
}

/**
 * Normalize LLM output structure
 * - If schema definition leaked into output -> extract properties content
 * - If wrapped in array -> extract first element
 */
function normalizeExtracted(parsed) {
  if (!parsed || parsed._error) return parsed;

  // Schema leak: { type: "object", properties: { title: "...", ... } }
  if (parsed.type && parsed.properties && typeof parsed.properties === "object") {
    const inner = parsed.properties;
    // If property values are actual data (not schema defs like { type: "string" })
    const firstVal = Object.values(inner)[0];
    if (firstVal && typeof firstVal !== "object") {
      return inner;
    }
  }

  // Array wrap: [{ title: "...", ... }] -> { title: "...", ... }
  if (Array.isArray(parsed) && parsed.length === 1) {
    return parsed[0];
  }

  return parsed;
}

/**
 * Safely parse a JSON string from LLM output
 */
function parseJSONSafe(raw) {
  // Remove think tags
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
  cleaned = cleaned.replace(/<think>[\s\S]*/g, "");
  // Remove code fences
  cleaned = cleaned.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Find the last valid JSON object
    const matches = [...cleaned.matchAll(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g)];
    for (let i = matches.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(matches[i][0]);
      } catch { continue; }
    }
    // Try broadest match
    const broad = cleaned.match(/\{[\s\S]*\}/);
    if (broad) {
      try {
        return JSON.parse(broad[0]);
      } catch {}
    }
    return { _raw: raw, _error: "Failed to parse JSON" };
  }
}

export { MODEL_PRESETS };
