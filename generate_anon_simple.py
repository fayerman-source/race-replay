#!/usr/bin/env python3
"""
Generate anonymized commentary using simpler Azure TTS (no SSML styles)
"""

import os
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv("/home/elidev/nidra/meditation-generator/.env")

# Check if Azure credentials exist
key = os.getenv("AZURE_SPEECH_KEY")
region = os.getenv("AZURE_SPEECH_REGION")

print(f"Azure Key: {'Set' if key else 'NOT SET'}")
print(f"Azure Region: {region if region else 'NOT SET'}")

if not key or not region:
    print("\nAzure credentials not found. Options:")
    print("1. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION environment variables")
    print("2. Wait until tomorrow for Gemini API quota reset")
    print("3. Use local TTS (Mac: say command, Linux: espeak)")
    exit(1)

import azure.cognitiveservices.speech as speechsdk

# Anonymized commentary
COMMENTARY = [
    ("commentary_00_-5s.mp3", "Welcome to the 800 meter championship heat. Eleven runners on the line, ages 10 to 14. Watch for Melodi, bib 2, the top seed. And Skye, bib 10, just 10 years old racing against older athletes."),
    ("commentary_01_0s.mp3", "Runners set. Clean start. Melodi immediately establishing position on the rail."),
    ("commentary_02_8s.mp3", "Melodi out fast through the first hundred. Committing to a front-running strategy."),
    ("commentary_03_18s.mp3", "Field stringing out. Separation between front pack and chase group. This is where tactical decisions matter."),
    ("commentary_04_32s.mp3", "Thirty-two nine for Melodi at the two hundred. Aggressive pacing. The question is whether she can hold this through the middle."),
    ("commentary_05_41s.mp3", "Now Skye coming through the first two hundred. Forty-one flat. Smart controlled start. Eight seconds back, not pulled out by the fast early pace."),
    ("commentary_06_52s.mp3", "Middle pack feeling the gap. Parvati and Reid trying to hold contact with Melodi but she's pulling away. Decision point: go with the leader or run your own race."),
    ("commentary_07_60s.mp3", "Four hundred meters. Melodi still commanding at one oh eight. The chase pack about five meters back."),
    ("commentary_08_68s.mp3", "One oh eight at the bell for Melodi. That was a thirty-five second lap. She's slowing. How much does she have left?"),
    ("commentary_09_75s.mp3", "Here's where it gets interesting. Skye just split one twenty-eight for the first four hundred. Negative split pacing. While others fade, she's maintaining."),
    ("commentary_10_88s.mp3", "Look at the separation. The field is completely strung out. Skye sitting in eighth, twenty meters off the lead but perfect position to move up."),
    ("commentary_11_98s.mp3", "Six hundred meter mark. This is where the race is decided. Melodi's lead shrinking but she's still out front."),
    ("commentary_12_105s.mp3", "One forty-five for Melodi through six hundred. She's paying for that early pace but still fighting. Can she hold on?"),
    ("commentary_13_115s.mp3", "Skye through six hundred in two sixteen. She's running people down. Closing on the field while others are tying up."),
    ("commentary_14_122s.mp3", "One hundred meters to go for Melodi. She's going to win this but watch the clock. Can she break two twenty-two?"),
    ("commentary_15_130s.mp3", "Skye flying now. Passing people. All that patience early is paying off. Moved up to eighth and still closing."),
    ("commentary_16_141s.mp3", "Two twenty-one fifty-eight for Melodi. Outstanding performance. She held on after going out hard."),
    ("commentary_17_148s.mp3", "But watch Skye coming home. Still moving. Forty-seven second final lap after a controlled start. That's how you negative split an eight hundred."),
    ("commentary_18_165s.mp3", "Fifty meters to go for Skye. She's gutting it out. Holding her pace while the early leaders are done."),
    ("commentary_19_184s.mp3", "Three oh four twenty-seven. Massive personal record for Skye. Twenty second improvement. That negative split strategy executed perfectly."),
    ("commentary_20_191s.mp3", "Margeaux crosses in three ten. Strong finish from the chase pack."),
    ("commentary_21_198s.mp3", "What a race. From Melodi's dominant front-running to Skye's brilliant negative split. Two different strategies, both executed beautifully.")
]

def generate_simple(filename, text, output_dir):
    """Simple Azure TTS without SSML styling."""
    speech_config = speechsdk.SpeechConfig(subscription=key, region=region)
    speech_config.set_speech_synthesis_output_format(
        speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
    )
    
    output_path = output_dir / filename
    audio_config = speechsdk.audio.AudioOutputConfig(filename=str(output_path))
    
    # Use simple text, not SSML
    synthesizer = speechsdk.SpeechSynthesizer(
        speech_config=speech_config,
        audio_config=audio_config
    )
    
    result = synthesizer.speak_text_async(text).get()
    
    if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
        return True
    elif result.reason == speechsdk.ResultReason.Canceled:
        cancellation = result.cancellation_details
        print(f"Canceled: {cancellation.reason}")
        if cancellation.reason == speechsdk.CancellationReason.Error:
            print(f"Error: {cancellation.error_details}")
        return False
    return False

def main():
    output_dir = Path("commentary_anonymized")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("Generating anonymized commentary (simple Azure TTS)")
    print("-" * 60)
    
    success = 0
    for filename, text in COMMENTARY:
        print(f"{filename}: {text[:40]}...", end=" ", flush=True)
        if generate_simple(filename, text, output_dir):
            print("✓")
            success += 1
        else:
            print("✗")
    
    print("-" * 60)
    print(f"Generated: {success}/{len(COMMENTARY)}")
    
    # Save manifest
    manifest = {
        "version": "anonymized_v1",
        "generated": success,
        "total": len(COMMENTARY),
        "removed_pii": ["surnames", "venues", "team_names", "meet_names"]
    }
    with open(output_dir / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)

if __name__ == "__main__":
    main()
