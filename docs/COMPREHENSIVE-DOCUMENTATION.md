# Sidecar AI - Comprehensive Documentation

## Table of Contents
1. [Overview](#overview)
2. [What is Sidecar AI?](#what-is-sidecar-ai)
3. [Core Concept](#core-concept)
4. [Architecture](#architecture)
5. [Key Features](#key-features)
6. [How It Works](#how-it-works)
7. [Use Cases](#use-cases)
8. [Technical Details](#technical-details)
9. [Installation & Setup](#installation--setup)
10. [Configuration](#configuration)
11. [Security](#security)
12. [Templates & Community](#templates--community)

---

## Overview

**Sidecar AI** is a SillyTavern browser extension that enables users to run additional AI-powered tasks alongside their main roleplay conversations. The extension allows you to offload auxiliary tasks (like commentary, tracking, analysis) to cheaper AI models while your expensive primary model handles the actual roleplay dialogue.

### Purpose

Running premium AI models (like Claude Opus, Gemini 3 Pro) for every task gets expensive quickly. Sidecar AI solves this by:
- **Cost Optimization**: Use cheap models (GPT-4o-mini, Deepseek) for auxiliary tasks
- **Feature Enhancement**: Add rich features without breaking the bank
- **Flexibility**: Run multiple specialized AI tasks simultaneously
- **Integration**: Seamlessly works with SillyTavern's existing infrastructure

### Example Setup

```
Main AI (Claude Opus):     Handles roleplay responses
Sidecar 1 (GPT-4o-mini):   Adds reader comment sections
Sidecar 2 (Deepseek):      Tracks relationships and stats
Sidecar 3 (GPT-4o-mini):  Generates actor interviews
```

---

## What is Sidecar AI?

Sidecar AI is a **SillyTavern extension** (browser-based) that adds a "sidecar" system to your roleplay conversations. Each sidecar is an independent AI task that:

- Runs alongside your main conversation
- Uses its own AI provider/model
- Has its own prompt/instructions
- Executes independently from the main chat
- Displays results in various formats and locations

### What is SillyTavern?

SillyTavern is a local, self-hosted interface for interacting with AI language models. It's commonly used for:
- AI-powered roleplay and storytelling
- Character-based conversations
- Creative writing assistance
- Interactive fiction

Sidecar AI extends SillyTavern's capabilities by adding parallel AI processing.

---

## Core Concept

### The Problem

When using premium AI models for roleplay:
- Every API call costs money
- Context window usage is expensive
- Adding features means more tokens
- Running analysis/tracking requires additional requests

### The Solution

Sidecar AI introduces **parallel AI processing**:
1. Your main AI handles the conversation (expensive model)
2. Sidecars handle auxiliary tasks (cheap models)
3. Results are displayed separately (doesn't clutter chat)
4. Context is controlled per sidecar (saves tokens)

### Key Benefits

- **💰 Cost Savings**: Use $0.15/1M tokens (GPT-4o-mini) instead of $15/1M tokens (Claude Opus) for auxiliary tasks
- **🚀 More Features**: Add tracking, commentary, analysis without affecting main conversation
- **🎯 Specialization**: Each sidecar can be optimized for a specific task
- **📊 Rich Output**: HTML/CSS formatting, tables, cards, visual elements
- **🔄 Automation**: Auto-trigger sidecars after every message or on-demand

---

## Architecture

### Extension Structure

```
sidecar-ai/
├── index.js              # Main entry point, initialization
├── manifest.json         # Extension metadata
├── style.css            # Styling and security CSS
├── settings.html         # Settings UI HTML
├── src/
│   ├── addon-manager.js  # Manages sidecar configurations
│   ├── context-builder.js # Builds context for AI requests
│   ├── ai-client.js      # Handles API communication
│   ├── result-formatter.js # Formats and displays results
│   ├── event-handler.js  # Handles SillyTavern events
│   └── settings-ui.js    # Settings interface management
└── templates/            # Pre-made sidecar configurations
```

### Component Responsibilities

#### 1. **AddonManager** (`addon-manager.js`)
- Loads/saves sidecar configurations
- Manages enabled/disabled state
- Handles storage (localStorage)
- Provides addon retrieval methods

#### 2. **ContextBuilder** (`context-builder.js`)
- Builds context for AI requests
- Includes chat history, character cards, world info
- Manages context depth and history
- Formats prompts with variables

#### 3. **AIClient** (`ai-client.js`)
- Communicates with AI providers
- Uses SillyTavern's ChatCompletionService
- Handles batch processing
- Manages API keys and connections
- Retry logic and error handling

#### 4. **ResultFormatter** (`result-formatter.js`)
- Formats AI responses (HTML, Markdown, XML, Beautify)
- Sanitizes content for security
- Displays results in cards/blocks
- Manages result storage (message.extra)
- Handles swipe variant support

#### 5. **EventHandler** (`event-handler.js`)
- Listens to SillyTavern events
- Triggers sidecars on AI responses
- Handles manual triggers
- Manages trigger mode (auto/manual/keyword)
- Coordinates with other components

#### 6. **SettingsUI** (`settings-ui.js`)
- Manages settings interface
- Handles addon creation/editing
- Template import/export
- AI Template Maker integration
- Connection testing

### Data Flow

```
User Action / AI Response
    ↓
EventHandler detects event
    ↓
AddonManager retrieves enabled sidecars
    ↓
ContextBuilder builds context for each sidecar
    ↓
AIClient sends requests (standalone or batch)
    ↓
AI Provider returns responses
    ↓
ResultFormatter sanitizes and formats
    ↓
Results displayed in UI / stored in metadata
```

### Storage Architecture

**Modern Storage (v0.3.0+)**:
- Results stored in `message.extra.sidecarResults`
- Per swipe variant: `message.swipe_info[swipeId].extra.sidecarResults`
- Not sent to AI (saves tokens)
- Clean metadata structure
- Backward compatible with old HTML comment storage

**Benefits**:
- Massive token savings (up to 45K tokens per request)
- No context pollution
- Faster responses
- Lower costs

---

## Key Features

### 1. Multiple Trigger Modes

#### Auto Mode (🟢)
- Runs automatically after every AI response
- Best for: Tracking, analysis, continuous monitoring
- Example: Emotion tracker, relationship matrix

#### Manual Mode (🟠)
- Triggered via Extensions menu → Run Sidecar
- Best for: Optional features, heavy analysis, on-demand tasks
- Example: Director's commentary, actor interviews

#### Trigger Mode (🔵)
- Runs when user message contains keywords or regex patterns
- Runs once on the next AI response
- Best for: Context-aware features, specific user requests
- Example: "Inventory" command triggers inventory list
- Supports both keyword matching and regex patterns

### 2. Format Styles

#### HTML+CSS (Default)
- Rich visual formatting with cards, colors, tables
- WCAG AA contrast enforced automatically
- Best for: Visual content, structured data, styled output

#### Markdown
- Simple text formatting
- Best for: Plain text, lists, basic formatting

#### XML
- Structured data format
- Best for: Data extraction, parsing, integration

#### Random Beautify
- Creative styling that changes each time
- Maintains style consistency across outputs
- Best for: Theatrical, entertaining content

### 3. Response Locations

#### Outside Chatlog (Recommended)
- Shows as expandable cards below messages
- Doesn't clutter chat
- Not sent to main AI (saves tokens)
- Collapsible, separate, or append formats

#### Chat History
- Injected as HTML comment in message
- Main AI can see it in future responses
- Useful for: Context that should influence main AI

### 4. Result Formats

#### Collapsible (Recommended)
- Expandable `<details>` block
- Click to show/hide
- Clean and organized

#### Separate Block
- Standalone text block
- Always visible
- Simple display

#### Append
- Inline with message
- Flows naturally
- Less visual separation

### 5. Context Control

Each sidecar can control what context it receives:

- **Messages Count** (1-50): How many recent messages to include
- **Include Character Card**: Character personality/description
- **Include User Card**: User personality/preferences
- **Include World Card**: Setting/world information
- **Include History**: Include previous sidecar outputs
- **History Depth** (minimum 1): How many previous outputs

### 6. Batch Processing

- Group multiple sidecars with same provider/model
- Single API request instead of multiple
- Saves tokens and cost
- Faster processing

### 7. AI Template Maker

Generate sidecar configurations using AI:
1. Describe what you want in plain English
2. AI generates complete JSON configuration
3. Preview, test, or add directly
4. Export as JSON or publish to GitHub

### 8. Template Library

Pre-made sidecar configurations:
- **Starter Pack**: 4 essential templates
- **Actor Interview**: Characters break fourth wall
- **Reader Comments**: Simulated comment sections
- **Relationship Matrix**: Comprehensive scene tracking
- **Director's Commentary**: DVD-style meta-analysis
- **Soundtrack Suggester**: Music recommendations
- **Art Prompt Generator**: Image generation prompts

### 9. API Key Management

**Option 1: Use SillyTavern's Saved Keys** (Recommended)
- Set up in Settings → API Connections
- No per-sidecar configuration needed
- Secure and centralized

**Option 2: Per-Sidecar Keys**
- Set API key in sidecar form
- Useful for different keys per sidecar
- Overrides SillyTavern key if set

**Supported Providers**:
- OpenAI, OpenRouter, Anthropic, Google, Deepseek, Cohere, Custom

### 10. History Viewer

- View all previous results for a sidecar
- Browse results by timestamp
- View full content
- Delete old results
- See which message each result belongs to

---

## How It Works

### Initialization

1. Extension loads when SillyTavern starts
2. Modules are imported dynamically
3. SillyTavern context is obtained
4. Components are initialized
5. Saved sidecars are loaded
6. Event listeners are registered
7. Settings UI is injected

### Auto-Trigger Flow

```
AI generates response
    ↓
SillyTavern fires GENERATION_COMPLETE event
    ↓
EventHandler detects event
    ↓
AddonManager gets enabled auto sidecars
    ↓
For each sidecar:
    - ContextBuilder builds context
    - AIClient sends request
    - ResultFormatter displays result
```

### Manual Trigger Flow

```
User clicks "Run Sidecar" in Extensions menu
    ↓
EventHandler.triggerAddons() called
    ↓
AddonManager gets enabled manual sidecars
    ↓
Same processing as auto-trigger
```

### Trigger Mode Flow

```
User sends message with trigger keyword/regex
    ↓
EventHandler detects MESSAGE_SENT event
    ↓
Checks if message matches any trigger patterns
    ↓
Queues matching sidecars
    ↓
On next AI response, runs queued sidecars
```

### Batch Processing Flow

```
Multiple sidecars with same provider/model
    ↓
Grouped into batch request
    ↓
Single API call with multiple prompts
    ↓
Responses distributed to respective sidecars
    ↓
Results formatted and displayed
```

### Result Storage Flow

```
AI response received
    ↓
ResultFormatter sanitizes content
    ↓
Result stored in message.extra.sidecarResults
    ↓
Result displayed in UI card
    ↓
On chat reload, results restored from metadata
```

---

## Use Cases

### Content Creation

**Reader Comments**
- Simulated comment sections after each message
- Diverse reactions and perspectives
- Adds engagement and immersion

**Actor Interviews**
- Characters break fourth wall
- Behind-the-scenes commentary
- Meta-narrative elements

**Director's Commentary**
- DVD commentary-style analysis
- Scene breakdowns and insights
- Creative process exploration

### Tracking & Analysis

**Relationship Matrix**
- Tracks relationships, stats, character states
- Location, time, weather tracking
- Comprehensive scene analysis
- Visual tables and cards

**Emotion Tracking**
- Character emotions with colored badges
- Intensity ratings
- Visual indicators

**Scene Analysis**
- Context understanding
- Plot progression tracking
- Character development monitoring

### Creative Enhancement

**Soundtrack Suggester**
- Music recommendations for scenes
- Mood-based suggestions
- Genre and style matching

**Art Prompt Generator**
- Creates prompts for Stable Diffusion/Midjourney
- Scene descriptions for image generation
- Visual reference generation

**Perspective Flip**
- Alternative viewpoints
- Character perspective shifts
- Narrative experimentation

### Meta Features

**Commentary Sections**
- Reader-style reactions
- Community engagement simulation
- Fanfiction-style comments

**Status Tracking**
- Character health, inventory, stats
- Game-like mechanics
- Progress monitoring

---

## Technical Details

### Integration with SillyTavern

Sidecar AI integrates deeply with SillyTavern:

- **Uses SillyTavern's ChatCompletionService**: All API calls go through SillyTavern's backend
- **Accesses SillyTavern's Context**: Uses `getContext()` to access chat state, characters, settings
- **Listens to SillyTavern Events**: Hooks into `GENERATION_COMPLETE`, `MESSAGE_SENT`, `MESSAGE_SWIPED`
- **Uses SillyTavern's API Keys**: Can use saved API connections from Settings
- **Follows SillyTavern's Patterns**: Storage in `message.extra`, event naming, UI styling

### Event System

Sidecar AI listens to these SillyTavern events:

- `GENERATION_COMPLETE`: AI response finished → triggers auto sidecars
- `MESSAGE_SENT`: User message sent → checks trigger mode patterns
- `MESSAGE_SWIPED`: Swipe navigation → updates displayed sidecars
- `CHAT_CHANGED`: Chat loaded → restores sidecar results

### API Communication

All API requests use SillyTavern's `ChatCompletionService.processRequest()`:

- Handles API keys automatically
- Supports proxies and custom URLs
- Manages headers and authentication
- Provides error handling and retries

### Security Measures

Multi-layer security to prevent AI-generated content from affecting SillyTavern:

1. **Content Sanitization**: Strips scripts, dangerous positioning, event handlers
2. **CSS Containment**: Isolates layout, style, and paint
3. **Position Locking**: Converts fixed/absolute to relative
4. **Z-Index Normalization**: Prevents stacking manipulation
5. **Dangerous Element Blocking**: Removes iframes, embeds, objects
6. **Width/Overflow Control**: Constrains media elements
7. **Margin Normalization**: Prevents layout shifting
8. **Error Message Escaping**: Prevents injection via errors

See `SECURITY.md` for detailed technical information.

### Performance Optimizations

- **Batch Processing**: Groups requests to save API calls
- **Metadata Storage**: Results not sent to AI (saves tokens)
- **Debounced Updates**: UI updates are debounced to prevent lag
- **Lazy Loading**: Templates and settings loaded on demand
- **Efficient DOM Updates**: Minimal DOM manipulation

### Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Uses ES6 modules, async/await, CSS containment
- Graceful degradation for older browsers

---

## Installation & Setup

### Via SillyTavern UI

1. Open SillyTavern
2. Go to **Extensions** → **Download Extensions & Assets**
3. Paste: `https://github.com/skirianov/sidecar-ai`
4. Click **Download**
5. Refresh the page (Ctrl+Shift+R / Cmd+Shift+R)
6. Go to **Extensions** tab → Find **"Sidecar AI"** → Click to expand

### Manual Installation

1. Clone or download this repo
2. Copy the folder to: `SillyTavern/public/scripts/extensions/third-party/sidecar-ai/`
3. Make sure the folder is named `sidecar-ai` exactly
4. Restart SillyTavern or hard refresh

### Verification

Open the browser console (F12) and look for `[Sidecar AI] Initialization complete`.

---

## Configuration

### Creating a Sidecar

#### Option 1: AI Maker (Easiest)

1. Open Sidecar AI settings
2. Click **🪄 AI Maker** button
3. Describe what you want: "Track character emotions with colored badges"
4. Click **Generate Template**
5. Click **Add to Sidecars**
6. Add your API key and you're done

#### Option 2: Import Template

1. Open Sidecar AI settings
2. Click **Templates** button
3. Click **Browse Local Templates**
4. Import a template (e.g., **Starter Pack**)
5. Edit to add API key

#### Option 3: Manual Creation

1. Click **Create Sidecar**
2. Fill in the form:
   - **Name**: Display name
   - **Description**: What it does
   - **Prompt**: Instructions for the AI
   - **Trigger Mode**: Auto, Manual, or Trigger
   - **AI Provider**: OpenAI, OpenRouter, etc.
   - **AI Model**: Model to use
   - **Format Style**: HTML+CSS, Markdown, XML, Beautify
   - **Result Format**: Collapsible, Separate, Append
   - **Response Location**: Outside Chatlog or Chat History
   - **Context Settings**: Messages count, cards, history
3. Save it

### Configuration Fields

**Basic Settings**:
- `name`: Display name for the sidecar
- `description`: What the sidecar does
- `prompt`: Instructions for the AI
- `enabled`: Whether the sidecar is active

**Trigger Settings**:
- `triggerMode`: `"auto"`, `"manual"`, or `"trigger"`
- `triggerType`: `"keyword"` or `"regex"` (for trigger mode)
- `triggers`: Array of keywords or regex patterns

**AI Settings**:
- `aiProvider`: Provider name (openai, openrouter, anthropic, etc.)
- `aiModel`: Model identifier
- `apiKey`: Optional per-sidecar API key
- `requestMode`: `"standalone"` or `"batch"`

**Output Settings**:
- `formatStyle`: `"html-css"`, `"markdown"`, `"xml"`, `"beautify"`
- `resultFormat`: `"collapsible"`, `"separate"`, `"append"`
- `responseLocation`: `"outsideChatlog"` or `"chatHistory"`

**Context Settings**:
- `messagesCount`: Number of recent messages (1-50)
- `includeCharCard`: Include character card
- `includeUserCard`: Include user card
- `includeWorldCard`: Include world card
- `includeHistory`: Include previous sidecar outputs
- `historyDepth`: Number of previous outputs (minimum 1)

---

## Security

Sidecar AI implements comprehensive security measures to prevent AI-generated content from affecting SillyTavern:

### Threat Model

AI-generated responses may contain:
- Malicious HTML/CSS that breaks page layout
- JavaScript injection attempts
- Position escaping via fixed/absolute CSS
- Global style overrides
- External resource loading
- Z-index manipulation

### Defense Layers

1. **Content Sanitization**: JavaScript-based stripping of dangerous content
2. **CSS Containment**: Isolated rendering contexts
3. **Position Locking**: Forces relative positioning
4. **Z-Index Normalization**: Prevents stacking manipulation
5. **Dangerous Element Blocking**: Removes iframes, scripts, styles
6. **Width/Overflow Control**: Constrains media elements
7. **Margin Normalization**: Prevents layout shifting
8. **Error Message Escaping**: Prevents injection via errors

See `SECURITY.md` for detailed technical information and testing procedures.

---

## Templates & Community

### Template System

Templates are JSON files containing sidecar configurations:

```json
{
  "version": "1.0",
  "name": "Template: Your Template Name",
  "description": "Brief description",
  "addons": [
    {
      "name": "🎯 Display Name",
      "prompt": "Your prompt here...",
      "triggerMode": "auto",
      "aiProvider": "openai",
      "aiModel": "gpt-4o-mini",
      ...
    }
  ]
}
```

### Available Templates

Located in `templates/` directory:
- `starter-pack.json`: 4 essential templates
- `directors-commentary.json`: DVD commentary
- `soundtrack-suggester.json`: Music suggestions
- `art-prompt-generator.json`: Image prompts
- `commentary-section.json`: Reader comments
- `actor-interview.json`: Actor interviews
- `relationship-matrix.json`: Scene tracking

### Community Templates

Community-contributed templates in `templates/community/`:
- Browse via Templates UI
- Import from GitHub
- Contribute your own via PR

### Creating Templates

1. **Use AI Maker**: Generate with AI, export as JSON
2. **Manual Creation**: Create sidecar, export JSON
3. **Share**: Submit PR to `templates/community/`

### Template Best Practices

- Clear, descriptive names
- Well-documented prompts
- Appropriate trigger modes
- Efficient context settings
- Good format style choices
- Example outputs

---

## Summary

**Sidecar AI** is a powerful SillyTavern extension that enables cost-effective, feature-rich roleplay experiences by:

- Running parallel AI tasks alongside main conversations
- Using cheap models for auxiliary tasks
- Providing rich formatting and display options
- Offering automation and manual control
- Supporting templates and community contributions
- Implementing comprehensive security measures

The extension is designed to be:
- **Easy to use**: AI Maker, templates, intuitive UI
- **Flexible**: Multiple trigger modes, format styles, context control
- **Secure**: Multi-layer security against malicious content
- **Efficient**: Batch processing, metadata storage, token savings
- **Extensible**: Template system, community contributions

Whether you want to add reader comments, track relationships, generate soundtracks, or create any other auxiliary AI feature, Sidecar AI makes it possible without breaking the bank.

---

## Additional Resources

- **Main README**: Installation and quick start
- **Features Documentation**: Complete feature list
- **AI Maker Guide**: Template generation guide
- **Template Library**: Available templates
- **Security Documentation**: Technical security details
- **Changelog**: Version history and changes

## Support

- **GitHub**: https://github.com/skirianov/sidecar-ai
- **Issues**: https://github.com/skirianov/sidecar-ai/issues
- **Ko-fi**: https://ko-fi.com/sidecarai (support development)

## License

MIT License - do whatever you want with it.
