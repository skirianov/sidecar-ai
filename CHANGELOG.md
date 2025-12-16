# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2025-12-16

### Fixed
- **Swipe Navigation**: Complete refactor of swipe handling for proper per-variant sidecar management
  - Sidecars now stored per swipe variant (`message.swipe_info[swipeId].extra.sidecarResults`)
  - Simplified "Clear and Render" strategy: clear container on swipe, render stored sidecars for new variant
  - Fixed sidecars not displaying when generating new swipe variants
  - Fixed sidecars not restoring when swiping back to previous variants
  - Fixed loading indicators being hidden during new generation
  - Event handler now tracks both `messageId` and `swipeId` to prevent duplicate processing
  - Container visibility properly managed when injecting new content

### Changed
- **Storage Architecture**: Sidecars now stored per swipe variant instead of per message
  - Follows SillyTavern's pattern: each swipe variant has its own `extra` object
  - Backward compatible: falls back to `message.extra` if swipe variant storage not available
  - All metadata operations (save, read, update, delete) now respect swipe variants

### Technical
- Refactored `handleSwipeVariantChange` to use simple clear-and-render approach
- Removed complex hide/show/restore logic in favor of container clearing
- Updated all metadata operations to use `swipe_info[swipeId].extra` storage
- Improved event handling to distinguish between message and swipe variant changes

## [0.3.5] - 2025-12-16

### Fixed
- **OpenRouter Selection Persistence**: Fixed issue where previously selected model and service provider weren't restored when editing addons
  - Model selection now properly restored after async model loading completes
  - Service provider selection now restored after dropdown is populated
  - Added retry logic to handle timing edge cases
  - Improved handling of different model ID formats

## [0.3.4] - 2025-12-16

### Fixed
- **OpenRouter Model Loading**: Fixed critical issue where OpenRouter models wouldn't load properly
  - Now uses async model fetching with multiple fallback strategies
  - Directly fetches from OpenRouter API if SillyTavern hasn't loaded models yet
  - No longer depends on user visiting API Connections tab first
  - Works reliably even when SillyTavern's dropdowns aren't populated
  - Added comprehensive retry logic with intelligent delays
  - Fixed race condition in model dropdown population

### Changed
- **OpenRouter Model Sorting**: Models are now sorted by provider name (company) first, then alphabetically
  - Groups all models from same provider together (e.g., all OpenAI models, then all Anthropic models)
  - Makes it much easier to find specific models in the dropdown
  - Applies to models fetched directly from OpenRouter API

### Technical
- Converted `getProviderModels()` to async function to support API fetching
- Added Strategy 4: Direct API fetch from `https://openrouter.ai/api/v1/models`
- Improved error handling and logging for model loading debugging
- Better handling of select2-enhanced dropdowns in SillyTavern

## [0.3.0] - 2025-12-16

### Added
- **🪄 AI Template Maker (Built-in UI)**: Create sidecars by describing them in plain English
  - Uses your existing SillyTavern API connection
  - AI generates complete JSON configuration
  - Preview generated config before adding
  - Export as JSON file or add directly to your sidecars
  - Auto-opens edit modal after adding for API key setup
  - No manual JSON editing required!
