# Templates

Pre-made sidecar configurations you can import and use.

## How to Use

1. Open Sidecar AI settings
2. Click **Templates** button
3. Click **Browse Local Templates**
4. Click **Import** on any template
5. Edit it to add your API key (or use SillyTavern's saved keys)

## Available Templates

- **starter-pack.json** - Bundle of 4 templates (Perspective Flip, Director's Commentary, Soundtrack, Art Prompt)
- **directors-commentary.json** - DVD commentary-style analysis
- **soundtrack-suggester.json** - Suggests music for scenes
- **art-prompt-generator.json** - Creates prompts for image generation
- **commentary-section.json** - Simulated reader comments
- **actor-interview.json** - Behind-the-scenes actor interviews
- **relationship-matrix.json** - Comprehensive scene tracking with relationship stats

## Creating Your Own

### Option 1: Use AI Maker (Easiest)

1. Click **🪄 AI Maker** button
2. Describe your sidecar idea
3. AI generates the config
4. Export it or add directly

### Option 2: Manual Creation

Copy this structure:

```json
{
  "version": "1.0",
  "name": "Template: Your Template Name",
  "description": "Brief description",
  "addons": [
    {
      "name": "🎯 Display Name",
      "description": "What it does",
      "prompt": "Your prompt here...",
      "triggerMode": "manual",
      "requestMode": "standalone",
      "aiProvider": "openai",
      "aiModel": "gpt-4o-mini",
      "apiKey": "",
      "resultFormat": "collapsible",
      "responseLocation": "outsideChatlog",
      "formatStyle": "html-css",
      "contextSettings": {
        "messagesCount": 10,
        "includeCharCard": true,
        "includeUserCard": true,
        "includeWorldCard": true,
        "includeHistory": true,
        "historyDepth": 1
      }
    }
  ]
}
```

### Field Reference

**triggerMode:** `"auto"` (runs automatically) or `"manual"` (you trigger it)

**requestMode:** `"standalone"` (own request) or `"batch"` (groups with same provider/model)

**formatStyle:** `"html-css"`, `"markdown"`, `"xml"`, or `"beautify"`

**resultFormat:** `"collapsible"` (recommended), `"separate"`, or `"append"`

**responseLocation:** `"outsideChatlog"` (recommended) or `"chatHistory"`

**contextSettings:**
- `messagesCount`: How many recent messages (1-50)
- `includeCharCard`: Include character info
- `includeUserCard`: Include user info
- `includeWorldCard`: Include world/setting info
- `includeHistory`: Include previous outputs
- `historyDepth`: How many previous outputs (minimum 1)

## Sharing Templates

### Export for Sharing

1. Create your sidecar in the UI
2. Click Export
3. Choose "Include API Keys" = NO
4. Save the JSON file

### Contribute to Community

1. Fork the repo
2. Add your template to `templates/community/`
3. Submit a pull request with description and example output

## Tips

**Writing prompts:**
- Be specific about what you want
- Include format examples
- Tell the AI what NOT to do
- Only include context you actually need

**Choosing settings:**
- Auto: Good for tracking, analysis, mood detection
- Manual: Better for heavy processing, optional features
- 1-5 messages: Immediate context
- 6-15 messages: Scene context
- 16-30 messages: Broader patterns
- HTML+CSS: Best for visual content
- Markdown: Best for simple text
- Use `gpt-4o-mini` for cheap operations
- Use `batch` mode for multiple auto-triggered sidecars

## Troubleshooting

**Sidecar not triggering?**
- Check if it's enabled (toggle switch)
- For auto: Make sure you have an AI response
- For manual: Use Extensions menu → Run Sidecar

**Output not formatted correctly?**
- Check `formatStyle` matches your prompt
- Verify prompt includes format examples
- Try different models

**API errors?**
- Verify API key is set
- Check provider/model combination is valid
- Test connection using "Test Connection" button
