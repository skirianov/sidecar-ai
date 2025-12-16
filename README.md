# Sidecar AI

A SillyTavern extension that lets you run extra AI tasks alongside your main roleplay conversation. Use cheap models for things like commentary sections, relationship tracking, or meta-analysis while your expensive model handles the actual roleplay.

## What's This For?

Running GPT-4 or Claude Opus for everything gets expensive fast. Sidecar AI lets you offload auxiliary tasks to cheaper models (like GPT-4o-mini or Deepseek) so you can add cool features without breaking the bank.

**Example setup:**
- Main AI (Claude Opus): Handles roleplay responses
- Sidecar 1 (GPT-4o-mini): Adds reader comment sections
- Sidecar 2 (Deepseek): Tracks relationships and stats
- Sidecar 3 (GPT-4o-mini): Generates actor interviews

You save money and get more features. Win-win.

## Installation

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

To verify it's working, open the browser console (F12) and look for `[Sidecar AI] Initialization complete`.

## Quick Start

### Option 1: Use the AI Maker (Easiest)

1. Open Sidecar AI settings
2. Click **🪄 AI Maker** button
3. Describe what you want: "Track character emotions with colored badges"
4. Click **Generate Template**
5. Click **Add to Sidecars**
6. Add your API key and you're done

Uses your existing SillyTavern API connection, so no extra setup needed.

### Option 2: Import a Template

1. Open Sidecar AI settings
2. Click **Templates** button
3. Click **Browse Local Templates**
4. Import **Starter Pack** (has 4 templates)
5. Edit each one to add your API key
6. Start using them

### Option 3: Create One Manually

1. Click **Create Sidecar**
2. Fill in the form (name, prompt, provider, etc.)
3. Save it

## How It Works

### Trigger Modes

**Auto:** Runs after every AI response. Good for tracking things that need to update constantly.

**Manual:** You trigger it when you want it. Good for optional features or heavy analysis.

### Response Locations

**Outside Chatlog (recommended):** Shows up in expandable cards below the message. Doesn't clutter your chat.

**Chat History:** Injects as an HTML comment in the message. The main AI can see it in future responses.

### Format Styles

- **HTML+CSS:** Rich formatting with cards and colors (default)
- **Markdown:** Simple text formatting
- **XML:** Structured data
- **Random Beautify:** Creative styling that changes each time

### API Keys

You can either:
- Use SillyTavern's saved API keys (recommended - set them up in Settings → API Connections)
- Set a key per sidecar (useful if you want different keys for different sidecars)

## Templates

There are a bunch of pre-made templates you can import:

- **Actor Interview** - Characters break the fourth wall and comment on the scene
- **Reader Comments** - Simulated comment sections like on fanfiction sites
- **Relationship Matrix** - Tracks relationships, stats, character states, location, etc.
- **Director's Commentary** - DVD commentary-style analysis
- **Soundtrack Suggester** - Suggests music that fits the scene
- **Art Prompt Generator** - Creates prompts for Stable Diffusion/Midjourney

Import them via the Templates button, or check `templates/README.md` for details.

## Advanced Stuff

### Batch Processing

If you have multiple sidecars using the same provider/model, set them to "Batch" mode. They'll be sent together in one API request, saving tokens and cost.

### Context Control

You can control what each sidecar sees:
- How many recent messages (1-50)
- Whether to include character card, user card, world card
- History depth (how many previous sidecar outputs to include)

### Console Commands

```javascript
// Trigger all manual sidecars
window.addOnsExtension.triggerAddons();

// Trigger specific ones
window.addOnsExtension.triggerAddons(['addon_id_1', 'addon_id_2']);

// Retry a failed one
window.addOnsExtension.retryAddon('addon_id', 'message_id');
```

## Troubleshooting

**Sidecars not running?**
- Check if it's enabled (toggle switch)
- Make sure API key is set (either in sidecar or SillyTavern)
- Check browser console for errors (F12)

**Results not showing up?**
- If using "Outside Chatlog", look for expandable cards below messages
- If using "Chat History", results are HTML comments (view page source)

**AI Maker not working?**
- Make sure you have at least one API connection set up in Settings → API Connections
- Check console for specific errors

**API errors?**
- Verify your API key is valid
- Test connection using the "Test Connection" button
- Check if you're hitting rate limits

## Contributing

This is a community project. Contributions welcome:

- New templates (add to `templates/community/`)
- Bug reports (open an issue)
- Feature ideas (open an issue)
- Code improvements (submit a PR)

Before contributing, check existing issues/PRs, test your changes, and update CHANGELOG.md if needed.

## Security

AI-generated content is sandboxed to prevent it from breaking SillyTavern. See `SECURITY.md` for technical details.

## Links

- **GitHub:** https://github.com/skirianov/sidecar-ai
- **Issues:** https://github.com/skirianov/sidecar-ai/issues
- **Ko-fi:** https://ko-fi.com/sidecarai (if you want to support development)

## License

MIT License - do whatever you want with it.