- **Template Library System**: Pre-made sidecar configurations for quick setup
  - Template browser modal with local and community template support
  - 8+ pre-made templates (Perspective Flip, Director's Commentary, Soundtrack Suggester, Art Prompt, Commentary Section, Actor Interview, Relationship Matrix, Template Maker)
  - `templates/` folder with organized template files
  - Template import from local files or GitHub community repo
  - Comprehensive template documentation in `templates/README.md`
- **Content Security & Isolation**: Multi-layer defense against malicious AI-generated content
  - CSS containment (layout/style/paint isolation)
  - Content sanitization (strips scripts, dangerous positioning, event handlers)
  - Position locking (converts fixed/absolute to relative)
  - Z-index normalization
  - Iframe/embed/object blocking
  - `SECURITY.md` documentation with threat model and testing guide
- **WCAG Accessibility Guidelines**: AI instructed to use proper contrast ratios
  - Minimum 4.5:1 contrast for normal text, 3:1 for large text
  - Color recommendations for light/dark themes
  - Specific guidance on visually pleasing, accessible color palettes
- **History Depth Enforcement**: Always minimum 1 history for consistency
  - Random Beautify uses history to maintain style consistency
  - Prevents placeholder images, requires emoji or initial avatars
  - Style consistency instructions for creative formats

### Fixed
- **Modal Click-Through Bug**: Clicking inside modals no longer closes them
  - Only backdrop clicks close modals now
  - Proper event propagation handling
- **Result Container Duplication**: Sidecars no longer duplicate on reload
  - Checks for existing containers before creating new ones
  - Removes old error/loading indicators before adding new ones
- **Card Layout Issues**: Fixed overlapping buttons and broken layouts
  - Removed Move Up/Down buttons (unnecessary complexity)
  - Icon-only action buttons with consistent sizing
  - Proper flex wrapping for mobile
  - Fixed button gaps and alignment
- **Content Overflow**: All text properly wraps within containers
  - Word-break rules for long URLs and code
  - Proper max-width constraints on all elements
  - Scrollable tables and pre blocks
- **Code Fence Stripping**: AI responses wrapped in ```html blocks now render properly
  - Automatically strips markdown code fences from HTML/CSS/XML responses
  - No more visible ``` markers in rendered output
- **Storage Migration**: Moved result storage from HTML comments to message.extra
  - **CRITICAL FIX**: No longer pollutes context with massive base64-encoded HTML comments
  - Uses SillyTavern's native `message.extra` field for clean metadata storage
  - Backward compatible with old HTML comment storage
  - Automatic migration: Cleans up old comments when updating results
  - Reduces token usage significantly (previously 2-5KB per result, now 0 in context)

### Changed
- **Simplified CSS**: Reduced from 1300+ lines to ~450 lines
  - Removed heavy custom theming system
  - Uses SillyTavern's native CSS variables directly
  - Minimal custom styling, maximum compatibility
  - Follows Qvink extension's lightweight philosophy
- **Default Format Style**: Changed from Markdown to HTML+CSS
  - Better visual output by default
  - Markdown still available as option
- **History Settings**: Changed defaults for better UX
  - History enabled by default (`includeHistory: true`)
  - Default depth reduced from 5 to 1
  - UI shows depth field by default (was hidden)

### Removed
- Move Up/Down buttons from addon cards (pointless complexity)
- Custom markdown parser (SillyTavern handles natively)
- Complex token-based theming system
- Heavy CSS abstractions and overrides

### Security
- Added defense-in-depth security with 8 protection layers
- Sanitizes all AI-generated content before rendering
- Prevents layout breaks, style pollution, and code execution
- Safe by default - no configuration needed

## [0.1.3] - 2025-12-16

### Added
- Service provider selection for OpenRouter (Chutes, Nvidia, Parasails, etc.)
- Service provider field automatically shows/hides based on selected AI provider
- Service providers loaded from SillyTavern's OpenRouter providers dropdown

### Fixed
- Fixed 403 Forbidden error when fetching API keys by properly accessing getRequestHeaders
- Improved API key retrieval to use SillyTavern's /api/secrets/find endpoint correctly

### Changed
- OpenRouter requests now support specifying service providers via provider array
- Better error handling for API key retrieval

## [0.1.2] - 2025-12-16

### Added
- API connection testing with "Test Connection" button
- Automatic connection test before saving Sidecar
- API key prefilling with "Using saved key from SillyTavern" placeholder
- Visual error/success highlighting for form fields

### Fixed
- Fixed duplicate `apiKey` variable declarations causing syntax errors
- Fixed CORS issues for Deepseek and other providers that block browser requests
- Fixed connection test to use ChatCompletionService first (server-side, avoids CORS)
- Fixed character card formatting to match SillyTavern's actual field structure
- Fixed prompt system to automatically include context (no variables needed)

### Changed
- Simplified prompt field - now just instruction, context automatically included
- Removed variable insertion buttons (no longer needed)
- Improved error messages for connection failures
- Better handling of CORS-blocking providers (requires ST API Connection config)

## [0.1.1] - 2025-12-16

### Fixed
- Fixed modal layout issues (API Key field truncation, button alignment)
- Fixed API key loading from SillyTavern's secret_state storage
- Fixed secret_state extraction to handle array format correctly
- Fixed Result Format/Response Location row structure in modal

### Changed
- Improved API key lookup with better fallback methods
- Enhanced logging for API key debugging

## [0.1.0] - 2025-12-16

### Added
- Initial release of Sidecar AI Add-Ons extension
- Support for custom add-on prompts with variable substitution
- Multiple AI provider support (OpenAI, OpenRouter, Anthropic, Google, Deepseek, Cohere, Custom)
- Auto-trigger and manual trigger modes
- Batch processing for add-ons with same provider/model
- Context awareness (chat history, character cards, user cards, world cards)
- Result placement options (chat history comments or dropdown UI)
- Integration with SillyTavern's ChatCompletionService for API requests
- Model loading from SillyTavern's UI dropdowns
- API URL override support for custom endpoints
- Variable insertion buttons for easy prompt building
- Settings UI with dark theme support matching SillyTavern's styling

### Fixed
- Fixed jQuery `.forEach()` bug - now uses `.each()` for proper jQuery iteration
- Fixed model loading from SillyTavern's UI dropdowns

### Changed
- Renamed "Add New Add-on" to "Create Sidecar" for better branding
- Improved CSS scoping to prevent global style conflicts
- Enhanced model loading to steal from SillyTavern's existing UI

### Technical
- Uses SillyTavern's `ChatCompletionService.processRequest()` for all API calls
- Automatically handles API keys, URLs, proxies, and headers via SillyTavern backend
- Proper event namespacing to prevent conflicts with SillyTavern's native handlers

[0.3.5]: https://github.com/skirianov/sidecar-ai/releases/tag/v0.3.5
[0.3.4]: https://github.com/skirianov/sidecar-ai/releases/tag/v0.3.4
[0.3.0]: https://github.com/skirianov/sidecar-ai/releases/tag/v0.3.0
[0.1.3]: https://github.com/skirianov/sidecar-ai/releases/tag/v0.1.3
[0.1.2]: https://github.com/skirianov/sidecar-ai/releases/tag/v0.1.2
[0.1.1]: https://github.com/skirianov/sidecar-ai/releases/tag/v0.1.1
[0.1.0]: https://github.com/skirianov/sidecar-ai/releases/tag/v0.1.0
