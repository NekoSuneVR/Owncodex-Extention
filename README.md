# NekoSune Codex

A VS Code extension project for configurable AI chat, coding assistance, image generation, web search and local voice services.

## Current foundation

- Chat via Ollama's native local `/api/chat` endpoint, including tool calls.
- A platform selector with presets for Ollama local and cloud, LM Studio, OmniRoute, OpenAI, OpenRouter, Groq, DeepSeek, Mistral, xAI, Together AI, Fireworks, Cerebras, SambaNova, NVIDIA NIM, Hugging Face, LocalAI, vLLM, llama.cpp, KoboldCpp, plus custom OpenAI-compatible endpoints.
- Claude and Gemini model routes through OmniRoute or another OpenAI-compatible gateway. The extension does not currently call the native Anthropic Messages or Google Gemini APIs directly.
- Web search via SearXNG JSON API, Firecrawl search, or a configurable HTTP search endpoint.
- Image generation via the configured gateway's `/v1/images/generations` endpoint.
- Selectable speech recognition: Whisper/OpenAI-compatible `/v1/audio/transcriptions` or a Vosk-compatible local HTTP adapter.
- Selectable text-to-speech: local Piper HTTP wrapper or OpenAI-compatible `/v1/audio/speech`.
- A VS Code sidebar with chat, microphone recording, read-aloud, web search and image generation controls.
- Coding tools for listing, reading and searching workspace files, with approval-gated file writes.
- An approval-gated terminal tool for build/test commands, executed from the workspace root.
- A workspace text search command.

This is an initial scaffold, not yet a full autonomous coding agent. Diff-based patch review/application, streaming, durable conversation history, image editing, and robust provider-specific audio adapters are follow-up work. File writes and terminal commands require explicit approval by default; review each proposed change and command before accepting it.

## Requirements

- VS Code 1.90+
- Node.js 20+ and npm for development
- One model service: Ollama, LM Studio, OmniRoute, or any supported OpenAI-compatible provider.
- Optional local voice services: Piper HTTP wrapper and either a Whisper-compatible transcription server or a Vosk HTTP adapter.
- Optional research services: SearXNG or Firecrawl.

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

### Platform selector

Choose the AI platform in the sidebar. Selecting a preset fills the default API base URL and model ID in Settings; check and adjust **NekoSune Codex → API Base URL**, **API Model**, and **API Key** for your account and installed model. The model list is a set of sensible starting examples, not a live model catalogue. `custom` keeps your configured API URL/model. Most remote platforms in this list use OpenAI-compatible chat completions. For Claude or Gemini, choose an OmniRoute/OpenRouter route and set the gateway model ID; the similarly named gateway presets do not mean the extension implements native Anthropic or Gemini request protocols.

Common local endpoints:

| Platform | Default base URL | Notes |
|---|---|---|
| Ollama local | `http://127.0.0.1:11434` | Uses Ollama's native `/api/chat` endpoint. |
| Ollama Cloud | `https://ollama.com/v1` | Requires an Ollama Cloud API key and a cloud model ID. |
| LM Studio | `http://127.0.0.1:1234/v1` | Start its local server and use the model identifier shown by LM Studio. |
| vLLM | `http://127.0.0.1:8000/v1` | OpenAI-compatible server. |
| llama.cpp | `http://127.0.0.1:8080/v1` | Enable its OpenAI-compatible server. |
| LocalAI | `http://127.0.0.1:8080/v1` | OpenAI-compatible server. |
| KoboldCpp | `http://127.0.0.1:5001/v1` | Requires its OpenAI-compatible API to be enabled. |

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

Use the sidebar's voice selectors to choose **Piper local TTS** and **Vosk local HTTP adapter**, then click **Save voice**. The Piper setting expects an HTTP wrapper that accepts JSON containing `text` and optionally `voice`, then returns audio bytes. Piper itself is a local text-to-speech engine; HTTP routes vary by wrapper. The extension does not install or launch Piper/Vosk automatically; run those local services yourself.

For transcription, configure an OpenAI-compatible endpoint such as `/v1/audio/transcriptions`. The request uploads a WebM recording; your server must support that audio format or convert it. Standard Vosk WebSocket/gRPC services are not the same as an HTTP file-upload endpoint, so expose Vosk through a compatible local HTTP adapter and set `nekosuneCodex.voice.transcriptionUrl` to that adapter's URL. For a local Whisper service, configure its compatible transcription URL and model name.

## Security notes

- Keep local service endpoints bound to localhost or a trusted network.
- Never commit API keys or credentials.
- Review AI-generated content before using it.
- The extension does not currently install or manage local model runtimes and voice servers for you.
- API key settings are ordinary VS Code settings, not OS-backed SecretStorage; avoid syncing or sharing them.

## Development

```sh
npm install
npm run compile
```

## License

MIT
