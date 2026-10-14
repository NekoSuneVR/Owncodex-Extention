# NekoSune Codex

A VS Code extension project for configurable AI chat, coding assistance, image generation, web search and local voice services.

## Current foundation

- Chat via Ollama's local `/api/chat` endpoint.
- Chat via OmniRoute or another OpenAI-compatible `/v1/chat/completions` endpoint.
- Web search via SearXNG JSON API, Firecrawl search, or a configurable HTTP search endpoint.
- Image generation via the configured gateway's `/v1/images/generations` endpoint.
- Speech transcription via an OpenAI-compatible `/v1/audio/transcriptions` endpoint or a configurable Vosk-style HTTP wrapper.
- Text-to-speech via a Piper HTTP wrapper or OpenAI-compatible `/v1/audio/speech`.
- A VS Code sidebar with chat, microphone recording, read-aloud, web search and image generation controls.
- Workspace text search command.

This is an initial scaffold, not yet a full autonomous coding agent. Safe patch review/application, agent tool-calling, streaming, durable conversation history, image editing, and robust provider-specific audio adapters are follow-up work. The extension currently does not run terminal commands or autonomously modify workspace files.

## Requirements

- VS Code 1.90+
- Node.js 20+ and npm for development
- One model service: Ollama or OmniRoute/OpenAI-compatible API
- Optional services: SearXNG, Firecrawl, Piper HTTP wrapper, Whisper-compatible transcription server, or Vosk HTTP wrapper

## Build and run

1. Clone this repository.
2. Run `npm install`.
3. Run `npm run compile`.
4. Open the folder in VS Code and press F5 to launch an Extension Development Host.
5. Open the NekoSune Codex icon in the Activity Bar.

To package for installation, run `npx @vscode/vsce package`.

## Settings

Open **Settings → Extensions → NekoSune Codex**.

### Ollama

- Base URL: `http://127.0.0.1:11434`
- Model: a model you have pulled, for example `qwen2.5-coder:7b`

Pull a model before selecting it: `ollama pull qwen2.5-coder:7b`.

### OmniRoute

- API base URL: set this to your OmniRoute server's actual OpenAI-compatible base URL, commonly a local `/v1` endpoint.
- API model: use an ID available from your own OmniRoute `/v1/models` response.
- API key: set only if your gateway requires one.

The default port is a starting value, not a guarantee; use the port configured by your OmniRoute installation.

### SearXNG

Set the base URL to your SearXNG instance. JSON output must be enabled in SearXNG's configuration for `format=json` requests to work.

### Firecrawl

Set the Firecrawl base URL and API key as needed for your deployment. Firecrawl can search and extract page content into readable Markdown. API paths and request options differ across versions, so check your installed server's API documentation if search fails.

### Piper and voice input

The Piper setting expects an HTTP wrapper that accepts JSON containing `text` and optionally `voice`, then returns audio bytes. Piper itself is a local text-to-speech engine; HTTP routes vary by wrapper.

For transcription, configure an OpenAI-compatible endpoint such as `/v1/audio/transcriptions`. The request uploads a WebM recording; your server must support that audio format or convert it. Vosk uses a different interface unless exposed through a compatible wrapper. For a local Whisper service, configure its compatible transcription URL and model name.

## Security notes

- Keep local service endpoints bound to localhost or a trusted network.
- Never commit API keys or credentials.
- Review AI-generated content before using it.
- This initial scaffold does not execute terminal commands or autonomously modify workspace files.

## Development

```sh
npm install
npm run compile
```

## License

MIT
