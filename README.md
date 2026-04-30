# ZenMux Provider Extension for pi

This package adds a `zenmux` provider to pi using the extension API (`registerProvider`), as requested in [badlogic/pi-mono#1811](https://github.com/badlogic/pi-mono/issues/1811).

Forked from [yangyang0507/pi-zenmux](https://github.com/yangyang0507/pi-zenmux).

## Features

- Registers provider name: `zenmux`
- Uses API key env var: `ZENMUX_API_KEY`
- Uses bundled model snapshot (`zenmux-models.generated.js`) at runtime
- Routes Anthropic models to `https://zenmux.ai/api/anthropic` with `anthropic-messages`
- Routes non-Anthropic models to `https://zenmux.ai/api/v1` with `openai-completions`
- Model `maxTokens` is merged from `https://models.dev/api.json` during generation

## Install

This project is not published on npm. Install it from a git checkout instead.

### Clone and install

```bash
git clone https://github.com/swarnimarun/pi-zenmux.git
cd pi-zenmux
pi install "$(pwd)"
```

If you prefer to keep the checkout elsewhere, install it by absolute path:

```bash
pi install /absolute/path/to/pi-zenmux
```

To update later:

```bash
cd /absolute/path/to/pi-zenmux
git pull
pi install "$(pwd)"
```

## Configure

Set API key:

```bash
export ZENMUX_API_KEY="your-zenmux-key"
```

Or use `~/.pi/agent/auth.json`:

```json
{
  "zenmux": {
    "type": "api_key",
    "key": "your-zenmux-key"
  }
}
```

## Use

```bash
pi --provider zenmux --model anthropic/claude-opus-4.6
```

You can also start `pi` normally and switch with `/model`.

## Optional endpoint override

If you need to route to a different ZenMux domain:

```bash
export ZENMUX_BASE_URL="https://zenmux.ai"
```

The extension derives:

- OpenAI-compatible base: `${ZENMUX_BASE_URL}/api/v1`
- Anthropic-compatible base: `${ZENMUX_BASE_URL}/api/anthropic`

## Dev / Test

```bash
npm install
npm run verify
```
