#!/usr/bin/env python3
"""
Generate race-aligned commentary audio using Gemini Flash TTS
Commentary is precisely timed to match actual race events from split data
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

MODEL = "gemini-2.5-flash-preview-tts"
RATE_LIMIT_DELAY = 9  # Stay under 7 RPM limit
VOICE = "Puck"

# Race data - actual split times
RUNNERS = {
    1: {"name": "Melodi", "bib": 2, "splits": [0, 32.94, 68.67, 105.05, 141.58], "color": "#3B82F6"},
    2: {"name": "Parvati", "bib": 3, "splits": [0, 33.86, 70.82, 108.62, 146.73]},
    3: {"name": "Reid", "bib": 5, "splits": [0, 33.63, 71.49, 111.25, 149.88]},
    8: {"name": "Skye", "bib": 10, "splits": [0, 41.00, 87.97, 136.27, 184.27], "color": "#F97316"},
    9: {"name": "Margeaux", "bib": 11, "splits": [0, 33.18, 70.18, 109.24, 190.55]},
}

# Commentary aligned to ACTUAL race events
# Format: (trigger_time, subject_id, text, voice_prompt)
COMMENTARY_EVENTS = [
    # PRE-RACE INTRO
    {
        "index": 0,
        "trigger_time": -46,
        "subject_id": None,
        "text": "Welcome to the 800 meter championship heat. Eleven runners on the line, ages 10 to 14. Watch for Melodi, bib 2, the top seed. And Skye, bib 10, just 10 years old racing against older athletes.",
        "prompt": "You are a professional track announcer. Calm, welcoming introduction with slight excitement."
    },
    
    # START - Gun goes off
    {
        "index": 1,
        "trigger_time": 0,
        "subject_id": 1,  # Melodi - she gets the rail immediately
        "text": "Runners set. Clean start. Melodi immediately establishing position on the rail.",
        "prompt": "You are a play-by-play announcer calling the start. Energetic and immediate."
    },
    
    # 100m - ~14 seconds (estimated)
    {
        "index": 2,
        "trigger_time": 8,  # Early mention as she's moving up
        "subject_id": 1,
        "text": "Melodi out fast through the first hundred. Committing to a front-running strategy.",
        "prompt": "You are noting strategic decisions. Building energy."
    },
    
    # 200m - Melodi 32.94, Skye 41.00
    {
        "index": 3,
        "trigger_time": 32,
        "subject_id": 1,
        "text": "Thirty-two nine for Melodi at the two hundred. Aggressive pacing. The question is whether she can hold this through the middle.",
        "prompt": "You are analyzing pacing strategy. Analytical, building tension."
    },
    {
        "index": 4,
        "trigger_time": 41,
        "subject_id": 8,  # Skye
        "text": "Now Skye coming through the first two hundred. Forty-one flat. Smart controlled start. Eight seconds back, not pulled out by the fast early pace.",
        "prompt": "You are praising smart tactics. Warm appreciation."
    },
    
    # Approaching 400m - tactical analysis
    {
        "index": 5,
        "trigger_time": 52,
        "subject_id": 2,  # Parvati - mentioned in commentary
        "text": "Middle pack feeling the gap. Parvati and Reid trying to hold contact with Melodi but she's pulling away. Decision point: go with the leader or run your own race.",
        "prompt": "You are explaining the tactical dilemma. Building tension."
    },
    
    # 400m - Melodi 68.67 (1:08), Bell lap
    {
        "index": 6,
        "trigger_time": 60,
        "subject_id": 1,
        "text": "Four hundred meters. Melodi still commanding at one oh eight. The chase pack about five meters back.",
        "prompt": "You are calling positions at halfway. Building energy."
    },
    {
        "index": 7,
        "trigger_time": 68,
        "subject_id": 1,
        "text": "One oh eight at the bell for Melodi. That was a thirty-five second lap. She's slowing. How much does she have left?",
        "prompt": "You are noting the time gap. Building tension for the finish."
    },
    
    # Skye at 400m - 87.97 (~1:28)
    {
        "index": 8,
        "trigger_time": 75,
        "subject_id": 8,
        "text": "Here's where it gets interesting. Skye just split one twenty-eight for the first four hundred. Negative split pacing. While others fade, she's maintaining.",
        "prompt": "You are excited by tactical brilliance. Genuine enthusiasm."
    },
    
    # Mid-race separation
    {
        "index": 9,
        "trigger_time": 88,
        "subject_id": 8,
        "text": "Look at the separation. The field is completely strung out. Skye sitting in eighth, twenty meters off the lead but perfect position to move up.",
        "prompt": "You are excited by the developing story. High energy."
    },
    
    # 600m - Melodi 105.05 (1:45)
    {
        "index": 10,
        "trigger_time": 98,
        "subject_id": None,
        "text": "Six hundred meter mark. This is where the race is decided. Melodi's lead shrinking but she's still out front.",
        "prompt": "You are building anticipation for the critical moment. Maximum energy."
    },
    {
        "index": 11,
        "trigger_time": 105,
        "subject_id": 1,
        "text": "One forty-five for Melodi through six hundred. She's paying for that early pace but still fighting. Can she hold on?",
        "prompt": "You are calling the leader struggling. Intense, dramatic."
    },
    
    # Skye at 600m - 136.27 (2:16)
    {
        "index": 12,
        "trigger_time": 115,
        "subject_id": 8,
        "text": "Skye through six hundred in two sixteen. She's running people down. Closing on the field while others are tying up.",
        "prompt": "You are beyond excited by the comeback. Maximum energy."
    },
    
    # Final 100m for Melodi
    {
        "index": 13,
        "trigger_time": 122,
        "subject_id": 1,
        "text": "One hundred meters to go for Melodi. She's going to win this but watch the clock. Can she break two twenty-two?",
        "prompt": "You are calling the finish. Peak excitement."
    },
    
    # Skye closing
    {
        "index": 14,
        "trigger_time": 130,
        "subject_id": 8,
        "text": "Skye flying now. Passing people. All that patience early is paying off. Moved up to eighth and still closing.",
        "prompt": "You are thrilled by the strong finish. Maximum enthusiasm."
    },
    
    # Melodi finish - 141.58 (2:21.58)
    {
        "index": 15,
        "trigger_time": 141,
        "subject_id": 1,
        "text": "Two twenty-one fifty-eight for Melodi. Outstanding performance. She held on after going out hard.",
        "prompt": "You are celebrating the winner. Triumphant."
    },
    
    # Skye final lap analysis
    {
        "index": 16,
        "trigger_time": 148,
        "subject_id": 8,
        "text": "But watch Skye coming home. Still moving. Forty-seven second final lap after a controlled start. That's how you negative split an eight hundred.",
        "prompt": "You are amazed by the tactical brilliance. Absolute peak excitement."
    },
    {
        "index": 17,
        "trigger_time": 165,
        "subject_id": 8,
        "text": "Fifty meters to go for Skye. She's gutting it out. Holding her pace while the early leaders are done.",
        "prompt": "You are calling the incredible finish. Maximum energy."
    },
    
    # Skye finish - 184.27 (3:04.27)
    {
        "index": 18,
        "trigger_time": 184,
        "subject_id": 8,
        "text": "Three oh four twenty-seven. Massive personal record for Skye. Twenty second improvement. That negative split strategy executed perfectly.",
        "prompt": "You are announcing the huge PR. Absolute peak celebration."
    },
    
    # Margeaux finish - 190.55 (3:10.55)
    {
        "index": 19,
        "trigger_time": 191,
        "subject_id": 9,
        "text": "Margeaux crosses in three ten. Strong finish from the chase pack.",
        "prompt": "You are acknowledging another finisher. Quick, appreciative."
    },
    
    # Race summary
    {
        "index": 20,
        "trigger_time": 198,
        "subject_id": None,
        "text": "What a race. From Melodi's dominant front-running to Skye's brilliant negative split. Two different strategies, both executed beautifully.",
        "prompt": "You are wrapping up with appreciation. Celebratory, satisfied."
    }
]

def save_pcm_as_wav(pcm_data, output_path, sample_rate=24000):
    with wave.open(output_path, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_data)

def generate_clip(client, event, output_dir):
    filename = f"commentary_{event['index']:02d}_{event['trigger_time']:.0f}s.mp3"
    output_path = output_dir / filename
    wav_path = str(output_path).replace('.mp3', '.wav')
    
    full_prompt = f"{event['prompt']}\n\n{event['text']}"
    
    try:
        print(f"[{event['index']:02d}] t={event['trigger_time']:3.0f}s: {event['text'][:45]}...", end=" ", flush=True)
        
        response = client.models.generate_content(
            model=MODEL,
            contents=full_prompt,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=VOICE)
                    )
                )
            )
        )
        
        if not response.candidates or not response.candidates[0].content.parts:
            print("✗ No audio")
            return False, 0
            
        audio_data = response.candidates[0].content.parts[0].inline_data.data
        
        save_pcm_as_wav(audio_data, wav_path)
        audio = AudioSegment.from_wav(wav_path)
        audio.export(str(output_path), format="mp3")
        os.remove(wav_path)
        
        duration_sec = len(audio) / 1000
        print(f"✓ ({duration_sec:.1f}s)")
        return True, duration_sec
        
    except Exception as e:
        print(f"✗ {e}")
        return False, 0

def main():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not found")
        return
    
    client = genai.Client(api_key=api_key)
    output_dir = Path("commentary_aligned")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Generating {len(COMMENTARY_EVENTS)} race-aligned clips with {MODEL}")
    print(f"Voice: {VOICE} | Delay: {RATE_LIMIT_DELAY}s between calls")
    print("-" * 80)
    
    success_count = 0
    manifest = []
    
    for i, event in enumerate(COMMENTARY_EVENTS):
        success, duration = generate_clip(client, event, output_dir)
        if success:
            success_count += 1
            manifest.append({
                "index": event["index"],
                "trigger_time": event["trigger_time"],
                "subject_id": event["subject_id"],
                "text": event["text"],
                "duration": duration,
                "filename": f"commentary_{event['index']:02d}_{event['trigger_time']:.0f}s.mp3"
            })
        if i < len(COMMENTARY_EVENTS) - 1:
            time.sleep(RATE_LIMIT_DELAY)
    
    print("-" * 80)
    print(f"Done! Generated {success_count}/{len(COMMENTARY_EVENTS)} clips")
    
    # Save manifest
    with open(output_dir / "manifest.json", "w") as f:
        json.dump({
            "model": MODEL,
            "voice": VOICE,
            "version": "race_aligned_v1",
            "removed_pii": ["surnames", "venues", "team_names", "meet_names"],
            "total_clips": len(COMMENTARY_EVENTS),
            "generated": success_count,
            "files": manifest
        }, f, indent=2)
    
    print(f"Output: {output_dir}")
    
    # Print HTML-ready timing array
    print("\n--- HTML Commentary Timing Array ---")
    print("const commentaryTiming = [")
    for item in manifest:
        subject = f"{item['subject_id']}" if item['subject_id'] else "null"
        print(f"    [{item['trigger_time']}, \"commentary_aligned/{item['filename']}\", {item['duration']:.1f}, {subject}, \"{item['text']}\"],")
    print("];")

if __name__ == "__main__":
    main()
