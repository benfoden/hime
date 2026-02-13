# Privacy Policy for hime Chrome Extension

**Effective Date:** February 13, 2026

## Overview

hime is a Chrome extension that provides AI-powered inline translation. This privacy policy explains how we handle your data.

## Data Collection

**We do not collect, store, or transmit any personal data to our servers.**

### What we access:
- **Text you type** in input fields — only when you explicitly trigger translation (via hotkey)
- **API keys** — stored locally in your browser using Chrome's `chrome.storage.local` API
- **Settings** — translation preferences stored locally

### Where data goes:
- Your text is sent directly to your chosen AI provider (OpenAI or Google Gemini) when you request translation
- We do not proxy, log, or store your text anywhere
- API calls are made directly from your browser to the provider's API

## Data Storage

All data is stored locally on your device:
- API keys: `chrome.storage.local` (or `chrome.storage.session` if you select session-only mode)
- Settings: `chrome.storage.local`

We have no access to this data.

## Third-Party Services

When you use hime, you interact directly with:
- **OpenAI** (if you provide an OpenAI API key) — subject to OpenAI's privacy policy
- **Google Gemini** (if you provide a Gemini API key) — subject to Google's privacy policy

Please review their respective privacy policies.

## Permissions

The extension requests these permissions:
- `activeTab` — to interact with the current page's text fields
- `storage` — to save your settings and API key locally
- `scripting` — to inject the content script for text manipulation
- Host permissions for OpenAI and Gemini API endpoints

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be posted with a new effective date.

## Contact

For questions about this privacy policy, please open an issue on our GitHub repository.
