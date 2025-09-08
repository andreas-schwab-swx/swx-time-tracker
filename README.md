# SWX Time Tracker

A VSCode extension for automatic time tracking with Git integration and comment functionality.

## Features

- **Automatic Time Tracking**: Automatically start tracking when VSCode opens and stop when it closes
- **Manual Controls**: Start/stop tracking manually via command palette
- **Session Comments**: Add comments to your time sessions for better documentation
- **Git Integration**: Track Git commits alongside your time sessions (structure ready for implementation)
- **Time Reports**: View current session duration or last completed session
- **Idle Detection**: Configurable idle threshold (default: 300 seconds)
- **Session Editor**: Open and edit session data in JSON format

## Installation

1. Download the extension from the VSCode Marketplace (search for "SWX Time Tracker")
2. Or install manually:
   ```bash
   git clone https://github.com/andreas-schwab-swx/swx-time-tracker.git
   cd swx-time-tracker
   npm install
   npm run compile
   ```

## Usage

### Commands

All commands are available through the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- `Time Tracker: Start Time Tracking` - Start a new tracking session
- `Time Tracker: Stop Time Tracking` - Stop the current tracking session
- `Time Tracker: Add Comment` - Add a comment to the current session
- `Time Tracker: Show Time Report` - Display current or last session duration
- `Time Tracker: Reset Today` - Clear today's tracking data
- `Time Tracker: Export Data` - Export tracking data (currently minimal implementation)
- `Time Tracker: Open Session Editor` - Open session data in editor

### Configuration

Configure the extension in VSCode settings:

```json
{
  "timeTracker.autoStart": true,              // Auto-start on VSCode launch
  "timeTracker.autoStop": true,               // Auto-stop on VSCode close
  "timeTracker.idleThreshold": 300,           // Idle threshold in seconds
  "timeTracker.trackGitCommits": true,        // Track Git commits
  "timeTracker.commitMessagePrefix": "GIT: "  // Prefix for Git commit comments
}
```

## Development

### Prerequisites

- Node.js 16.x or higher
- VSCode 1.74.0 or higher
- TypeScript 4.9.4 or higher

### Setup

```bash
# Clone repository
git clone https://github.com/andreas-schwab-swx/swx-time-tracker.git
cd swx-time-tracker

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode for development
npm run watch
```

### Project Structure

```
swx-time-tracker/
├── src/
│   └── extension.ts       # Main extension code
├── out/                   # Compiled JavaScript
├── package.json           # Extension manifest
├── tsconfig.json          # TypeScript configuration
├── icon.png              # Extension icon
└── README.md             # This file
```

### Building

```bash
# Compile TypeScript to JavaScript
npm run compile

# Package extension as .vsix
vsce package

# Publish to marketplace
vsce publish
```

## Data Storage

Time tracking data is stored in:
- **Windows**: `%APPDATA%\Code\User\globalStorage\softworx.swx-time-tracker\`
- **macOS**: `~/Library/Application Support/Code/User/globalStorage/softworx.swx-time-tracker/`
- **Linux**: `~/.config/Code/User/globalStorage/softworx.swx-time-tracker/`

## License

This project is licensed under the GPL-3.0 License - see the [LICENSE](LICENSE) file for details.

## Author

**Andreas Schwab**  
softworx by andreas schwab  
[andreas.schwab@softworx.at](mailto:andreas.schwab@softworx.at)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Support

If you encounter any problems or have suggestions, please [open an issue](https://github.com/andreas-schwab-swx/swx-time-tracker/issues).

## Acknowledgments

- VSCode Extension API documentation
- Time tracking inspiration from various productivity tools

---

Copyright (C) 2025 softworx by andreas schwab