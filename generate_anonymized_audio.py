#!/usr/bin/env python3
"""
Generate anonymized commentary audio using Azure TTS
- First names only (no surnames)
- No PII (venues, teams, specific meet references removed)
"""

import os
import json
from pathlib import Path
from dotenv import load_dotenv

# Load Azure credentials from nidra project
load_dotenv("/home/elidev/nidra/meditation-generator/.env")

import azure.cognitiveservices.speech as speechsdk

# Anonymized commentary - first names only, no PII
COMMENTARY_EVENTS = [
    # PRE-RACE INTRO
    { "index": 0, "time": -5, "text": "Welcome to the 800 meter championship heat. Eleven runners on the line, ages 10 to 14. Watch for Melodi, bib 2, the top seed. And Skye, bib 10, just 10 years old racing against older athletes.", "voice": "en-US-JennyNeural", "style": "cheerful" },
    
    # RACE ACTION
    { "index": 1, "time": 0, "text": "Runners set. Clean start. Melodi immediately establishing position on the rail.", "voice": "en-US-GuyNeural", "style": "excited" },
    { "index": 2, "time": 8, "text": "Melodi out fast through the first hundred. Committing to a front-running strategy.", "voice": "en-US-GuyNeural", "style": "excited" },
    { "index": 3, "time": 18, "text": "Field stringing out. Separation between front pack and chase group. This is where tactical decisions matter.", "voice": "en-US-JennyNeural", "style": "chat" },
    { "index": 4, "time": 32, "text": "Thirty-two nine for Melodi at the two hundred. Aggressive pacing. The question is whether she can hold this through the middle.", "voice": "en-US-JennyNeural", "style": "chat" },
    { "index": 5, "time": 41, "text": "Now Skye coming through the first two hundred. Forty-one flat. Smart controlled start. Eight seconds back, not pulled out by the fast early pace.", "voice": "en-US-JennyNeural", "style": "cheerful" },
    { "index": 6, "time": 52, "text": "Middle pack feeling the gap. Parvati and Reid trying to hold contact with Melodi but she's pulling away. Decision point: go with the leader or run your own race.", "voice": "en-US-JennyNeural", "style": "chat" },
    { "index": 7, "time": 60, "text": "Four hundred meters. Melodi still commanding at one oh eight. The chase pack about five meters back.", "voice": "en-US-GuyNeural", "style": "excited" },
    { "index": 8, "time": 68, "text": "One oh eight at the bell for Melodi. That was a thirty-five second lap. She's slowing. How much does she have left?", "voice": "en-US-GuyNeural", "style": "excited" },
    { "index": 9, "time": 75, "text": "Here's where it gets interesting. Skye just split one twenty-eight for the first four hundred. Negative split pacing. While others fade, she's maintaining.", "voice": "en-US-JennyNeural", "style": "cheerful" },
    { "index": 10, "time": 88, "text": "Look at the separation. The field is completely strung out. Skye sitting in eighth, twenty meters off the lead but perfect position to move up.", "voice": "en-US-GuyNeural", "style": "excited" },
    { "index": 11, "time": 98, "text": "Six hundred meter mark. This is where the race is decided. Melodi's lead shrinking but she's still out front.", "voice": "en-US-GuyNeural", "style": "excited" },
    { "index": 12, "time": 105, "text": "One forty-five for Melodi through six hundred. She's paying for that early pace but still fighting. Can she hold on?", "voice": "en-US-GuyNeural", "style": "excited" },
    { "index": 13, "time": 115, "text": "Skye through six hundred in two sixteen. She's running people down. Closing on the field while others are tying up.", "voice": "en-US-GuyNeural", "style": "excited" },
    { "index": 14, "time": 122, "text": "One hundred meters to go for Melodi. She's going to win this but watch the clock. Can she break two twenty-two?", "voice": "en-US-GuyNeural", "style": "excited" },
    { "index": 15, "time": 130, "text": "Skye flying now. Passing people. All that patience early is paying off. Moved up to eighth and still closing.", "voice": "en-US-GuyNeural", "style": "excited" },
    { "index": 16, "time": 141, "text": "Two twenty-one fifty-eight for Melodi. Outstanding performance. She held on after going out hard.", "voice": "en-US-GuyNeural", "style": "excited" },
    { "index": 17, "time": 148, "text": "But watch Skye coming home. Still moving. Forty-seven second final lap after a controlled start. That's how you negative split an eight hundred.", "voice": "en-US-GuyNeural", "style": "excited" },
    { "index": 18, "time": 165, "text": "Fifty meters to go for Skye. She's gutting it out. Holding her pace while the early leaders are done.", "voice": "en-US-GuyNeural", "style": "excited" },
    { "index": 19, "time": 184, "text": "Three oh four twenty-seven. Massive personal record for Skye. Twenty second improvement. That negative split strategy executed perfectly.", "voice": "en-US-GuyNeural", "style": "excited" },
    { "index": 20, "time": 191, "text": "Margeaux crosses in three ten. Strong finish from the chase pack.", "voice": "en-US-JennyNeural", "style": "chat" },
    { "index": 21, "time": 198, "text": "What a race. From Melodi's dominant front-running to Skye's brilliant negative split. Two different strategies, both executed beautifully.", "voice": "en-US-JennyNeural", "style": "cheerful" }
]

def generate_azure_tts(text, output_path, voice_name="en-US-JennyNeural", style="cheerful"):
    """Generate audio using Azure TTS."""
    speech_config = speechsdk.SpeechConfig(
        subscription=os.getenv("AZURE_SPEECH_KEY"),
        region=os.getenv("AZURE_SPEECH_REGION")
    )
    
    # Use neural voice with style
    ssml = f'''
    <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" 
           xmlns:mstts="https://www.w3.org/2001/mstts" 
           xml:lang="en-US">
        <voice name="{voice_name}">
            <mstts:express-as style="{style}">
                {text}
            </mstts:express-as>
        </voice>
    </speak>
    '''
    
    audio_config = speechsdk.audio.AudioOutputConfig(filename=str(output_path))
    synthesizer = speechsdk.SpeechSynthesizer(
        speech_config=speech_config,
        audio_config=audio_config
    )
    
    result = synthesizer.speak_ssml_async(ssml).get()
    
    if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
        return True
    else:
        print(f"Error: {result.reason}")
        return False

def main():
    output_dir = Path("commentary_anonymized")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("Generating ANONYMIZED commentary with Azure TTS")
    print("First names only. No surnames. No PII.")
    print("-" * 80)
    
    success_count = 0
    for event in COMMENTARY_EVENTS:
        filename = f"commentary_{event['index']:02d}_{event['time']:.0f}s.mp3"
        output_path = output_dir / filename
        
        print(f"[{event['index']:02d}] {event['voice']}: {event['text'][:50]}...", end=" ", flush=True)
        
        if generate_azure_tts(
            event['text'], 
            output_path, 
            event['voice'],
            event['style']
        ):
            print("✓")
            success_count += 1
        else:
            print("✗")
    
    print("-" * 80)
    print(f"Done! Generated {success_count}/{len(COMMENTARY_EVENTS)} clips")
    
    # Save manifest
    manifest = {
        "version": "anonymized_first_names_only",
        "total_clips": len(COMMENTARY_EVENTS),
        "generated": success_count,
        "removed_pii": ["surnames", "venue_names", "team_names", "meet_names"],
        "files": [{"index": e["index"], "time": e["time"], "text": e["text"], "voice": e["voice"]} 
                  for e in COMMENTARY_EVENTS]
    }
    
    with open(output_dir / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)
    
    print(f"Output: {output_dir}")

if __name__ == "__main__":
    main()
