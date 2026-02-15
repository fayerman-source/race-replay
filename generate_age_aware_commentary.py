#!/usr/bin/env python3
"""
Refined Dual Commentary - Age-Aware Elite Sportscasting

Jim (Play-by-Play): Energetic, builds excitement (Puck)
Sarah (Elite Coach/Analyst): Technical, developmental insight (Leda)

Key narrative: Skye is 10, racing against 13-14 year olds (3-4 years older)
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

# Load race data
with open("/home/elidev/.openclaw/workspace/circuit-race-replay/data/race_data.json") as f:
    race_data = json.load(f)

# Age-aware dual commentary
COMMENTARY_EVENTS = [
    {
        "index": 0,
        "time": 0,
        "speaker": "Jim",
        "text": "Runners set at the Armory... Gun goes! Clean start! Ashford out fast!",
        "subjectId": 1,
        "voice": "Puck",
        "prompt": "You are Jim, energetic play-by-play announcer. Building energy."
    },
    {
        "index": 1,
        "time": 6,
        "speaker": "Sarah",
        "text": "Now Jim, look at this field. We've got athletes ranging from ten to fourteen years old. That's a huge developmental gap in middle school track.",
        "subjectId": None,
        "voice": "Leda",
        "prompt": "You are Sarah, elite coach and analyst. Establishing the age context for viewers. Educational tone."
    },
    {
        "index": 2,
        "time": 15,
        "speaker": "Jim",
        "text": "Thirty-two nine at the two hundred for Ashford! She's flying!",
        "subjectId": 1,
        "voice": "Puck",
        "prompt": "Jim calling fast split. High energy."
    },
    {
        "index": 3,
        "time": 21,
        "speaker": "Sarah",
        "text": "That's a thirteen-year-old running like a high schooler, Jim. But watch the ten-year-olds in the back. They've got three to four fewer years of aerobic development.",
        "subjectId": 1,
        "voice": "Leda",
        "prompt": "Sarah explaining age disadvantage. Technical but building narrative."
    },
    {
        "index": 4,
        "time": 30,
        "speaker": "Jim",
        "text": "Now focusing on Skye Fayerman, bib ten. She's ten years old, Sarah. Ten! Coming through the two hundred in forty-one flat.",
        "subjectId": 8,
        "voice": "Puck",
        "prompt": "Jim introducing the featured athlete with amazement at her age."
    },
    {
        "index": 5,
        "time": 39,
        "speaker": "Sarah",
        "text": "Eight seconds back of the leader, Jim, but that's exactly right. A ten-year-old running her own race against eighth and ninth graders. That's racing IQ beyond her years.",
        "subjectId": 8,
        "voice": "Leda",
        "prompt": "Sarah praising tactical maturity despite age disadvantage. Warm appreciation."
    },
    {
        "index": 6,
        "time": 50,
        "speaker": "Jim",
        "text": "Four hundred meters. Ashford's one oh eight, but she's tightening up!",
        "subjectId": 1,
        "voice": "Puck",
        "prompt": "Jim noticing leader struggling. Building tension."
    },
    {
        "index": 7,
        "time": 57,
        "speaker": "Sarah",
        "text": "Classic fast-start fatigue, Jim. Now watch Fayerman. One twenty-eight through four hundred. She's closing the gap on older runners who are fading.",
        "subjectId": 8,
        "voice": "Leda",
        "prompt": "Sarah explaining race dynamics and highlighting Skye moving up. Building excitement."
    },
    {
        "index": 8,
        "time": 68,
        "time": 68,
        "speaker": "Jim",
        "text": "The bell lap! Ashford at one forty-five. But Jim, Fayerman's still rolling!",
        "subjectId": 1,
        "voice": "Puck",
        "prompt": "Jim excited about the developing story."
    },
    {
        "index": 9,
        "time": 76,
        "speaker": "Sarah",
        "text": "Seventeen second gap, Jim. But here's the thing - that ten-year-old is running negative splits while thirteen and fourteen year olds are coming back to her.",
        "subjectId": 8,
        "voice": "Leda",
        "prompt": "Sarah emphasizing the age dynamic. Impressed but analytical."
    },
    {
        "index": 10,
        "time": 88,
        "speaker": "Jim",
        "text": "Six hundred meters! Fayerman through in two sixteen! She's passing people!",
        "subjectId": 8,
        "voice": "Puck",
        "prompt": "Jim beyond excited. Maximum energy."
    },
    {
        "index": 11,
        "time": 95,
        "speaker": "Sarah",
        "text": "A ten-year-old reeling in eighth and ninth graders, Jim! Aerobic strength winning over raw speed. That doesn't happen without incredible coaching and natural talent.",
        "subjectId": 8,
        "voice": "Leda",
        "prompt": "Sarah genuinely impressed by the upset. High energy."
    },
    {
        "index": 12,
        "time": 108,
        "speaker": "Jim",
        "text": "Two twenty-one fifty-eight for Ashford! She wins! Brave effort!",
        "subjectId": 1,
        "voice": "Puck",
        "prompt": "Jim calling winner. Celebratory."
    },
    {
        "index": 13,
        "time": 115,
        "speaker": "Sarah",
        "text": "Great race from the thirteen-year-old, but Jim - look at Fayerman! She's not done! Forty-seven second final lap!",
        "subjectId": 8,
        "voice": "Leda",
        "prompt": "Sarah redirecting to Skye's incredible finish. Maximum excitement."
    },
    {
        "index": 14,
        "time": 128,
        "speaker": "Jim",
        "text": "Fifty meters to go! She's ten years old racing eighth graders and she's gutting it out!",
        "subjectId": 8,
        "voice": "Puck",
        "prompt": "Jim emphasizing the age factor at the climax. Absolute peak energy."
    },
    {
        "index": 15,
        "time": 142,
        "speaker": "Sarah",
        "text": "Three oh four! That's a twenty-second personal record! Sarah, she's ten years old running with that kind of composure!",
        "subjectId": 8,
        "voice": "Leda",
        "prompt": "Sarah announcing PR with amazement at age. Beyond excited."
    },
    {
        "index": 16,
        "time": 152,
        "speaker": "Jim",
        "text": "Unbelievable! Beat four athletes three to four years older than her!",
        "subjectId": 8,
        "voice": "Puck",
        "prompt": "Jim summarizing the achievement. Maximum celebration."
    },
    {
        "index": 17,
        "time": 162,
        "speaker": "Sarah",
        "text": "That's not just talent, Jim. That's training, racing IQ, and mental toughness you rarely see in elementary school. This kid's going places.",
        "subjectId": 8,
        "voice": "Leda",
        "prompt": "Sarah providing final analysis. Warm, impressed, predictive."
    },
    {
        "index": 18,
        "time": 172,
        "speaker": "Jim",
        "text": "What a race across all ages! From Ashford's dominant win to Fayerman's incredible age-group performance!",
        "subjectId": None,
        "voice": "Puck",
        "prompt": "Jim wrapping up. Celebratory."
    },
    {
        "index": 19,
        "time": 180,
        "speaker": "Sarah",
        "text": "This is why developmental track matters, Jim. You never know when you're watching a future champion. Ten years old.",
        "subjectId": 8,
        "voice": "Leda",
        "prompt": "Sarah philosophical closing. Emphasizing the discovery aspect. Warm."
    }
]

MODEL = "gemini-2.5-pro-preview-tts"
RATE_LIMIT_DELAY = 6

def save_pcm_as_wav(pcm_data: bytes, output_path: str, sample_rate: int = 24000):
    with wave.open(output_path, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_data)

def generate_clip(client, event, output_dir: Path):
    """Generate a single commentary clip."""
    safe_name = f"commentary_{event['index']:02d}_{event['time']:.0f}s"
    filename = f"{safe_name}.mp3"
    output_path = output_dir / filename
    wav_path = str(output_path).replace('.mp3', '.wav')
    
    full_prompt = f"{event['prompt']}\n\n{event['text']}"
    voice = event.get('voice', 'Puck')
    
    try:
        print(f"[{event['index']:02d}] {event['speaker']:6s}: {event['text'][:50]}...", end=" ", flush=True)
        
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
    output_dir = Path("commentary_age_aware")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("Generating Age-Aware Dual Commentary")
    print("Jim (Play-by-Play) + Sarah (Elite Coach)")
    print(f"Race Context: 10-year-old vs 13-14 year olds")
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
        "version": "age_aware_dual",
        "commentators": {"Jim": "Play-by-Play", "Sarah": "Elite Coach/Analyst"},
        "key_narrative": "10-year-old racing against 13-14 year olds (3-4 year disadvantage)",
        "total_clips": len(COMMENTARY_EVENTS),
        "generated": success_count,
        "files": [{"index": e["index"], "time": e["time"], "speaker": e["speaker"], 
                   "text": e["text"], "subjectId": e["subjectId"]} 
                  for e in COMMENTARY_EVENTS]
    }
    
    manifest_path = output_dir / "manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"Manifest: {manifest_path}")

if __name__ == "__main__":
    main()
