import os
import json
from pathlib import Path
from pydub import AudioSegment

# Load existing manifest
with open("/home/elidev/.openclaw/workspace/circuit-race-replay/commentary_audio_v2/manifest.json") as f:
    manifest = json.load(f)

# Add durations to each file
for item in manifest["files"]:
    mp3_path = Path(f"/home/elidev/.openclaw/workspace/circuit-race-replay/commentary_audio_v2/{item['filename']}")
    if mp3_path.exists():
        audio = AudioSegment.from_mp3(mp3_path)
        item["duration_sec"] = round(len(audio) / 1000, 2)
    else:
        item["duration_sec"] = 8.0  # Default estimate

# Save updated manifest
with open("/home/elidev/.openclaw/workspace/circuit-race-replay/commentary_audio_v2/manifest.json", "w") as f:
    json.dump(manifest, f, indent=2)

print("Updated manifest with durations:")
for item in manifest["files"]:
    print(f"  [{item['index']:02d}] {item['time']:5.1f}s - {item['duration_sec']:4.1f}s duration - {item['text'][:40]}...")

# Also create a JS-compatible version
js_data = {
    "commentaryTiming": []
}

for item in manifest["files"]:
    js_data["commentaryTiming"].append({
        "index": item["index"],
        "triggerTime": item["time"],
        "duration": item["duration_sec"],
        "text": item["text"],
        "filename": item["filename"],
        "subjectId": item["subjectId"]
    })

with open("/home/elidev/.openclaw/workspace/circuit-race-replay/data/commentary_timing.json", "w") as f:
    json.dump(js_data, f, indent=2)

print(f"\nCreated commentary_timing.json with {len(js_data['commentaryTiming'])} entries")
