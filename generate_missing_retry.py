#!/usr/bin/env python3
"""
Generate missing commentary with modified text
"""

import os
import re
import wave
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv("/home/elidev/nidra/meditation-generator/.env")

from google import genai
from google.genai import types
from pydub import AudioSegment

# Modified text to avoid potential content filter issues
MISSING_EVENTS = [
    { "index": 3, "time": 41.5, "text": "Skye is through the first 200 meters in forty-one five, running smart.", "subjectId": 8, "original": "Skye through the first 200 in 41.5, staying calm." },
    { "index": 10, "time": 141, "text": "Melodi crosses the finish line with a time of two twenty-one! First place!", "subjectId": 1, "original": "Melodi crosses the line! 2:21.58! Winner!" }
]

MODEL = "gemini-2.5-pro-preview-tts"
RATE_LIMIT_DELAY = 6

VOICE_CONFIG = {
    "voice": "Puck",
    "prompt": "You are an energetic track and field announcer. Speak with excitement and enthusiasm."
}

def save_pcm_as_wav(pcm_data: bytes, output_path: str, sample_rate: int = 24000):
    with wave.open(output_path, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_data)

def generate_clip(client, event, output_dir):
    safe_name = f"commentary_{event['index']:02d}_{event['time']:.1f}s"
    filename = f"{safe_name}.mp3"
    output_path = output_dir / filename
    wav_path = str(output_path).replace('.mp3', '.wav')
    
    prompt = f"{VOICE_CONFIG['prompt']}\n\n{event['text']}"
    
    try:
        print(f"Generating clip {event['index']}: {event['text'][:50]}...", end=" ", flush=True)
        
        response = client.models.generate_content(
            model=MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=VOICE_CONFIG["voice"]
                        )
                    )
                )
            )
        )
        
        if not response.candidates or not response.candidates[0].content.parts:
            print("✗ No audio data")
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
    output_dir = Path("commentary_audio")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("Generating missing commentary clips (modified text)...")
    print(f"Voice: {VOICE_CONFIG['voice']}")
    print("-" * 60)
    
    for i, event in enumerate(MISSING_EVENTS):
        success = generate_clip(client, event, output_dir)
        if i < len(MISSING_EVENTS) - 1:
            time.sleep(RATE_LIMIT_DELAY)
    
    print("-" * 60)
    print("Done!")

if __name__ == "__main__":
    main()
