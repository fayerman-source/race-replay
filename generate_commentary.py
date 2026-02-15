#!/usr/bin/env python3
"""
Race Commentary Audio Generator

Generates voiceover audio for race commentary using Google Cloud TTS or Gemini TTS.
Outputs MP3 files that can be synced with the race replay.
"""

import os
import json
from pathlib import Path
from dotenv import load_dotenv

# Load credentials from nidra project
load_dotenv("/home/elidev/nidra/meditation-generator/.env")
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "/home/elidev/nidra/google_credentials.json"

from google.cloud import texttospeech

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

# Voice configurations - choose your preferred announcer style
VOICE_OPTIONS = {
    "energetic_male": {
        "name": "en-US-Chirp-HD-O",  # High definition male
        "speaking_rate": 1.1,
        "pitch": 0
    },
    "energetic_female": {
        "name": "en-US-Chirp-HD-F",  # High definition female
        "speaking_rate": 1.1,
        "pitch": 0
    },
    "classic_announcer": {
        "name": "en-US-Neural2-J",  # Professional male
        "speaking_rate": 1.0,
        "pitch": 0
    },
    "excited_female": {
        "name": "en-US-Neural2-F",  # Professional female
        "speaking_rate": 1.15,
        "pitch": 0
    }
}

def generate_commentary_audio(output_dir: Path, voice_key: str = "energetic_male"):
    """Generate MP3 files for each commentary event."""
    
    client = texttospeech.TextToSpeechClient()
    voice_config = VOICE_OPTIONS[voice_key]
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    manifest = {
        "voice": voice_key,
        "voice_config": voice_config,
        "files": []
    }
    
    print(f"Generating {len(COMMENTARY_EVENTS)} commentary clips...")
    print(f"Voice: {voice_key} ({voice_config['name']})")
    print("-" * 60)
    
    for i, event in enumerate(COMMENTARY_EVENTS):
        filename = f"commentary_{i:02d}_{event['time']:.1f}s.mp3"
        output_path = output_dir / filename
        
        # Add SSML for emphasis and pauses where appropriate
        text = event['text']
        if '!' in text or 'Winner' in text or 'PR' in text:
            # Excited delivery for climactic moments
            ssml = f'''<speak>
                <emphasis level="strong">{text.replace('!', '!</emphasis><break time="200ms"/>')}
            </speak>''' if '!' in text else f'<speak><emphasis level="strong">{text}</emphasis></speak>'
            synthesis_input = texttospeech.SynthesisInput(ssml=ssml)
        else:
            synthesis_input = texttospeech.SynthesisInput(text=text)
        
        voice = texttospeech.VoiceSelectionParams(
            language_code="en-US",
            name=voice_config["name"]
        )
        
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=voice_config["speaking_rate"],
            pitch=voice_config["pitch"],
            volume_gain_db=3.0  # Slightly louder
        )
        
        try:
            response = client.synthesize_speech(
                input=synthesis_input,
                voice=voice,
                audio_config=audio_config
            )
            
            with open(output_path, "wb") as out:
                out.write(response.audio_content)
            
            print(f"✓ {filename}")
            
            manifest["files"].append({
                "index": i,
                "time": event["time"],
                "text": event["text"],
                "filename": filename,
                "subjectId": event["subjectId"]
            })
            
        except Exception as e:
            print(f"✗ {filename}: {e}")
    
    # Save manifest for reference
    manifest_path = output_dir / "commentary_manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    
    print("-" * 60)
    print(f"Done! Files saved to: {output_dir}")
    print(f"Manifest: {manifest_path}")
    
    return manifest


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Generate race commentary audio")
    parser.add_argument("--voice", choices=list(VOICE_OPTIONS.keys()), 
                       default="energetic_male",
                       help="Voice style for commentary")
    parser.add_argument("--output", type=str, default="commentary_audio",
                       help="Output directory for MP3 files")
    args = parser.parse_args()
    
    output_dir = Path(args.output)
    generate_commentary_audio(output_dir, args.voice)


if __name__ == "__main__":
    main()
