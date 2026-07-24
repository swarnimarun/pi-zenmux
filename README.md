# ZenMux Provider Extension for pi

This package adds a `zenmux` provider to pi using the extension API (`registerProvider`), as requested in [badlogic/pi-mono#1811](https://github.com/badlogic/pi-mono/issues/1811).

Forked from [yangyang0507/pi-zenmux](https://github.com/yangyang0507/pi-zenmux).

## Features

- Registers provider name: `zenmux`
- Uses API key env var: `ZENMUX_API_KEY`
- Uses the bundled model snapshot immediately, then refreshes models from ZenMux at runtime with timeouts, retries, and a last-good-catalog fallback
- Shows the provider as `ZenMux` in Pi
- Targets Pi 0.81.1 (`@earendil-works/*` packages)
- Uses ZenMux's OpenAI-compatible endpoint (`https://zenmux.ai/api/v1`) for all models, including Anthropic model IDs
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

## Dev / Test

```bash
npm install
npm run check

# Optional: refresh the checked-in offline snapshot
npm run generate:models
```


## Compatibility

This extension supports Pi `0.81.1` only (the `>=0.81.1 <0.82.0` peer range). It
uses Pi's provider `refreshModels` hook for the live catalog while retaining the
generated snapshot as the startup/offline fallback. Set `ZENMUX_API_KEY` before
launching Pi; no `/login` interaction is required.
