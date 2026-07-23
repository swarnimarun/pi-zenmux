import assert from "node:assert/strict";
import test from "node:test";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
	ZENMUX_ANTHROPIC_BASE_URL,
	ZENMUX_MODELS_SNAPSHOT,
	ZENMUX_OPENAI_BASE_URL,
	ZENMUX_ROUTER_API,
	refreshZenmuxModels,
	asZenmuxRouterModels,
	routeModel,
} from "./index.js";

function makeModel(overrides: Partial<Model<Api>> = {}): Model<Api> {
	return {
		id: "openai/gpt-5.3-chat",
		name: "OpenAI: GPT-5.3 Chat",
		api: ZENMUX_ROUTER_API,
		provider: "zenmux",
		baseUrl: ZENMUX_OPENAI_BASE_URL,
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 32768,
		...overrides,
	};
}

test("bundled model snapshot exists and has maxTokens", () => {
	assert.ok(ZENMUX_MODELS_SNAPSHOT.length > 0);

	for (const model of ZENMUX_MODELS_SNAPSHOT) {
		assert.equal(typeof model.id, "string");
		assert.equal(typeof model.name, "string");
		assert.ok(Number.isInteger(model.maxTokens));
		assert.ok(model.maxTokens > 0);
	}
});

test("routeModel routes anthropic ids to anthropic endpoint", () => {
	const routed = routeModel(
		makeModel({
			id: "anthropic/claude-sonnet-4.6",
		}),
	);

	assert.equal(routed.api, "anthropic-messages");
	assert.equal(routed.baseUrl, ZENMUX_ANTHROPIC_BASE_URL);
});

test("routeModel routes non-anthropic ids to openai endpoint", () => {
	const routed = routeModel(
		makeModel({
			id: "openai/gpt-5.3-codex",
		}),
	);

	assert.equal(routed.api, "openai-completions");
	assert.equal(routed.baseUrl, ZENMUX_OPENAI_BASE_URL);
});

test("asZenmuxRouterModels forces all model APIs to zenmux-router", () => {
	const models = asZenmuxRouterModels([
		{
			id: "anthropic/claude-opus-4.6",
			name: "Anthropic: Claude Opus 4.6",
			api: "anthropic-messages",
			reasoning: true,
			input: ["text", "image"],
			cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
			contextWindow: 1000000,
			maxTokens: 8192,
		},
		{
			id: "openai/gpt-5.3-chat",
			name: "OpenAI: GPT-5.3 Chat",
			api: "openai-completions",
			reasoning: true,
			input: ["text", "image"],
			cost: { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
			contextWindow: 128000,
			maxTokens: 16384,
		},
	]);

	assert.equal(models.length, 2);
	assert.equal(models[0]?.api, ZENMUX_ROUTER_API);
	assert.equal(models[1]?.api, ZENMUX_ROUTER_API);
});


test("refreshZenmuxModels loads and routes the live catalog", async () => {
	const models = await refreshZenmuxModels(async (url) => new Response(JSON.stringify(String(url).includes("models.dev") ? {
		anthropic: { models: { "anthropic/claude-test": { limit: { output: 98765 } } } },
	} : {
		data: [{
			id: "anthropic/claude-test",
			display_name: "Claude Test",
			owned_by: "anthropic",
			input_modalities: ["text", "image"],
			capabilities: { reasoning: true },
			context_length: 200000,
		}],
	})));

	assert.equal(models.length, 1);
	assert.equal(models[0]?.api, ZENMUX_ROUTER_API);
	assert.equal(models[0]?.maxTokens, 98765);
});

test("registerZenmuxProvider exposes a named provider with snapshot fallback and refresh", async () => {
	const { default: registerZenmuxProvider } = await import("./index.js");
	let registered: Record<string, unknown> | undefined;
	registerZenmuxProvider({ registerProvider: (_name: string, config: Record<string, unknown>) => { registered = config; } } as never);
	assert.equal(registered?.name, "ZenMux");
	assert.equal(registered?.apiKey, "$ZENMUX_API_KEY");
	assert.equal(typeof registered?.refreshModels, "function");
	assert.deepEqual((registered?.models as Array<{ api: string }>).every((model) => model.api === ZENMUX_ROUTER_API), true);
});

test("refreshZenmuxModels retries transient catalog errors and retains its last good catalog", async () => {
	let zenmuxCalls = 0;
	const fetchCatalog = async (url: URL | RequestInfo) => {
		if (String(url).includes("models.dev")) return new Response(JSON.stringify({}));
		zenmuxCalls += 1;
		if (zenmuxCalls === 1) throw new Error("temporary network failure");
		return new Response(JSON.stringify({ data: [{ id: "openai/gpt-test", context_length: 1000 }] }));
	};
	const loaded = await refreshZenmuxModels(fetchCatalog);
	assert.equal(zenmuxCalls, 2);
	assert.equal(loaded[0]?.id, "openai/gpt-test");

	const stale = await refreshZenmuxModels(async () => { throw new Error("offline"); });
	assert.equal(stale, loaded);
});
