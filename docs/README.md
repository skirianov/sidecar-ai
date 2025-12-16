# Documentation

Quick reference for Sidecar AI features and usage.

## Getting Started

1. [Installation](../README.md#installation) - Get it set up
2. [Quick Start](../README.md#quick-start) - Create your first sidecar
3. [AI Template Maker Guide](AI-MAKER-GUIDE.md) - Use AI to generate templates

## What's a Sidecar?

A sidecar is an extra AI task that runs alongside your main conversation. Like:
- Reader comment sections
- Emotion tracking
- Relationship stats
- Meta-commentary
- Scene descriptions

You use cheap models for these so your expensive model can focus on roleplay.

## Documentation

- [Main README](../README.md) - Overview and installation
- [AI Template Maker](AI-MAKER-GUIDE.md) - Generate templates with AI
- [Template Library](../templates/README.md) - Pre-made templates
- [Template Installation](../templates/INSTALLATION.md) - How to import templates
- [Security](../SECURITY.md) - Technical security details
- [Changelog](../CHANGELOG.md) - What changed in each version

## Quick Reference

**Trigger Modes:**
- Auto: Runs after every AI response
- Manual: Trigger via Extensions menu

**Format Styles:**
- HTML+CSS: Rich visual formatting (default)
- Markdown: Simple text
- XML: Structured data
- Beautify: Creative styling

**Response Locations:**
- Outside Chatlog: Expandable cards below messages (recommended)
- Chat History: HTML comment in message (main AI can see it)

**Context Settings:**
- messagesCount: How many recent messages (1-50)
- includeCharCard: Include character info
- includeUserCard: Include user info
- includeWorldCard: Include world/setting info
- includeHistory: Include previous sidecar outputs
- historyDepth: How many previous outputs (minimum 1)

## Common Use Cases

**Reader comments:** Import `commentary-section.json`

**Relationship tracking:** Import `relationship-matrix.json`

**Meta commentary:** Import `directors-commentary.json` or `actor-interview.json`

**Music suggestions:** Import `soundtrack-suggester.json`

## Troubleshooting

**Extension not loading?** Check [installation troubleshooting](../README.md#troubleshooting)

**Sidecars not running?** Check [runtime troubleshooting](../README.md#troubleshooting)

**AI Maker not working?** Make sure you have an API connection set up

**Security questions?** See [SECURITY.md](../SECURITY.md)

## Need Help?

- Check the [main README](../README.md)
- Search [GitHub issues](https://github.com/skirianov/sidecar-ai/issues)
- Open a [new issue](https://github.com/skirianov/sidecar-ai/issues/new)
