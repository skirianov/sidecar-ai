# AI Template Maker Guide

The AI Template Maker generates sidecar configurations for you. Just describe what you want in plain English.

## How It Works

1. Click **🪄 AI Maker** button in Sidecar AI settings
2. Describe what you want
3. Select an API connection (uses your existing SillyTavern setup)
4. Click **Generate Template**
5. Review the generated config
6. Add it to your sidecars or export as JSON

## Example

**You write:** "I want a sidecar that adds reader comments to each chapter with diverse reactions"

**AI generates:** Complete JSON config with name, prompt, settings, format - ready to use.

## Writing Good Descriptions

### Be Specific

❌ "Show emotions"  
✅ "Show emotions as colored badges with emoji and intensity numbers"

### Mention When It Should Run

- "automatically after each message"
- "manually when I click the button"
- "after every AI response"

### Describe the Output Format

- "as a collapsible card"
- "as a table with colored cells"
- "as a comment section with user avatars"
- "as simple bullet points"

### Examples

**Simple:**
```
Track character emotions with colored badges
```

**Detailed:**
```
I want a sidecar that tracks character emotions and displays them 
as colored emoji with intensity ratings from 1-10. It should run 
automatically after each message and show results in a collapsible 
card using HTML+CSS formatting.
```

**Complex:**
```
Create a comprehensive relationship tracker that monitors:
- Affection, Trust, and Desire on 0-200 scales
- Current relationship status (Friends, Lovers, Complicated, etc.)
- Character physical and emotional states
- Location, time, and weather
- Inner thoughts for each character

Should auto-trigger, use HTML formatting with colored cards. 
Include last 5 messages of context and track history.
```

## Tips

**For tracking sidecars:**
- Mention "automatically" or "auto-trigger"
- Specify what metrics to track
- Note if history is important
- Usually need character card context

**For analysis sidecars:**
- Usually "manual" trigger
- Describe the analysis type
- Specify output format
- May need broader context (more messages)

**For creative sidecars:**
- Mention "beautify" if you want variety
- Describe visual style preferences
- Usually manual trigger

## What If It's Not Perfect?

The AI generates a starting point, not always perfect. You can:

1. Regenerate with a different description
2. Edit manually after adding it
3. Test it and adjust the prompt
4. Combine ideas from multiple generations

Even if it's 80% there, it's faster than writing JSON from scratch.

## Troubleshooting

**"No API connections configured"**
- Set up at least one API connection in Settings → API Connections
- Any provider works

**Generation takes too long**
- Normal for complex descriptions
- GPT-4o-mini is fastest (5-10 sec)
- GPT-4o is slower but better (15-20 sec)

**Generated config doesn't make sense**
- Try simpler language
- Break complex ideas into multiple sidecars
- Be more explicit about settings you want

**Wrong settings chosen**
- Edit after generation to fix
- Or regenerate with more explicit description
- Mention specific settings: "trigger manually", "use markdown format", etc.
