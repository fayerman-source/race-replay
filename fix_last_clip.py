#!/usr/bin/env python3
"""Generate the missing last clip (21)"""
import os
import wave
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv("/home/elidev/nidra/meditation-generator/.env")
from google import genai
from google.genai import types
from pydub import AudioSegment

MODEL = "gemini-2.5-flash-preview-tts"
VOICE = "Puck"

EVENT = {
    "index": 21,
    "time": 198,
    "text": "What a race. From Melodi's dominant front-running to Skye's brilliant negative split. Two different strategies, both executed beautifully.",
    "prompt": "You are wrapping up with appreciation. Celebratory, satisfied."
}

def save_pcm_as_wav(pcm_data, output_path, sample_rate=24000):
    with wave.open(output_path, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_data)

def main():
    api_key = os.getenv("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)
    output_dir = Path("commentary_anonymized")
    
    filename = f"commentary_{EVENT['index']:02d}_{EVENT['time']:.0f}s.mp3"
    output_path = output_dir / filename
    wav_path = str(output_path).replace('.mp3', '.wav')
    
    full_prompt = f"{EVENT['prompt']}\n\n{EVENT['text']}"
    
    print(f"Generating clip 21: {EVENT['text'][:50]}...")
    
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
    
    if response.candidates and response.candidates[0].content.parts:
        audio_data = response.candidates[0].content.parts[0].inline_data.data
        save_pcm_as_wav(audio_data, wav_path)
        audio = AudioSegment.from_wav(wav_path)
        audio.export(str(output_path), format="mp3")
        os.remove(wav_path)
        print(f"✓ Done ({len(audio)/1000:.1f}s)")
    else:
        print("✗ Failed")

if __name__ == "__main__":
    main()
