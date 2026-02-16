#!/usr/bin/env python3
"""
Regenerate commentary audio with cleaned text (no fake data)
"""

import os
import re
import wave
import time
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv("/home/elidev/nidra/meditation-generator/.env")

from google import genai
from google.genai import types
from pydub import AudioSegment

# Clean commentary - NO fake data (turnover, form, lactate, etc.)
# Based ONLY on: splits, positions, gaps, pacing strategy
COMMENTARY_EVENTS = [
    # PRE-RACE INTRODUCTION
    { "index": 0, "time": -15, "text": "Welcome to the eight hundred meter championship heat.", "voice": "Leda", "prompt": "You are a professional track announcer. Calm, welcoming introduction." },
    { "index": 1, "time": -10, "text": "Eleven runners on the line today, ranging from ten to fourteen years old. Big developmental spread in this field.", "voice": "Leda", "prompt": "You are a track analyst setting up the age dynamic. Observational tone." },
    { "index": 2, "time": -6, "text": "Watch for Melodi Ashford in bib two. She's the top seed looking to run sub-two-twenty-two.", "voice": "Leda", "prompt": "You are highlighting the favorite. Analytical but building anticipation." },
    { "index": 3, "time": -3, "text": "Also keep an eye on Skye Fayerman, bib ten. Just ten years old, running up against middle schoolers. She's targeting a personal best today.", "voice": "Leda", "prompt": "You are introducing the underdog story. Warm, building narrative interest." },
    
    # RACE ACTION
    { "index": 4, "time": 0, "text": "Runners set. Clean start off the waterfall. Melodi Ashford immediately establishing position on the rail.", "voice": "Puck", "prompt": "You are a play-by-play announcer calling the start. Energetic but controlled." },
    { "index": 5, "time": 8, "text": "Ashford out fast through the first hundred. She's committing to a front-running strategy.", "voice": "Puck", "prompt": "You are noting strategic decisions early in the race. Building energy." },
    { "index": 6, "time": 18, "text": "Field stringing out already. You can see the separation between the front pack and the chase group. This is where eight-hundred meter racing gets tactical.", "voice": "Leda", "prompt": "You are explaining race dynamics. Educational but engaged." },
    { "index": 7, "time": 32, "text": "Thirty-two point nine for Ashford at the two-hundred. That's aggressive pacing. The question is whether she can hold this through the middle laps.", "voice": "Leda", "prompt": "You are analyzing pacing strategy. Analytical, slightly concerned about the fast start." },
    { "index": 8, "time": 41, "text": "Now looking at Skye Fayerman coming through the first two hundred. Forty-one flat. Smart, controlled start. She's eight seconds back, not getting pulled out by the fast early pace.", "voice": "Leda", "prompt": "You are praising smart tactics. Warm appreciation." },
    { "index": 9, "time": 52, "text": "Middle pack starting to feel the gap. Dabral and Macari trying to hold contact with Ashford but she's pulling away. Big decision point: go with the leader or run your own race.", "voice": "Leda", "prompt": "You are explaining the tactical dilemma. Building tension." },
    { "index": 10, "time": 60, "text": "Four hundred meters in. Ashford still commanding at one-oh-eight. The chase pack including Dabral, Macari, and Hagen are about five meters back.", "voice": "Puck", "prompt": "You are calling positions at the halfway point. Building energy." },
    { "index": 11, "time": 68, "text": "One oh eight at the bell for Ashford! That was a thirty-five second lap. She's slowing. How much does she have left for the final two hundred?", "voice": "Puck", "prompt": "You are noting the time gap widening. Building tension for the finish." },
    { "index": 12, "time": 75, "text": "Here's where it gets interesting. Skye Fayerman just split one twenty-eight for the first four hundred. Negative split pacing. While others are fading, she's maintaining.", "voice": "Leda", "prompt": "You are excited by tactical brilliance. Genuine enthusiasm." },
    { "index": 13, "time": 88, "text": "Look at the separation now! The field is completely strung out. Fayerman sitting in eighth, twenty meters off the lead but perfect position to move up as others fade.", "voice": "Puck", "prompt": "You are excited by the developing story. High energy." },
    { "index": 14, "time": 98, "text": "Six hundred meter mark coming up. This is where the race is decided. Ashford's lead is shrinking but she's still out front.", "voice": "Puck", "prompt": "You are building anticipation for the critical moment. Maximum energy." },
    { "index": 15, "time": 105, "text": "One forty-five for Ashford through six hundred! She's paying for that early pace but she's still fighting. Can she hold on?", "voice": "Puck", "prompt": "You are calling the leader struggling. Intense, dramatic." },
    { "index": 16, "time": 115, "text": "Fayerman through six hundred in two sixteen! She's running people down! Closing on the field while others are tying up.", "voice": "Puck", "prompt": "You are beyond excited by the comeback. Maximum energy." },
    { "index": 17, "time": 122, "text": "One hundred meters to go for Ashford. She's gonna win this but watch the clock. Can she break two twenty-two?", "voice": "Puck", "prompt": "You are calling the finish. Peak excitement." },
    { "index": 18, "time": 130, "text": "Skye's flying now! She's passing people! All that patience early is paying off. She's moved up to eighth and still closing!", "voice": "Puck", "prompt": "You are thrilled by the strong finish. Maximum enthusiasm." },
    { "index": 19, "time": 141, "text": "Two twenty-one fifty-eight for Ashford! Outstanding performance! She held on after going out hard.", "voice": "Puck", "prompt": "You are celebrating the winner. Triumphant." },
    { "index": 20, "time": 148, "text": "But watch Skye Fayerman coming home! Still moving! Forty-seven second final lap after a controlled start! That's how you negative split an eight-hundred!", "voice": "Puck", "prompt": "You are amazed by the tactical brilliance. Absolute peak excitement." },
    { "index": 21, "time": 165, "text": "Fifty meters to go for Skye! She's gutting it out! Holding her pace while the early leaders are done!", "voice": "Puck", "prompt": "You are calling the incredible finish. Maximum energy." },
    { "index": 22, "time": 184, "text": "Three oh four twenty-seven! Massive personal record for Skye Fayerman! Twenty second improvement! That negative split strategy executed perfectly!", "voice": "Puck", "prompt": "You are announcing the huge PR. Absolute peak celebration." },
    { "index": 23, "time": 191, "text": "Margeaux Siriban crosses in three ten. Strong finish from the chase pack.", "voice": "Leda", "prompt": "You are acknowledging another finisher. Quick, appreciative." },
    { "index": 24, "time": 198, "text": "What a race! From Ashford's dominant front-running to Fayerman's brilliant negative split! Two different strategies, both executed beautifully!", "voice": "Puck", "prompt": "You are wrapping up with appreciation. Celebratory, satisfied." }
]

