# Agent Guidelines for Race Replay

This is a visual race replay system with JavaScript frontend and Python data generation scripts.

## Project Structure

```
/home/fayerman/race-replay/
├── js/                    # Frontend JavaScript (ES6 modules)
│   ├── app.js            # Main application logic
│   ├── commentary-engine.js  # Audio commentary orchestration
│   ├── data.js           # Race data and constants
│   └── utils.js          # Track geometry, timing utilities
├── data/                 # Race and commentary data files
├── generate_*.py         # Python scripts for audio/data generation
└── index.html            # Main HTML entry point
```

## Commands

### Development
- Open `index.html` in a browser to test the frontend
- Use a local server: `python -m http.server 8000` then visit `http://localhost:8000`

### Python Scripts
- Run any script directly: `python generate_commentary.py`
- Python linting: `python -m py_compile <file>` to check syntax

### JavaScript
- No build step required (vanilla ES6 modules)
- Use browser console for debugging

### Testing
- No formal test framework exists
- Manual testing: Open browser console, test functions directly
- Example: `import { getDistanceAtTime, getTrackCoordinates } from './js/utils.js'`

## Code Style

### JavaScript
- Use ES6 modules with explicit imports/exports
- Use `const` by default, `let` when mutation needed
- Arrow functions for callbacks, function declarations for methods
- Template literals for string interpolation
- Object destructuring for imports: `import { foo, bar } from './module'`

### Python
- snake_case for functions and variables
- UPPER_SNAKE_CASE for constants
- Double quotes for strings

### Naming Conventions
- Files: `snake_case.py`, `kebab-case.js`
- Functions: `camelCase` (JS), `snake_case` (Python)
- Constants: `UPPER_SNAKE_CASE`
- Classes: `PascalCase`

### Types
- Use JSDoc comments for complex functions
- Example:
  ```javascript
  /**
   * @param {number[]} splits - Array of split times in seconds
   * @param {number} currentTime - Current race time
   * @returns {number} Distance in meters
   */
  ```

### Error Handling
- Use try/catch for async operations
- Log errors to console with context
- Handle audio playback failures gracefully (see `app.js:136-139`)

### Formatting
- 2-space indentation
- Trailing commas in arrays/objects
- One import per line
- Group imports: external, then internal

### Key Files
- `js/data.js`: Runner data, audio clips, checkpoint definitions
- `js/commentary-engine.js`: Event timing logic (the core algorithm)
- `js/utils.js`: Track geometry, time/distance calculations
- `data/race_data.json`: Runner splits and metadata

## Common Tasks

### Adding a New Runner
1. Add runner to `data/race_data.json`
2. Add runner checkpoints to `js/data.js` (RUNNER_CHECKPOINTS_TEMPLATE)
3. Regenerate audio commentary if needed

### Adding a Commentary Clip
1. Add clip to AUDIO_CLIPS array in `js/data.js`
2. Add checkpoint trigger in appropriate runner's checkpoint list or GLOBAL_EVENTS

### Modifying Track Geometry
Track coordinates are in `js/utils.js` (getTrackCoordinates function). The track is a 200m banked indoor oval.

## Architecture Overview

### Data Flow
1. Race data (splits, runner info) is loaded from `data/race_data.json`
2. Commentary timing is defined in `js/data.js` (RUNNER_CHECKPOINTS_TEMPLATE, GLOBAL_EVENTS_TEMPLATE)
3. Audio clips are stored in `commentary_audio/` or similar directories
4. The CommentaryEngine (`commentary-engine.js`) evaluates triggers each frame
5. Audio is synced to runner positions using distance interpolation

### Track Geometry
- 200m banked indoor oval track
- 4 laps = 800m race distance
- Coordinate system: pixels calculated from meters using `PIXELS_PER_METER` constant
- Track rendering uses HTML/CSS positioning (not Canvas)

### Commentary Engine Algorithm
The core algorithm in `commentary-engine.js:32-97` works as follows:
1. Each animation frame, check if audio is currently playing
2. Collect "due" global events (time-based or distance-based triggers)
3. Collect "due" runner checkpoint events (distance thresholds)
4. Sort all due events by dueTime, pick the earliest
5. Mark event as played and return audio clip info

## JavaScript Specific Guidelines

### State Management
- Use a single state object at module level or in a class
- Avoid global variables; encapsulate in modules
- Example from `app.js:11-19`:
  ```javascript
  const state = {
    raceTime: 0,
    speed: 1,
    isRunning: false,
    // ...
  };
  ```

### DOM Manipulation
- Cache DOM element references at init time
- Use dataset for storing runner-specific data
- Update styles directly; avoid re-rendering entire sections

### Audio Handling
- Preload all audio elements at startup
- Handle play() failures gracefully (user interaction required)
- Reset currentTime to 0 before replaying
- Only one audio plays at a time - check `isAudioPlaying` flag

### Animation Loop
- Use requestAnimationFrame for smooth 60fps updates
- Calculate delta time between frames for consistent speed
- Stop animation when all runners finish (distance >= 800m)

## Python Specific Guidelines

### Script Organization
- Each generate_*.py script is independent
- Use argparse for command-line arguments if needed
- Output files to appropriate directories (data/, commentary_audio/, etc.)

### Data Processing
- JSON for data interchange (read/write race data)
- Use json module for parsing and serialization
- Validate data structure before processing

### Audio Generation
- Scripts may generate audio using external APIs
- Always create manifest.json for audio directories
- Include timing metadata in manifests

## Testing Checklist

### Manual Testing
- [ ] Open browser console, verify no errors on load
- [ ] Test play/pause/resume functionality
- [ ] Verify audio syncs with runner positions
- [ ] Test reset returns to initial state
- [ ] Check all runners finish correctly

### Audio Not Playing
- Most browsers block autoplay; requires user interaction first
- Check audio file paths exist and are correct

### Runners Not Moving
- Check splits array format: [0, t200, t400, t600, t800]
- Verify requestAnimationFrame is being called

### Commentary Out of Sync
- Verify checkpoint distances match actual runner positions
- Ensure isAudioPlaying prevents overlapping clips
