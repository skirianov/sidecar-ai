# Template Installation

Quick guide to installing templates.

## Method 1: Via Templates Button

1. Open SillyTavern → Extensions → Sidecar AI
2. Click **Templates** button
3. Click **Browse Local Templates**
4. Click **Import** on any template
5. Done

## Method 2: Manual Import

1. Download a template `.json` file
2. Open Sidecar AI settings
3. Click **Import** button
4. Select the template file
5. Done

## Method 3: Copy-Paste

1. Open a template `.json` file
2. Copy the entire contents
3. Open Sidecar AI settings → Click **Import**
4. Choose "Paste from clipboard"
5. Paste the JSON
6. Done

## After Import

### Set Your API Key

Templates don't include API keys for security. After importing:

**Option A: Use SillyTavern's Keys (Recommended)**
1. Go to Settings → API Connections
2. Set up your provider
3. Sidecar will automatically use it

**Option B: Set Key in Sidecar**
1. Click **Edit** on the imported sidecar
2. Enter your API key
3. Click **Save Sidecar**

### Customize

Feel free to modify:
- The prompt text
- Number of messages to include
- Trigger mode (auto vs manual)
- AI provider/model
- Format style

## Recommended Starter Templates

If you're new, try these:

1. **starter-pack.json** - 4 templates at once
2. **🪄 AI Maker** - Create custom templates by describing them
3. **commentary-section.json** - Fun reader comments

## Creating Your Own

### Use AI Template Maker

1. Click **🪄 AI Maker** button
2. Describe your sidecar idea
3. AI generates the config
4. Export it or add directly

See [AI Template Maker Guide](../docs/AI-MAKER-GUIDE.md) for details.

### Manual Method

See `templates/README.md` for template structure and fields.

## Sharing Templates

### Contribute to Community

1. Create your template
2. Test it thoroughly
3. Export it (without API key!)
4. Save to `templates/community/your-template.json`
5. Submit a pull request with:
   - Template file
   - Description
   - Example output
   - Any special requirements

### Guidelines

- Clear naming (emoji + descriptive name)
- Good prompts (include format examples)
- Sensible defaults
- Test thoroughly
- No API keys in templates

## Troubleshooting

**Template won't import?**
- Verify it's valid JSON
- Check all required fields are present
- Look at working templates for reference

**Template not working?**
- Check API key is set
- Verify provider/model combination is valid
- Test with simpler prompt first
- Check console for errors

**Need help?**
- Open an issue on GitHub
- Check `templates/README.md` for details
- Review example templates
