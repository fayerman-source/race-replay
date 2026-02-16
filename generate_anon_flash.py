#!/usr/bin/env python3
"""
Generate anonymized commentary using Gemini Flash TTS
Using existing API key - 82 requests available (18/100 RPD used)
"""

import os
import json
import wave
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv("/home/elidev/nidra/meditation-generator/.env")

from google import genai
from google.genai import types
from pydub import AudioSegment

MODEL = "gemini-2.5-flash-preview-tts"  # Has 82 requests remaining
RATE_LIMIT_DELAY = 9  # Stay under 7 RPM limit

VOICE = "Puck"  # Energetic announcer voice

# Anonymized commentary - first names only, no PII
COMMENTARY_EVENTS = [
    { "index": 0, "time": -5, "text": "Welcome to the 800 meter championship heat. Eleven runners on the line, ages 10 to 14. Watch for Melodi, bib 2, the top seed. And Skye, bib 10, just 10 years old racing against older athletes.", "prompt": "You are a professional track announcer. Calm, welcoming introduction with slight excitement." },
    { "index": 1, "time": 0, "text": "Runners set. Clean start. Melodi immediately establishing position on the rail.", "prompt": "You are a play-by-play announcer calling the start. Energetic and immediate." },
    { "index": 2, "time": 8, "text": "Melodi out fast through the first hundred. Committing to a front-running strategy.", "prompt": "You are noting strategic decisions. Building energy." },
    { "index": 3, "time": 18, "text": "Field stringing out. Separation between front pack and chase group. This is where tactical decisions matter.", "prompt": "You are explaining race dynamics. Educational but engaged." },
    { "index": 4, "time": 32, "text": "Thirty-two nine for Melodi at the two hundred. Aggressive pacing. The question is whether she can hold this through the middle.", "prompt": "You are analyzing pacing strategy. Analytical, building tension." },
    { "index": 5, "time": 41, "text": "Now Skye coming through the first two hundred. Forty-one flat. Smart controlled start. Eight seconds back, not pulled out by the fast early pace.", "prompt": "You are praising smart tactics. Warm appreciation." },
    { "index": 6, "time": 52, "text": "Middle pack feeling the gap. Parvati and Reid trying to hold contact with Melodi but she's pulling away. Decision point: go with the leader or run your own race.", "prompt": "You are explaining the tactical dilemma. Building tension." },
    { "index": 7, "time": 60, "text": "Four hundred meters. Melodi still commanding at one oh eight. The chase pack about five meters back.", "prompt": "You are calling positions at halfway. Building energy." },
    { "index": 8, "time": 68, "text": "One oh eight at the bell for Melodi. That was a thirty-five second lap. She's slowing. How much does she have left?", "prompt": "You are noting the time gap. Building tension for the finish." },
    { "index": 9, "time": 75, "text": "Here's where it gets interesting. Skye just split one twenty-eight for the first four hundred. Negative split pacing. While others fade, she's maintaining.", "prompt": "You are excited by tactical brilliance. Genuine enthusiasm." },
    { "index": 10, "time": 88, "text": "Look at the separation. The field is completely strung out. Skye sitting in eighth, twenty meters off the lead but perfect position to move up.", "prompt": "You are excited by the developing story. High energy." },
    { "index": 11, "time": 98, "text": "Six hundred meter mark. This is where the race is decided. Melodi's lead shrinking but she's still out front.", "prompt": "You are building anticipation for the critical moment. Maximum energy." },
    { "index": 12, "time": 105, "text": "One forty-five for Melodi through six hundred. She's paying for that early pace but still fighting. Can she hold on?", "prompt": "You are calling the leader struggling. Intense, dramatic." },
    { "index": 13, "time": 115, "text": "Skye through six hundred in two sixteen. She's running people down. Closing on the field while others are tying up.", "prompt": "You are beyond excited by the comeback. Maximum energy." },
    { "index": 14, "time": 122, "text": "One hundred meters to go for Melodi. She's going to win this but watch the clock. Can she break two twenty-two?", "prompt": "You are calling the finish. Peak excitement." },
    { "index": 15, "time": 130, "text": "Skye flying now. Passing people. All that patience early is paying off. Moved up to eighth and still closing.", "prompt": "You are thrilled by the strong finish. Maximum enthusiasm." },
    { "index": 16, "time": 141, "text": "Two twenty-one fifty-eight for Melodi. Outstanding performance. She held on after going out hard.", "prompt": "You are celebrating the winner. Triumphant." },
    { "index": 17, "time": 148, "text": "But watch Skye coming home. Still moving. Forty-seven second final lap after a controlled start. That's how you negative split an eight hundred.", "prompt": "You are amazed by the tactical brilliance. Absolute peak excitement." },
    { "index": 18, "time": 165, "text": "Fifty meters to go for Skye. She's gutting it out. Holding her pace while the early leaders are done.", "prompt": "You are calling the incredible finish. Maximum energy." },
    { "index": 19, "time": 184, "text": "Three oh four twenty-seven. Massive personal record for Skye. Twenty second improvement. That negative split strategy executed perfectly.", "prompt": "You are announcing the huge PR. Absolute peak celebration." },
    { "index": 20, "time": 191, "text": "Margeaux crosses in three ten. Strong finish from the chase pack.", "prompt": "You are acknowledging another finisher. Quick, appreciative." },
    { "index": 21, "time": 198, "text": "What a race. From Melodi's dominant front-running to Skye's brilliant negative split. Two different strategies, both executed beautifully.", "prompt": "You are wrapping up with appreciation. Celebratory, satisfied." }
]

