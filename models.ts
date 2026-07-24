import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";

export const DEFAULT_CONTEXT_WINDOW = 128_000;
export const DEFAULT_MAX_TOKENS = 32_768;

export type MaxTokensByModel = ReadonlyMap<string, number>;

interface ZenMuxPrice {
	value?: unknown;
	conditions?: { prompt_tokens?: { gte?: unknown } };
}

interface ZenMuxModel {
	id?: unknown;
	display_name?: unknown;
	owned_by?: unknown;
	input_modalities?: unknown;
	capabilities?: { reasoning?: unknown };
	pricings?: {
		prompt?: ZenMuxPrice[];
		completion?: ZenMuxPrice[];
		input_cache_read?: ZenMuxPrice[];
		input_cache_write_5_min?: ZenMuxPrice[];
	};
	context_length?: unknown;
}

function positiveInt(value: unknown, fallback: number): number {
	const numberValue = typeof value === "number" ? value : Number(value);
	return Number.isFinite(numberValue) && numberValue > 0 ? Math.floor(numberValue) : fallback;
}

function basePrice(prices: ZenMuxPrice[] | undefined): number {
	if (!prices?.length) return 0;
	const base = prices.find((price) => !price.conditions || Number(price.conditions.prompt_tokens?.gte ?? 0) === 0) ?? prices[0];
	const value = Number(base?.value ?? 0);
	return Number.isFinite(value) ? value : 0;
}

function isAnthropic(model: ZenMuxModel, id: string): boolean {
	return model.owned_by === "anthropic" || id.startsWith("anthropic/");
}

/** Converts ZenMux's OpenAI-compatible model payload into Pi provider models. */
export function parseZenmuxModels(payload: unknown, maxTokensByModel: MaxTokensByModel = new Map()): ProviderModelConfig[] {
	const data = payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
		? (payload as { data: ZenMuxModel[] }).data
		: [];
	const uniqueModels = new Map<string, ProviderModelConfig>();

	for (const model of data) {
		const id = String(model.id ?? "").trim();
		if (!id) continue;
		const imageInput = Array.isArray(model.input_modalities) && model.input_modalities.includes("image");
		uniqueModels.set(id, {
			id,
			name: String(model.display_name ?? id),
			api: isAnthropic(model, id) ? "anthropic-messages" : "openai-completions",
			reasoning: Boolean(model.capabilities?.reasoning),
			input: imageInput ? ["text", "image"] : ["text"],
			cost: {
				input: basePrice(model.pricings?.prompt),
				output: basePrice(model.pricings?.completion),
				cacheRead: basePrice(model.pricings?.input_cache_read),
				cacheWrite: basePrice(model.pricings?.input_cache_write_5_min),
			},
			contextWindow: positiveInt(model.context_length, DEFAULT_CONTEXT_WINDOW),
			maxTokens: maxTokensByModel.get(id) ?? DEFAULT_MAX_TOKENS,
		});
	}

	return [...uniqueModels.values()].sort((left, right) => left.id.localeCompare(right.id));
}


function modelMaxTokens(model: unknown): number | undefined {
	if (!model || typeof model !== "object") return undefined;
	const value = model as { limit?: Record<string, unknown>; max_output_tokens?: unknown; max_tokens?: unknown; output_tokens?: unknown };
	for (const candidate of [value.limit?.output, value.limit?.max_output_tokens, value.limit?.max_tokens, value.max_output_tokens, value.max_tokens, value.output_tokens]) {
		const maxTokens = positiveInt(candidate, 0);
		if (maxTokens) return maxTokens;
	}
}

/** Extracts output-token limits from models.dev's provider-keyed catalog. */
export function parseModelsDevMaxTokens(payload: unknown): MaxTokensByModel {
	const result = new Map<string, number>();
	if (!payload || typeof payload !== "object") return result;
	for (const provider of Object.values(payload as Record<string, { models?: Record<string, unknown> }>)) {
		for (const [id, model] of Object.entries(provider?.models ?? {})) {
			const maxTokens = modelMaxTokens(model);
			if (maxTokens) result.set(id, maxTokens);
		}
	}
	return result;
}
