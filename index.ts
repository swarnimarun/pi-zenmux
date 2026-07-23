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
import { ZENMUX_MODELS } from "./zenmux-models.generated.js";

export const ZENMUX_BASE_URL = (process.env.ZENMUX_BASE_URL || "https://zenmux.ai").replace(/\/$/, "");
export const ZENMUX_OPENAI_BASE_URL = `${ZENMUX_BASE_URL}/api/v1`;
export const ZENMUX_ANTHROPIC_BASE_URL = `${ZENMUX_BASE_URL}/api/anthropic`;
export const ZENMUX_MODELS_URL = `${ZENMUX_OPENAI_BASE_URL}/models`;
export const MODELS_DEV_URL = "https://models.dev/api.json";
export const MODEL_FETCH_TIMEOUT_MS = 10_000;
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

/** Fetches JSON with a bounded timeout so model discovery cannot stall Pi startup. */
async function fetchJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), MODEL_FETCH_TIMEOUT_MS);
	try {
		const response = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: controller.signal });
		if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
		return response.json();
	} finally {
		clearTimeout(timeout);
	}
}

/** Fetches the current ZenMux catalog. Pi retains the bundled snapshot if this fails. */
export async function refreshZenmuxModels(fetchImpl: typeof fetch = fetch): Promise<ProviderModelConfig[]> {
	const [zenmuxPayload, modelsDevPayload] = await Promise.all([
		fetchJson(fetchImpl, ZENMUX_MODELS_URL),
		fetchJson(fetchImpl, MODELS_DEV_URL).catch(() => undefined),
	]);
	const models = parseZenmuxModels(zenmuxPayload, parseModelsDevMaxTokens(modelsDevPayload));
	if (models.length === 0) throw new Error("ZenMux model list is empty or invalid");
	return asZenmuxRouterModels(models);
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
