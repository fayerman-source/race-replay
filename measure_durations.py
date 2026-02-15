import os
import json
from pathlib import Path
from pydub import AudioSegment

# Scan actual MP3 files and get durations
audio_dir = Path("/home/elidev/.openclaw/workspace/circuit-race-replay/commentary_audio_v2")
mp3_files = sorted(audio_dir.glob("*.mp3"))

print(f"Found {len(mp3_files)} MP3 files")
print("-" * 80)

commentary_timing = []

for mp3_file in mp3_files:
    if mp3_file.name == "commentary_manifest.json":
        continue
    
    # Parse index from filename (commentary_XX_...)
    try:
        parts = mp3_file.stem.split("_")
        index = int(parts[1])
    except:
        continue
    
    # Get duration
    audio = AudioSegment.from_mp3(mp3_file)
    duration_sec = round(len(audio) / 1000, 2)
    
    commentary_timing.append({
        "index": index,
        "filename": mp3_file.name,
        "duration": duration_sec
    })
    
    print(f"  [{index:02d}] {mp3_file.name[:50]:50s} - {duration_sec:5.2f}s")

# Sort by index
commentary_timing.sort(key=lambda x: x["index"])

# Save timing data
timing_data = {"commentaryTiming": commentary_timing}

output_path = "/home/elidev/.openclaw/workspace/circuit-race-replay/data/commentary_timing.json"
with open(output_path, "w") as f:
    json.dump(timing_data, f, indent=2)

print("-" * 80)
print(f"Created commentary_timing.json with {len(commentary_timing)} entries")
print(f"Output: {output_path}")
