# Race Replay Audio-Visual Alignment System
## Distance-Based Checkpoint Architecture

### Track Geometry
- **Track Type**: 200m Banked Indoor
- **Race Distance**: 800m
- **Laps**: 4 (200m × 4 = 800m)
- **Checkpoints**: 0m (start), 200m, 400m, 600m, 800m (finish)

### Data Structure Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMMENTARY CHECKPOINT SYSTEM                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CHECKPOINT QUEUE (One per runner × 5 checkpoints = max 55 events)         │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ RUNNER: Melodi (id=1)  -  Splits: [0, 32.94, 68.67, 105.05, 141.58]│   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ Distance │ Time      │ Status │ Audio Clips                          │   │
│  │──────────┼───────────┼────────┼─────────────────────────────────────│   │
│  │    0m    │ 0.00s     │   ✓    │ [00] Intro, [01] "Runners set..."   │   │
│  │   200m   │ 32.94s    │   ○    │ [04] "32.9 for Melodi at 200m"      │   │
│  │   400m   │ 68.67s    │   ○    │ [07] "1:08 at the bell"             │   │
│  │   600m   │ 105.05s   │   ○    │ [11] "1:45 through 600m"            │   │
│  │   800m   │ 141.58s   │   ○    │ [15] "2:21.58 for Melodi"           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ RUNNER: Skye (id=8)    -  Splits: [0, 41.00, 88.55, 136.83, 184.27]│   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ Distance │ Time      │ Status │ Audio Clips                          │   │
│  │──────────┼───────────┼────────┼─────────────────────────────────────│   │
│  │    0m    │ 0.00s     │   ✓    │ (no start clip - shared)            │   │
│  │   200m   │ 41.00s    │   ○    │ [05] "41 flat for Skye"             │   │
│  │   400m   │ 88.55s    │   ○    │ [09] "1:28 for Skye"                │   │
│  │   600m   │ 136.83s   │   ○    │ [13] "2:16 through 600m"            │   │
│  │   800m   │ 184.27s   │   ○    │ [18] "3:04.27 PR for Skye"          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ RUNNER: Margeaux (id=9) - Splits: [0, 33.18, 70.18, 109.24, 190.55]│   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ Distance │ Time      │ Status │ Audio Clips                          │   │
│  │──────────┼───────────┼────────┼─────────────────────────────────────│   │
│  │    0m    │ 0.00s     │   ✓    │ (no start clip)                     │   │
│  │   200m   │ 33.18s    │   ○    │ (no clip)                           │   │
│  │   400m   │ 70.18s    │   ○    │ (no clip)                           │   │
│  │   600m   │ 109.24s   │   ○    │ (no clip)                           │   │
│  │   800m   │ 190.55s   │   ○    │ [20] "Margeaux crosses in 3:10"     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

### Global Commentary Queue (Non-Runner-Specific)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GLOBAL EVENTS                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PRE-RACE (Time-based, triggers at raceTime = -46s)                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ [00] "Welcome to the 800m championship heat..."                     │   │
│  │ Trigger: raceTime >= -46                                            │   │
│  │ Duration: ~18s                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  FIELD SEPARATION (Distance-based, triggers at ~130m when gap forms)       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ [03] "Field stringing out..."                                       │   │
│  │ Trigger: leader distance >= 130m                                    │   │
│  │ Subject: None (general observation)                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  MIDDLE PACK ANALYSIS (Distance-based, triggers at ~250m)                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ [06] "Middle pack feeling the gap..."                               │   │
│  │ Trigger: leader distance >= 250m                                    │   │
│  │ Subject: Parvati (id=2) - mentioned in audio                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  RACE SUMMARY (Time-based, triggers at raceTime = 198s)                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ [21] "What a race... two different strategies"                      │   │
│  │ Trigger: raceTime >= 198                                            │   │
│  │ Subject: None                                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Audio-Visual Synchronization Logic

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TRIGGER EVALUATION PER FRAME                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  EACH ANIMATION FRAME (60fps):                                              │
│                                                                             │
│  1. UPDATE raceTime                                                         │
│     raceTime += (1/60) * speed;                                             │
│                                                                             │
│  2. UPDATE all runner positions                                             │
│     For each runner:                                                        │
│       dist = interpolateDistance(runner.splits, raceTime)                   │
│       (x, y) = getTrackCoordinates(dist)                                    │
│                                                                             │
│  3. EVALUATE COMMENTARY QUEUE                                               │
│                                                                             │
│     A. Check PRE-RACE queue (time-based)                                    │
│        if raceTime >= -46 and intro not played:                             │
│           playAudio([00])                                                   │
│                                                                             │
│     B. Check RUNNER-SPECIFIC queues (distance-based)                        │
│        For each runner with pending audio:                                  │
│          checkpoint = nextPendingCheckpoint(runner)                         │
│          actualDist = getDistanceAtTime(runner.splits, raceTime)            │
│                                                                             │
│          if actualDist >= checkpoint.distance:                              │
│              // RUNNER HAS CROSSED THE CHECKPOINT!                          │
│              if not isAudioPlaying:                                         │
│                  playAudio(checkpoint.audioClip)                            │
│                  checkpoint.status = "PLAYED"                               │
│                  focusIndicator.target = runner.id                          │
│                                                                             │
│     C. Check GLOBAL events (mixed triggers)                                 │
│        For each global event:                                               │
│          if event.triggerType == "time" and raceTime >= event.triggerValue  │
│             OR                                                              │
│          if event.triggerType == "distance" and leaderDist >= event.trigger │
│             if not isAudioPlaying:                                          │
│                playAudio(event.audioClip)                                   │
│                                                                             │
│  4. UPDATE VISUAL INDICATOR                                                 │
│     if currentFocusRunnerId and isAudioPlaying:                             │
│        target = document.getElementById(`runner-${currentFocusRunnerId}`)   │
│        focusIndicator.style.top = target.style.top                          │
│        focusIndicator.style.left = target.style.left                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Checkpoint Data Structure (JavaScript)

