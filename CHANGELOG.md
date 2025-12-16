# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.1]: https://github.com/skirianov/sidecar-ai/releases/tag/v0.1.1
[0.1.0]: https://github.com/skirianov/sidecar-ai/releases/tag/v0.1.0