def save_pcm_as_wav(pcm_data, output_path, sample_rate=24000):
    with wave.open(output_path, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_data)

def generate_clip(client, event, output_dir):
    safe_name = f"commentary_{event['index']:02d}_{event['time']:.0f}s"
    filename = f"{safe_name}.mp3"
    output_path = output_dir / filename
    wav_path = str(output_path).replace('.mp3', '.wav')
    
    full_prompt = f"{event['prompt']}\n\n{event['text']}"
    
    try:
        print(f"[{event['index']:02d}] {event['text'][:45]}...", end=" ", flush=True)
        
        response = client.models.generate_content(
            model=MODEL,
            contents=full_prompt,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=VOICE
                        )
                    )
                )
            )
        )
        
        if not response.candidates or not response.candidates[0].content.parts:
            print("✗ No audio")
            return False
            
        audio_data = response.candidates[0].content.parts[0].inline_data.data
        
        save_pcm_as_wav(audio_data, wav_path)
        audio = AudioSegment.from_wav(wav_path)
        audio.export(str(output_path), format="mp3")
        os.remove(wav_path)
        
        duration_sec = len(audio) / 1000
        print(f"✓ ({duration_sec:.1f}s)")
        return True
        
    except Exception as e:
        print(f"✗ {e}")
        return False

def main():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not found")
        return
    
    client = genai.Client(api_key=api_key)
    output_dir = Path("commentary_anonymized")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Generating {len(COMMENTARY_EVENTS)} anonymized clips with {MODEL}")
    print(f"Voice: {VOICE} | Delay: {RATE_LIMIT_DELAY}s between calls")
    print("-" * 70)
    
    success_count = 0
    for i, event in enumerate(COMMENTARY_EVENTS):
        if generate_clip(client, event, output_dir):
            success_count += 1
        if i < len(COMMENTARY_EVENTS) - 1:
            time.sleep(RATE_LIMIT_DELAY)
    
    print("-" * 70)
    print(f"Done! Generated {success_count}/{len(COMMENTARY_EVENTS)} clips")
    
    manifest = {
        "model": MODEL,
        "voice": VOICE,
        "version": "anonymized_first_names_only",
        "removed_pii": ["surnames", "venues", "team_names", "meet_names"],
        "total_clips": len(COMMENTARY_EVENTS),
        "generated": success_count,
        "files": [{"index": e["index"], "time": e["time"], "text": e["text"]} for e in COMMENTARY_EVENTS]
    }
    
    with open(output_dir / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"Output: {output_dir}")

if __name__ == "__main__":
    main()
