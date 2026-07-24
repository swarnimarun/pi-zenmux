import {
 	type Api,
 	type Context,
 	type Model,
 	type SimpleStreamOptions,
 	streamSimpleAnthropic,
 	streamSimpleOpenAICompletions,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { parseModelsDevMaxTokens, parseZenmuxModels } from "./models.js";

export const ZENMUX_BASE_URL = (process.env.ZENMUX_BASE_URL || "https://zenmux.ai").replace(/\/$/, "");
export const ZENMUX_OPENAI_BASE_URL = `${ZENMUX_BASE_URL}/api/v1`;
export const ZENMUX_ANTHROPIC_BASE_URL = `${ZENMUX_BASE_URL}/api/anthropic`;
export const ZENMUX_ROUTER_API = "zenmux-router";

export const ZENMUX_MODELS_SNAPSHOT: ProviderModelConfig[] = await fetch(`${ZENMUX_OPENAI_BASE_URL}/models`)
	.then((response) => {
		if (!response.ok) throw new Error(`ZenMux model list failed: HTTP ${response.status}`);
		return response.json() as Promise<{ data?: Array<Record<string, any>> }>;
	})
	.then(({ data = [] }) => data.filter((model) => model.id).map((model) => ({
		id: String(model.id),
		name: String(model.display_name || model.id),
		api: model.id.startsWith("anthropic/") || model.owned_by === "anthropic" ? "anthropic-messages" : "openai-completions",
		reasoning: Boolean(model.capabilities?.reasoning),
		input: Array.isArray(model.input_modalities) && model.input_modalities.includes("image") ? ["text", "image"] : ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: Number(model.context_length) > 0 ? Math.floor(Number(model.context_length)) : 128000,
		maxTokens: Number(model.max_output_tokens) > 0 ? Math.floor(Number(model.max_output_tokens)) : 32768,
	} as ProviderModelConfig)));

export function asZenmuxRouterModels(models: ProviderModelConfig[]): ProviderModelConfig[] {
	return models.map((model) => ({ ...model, api: ZENMUX_ROUTER_API }));
}

/** Fetches JSON with a bounded timeout and retries transient failures. */
async function fetchJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
	let error: unknown;
	for (let attempt = 0; attempt <= MODEL_FETCH_RETRIES; attempt += 1) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), MODEL_FETCH_TIMEOUT_MS);
		try {
			const response = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: controller.signal });
			if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
			return response.json();
		} catch (caught) {
			error = caught;
			if (attempt < MODEL_FETCH_RETRIES) await new Promise((resolve) => setTimeout(resolve, MODEL_FETCH_RETRY_DELAY_MS));
		} finally {
			clearTimeout(timeout);
		}
	}
	throw error;
}

let cachedLiveModels: ProviderModelConfig[] | undefined;

/** Fetches the current ZenMux catalog, falling back to the last good live catalog on errors. */
export async function loadZenmuxModels(fetchImpl: typeof fetch = fetch): Promise<ProviderModelConfig[]> {
	try {
		const [zenmuxPayload, modelsDevPayload] = await Promise.all([
			fetchJson(fetchImpl, ZENMUX_MODELS_URL),
			fetchJson(fetchImpl, MODELS_DEV_URL).catch(() => undefined),
		]);
		const models = asZenmuxRouterModels(parseZenmuxModels(zenmuxPayload, parseModelsDevMaxTokens(modelsDevPayload)));
		if (models.length === 0) throw new Error("ZenMux model list is empty or invalid");
		cachedLiveModels = models;
		return models;
	} catch (error) {
		if (cachedLiveModels) return cachedLiveModels;
		throw error;
	}
}

/** Pi refresh hook. The global fetch avoids coupling the public model endpoint to credentials. */
export async function refreshZenmuxModels(..._args: Parameters<NonNullable<ProviderConfig["refreshModels"]>>): Promise<ProviderModelConfig[]> {
	return loadZenmuxModels();
}

export default function registerZenmuxProvider(pi: ExtensionAPI): void {
	pi.registerProvider("zenmux", {
		name: "ZenMux",
		baseUrl: ZENMUX_OPENAI_BASE_URL,
		apiKey: "$ZENMUX_API_KEY",
		api: ZENMUX_ROUTER_API,
		models: asZenmuxRouterModels(ZENMUX_MODELS_SNAPSHOT),
		refreshModels: refreshZenmuxModels,
	});
}
