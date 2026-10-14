import * as vscode from 'vscode';
import * as path from 'node:path';
import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';
const execCommand = promisify(execCallback);

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
type WebviewRequest =
  | { type: 'chat'; text: string; history: ChatMessage[] }
  | { type: 'search'; query: string }
  | { type: 'generateImage'; prompt: string }
  | { type: 'transcribe'; audioBase64: string; mimeType: string }
  | { type: 'speak'; text: string }
  | { type: 'insertSelection' }
  | { type: 'providerChanged'; provider: 'ollama' | 'omniroute' | 'openai-compatible' };

class CodexViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'media'))] };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage(async (message: WebviewRequest) => {
      try {
        if (message.type === 'providerChanged') {
          await cfg().update('provider', message.provider, vscode.ConfigurationTarget.Global);
          view.webview.postMessage({ type: 'providerSaved', provider: message.provider });
        } else if (message.type === 'chat') {
          const answer = await chat(message.text, message.history);
          view.webview.postMessage({ type: 'chatResult', text: answer });
        } else if (message.type === 'search') {
          const results = await searchWeb(message.query);
          view.webview.postMessage({ type: 'searchResult', text: results });
        } else if (message.type === 'generateImage') {
          const image = await generateImage(message.prompt);
          view.webview.postMessage({ type: 'imageResult', ...image });
        } else if (message.type === 'transcribe') {
          const text = await transcribe(message.audioBase64, message.mimeType);
          view.webview.postMessage({ type: 'transcriptionResult', text });
        } else if (message.type === 'speak') {
          const audio = await speak(message.text);
          view.webview.postMessage({ type: 'speechResult', ...audio });
        } else if (message.type === 'insertSelection') {
          const editor = vscode.window.activeTextEditor;
          if (!editor) throw new Error('Open a text editor and select some code first.');
          view.webview.postMessage({ type: 'selectionResult', text: editor.document.getText(editor.selection) });
        }
      } catch (error) {
        view.webview.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  private html(webview: vscode.Webview): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; media-src data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'none';">
<title>NekoSune Codex</title>
<style>
:root{color-scheme:light dark}*{box-sizing:border-box}body{padding:0;margin:0;color:var(--vscode-foreground);font:var(--vscode-font-size) var(--vscode-font-family);background:var(--vscode-sideBar-background)}header{position:sticky;top:0;background:var(--vscode-sideBar-background);border-bottom:1px solid var(--vscode-panel-border);padding:10px;z-index:2}h1{font-size:15px;margin:0 0 8px}.toolbar{display:flex;gap:5px;flex-wrap:wrap}button,select,input,textarea{font:inherit;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:4px;padding:6px}button{cursor:pointer;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0}button:hover{background:var(--vscode-button-hoverBackground)}select{min-width:0;max-width:100%;flex:1}.hint{font-size:11px;color:var(--vscode-descriptionForeground);margin-top:7px}#messages{padding:10px;display:flex;flex-direction:column;gap:10px}.message{border:1px solid var(--vscode-panel-border);border-radius:6px;padding:9px;overflow-wrap:anywhere;white-space:pre-wrap}.message.user{background:var(--vscode-textBlockQuote-background)}.role{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);margin-bottom:5px}#composer{position:sticky;bottom:0;padding:10px;background:var(--vscode-sideBar-background);border-top:1px solid var(--vscode-panel-border)}textarea{width:100%;resize:vertical;min-height:72px;background:var(--vscode-input-background)}.actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.actions button{flex:1}.status{font-size:11px;color:var(--vscode-descriptionForeground);padding:4px 10px}img.generated{max-width:100%;height:auto;border-radius:4px;margin-top:8px}a{color:var(--vscode-textLink-foreground)}.small{font-size:11px}
</style>
</head>
<body>
<header><h1>NekoSune Codex</h1>
<div class="toolbar"><select id="provider"><option value="ollama">Ollama (local)</option><option value="omniroute">OmniRoute</option><option value="openai-compatible">OpenAI-compatible</option></select><button id="clear">New chat</button></div>
<div class="hint">Chat, code help, web research, image generation and voice. Configure endpoints in Settings.</div></header>
<div id="messages"><div class="message"><div class="role">Welcome</div>Ask a coding question, research documentation, generate an image, or use the microphone to dictate a prompt.</div></div>
<div id="status" class="status">Ready</div>
<section id="composer"><textarea id="prompt" placeholder="Ask NekoSune Codex… (Ctrl+Enter to send)"></textarea>
<div class="actions"><button id="send">Send</button><button id="mic">Record</button><button id="speak">Read reply</button><button id="search">Web search</button><button id="image">Generate image</button></div>
<div class="hint">Voice requires a configured local or compatible transcription/TTS service. Review generated content before using it.</div></section>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const messagesEl=document.getElementById('messages'), statusEl=document.getElementById('status'), promptEl=document.getElementById('prompt');
let history=[],lastReply='',recorder,recordedChunks=[];
function status(t){statusEl.textContent=t}
function addMessage(role,text){const card=document.createElement('div');card.className='message '+role;const label=document.createElement('div');label.className='role';label.textContent=role;const body=document.createElement('div');body.textContent=text;card.append(label,body);messagesEl.appendChild(card);card.scrollIntoView({block:'end'});return body}
function send(){const text=promptEl.value.trim();if(!text)return;promptEl.value='';addMessage('user',text);history.push({role:'user',content:text});status('Thinking…');vscode.postMessage({type:'chat',text,history:history.slice(-20)})}
document.getElementById('send').addEventListener('click',send);
promptEl.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();send()}});
document.getElementById('clear').addEventListener('click',()=>{history=[];lastReply='';messagesEl.replaceChildren();status('New conversation')});
document.getElementById('provider').addEventListener('change',e=>vscode.postMessage({type:'providerChanged',provider:e.target.value}));
document.getElementById('search').addEventListener('click',()=>{const query=promptEl.value.trim();if(!query){status('Enter a search query first');return}status('Searching web…');vscode.postMessage({type:'search',query})});
document.getElementById('image').addEventListener('click',()=>{const prompt=promptEl.value.trim();if(!prompt){status('Enter an image prompt first');return}status('Generating image…');vscode.postMessage({type:'generateImage',prompt})});
document.getElementById('speak').addEventListener('click',()=>{if(!lastReply){status('There is no reply to read yet');return}status('Generating speech…');vscode.postMessage({type:'speak',text:lastReply})});
document.getElementById('mic').addEventListener('click',async()=>{
 if(recorder&&recorder.state==='recording'){recorder.stop();document.getElementById('mic').textContent='Record';status('Transcribing recording…');return}
 try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});recordedChunks=[];recorder=new MediaRecorder(stream);recorder.ondataavailable=e=>{if(e.data.size)recordedChunks.push(e.data)};recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(recordedChunks,{type:recorder.mimeType||'audio/webm'});const reader=new FileReader();reader.onload=()=>vscode.postMessage({type:'transcribe',audioBase64:String(reader.result).split(',')[1],mimeType:blob.type});reader.readAsDataURL(blob)};recorder.start();document.getElementById('mic').textContent='Stop';status('Recording… click Stop when finished')}
 catch(e){status('Microphone unavailable: '+e.message)}
});
window.addEventListener('message',event=>{const m=event.data;
 if(m.type==='chatResult'){lastReply=m.text;history.push({role:'assistant',content:m.text});addMessage('assistant',m.text);status('Ready')}
 else if(m.type==='searchResult'){addMessage('assistant','Web search results\n'+m.text);status('Search complete')}
 else if(m.type==='imageResult'){addMessage('assistant','Image generated'+(m.url?'\n'+m.url:''));if(m.data){const img=document.createElement('img');img.className='generated';img.alt='Generated image';img.src='data:'+(m.mimeType||'image/png')+';base64,'+m.data;messagesEl.lastChild.appendChild(img)}status('Image generation complete')}
 else if(m.type==='transcriptionResult'){promptEl.value=(promptEl.value?promptEl.value+' ':'')+m.text;status('Transcription complete')}
 else if(m.type==='speechResult'){const audio=new Audio('data:'+(m.mimeType||'audio/wav')+';base64,'+m.data);audio.play().catch(e=>status('Could not play speech: '+e.message));status('Playing speech')}
 else if(m.type==='selectionResult'){promptEl.value+='\n\nSelected code:\n'+m.text;status('Selected code added')}
 else if(m.type==='error'){addMessage('assistant','Error: '+m.message);status('Request failed')}
});
</script>
</body></html>`;
  }
}

function getNonce(): string { return Array.from({length: 32}, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random()*62))).join(''); }

function cfg() { return vscode.workspace.getConfiguration('nekosuneCodex'); }
function joinUrl(base: string, suffix: string): string { return base.replace(/\/+$/, '') + '/' + suffix.replace(/^\/+/, ''); }
function authHeaders(key: string): Record<string,string> { return key ? { Authorization: 'Bearer ' + key } : {}; }
async function checkedJson(response: Response): Promise<any> {
  const body = await response.text();
  if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + body.slice(0, 1200));
  try { return JSON.parse(body); } catch { throw new Error('Service returned non-JSON response: ' + body.slice(0, 500)); }
}

type AgentTool = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } };
const agentTools: AgentTool[] = [
  { type:'function', function:{ name:'list_workspace_files', description:'List files in the current VS Code workspace. Use a glob pattern such as **/*.ts or **/*.', parameters:{type:'object',properties:{pattern:{type:'string',description:'Glob pattern; default **/*'}},required:[]} } },
  { type:'function', function:{ name:'read_file', description:'Read a UTF-8 text file in the current workspace using a relative path.', parameters:{type:'object',properties:{path:{type:'string',description:'Workspace-relative file path'}},required:['path']} } },
  { type:'function', function:{ name:'search_workspace', description:'Search text in workspace files and return matching file paths and line numbers.', parameters:{type:'object',properties:{query:{type:'string'},pattern:{type:'string',description:'Optional glob pattern, e.g. **/*.ts'}},required:['query']} } },
  { type:'function', function:{ name:'write_file', description:'Create or replace a UTF-8 workspace file. Always explain the proposed change and ask the user for approval before writing.', parameters:{type:'object',properties:{path:{type:'string'},content:{type:'string',description:'Complete new file contents'}},required:['path','content']} } },
  { type:'function', function:{ name:'run_terminal', description:'Run a shell command in the workspace to build, test, or inspect the project. Explain the command and obtain user approval first.', parameters:{type:'object',properties:{command:{type:'string',description:'Command to execute in the workspace root'}},required:['command']} } },
  { type:'function', function:{ name:'web_search', description:'Search the web through the configured SearXNG, Firecrawl or custom search provider.', parameters:{type:'object',properties:{query:{type:'string'}},required:['query']} } }
];

async function runAgentTool(name: string, args: any): Promise<string> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return 'No workspace is open. Open a folder in VS Code first.';
  const root = folders[0].uri;
  if (name === 'list_workspace_files') {
    const pattern = typeof args.pattern === 'string' && args.pattern ? args.pattern : '**/*';
    const uris = await vscode.workspace.findFiles(pattern, '**/{node_modules,.git,out,dist,.next}/**', 250);
    return uris.map(uri => vscode.workspace.asRelativePath(uri)).join('\n') || 'No files matched.';
  }
  if (name === 'read_file') {
    const relative = String(args.path || '');
    const target = safeWorkspaceUri(root, relative);
    const bytes = await vscode.workspace.fs.readFile(target);
    return Buffer.from(bytes).toString('utf8').slice(0, 30000);
  }
  if (name === 'search_workspace') {
    const query = String(args.query || '').toLowerCase();
    if (!query) return 'Search query is empty.';
    const pattern = typeof args.pattern === 'string' && args.pattern ? args.pattern : '**/*';
    const uris = await vscode.workspace.findFiles(pattern, '**/{node_modules,.git,out,dist,.next}/**', 250);
    const hits: string[] = [];
    for (const uri of uris) {
      try {
        const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
        if (text.includes('\0')) continue;
        text.split(/\r?\n/).forEach((line, index) => {
          if (line.toLowerCase().includes(query)) hits.push(vscode.workspace.asRelativePath(uri) + ':' + (index + 1) + ': ' + line.trim().slice(0, 400));
        });
      } catch { /* Ignore binary and unreadable files. */ }
      if (hits.length >= 80) break;
    }
    return hits.join('\n') || 'No matches found.';
  }
  if (name === 'write_file') {
    const relative = String(args.path || '');
    const target = safeWorkspaceUri(root, relative);
    const existing = await vscode.workspace.fs.readFile(target).then(bytes => Buffer.from(bytes).toString('utf8')).catch(() => undefined);
    const preview = String(args.content ?? '');
    if (preview.length > 200000) return 'Write refused: file exceeds the 200 KB safety limit.';
    const approvalRequired = cfg().get<boolean>('agent.requireApprovalForEdits', true);
    if (approvalRequired) {
      const action = await vscode.window.showWarningMessage(
        'NekoSune Codex wants to ' + (existing === undefined ? 'create' : 'replace') + ' ' + relative + '. Review the change before continuing.',
        { modal: true, detail: 'New content: ' + preview.slice(0, 1600) + (preview.length > 1600 ? '\n… preview truncated …' : '') },
        'Apply file change'
      );
      if (action !== 'Apply file change') return 'User declined the file write. Do not retry unless the user explicitly asks.';
    }
    await vscode.workspace.fs.writeFile(target, Buffer.from(preview, 'utf8'));
    return 'File saved: ' + relative + (existing === undefined ? ' (created)' : ' (replaced)') + '.';
  }
  if (name === 'run_terminal') {
    const command = String(args.command || '').trim();
    if (!command) return 'No terminal command supplied.';
    if (command.length > 2000) return 'Command refused: it exceeds the 2,000-character safety limit.';
    const approvalRequired = cfg().get<boolean>('agent.requireApprovalForTerminal', true);
    if (approvalRequired) {
      const action = await vscode.window.showWarningMessage('NekoSune Codex wants to run a terminal command.', { modal:true, detail:'Working directory: ' + root.fsPath + '\n\nCommand:\n' + command }, 'Run command');
      if (action !== 'Run command') return 'User declined the terminal command. Do not retry unless the user explicitly asks.';
    }
    const result = await execCommand(command, { cwd:root.fsPath, timeout:120000, maxBuffer:1024*1024, windowsHide:true });
    return 'Exit code: 0\nSTDOUT:\n' + (result.stdout || '(empty)') + '\nSTDERR:\n' + (result.stderr || '(empty)');
  }
  if (name === 'web_search') return await searchWeb(String(args.query || ''));
  return 'Unknown tool: ' + name;
}

function safeWorkspaceUri(root: vscode.Uri, relative: string): vscode.Uri {
  if (!relative || path.isAbsolute(relative) || relative.includes('\0')) throw new Error('A safe workspace-relative path is required.');
  const normalized = path.normalize(relative).split(path.sep).join('/');
  if (normalized === '..' || normalized.startsWith('../')) throw new Error('Path escapes the workspace.');
  const target = vscode.Uri.joinPath(root, normalized);
  const rootPath = path.resolve(root.fsPath);
  const targetPath = path.resolve(target.fsPath);
  if (targetPath !== rootPath && !targetPath.startsWith(rootPath + path.sep)) throw new Error('Path escapes the workspace.');
  return target;
}

async function chat(text: string, history: ChatMessage[]): Promise<string> {
  const provider = cfg().get<string>('provider', 'ollama');
  const system = 'You are NekoSune Codex, a coding and research assistant inside VS Code. You can inspect the workspace, search files, research the web, and create or replace files using tools. Before writing, explain what you intend to change; the write tool will ask the user for approval. Never claim a change succeeded unless the tool confirms it. Prefer small, relevant edits and suggest validation steps.';
  const transcript: any[] = [{role:'system',content:system}, ...history.slice(-20)];
  const base = provider === 'ollama'
    ? cfg().get<string>('ollama.baseUrl', 'http://127.0.0.1:11434')
    : cfg().get<string>('api.baseUrl', 'http://127.0.0.1:20128/v1');
  const model = provider === 'ollama'
    ? cfg().get<string>('ollama.model', 'qwen2.5-coder:7b')
    : cfg().get<string>('api.model', 'openai/gpt-4.1-mini');
  const key = cfg().get<string>('apiKey', '');

  for (let turn = 0; turn < 6; turn++) {
    let data: any;
    if (provider === 'ollama') {
      data = await checkedJson(await fetch(joinUrl(base, '/api/chat'), {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model, stream:false, messages:transcript, tools:agentTools})
      }));
      const assistant = data.message ?? {};
      const calls = assistant.tool_calls ?? [];
      if (!calls.length) return assistant.content ?? 'Ollama returned an empty response.';
      transcript.push(assistant);
      for (const call of calls) {
        const name = call.function?.name;
        const rawArgs = call.function?.arguments ?? {};
        const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
        let result: string;
        try { result = await runAgentTool(name, args); } catch (error) { result = 'Tool error: ' + (error instanceof Error ? error.message : String(error)); }
        transcript.push({role:'tool', tool_name:name, content:result});
      }
    } else {
      data = await checkedJson(await fetch(joinUrl(base, '/chat/completions'), {
        method:'POST', headers:{'Content-Type':'application/json', ...authHeaders(key)},
        body:JSON.stringify({model, messages:transcript, tools:agentTools, tool_choice:'auto', stream:false})
      }));
      const assistant = data.choices?.[0]?.message;
      if (!assistant) throw new Error('The model returned no assistant message.');
      const calls = assistant.tool_calls ?? [];
      if (!calls.length) return typeof assistant.content === 'string' ? assistant.content : JSON.stringify(assistant.content ?? '');
      transcript.push(assistant);
      for (const call of calls) {
        const name = call.function?.name;
        const args = JSON.parse(call.function?.arguments || '{}');
        let result: string;
        try { result = await runAgentTool(name, args); } catch (error) { result = 'Tool error: ' + (error instanceof Error ? error.message : String(error)); }
        transcript.push({role:'tool', tool_call_id:call.id, content:result});
      }
    }
  }
  return 'I reached the tool-call limit for this turn. Please ask me to continue or narrow the task.';
}

async function searchWeb(query: string): Promise<string> {
  const c = cfg();
  const provider = c.get<string>('search.provider','searxng');
  if (provider === 'firecrawl') {
    const base = c.get<string>('firecrawl.baseUrl','http://127.0.0.1:3002');
    const key = c.get<string>('firecrawl.apiKey','');
    const response = await fetch(joinUrl(base,'/v2/search'), {method:'POST',headers:{'Content-Type':'application/json',...authHeaders(key)},body:JSON.stringify({query,limit:5,scrapeOptions:{formats:['markdown']}})});
    const data = await checkedJson(response);
    const results = data.data ?? data.results ?? [];
    return results.map((x:any,i:number)=>(i+1)+'. '+(x.title||x.url||'Result')+'\n'+(x.url||'')+'\n'+(x.description||x.markdown||x.content||'')).join('\n\n') || JSON.stringify(data).slice(0,5000);
  }
  if (provider === 'custom') {
    const base = c.get<string>('search.baseUrl','http://127.0.0.1:8080');
    const customPath = c.get<string>('search.customPath','/search');
    const url = new URL(joinUrl(base,customPath)); url.searchParams.set('q',query);
    const response = await fetch(url, {headers:{...authHeaders(c.get<string>('apiKey',''))}});
    const data = await checkedJson(response);
    return JSON.stringify(data,null,2).slice(0,8000);
  }
  const base = c.get<string>('search.baseUrl','http://127.0.0.1:8080');
  const url = new URL(joinUrl(base,'/search')); url.searchParams.set('q',query); url.searchParams.set('format','json');
  const data = await checkedJson(await fetch(url));
  const results = data.results ?? [];
  return results.slice(0,8).map((x:any,i:number)=>(i+1)+'. '+x.title+'\n'+x.url+'\n'+(x.content||'')).join('\n\n') || 'No search results. Check that SearXNG JSON output is enabled in its settings.';
}

async function generateImage(prompt: string): Promise<{data?:string;mimeType?:string;url?:string}> {
  const c = cfg();
  if (!c.get<boolean>('images.enabled',true)) throw new Error('Image generation is disabled in Settings.');
  const base = c.get<string>('api.baseUrl','http://127.0.0.1:20128/v1');
  const key = c.get<string>('apiKey','');
  const model = c.get<string>('images.model','openai/gpt-image-2');
  const response = await fetch(joinUrl(base,'/images/generations'), {method:'POST',headers:{'Content-Type':'application/json',...authHeaders(key)},body:JSON.stringify({model,prompt,n:1,size:'1024x1024',response_format:'b64_json'})});
  const data = await checkedJson(response);
  const image = data.data?.[0];
  if (image?.b64_json) return {data:image.b64_json,mimeType:'image/png'};
  if (image?.url) return {url:image.url};
  throw new Error('The image endpoint returned no image URL or base64 data. Check the selected model and its supported response format.');
}

async function transcribe(audioBase64: string, mimeType: string): Promise<string> {
  const c = cfg();
  const endpoint = c.get<string>('voice.transcriptionUrl','http://127.0.0.1:9000/v1/audio/transcriptions');
  const protocol = c.get<string>('voice.transcriptionProvider','openai-compatible');
  const bytes = Buffer.from(audioBase64,'base64');
  if (protocol === 'vosk-http') {
    const form = new FormData(); form.append('file',new Blob([bytes],{type:mimeType}),'recording.webm');
    const data = await checkedJson(await fetch(endpoint,{method:'POST',body:form}));
    return data.text ?? data.transcription ?? data.result?.text ?? JSON.stringify(data);
  }
  const form = new FormData();
  form.append('file',new Blob([bytes],{type:mimeType}),'recording.webm');
  form.append('model',c.get<string>('voice.transcriptionModel','whisper-1'));
  const key = c.get<string>('apiKey','');
  const response = await fetch(endpoint,{method:'POST',headers:authHeaders(key),body:form});
  const data = await checkedJson(response);
  return data.text ?? data.transcription ?? 'The transcription service returned no text.';
}

async function speak(text: string): Promise<{data:string;mimeType:string}> {
  const c = cfg();
  const base = c.get<string>('voice.ttsUrl','http://127.0.0.1:5000');
  const mode = c.get<string>('voice.ttsMode','piper-http');
  let response: Response;
  if (mode === 'openai-compatible') {
    const key = c.get<string>('apiKey','');
    response = await fetch(joinUrl(base,'/v1/audio/speech'),{method:'POST',headers:{'Content-Type':'application/json',...authHeaders(key)},body:JSON.stringify({model:'tts-1',voice:c.get<string>('voice.ttsVoice','alloy'),input:text,response_format:'wav'})});
  } else {
    response = await fetch(joinUrl(base,'/'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,voice:c.get<string>('voice.ttsVoice','en_GB-alan-medium')})});
  }
  if (!response.ok) throw new Error('TTS HTTP '+response.status+': '+(await response.text()).slice(0,800));
  const type = response.headers.get('content-type') || 'audio/wav';
  return {data:Buffer.from(await response.arrayBuffer()).toString('base64'),mimeType:type.includes('mpeg')?'audio/mpeg':type.includes('ogg')?'audio/ogg':type.includes('wav')?'audio/wav':'audio/wav'};
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new CodexViewProvider(context);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('nekosuneCodex.chat',provider));
  context.subscriptions.push(vscode.commands.registerCommand('nekosuneCodex.openChat',async()=>{await vscode.commands.executeCommand('workbench.view.extension.nekosuneCodex');}));
  context.subscriptions.push(vscode.commands.registerCommand('nekosuneCodex.searchWorkspace',async()=>{
    const query = await vscode.window.showInputBox({prompt:'Search workspace files for text'});
    if (!query) return;
    const files = await vscode.workspace.findFiles('**/*', '**/{node_modules,.git,out,dist}/**', 500);
    const matches: string[] = [];
    for (const file of files) {
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        const lines = doc.getText().split(/\r?\n/);
        lines.forEach((line,i)=>{if(line.toLowerCase().includes(query.toLowerCase())) matches.push(path.relative(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',file.fsPath)+':'+(i+1)+': '+line.trim());});
        if (matches.length >= 100) break;
      } catch { /* Skip binary or unreadable files. */ }
    }
    const doc = await vscode.workspace.openTextDocument({language:'markdown',content:matches.length?matches.join('\n'):'No matches found.'});
    await vscode.window.showTextDocument(doc,{preview:true});
  }));
}
export function deactivate(): void {}
