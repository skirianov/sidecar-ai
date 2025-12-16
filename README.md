# SillyTavern Sidecar AI Add-Ons

**Version:** 0.1.3

A SillyTavern extension that allows you to define custom "add-on" prompts (like critiques, comments, interviews, etc.) that execute using cheaper AI models instead of your main expensive model. This helps reduce costs by routing auxiliary processing tasks to more affordable AI providers.

## Features

- **Custom Add-On Prompts**: Define multiple add-on prompts with full control over their behavior
- **Cost Optimization**: Route auxiliary tasks to cheaper AI models (e.g., Deepseek, GPT-3.5) while using expensive models for main roleplay
- **Batch Processing**: Group add-ons with the same provider/model for efficient batch requests
- **Flexible Triggering**: Auto-trigger after each AI response or manually trigger via button
- **Context Awareness**: Automatically includes chat history, character cards, user cards, and world cards
- **Result Placement**: Choose to inject results as HTML comments (accessible to main AI) or display in dropdown UI
- **Multiple Providers**: Support for OpenAI, Deepseek, Anthropic (Claude), Google (Gemini), and Cohere

## Installation

1. Clone or download this repository
2. Copy the entire extension folder into your SillyTavern installation:
   ```
   SillyTavern/public/scripts/extensions/third-party/sidecar-ai/
   ```
   **Important**: The folder must be named `sidecar-ai` and placed in the `third-party` directory.

3. Restart SillyTavern (or hard refresh the page with Ctrl+Shift+R / Cmd+Shift+R)

4. **Accessing the Extension**:
   - Go to **Settings** (gear icon) → **Extensions** tab
   - Look for **"Sidecar AI Add-Ons"** in the extensions list
   - Click on it to open the settings panel
   - If you don't see it, check the browser console (F12) for any errors

5. **Troubleshooting**:
   - Make sure the folder structure is: `public/scripts/extensions/third-party/sidecar-ai/`
   - Verify `manifest.json`, `index.js`, and `settings.html` are in the root of the folder
   - Check browser console for `[Add-Ons Extension]` or `[Sidecar AI Add-Ons]` messages
   - Ensure the extension is enabled in the Extensions list

## Usage

### Creating an Add-On

1. Go to **Settings** → **Extensions** → **Sidecar AI Add-Ons**
2. Click **"Add New Add-On"**
3. Fill in the form:
   - **Name**: A descriptive name for your add-on
   - **Description**: Optional description
   - **Prompt Template**: Your prompt with variables (see below)
   - **Trigger Mode**: Auto (after each response) or Manual (button trigger)
   - **Request Mode**: Standalone or Batch (group with same provider/model)
   - **AI Provider & Model**: Choose your cheaper AI provider and model
   - **Result Format**: How to format the result (append, separate, collapsible)
   - **Response Location**: Where to place results (chat history or dropdown)
   - **Context Settings**: Configure what context to include

### Prompt Variables

Use these variables in your prompt templates:

- `{{lastMessages}}` - Last N messages from chat (configurable count)
- `{{charCard}}` - Character card information
- `{{userCard}}` - User card information
- `{{worldCard}}` - World card information
- `{{currentMessage}}` - The most recent AI response

### Example Add-Ons

#### Gemini Nazi Module (Critique)
```
### GEMINI NAZI MODULE
*(Ruthless self-critique — NO mercy)*

**PURPOSE**:
- Enforce perfection in roleplay.
- Identify weaknesses in the last 3 responses (including current).
- Provide actionable feedback for the next response.

**RULES**:
1. Scan the last 3 responses for compliance with instructions.
2. Score 0-10 on metrics: POV Sanctity, Visibility, Sensory Immersion, Hook Strength, etc.
3. Provide comments for each score.
4. Render as a collapsible HTML details block.

**FORMAT**:
<details>
<summary>🔍 <strong>CELIA'S GEMINI NAZI REPORT (CLICK TO EXPAND)</strong></summary>
[Your critique here]
</details>

**CONTEXT**:
{{lastMessages}}
{{charCard}}
```

#### End of Chapter Comments
```
[End of Chapter Comments: ALWAYS Design and populate at the end of the response a comment section where random or repeat(same username-handle) users, throw in their opinions, feelings positive, negative, emotional, etc. on the chapter or even on one-another. Also, sometimes the more sophisticated like to leave small images representing their feelings. Remember to Leave Comments and Reader-on-Reader Interactions at the end. Foster a sense of community]

**CONTEXT**:
{{lastMessages}}
{{currentMessage}}
```

#### Actor Interview
```
[Actor Interview, at the end of the response, add a brief Behind the Scenes section at the end where the actors break out of character and share their real thoughts about the scene they just performed. Everyone EXCEPT {{user}}!

Formatting Criterias: Keep it short (2-3 lines per character maximum). Genuine reaction to what just happened, their feelings on the character and scene.]

**CONTEXT**:
{{lastMessages}}
{{charCard}}
```

## Configuration

### Response Location Options

- **Chat History**: Results are injected as HTML comments (`<!-- addon-result: [id] -->...<!-- /addon-result -->`) at the end of the main AI response. These are hidden from view but accessible to the main AI for context in future responses.

- **Outside Chatlog**: Results appear in an expandable dropdown section below the chat area, separate from the message history. Useful for critiques or comments you want to review but don't want cluttering the chat.

### Request Modes

- **Standalone**: Each add-on is sent individually to the AI provider
- **Batch**: Add-ons with the same provider/model are grouped and sent together in a single request (more efficient)

### Trigger Modes

- **Auto**: Automatically executes after each AI response
- **Manual**: Only executes when you click the "Run Add-Ons" button in the chat interface

## Manual Triggering

Click the **"Run Add-Ons"** button in the chat interface to manually trigger all add-ons set to manual mode, or use the browser console:

```javascript
window.addOnsExtension.triggerAddons(); // Trigger all manual add-ons
window.addOnsExtension.triggerAddons(['addon_id_1', 'addon_id_2']); // Trigger specific add-ons
```

## API Keys

You can either:
1. Configure API keys in SillyTavern's main settings (recommended)
2. Set a custom API key per add-on in the add-on settings

If no API key is provided for an add-on, it will use the key from SillyTavern's settings for that provider.

## Troubleshooting

### Add-ons not executing
- Check that add-ons are enabled (toggle switch)
- Verify API keys are configured
- Check browser console for errors
- Ensure the extension loaded properly (check Extensions settings)

### Results not appearing
- For "Chat History" mode: Check the HTML source of messages (results are in comments)
- For "Outside Chatlog" mode: Look for the dropdown section below the chat area
- Check browser console for injection errors

### Batch requests not working
- Ensure all add-ons in a batch have the same provider and model
- Check that batch splitting logic works for your provider (may need adjustment)

## Development

### File Structure
```
add-ons-extension/
├── manifest.json          # Extension metadata
├── index.js               # Main extension logic
├── settings.html          # Settings UI (Handlebars template)
├── style.css             # Extension styles
└── src/
    ├── addon-manager.js   # Add-on CRUD operations
    ├── context-builder.js # Context gathering
    ├── ai-client.js       # AI provider integration
    ├── result-formatter.js # Result formatting/injection
    └── event-handler.js   # Event handling
```

### Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Credits

Created for SillyTavern community. Designed to help reduce AI costs while maintaining quality roleplay experiences.