MODEL = "gemini-2.5-pro-preview-tts"
RATE_LIMIT_DELAY = 6

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
    voice = event.get('voice', 'Puck')
    
    try:
        print(f"[{event['index']:02d}] {voice}: {event['text'][:50]}...", end=" ", flush=True)
        
        response = client.models.generate_content(
            model=MODEL,
            contents=full_prompt,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=voice
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
        print(f"✗ Error: {e}")
        return False

def main():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not found")
        return
    
    client = genai.Client(api_key=api_key)
    output_dir = Path("commentary_final")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("Generating CLEAN commentary - NO fake data")
    print("Removed: turnover, lactate, form breakdown, aerobic strength")
    print("Keeping: splits, positions, gaps, pacing strategy only")
    print("-" * 80)
    
    success_count = 0
    for i, event in enumerate(COMMENTARY_EVENTS):
        if generate_clip(client, event, output_dir):
            success_count += 1
        if i < len(COMMENTARY_EVENTS) - 1:
            time.sleep(RATE_LIMIT_DELAY)
    
    print("-" * 80)
    print(f"Done! Generated {success_count}/{len(COMMENTARY_EVENTS)} clips")
    
    # Save manifest
    manifest = {
        "model": MODEL,
        "version": "clean_no_fake_data",
        "removed": ["turnover", "lactate", "form_breakdown", "aerobic_strength", "kick"],
        "kept": ["splits", "positions", "gaps", "pacing_strategy"],
        "total_clips": len(COMMENTARY_EVENTS),
        "generated": success_count,
        "files": [{"index": e["index"], "time": e["time"], "text": e["text"], "voice": e["voice"]} 
                  for e in COMMENTARY_EVENTS]
    }
    
    manifest_path = output_dir / "manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"Manifest: {manifest_path}")

if __name__ == "__main__":
    main()
