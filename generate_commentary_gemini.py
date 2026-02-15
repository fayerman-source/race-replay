#!/usr/bin/env python3
"""
Race Commentary Audio Generator using Gemini TTS

Generates voiceover audio for race commentary using Google's Gemini TTS API.
Outputs MP3 files that can be synced with the race replay.
"""

import os
import json
import re
import wave
import time
from pathlib import Path
from dotenv import load_dotenv

# Load credentials from nidra project
load_dotenv("/home/elidev/nidra/meditation-generator/.env")

from google import genai
from google.genai import types
from pydub import AudioSegment

# Commentary events from the race replay
COMMENTARY_EVENTS = [
    { "time": 0, "text": "Runners are at the line... The gun goes off! Clean start.", "subjectId": None },
    { "time": 8, "text": "Melodi getting out aggressively early on!", "subjectId": 1 },
    { "time": 32, "text": "Melodi hits the 200 meter mark in a blistering 32.9!", "subjectId": 1 },
    { "time": 41.5, "text": "Skye through the first 200 in 41.5, staying calm.", "subjectId": 8 },
    { "time": 60, "text": "Approaching the 400 meter mark. Melodi extending the lead.", "subjectId": 1 },
    { "time": 68, "text": "Melodi hits the bell lap in 1:08! Field spreading out.", "subjectId": 1 },
    { "time": 88, "text": "Skye through 400 meters in 1:28.5. Perfect positioning in 8th.", "subjectId": 8 },
    { "time": 105, "text": "Melodi through 600 meters in 1:45. Dominating performance!", "subjectId": 1 },
    { "time": 130, "text": "Skye making her move! The endurance is kicking in.", "subjectId": 8 },
    { "time": 136, "text": "Skye hits 600 meters in 2:16.8. Holding form while others fade.", "subjectId": 8 },
    { "time": 141, "text": "Melodi crosses the line! 2:21.58! Winner!", "subjectId": 1 },
    { "time": 165, "text": "Skye winding it up for the finish! Look at that kick!", "subjectId": 8 },
    { "time": 184, "text": "Skye stops the clock at 3:04.27! A massive new personal record!", "subjectId": 8 },
    { "time": 191, "text": "Margeaux finishes in 3:10. Great racing.", "subjectId": 9 }
]

# Gemini TTS Configuration
MODEL = "gemini-2.5-flash-preview-tts"  # or gemini-2.5-pro-preview-tts
RATE_LIMIT_DELAY = 4  # seconds between API calls

# Voice personalities
VOICE_PERSONALITIES = {
    "excited_announcer": {
        "voice": "Puck",  # Energetic, upbeat
        "prompt": "You are an energetic track and field announcer. Speak with excitement and enthusiasm, like you're calling a championship race."
    },
    "professional_announcer": {
        "voice": "Fenrir",  # Professional, authoritative
        "prompt": "You are a professional sports announcer. Speak clearly and authoritatively, with measured excitement for big moments."
    },
    "encouraging_coach": {
        "voice": "Leda",  # Warm, encouraging
        "prompt": "You are an encouraging coach and announcer. Speak warmly and supportively, building excitement naturally."
    },
    "intense_caller": {
        "voice": "Orus",  # Intense, dramatic
        "prompt": "You are a dramatic race caller. Build intensity as the race progresses, reaching a crescendo at the finish."
    }
}


def save_pcm_as_wav(pcm_data: bytes, output_path: str, sample_rate: int = 24000):
    """Convert PCM to WAV."""
    with wave.open(output_path, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_data)


def generate_commentary_audio(output_dir: Path, personality: str = "excited_announcer"):
    """Generate MP3 files for each commentary event using Gemini TTS."""
    
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not found in environment")
        print("Make sure /home/elidev/nidra/meditation-generator/.env has GEMINI_API_KEY")
        return
    
    client = genai.Client(api_key=api_key)
    voice_config = VOICE_PERSONALITIES[personality]
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Check for existing files to resume
    existing_files = set(f.stem for f in output_dir.glob("*.mp3"))
    
    manifest = {
        "model": MODEL,
        "personality": personality,
        "voice": voice_config["voice"],
        "files": []
    }
    
    print(f"Generating {len(COMMENTARY_EVENTS)} commentary clips...")
    print(f"Voice: {voice_config['voice']} ({personality})")
    print(f"Rate limit: {RATE_LIMIT_DELAY}s between calls")
    print("-" * 60)
    
    for i, event in enumerate(COMMENTARY_EVENTS):
        safe_name = re.sub(r'[^\w\s-]', '', event['text'][:30]).replace(' ', '_')
        filename = f"commentary_{i:02d}_{event['time']:.1f}s_{safe_name}.mp3"
        output_path = output_dir / filename
        wav_path = str(output_path).replace('.mp3', '.wav')
        
        # Skip if already exists
        if output_path.stem in existing_files:
            print(f"  [{i+1:02d}/{len(COMMENTARY_EVENTS)}] {event['text'][:50]}... ✓ (exists)")
            # Get duration from existing file
            audio = AudioSegment.from_mp3(output_path)
            manifest["files"].append({
                "index": i,
                "time": event["time"],
                "text": event["text"],
                "filename": filename,
                "duration_sec": len(audio) / 1000,
                "subjectId": event["subjectId"]
            })
            continue
        
        # Build prompt with personality
        prompt = f"{voice_config['prompt']}\n\n{event['text']}"
        
        try:
            print(f"  [{i+1:02d}/{len(COMMENTARY_EVENTS)}] {event['text'][:50]}...", end=" ", flush=True)
            
            response = client.models.generate_content(
                model=MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name=voice_config["voice"]
                            )
                        )
                    )
                )
            )
            
            # Check if response has audio data
            if not response.candidates or not response.candidates[0].content.parts:
                print(f"✗ No audio data received")
                continue
                
            audio_data = response.candidates[0].content.parts[0].inline_data.data
            
            # Convert PCM -> WAV -> MP3
            save_pcm_as_wav(audio_data, wav_path)
            audio = AudioSegment.from_wav(wav_path)
            audio.export(str(output_path), format="mp3")
            os.remove(wav_path)
            
            duration_sec = len(audio) / 1000
            print(f"✓ ({duration_sec:.1f}s)")
            
            manifest["files"].append({
                "index": i,
                "time": event["time"],
                "text": event["text"],
                "filename": filename,
                "duration_sec": duration_sec,
                "subjectId": event["subjectId"]
            })
            
            # Rate limiting
            if i < len(COMMENTARY_EVENTS) - 1:
                time.sleep(RATE_LIMIT_DELAY)
                
        except Exception as e:
            print(f"✗ Error: {e}")
            continue
    
    # Save manifest
    manifest_path = output_dir / "commentary_manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    
    print("-" * 60)
    print(f"Done! Generated {len(manifest['files'])} audio files")
    print(f"Output: {output_dir}")
    print(f"Manifest: {manifest_path}")
    
    return manifest


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Generate race commentary audio with Gemini TTS")
    parser.add_argument("--personality", choices=list(VOICE_PERSONALITIES.keys()), 
                       default="excited_announcer",
                       help="Announcer personality style")
    parser.add_argument("--output", type=str, default="commentary_audio",
                       help="Output directory for MP3 files")
    args = parser.parse_args()
    
    output_dir = Path(args.output)
    generate_commentary_audio(output_dir, args.personality)


if __name__ == "__main__":
    main()
