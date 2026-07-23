import type { Api, Context, Model, SimpleStreamOptions } from "@earendil-works/pi-ai";
import { streamSimpleAnthropic } from "@earendil-works/pi-ai/anthropic";
import { streamSimpleOpenAICompletions } from "@earendil-works/pi-ai/openai-completions";
import type { ExtensionAPI, ProviderConfig, ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { parseModelsDevMaxTokens, parseZenmuxModels } from "./models.js";
import { ZENMUX_MODELS } from "./zenmux-models.generated.js";

export const ZENMUX_BASE_URL = (process.env.ZENMUX_BASE_URL || "https://zenmux.ai").replace(/\/$/, "");
export const ZENMUX_OPENAI_BASE_URL = `${ZENMUX_BASE_URL}/api/v1`;
export const ZENMUX_ANTHROPIC_BASE_URL = `${ZENMUX_BASE_URL}/api/anthropic`;
export const ZENMUX_MODELS_URL = `${ZENMUX_OPENAI_BASE_URL}/models`;
export const MODELS_DEV_URL = "https://models.dev/api.json";
export const MODEL_FETCH_TIMEOUT_MS = 10_000;
export const MODEL_FETCH_RETRIES = 2;
export const MODEL_FETCH_RETRY_DELAY_MS = 200;
export const ZENMUX_ROUTER_API = "zenmux-router";
export const ZENMUX_MODELS_SNAPSHOT: ProviderModelConfig[] = ZENMUX_MODELS;

export function routeModel(model: Model<Api>): Model<Api> {
	if (model.id.startsWith("anthropic/")) {
		const { compat: _compat, ...rest } = model as Model<Api> & { compat?: unknown };
		return { ...rest, api: "anthropic-messages", baseUrl: ZENMUX_ANTHROPIC_BASE_URL };
	}
	return { ...model, api: "openai-completions", baseUrl: ZENMUX_OPENAI_BASE_URL };
}

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

export function streamSimpleZenmux(model: Model<Api>, context: Context, options?: SimpleStreamOptions) {
	const routedModel = routeModel(model);
	if (routedModel.api === "anthropic-messages") return streamSimpleAnthropic(routedModel as Model<"anthropic-messages">, context, options);
	return streamSimpleOpenAICompletions(routedModel as Model<"openai-completions">, context, options);
}

export default function registerZenmuxProvider(pi: ExtensionAPI): void {
	pi.registerProvider("zenmux", {
		name: "ZenMux",
		baseUrl: ZENMUX_OPENAI_BASE_URL,
		apiKey: "$ZENMUX_API_KEY",
		api: ZENMUX_ROUTER_API,
		models: asZenmuxRouterModels(ZENMUX_MODELS_SNAPSHOT),
		streamSimple: streamSimpleZenmux,
		refreshModels: refreshZenmuxModels,
	});
}