```javascript
// Runner-specific checkpoint queue
const runnerCheckpoints = {
  1: { // Melodi
    checkpoints: [
      { distance: 0,   time: 0,     audio: [1],  played: false },   // Start
      { distance: 200, time: 32.94, audio: [4],  played: false },   // 200m
      { distance: 400, time: 68.67, audio: [7, 10], played: false }, // 400m (bell + 600m approaching)
      { distance: 600, time: 105.05, audio: [11], played: false },  // 600m
      { distance: 800, time: 141.58, audio: [14, 15], played: false } // Finish
    ]
  },
  8: { // Skye
    checkpoints: [
      { distance: 0,   time: 0,     audio: [],   played: false },   // Start (no specific audio)
      { distance: 200, time: 41.00, audio: [5],  played: false },   // 200m
      { distance: 400, time: 88.55, audio: [9],  played: false },   // 400m
      { distance: 600, time: 136.83, audio: [12, 16], played: false }, // 600m
      { distance: 800, time: 184.27, audio: [18], played: false }  // Finish
    ]
  },
  9: { // Margeaux
    checkpoints: [
      { distance: 800, time: 190.55, audio: [19], played: false }   // Finish only
    ]
  }
};

// Global events queue
const globalEvents = [
  { type: "time",     trigger: -46,  audio: [0],  played: false }, // Pre-race intro
  { type: "distance", trigger: 130,  audio: [3],  played: false }, // Field separation
  { type: "distance", trigger: 250,  audio: [6],  played: false }, // Middle pack
  { type: "distance", trigger: 450,  audio: [8],  played: false }, // Field strung out
  { type: "time",     trigger: 198,  audio: [20], played: false }  // Race summary
];
```

### Audio Clip Inventory (Aligned to Checkpoints)

```
┌──────┬─────────────┬──────────────────┬────────────────────────────────────────────┐
│ Clip │ Checkpoint  │ Runner           │ Transcript                                 │
├──────┼─────────────┼──────────────────┼────────────────────────────────────────────┤
│ [00] │ Pre-race    │ None             │ "Welcome to the 800m championship..."      │
│ [01] │ 0m          │ All (start)      │ "Runners set. Clean start..."              │
│ [02] │ 100m        │ Melodi           │ "Melodi out fast through the first 100"    │
│ [03] │ 130m        │ Leader (general) │ "Field stringing out..."                   │
│ [04] │ 200m        │ Melodi           │ "32.9 for Melodi at the 200"               │
│ [05] │ 200m        │ Skye             │ "41 flat for Skye at the 200"              │
│ [06] │ 250m        │ Leader (general) │ "Middle pack feeling the gap..."           │
│ [07] │ 380m        │ Melodi           │ "400m. Melodi commanding at 1:08"          │
│ [08] │ 450m        │ Leader (general) │ "Look at the separation..."                │
│ [09] │ 400m        │ Skye             │ "1:28 for Skye... negative split pacing"   │
│ [10] │ 580m        │ Leader (general) │ "600m mark. This is where it's decided"    │
│ [11] │ 600m        │ Melodi           │ "1:45 for Melodi through 600m"             │
│ [12] │ 600m        │ Skye             │ "2:16 for Skye... running people down"     │
│ [13] │ 700m        │ Leader (general) │ "100m to go for Melodi"                    │
│ [14] │ 720m        │ Skye             │ "Skye flying now... passing people"        │
│ [15] │ 800m        │ Melodi           │ "2:21.58 for Melodi... outstanding"        │
│ [16] │ 750m        │ Skye             │ "Watch Skye coming home... 47s final lap"  │
│ [17] │ 750m        │ Skye             │ "50m to go for Skye"                       │
│ [18] │ 800m        │ Skye             │ "3:04.27 PR for Skye"                      │
│ [19] │ 800m        │ Margeaux         │ "Margeaux crosses in 3:10"                 │
│ [20] │ 198s        │ None (summary)   │ "What a race... two different strategies"  │
└──────┴─────────────┴──────────────────┴────────────────────────────────────────────┘
```

### Implementation Notes

1. **Audio Overlap Prevention**: Only ONE audio clip plays at a time. If a checkpoint
   is crossed while another clip is playing, it queues (or cancels if too late).

2. **Visual Indicator**: The yellow ring follows the runner mentioned in the CURRENTLY
   PLAYING audio clip, not just any runner crossing a checkpoint.

3. **Reset Behavior**: All `played: false` flags reset to allow replay.

4. **Multiple Clips at Same Checkpoint**: Some checkpoints have multiple clips
   (e.g., Melodi at 400m has clips [7] and [10]). They play sequentially.

5. **Distance Calculation**: Uses linear interpolation between known split times:
   ```javascript
   distance = checkpoint * 200 + (timeInSegment / segmentDuration * 200)
   ```
