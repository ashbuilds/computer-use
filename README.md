# Claude Computer use Implementation in Nodejs

A Node.js/TypeScript port of [Anthropic's official Python computer-use demo](https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo). This implementation provides a complete TypeScript version of Claude's computer control capabilities, allowing Claude to interact with your computer through mouse movements, keyboard input, and screen captures.

## Overview

This project converts Anthropic's Python implementation to TypeScript while maintaining all the core functionalities and adding some TypeScript-specific enhancements. It enables Claude to:
- Control your computer's mouse and keyboard
- Capture and analyze screenshots
- Manage windows and applications
- Execute system commands

Perfect for developers who prefer Node.js/TypeScript or want to integrate Claude's computer control capabilities into TypeScript projects.

## Features

- 🖱️ **Mouse Control**
    - Movement and clicks
    - Dragging and scrolling
    - Position tracking
    - Multiple button support

- ⌨️ **Keyboard Actions**
    - Key press and release
    - Text typing
    - Modifier key combinations
    - Multiple key sequences

- 🪟 **Window Management**
    - Focus control
    - Move and resize
    - Minimize/maximize
    - Cross-platform support

- 📸 **Screen Capture**
    - High-quality screenshots
    - Automatic compression
    - Organized storage
    - Metadata tracking

## Quick Start

### Environment Variables
Create a `.env` file in the root directory:

```env
# Required
ANTHROPIC_API_KEY=sk-ant-xxxx   # Your Anthropic API key
```

```bash
# Install dependencies
pnpm install

# Build the project
pnpm run build

# Run example
pnpm run test:basic
```

## Basic Usage

```typescript
import { ComputerTool } from './src/tools/computer';

const tool = new ComputerTool();

// Move mouse
await tool.execute({
    action: 'mouse_move',
    coordinate: [100, 100]
});

// Type text
await tool.execute({
    action: 'type',
    text: 'Hello, World!'
});

// Take screenshot
await tool.execute({
    action: 'screenshot'
});
```

## Advanced Examples

```typescript
// Mouse scroll with direction
await tool.execute({
    action: 'mouse_scroll',
    scrollAmount: 5,
    direction: 'down'
});

// Key combination
await tool.execute({
    action: 'key',
    text: 'Control+C'
});

// Window management
await tool.execute({
    action: 'focus_window',
    windowTitle: 'Chrome'
});
```

## Available Actions

### Mouse Actions
- `mouse_move`: Move cursor to coordinates
- `left_click`, `right_click`, `middle_click`: Mouse clicks
- `left_click_drag`: Click and drag
- `mouse_scroll`: Scroll in any direction
- `mouse_toggle`: Press/release mouse buttons

### Keyboard Actions
- `key`: Single key or combination press
- `type`: Type text string
- `key_toggle`: Press/release keys
- `key_tap_multiple`: Repeat key taps

### Window Actions
- `focus_window`: Activate window
- `move_window`: Change window position
- `resize_window`: Adjust window size
- `minimize_window`, `maximize_window`: Window state

### Screen Actions
- `screenshot`: Capture screen
- `cursor_position`: Get current cursor location

## Screenshots

Screenshots are automatically organized:
```
screenshots/
├── metadata.json
└── YYYY/MM/DD/
    ├── screenshot-{timestamp}-original.png
    └── screenshot-{timestamp}-compressed.[png|jpg]
```

## Configuration

Key settings can be modified in constants:

```typescript
const TIMING = {
    TYPING_DELAY_MS: 12,
    SCREENSHOT_DELAY_MS: 2000,
    RETRY_DELAY_MS: 500
};

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
```

## Requirements

- Node.js (v16+)
- TypeScript
- Dependencies:
    - robotjs
    - screenshot-desktop
    - sharp
    - Relevant system libraries

## Platform Support

### Linux
```bash
sudo apt-get install -y \
    libxtst-dev \
    libpng-dev \
    libxss-dev \
    xvfb
```

### macOS
```bash
brew install opencv@4
brew install cairo pango
```

### Windows
- Requires windows-build-tools:
```bash
npm install --global windows-build-tools
```

## License

MIT

## Contributing

1. Fork the repo
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request