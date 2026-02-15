#!/usr/bin/env python3
"""
Two-Commentator System for Race Replay

Jim (Play-by-Play): Energetic, calls action, builds excitement (Puck voice)
Sarah (Analyst): Technical insights, reacts to Jim, provides context (Leda voice)

Features:
- Call-and-response dynamics
- Picking up on each other's cues
- Different energy levels based on race moments
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

# Two-commentator system with interaction
COMMENTARY_EVENTS = [
    { 
        "index": 0, 
        "time": 0, 
        "speaker": "Jim",
        "text": "Runners set... Gun goes! Clean start! Ashford immediately to the front!",
        "subjectId": 1,
        "excitement": "building",
        "voice": "Puck",
        "prompt": "You are Jim, an energetic play-by-play track announcer. Fast, excited delivery."
    },
    { 
        "index": 1, 
        "time": 5, 
        "speaker": "Sarah",
        "text": "And look at Ashford's turnover, Jim. She's running this like a four-hundred. High risk, high reward strategy.",
        "subjectId": 1,
        "excitement": "analytical",
        "voice": "Leda",
        "prompt": "You are Sarah, a track analyst responding to Jim. Measured, technical, acknowledging what Jim said."
    },
    { 
        "index": 2, 
        "time": 12, 
        "speaker": "Jim",
        "text": "The field's already stringing out, Sarah! Big separation between the leaders and chase pack!",
        "subjectId": None,
        "excitement": "excited",
        "voice": "Puck",
        "prompt": "You are Jim responding to Sarah's analysis. Acknowledge her point, build energy."
    },
    { 
        "index": 3, 
        "time": 22, 
        "speaker": "Sarah",
        "text": "Exactly, Jim. This is where eight-hundred racing gets tactical. Go with the fast pace or run your own race. Decisions made in the first hundred meters determine the outcome.",
        "subjectId": None,
        "excitement": "analytical",
        "voice": "Leda",
        "prompt": "You are Sarah building on Jim's observation. Educational tone, slightly faster."
    },
    { 
        "index": 4, 
        "time": 32, 
        "speaker": "Jim",
        "text": "Thirty-two nine at the two-hundred for Ashford! She's flying!",
        "subjectId": 1,
        "excitement": "very_excited",
        "voice": "Puck",
        "prompt": "You are Jim calling a fast split. Maximum energy."
    },
    { 
        "index": 5, 
        "time": 38, 
        "speaker": "Sarah",
        "text": "That's aggressive, Jim. Real question is lactate buildup. Can she maintain this through the middle laps when the pain comes?",
        "subjectId": 1,
        "excitement": "analytical_concern",
        "voice": "Leda",
        "prompt": "You are Sarah questioning the fast pace. Analytical, slightly concerned, building tension."
    },
    { 
        "index": 6, 
        "time": 45, 
        "speaker": "Jim",
        "text": "Now looking at Skye Fayerman, Sarah. Forty-one flat through the first two hundred. Much more controlled.",
        "subjectId": 8,
        "excitement": "observational",
        "voice": "Puck",
        "prompt": "You are Jim pointing out a different strategy to Sarah. Observational, setting up her analysis."
    },
    { 
        "index": 7, 
        "time": 52, 
        "speaker": "Sarah",
        "text": "Smart racing, Jim. She's not getting pulled out by the early pace. Settling into her rhythm. That's mature tactics for a ten-year-old.",
        "subjectId": 8,
        "excitement": "appreciative",
        "voice": "Leda",
        "prompt": "You are Sarah responding to Jim's observation. Warm appreciation of smart racing."
    },
    { 
        "index": 8, 
        "time": 60, 
        "time": 60, 
        "speaker": "Jim",
        "text": "Four hundred meters in! Ashford still leading but I'm seeing some form breakdown, Sarah!",
        "subjectId": 1,
        "excitement": "building_concern",
        "voice": "Puck",
        "prompt": "You are Jim noticing potential problems. Building tension, seeking Sarah's expert eye."
    },
    { 
        "index": 9, 
        "time": 66, 
        "speaker": "Sarah",
        "text": "I see it too, Jim. Her shoulders are tightening. That's the early pace catching up. The chase pack is only five meters back now.",
        "subjectId": 1,
        "excitement": "analytical_tension",
        "voice": "Leda",
        "prompt": "You are Sarah confirming Jim's observation. Technical analysis, building tension."
    },
    { 
        "index": 10, 
        "time": 72, 
        "speaker": "Jim",
        "text": "One oh eight at the bell! Ashford's slowing! Sarah, how much does she have left?",
        "subjectId": 1,
        "excitement": "intense_question",
        "voice": "Puck",
        "prompt": "You are Jim asking Sarah a direct question about the leader. Urgent, seeking expert opinion."
    },
    { 
        "index": 11, 
        "time": 78, 
        "speaker": "Sarah",
        "text": "That's a thirty-five second lap, Jim. She's paying now. But watch Fayerman - one twenty-eight through four hundred. Negative split pacing!",
        "subjectId": 8,
        "excitement": "excited_discovery",
        "voice": "Leda",
        "prompt": "You are Sarah answering Jim's question and pivoting to an exciting observation. Building excitement."
    },
    { 
        "index": 12, 
        "time": 85, 
        "speaker": "Jim",
        "text": "Negative split! While others fade, she's maintaining! Sarah, you called it!",
        "subjectId": 8,
        "excitement": "excited_validation",
        "voice": "Puck",
        "prompt": "You are Jim excitedly acknowledging Sarah was right. High energy, building toward climax."
    },
    { 
        "index": 13, 
        "time": 92, 
        "speaker": "Sarah",
        "text": "Diesel engine racing, Jim! Aerobic strength winning over raw speed. The field is strung out and Fayerman is in perfect position to move up!",
        "subjectId": 8,
        "excitement": "very_excited",
        "voice": "Leda",
        "prompt": "You are Sarah matching Jim's energy. Maximum enthusiasm, explaining why this is working."
    },
    { 
        "index": 14, 
        "time": 100, 
        "speaker": "Jim",
        "text": "Six hundred coming up! This is where races are won and lost!",
        "subjectId": None,
        "excitement": "maximum",
        "voice": "Puck",
        "prompt": "You are Jim at peak excitement calling the critical moment. Maximum energy."
    },
    { 
        "index": 15, 
        "time": 108, 
        "speaker": "Sarah",
        "text": "One forty-five for Ashford, Jim! She's fighting but she's hurting! Championship mentality right there!",
        "subjectId": 1,
        "excitement": "intense",
        "voice": "Leda",
        "prompt": "You are Sarah responding to Jim's high energy with equal intensity. Acknowledging the struggle."
    },
    { 
        "index": 16, 
        "time": 115, 
        "speaker": "Jim",
        "text": "But look at Fayerman! Two sixteen through six hundred! She's running people down! Sarah!",
        "subjectId": 8,
        "excitement": "maximum",
        "voice": "Puck",
        "prompt": "You are Jim beyond excited, calling Sarah's attention to the incredible move. Maximum energy."
    },
    { 
        "index": 17, 
        "time": 121, 
        "speaker": "Sarah",
        "text": "I see it Jim! Closing on the field while others tie up! That patience early is paying off! She's got another gear!",
        "subjectId": 8,
        "excitement": "maximum",
        "voice": "Leda",
        "prompt": "You are Sarah matching Jim's maximum excitement. This is the climax of the race analysis."
    },
    { 
        "index": 18, 
        "time": 128, 
        "time": 128, 
        "speaker": "Jim",
        "text": "One hundred to go for Ashford! She's gonna win but watch the clock! Can she break two twenty-two?",
        "subjectId": 1,
        "excitement": "intense",
        "voice": "Puck",
        "prompt": "You are Jim calling the leader's finish while building anticipation for others. High energy."
    },
    { 
        "index": 19, 
        "time": 135, 
        "speaker": "Sarah",
        "text": "And Fayerman's flying, Jim! Passing people! That kick is devastating!",
        "subjectId": 8,
        "excitement": "very_excited",
        "voice": "Leda",
        "prompt": "You are Sarah excitedly responding about Skye's finish. Very high energy."
    },
    { 
        "index": 20, 
        "time": 142, 
        "speaker": "Jim",
        "text": "Two twenty-one fifty-eight! Ashford wins! Held on after going out hard!",
        "subjectId": 1,
        "excitement": "celebratory",
        "voice": "Puck",
        "prompt": "You are Jim calling the winner. Celebratory but acknowledging the effort."
    },
    { 
        "index": 21, 
        "time": 148, 
        "speaker": "Sarah",
        "text": "But Jim! Look at Fayerman! Still moving! Forty-seven second final lap! Championship racing!",
        "subjectId": 8,
        "excitement": "maximum",
        "voice": "Leda",
        "prompt": "You are Sarah redirecting attention to Skye's incredible finish. Maximum excitement."
    },
    { 
        "index": 22, 
        "time": 158, 
        "speaker": "Jim",
        "text": "Fifty meters to go for Skye! She's gutting it out! Form still holding!",
        "subjectId": 8,
        "excitement": "maximum",
        "voice": "Puck",
        "prompt": "You are Jim calling Skye's final sprint. Absolute peak energy."
    },
    { 
        "index": 23, 
        "time": 170, 
        "speaker": "Sarah",
        "text": "This is what separates good from great, Jim! Look at that composure!",
        "subjectId": 8,
        "excitement": "maximum",
        "voice": "Leda",
        "prompt": "You are Sarah providing analysis at the climax. Maximum energy, building to the announcement."
    },
    { 
        "index": 24, 
        "time": 185, 
        "speaker": "Jim",
        "text": "Three oh four twenty-seven! Personal record! Twenty second improvement! Sarah!",
        "subjectId": 8,
        "excitement": "maximum_celebration",
        "voice": "Puck",
        "prompt": "You are Jim announcing the massive PR. Beyond excited, calling for Sarah's reaction."
    },
    { 
        "index": 25, 
        "time": 192, 
        "speaker": "Sarah",
        "text": "Executed to perfection, Jim! Negative split strategy paid off! What a race!",
        "subjectId": 8,
        "excitement": "celebratory",
        "voice": "Leda",
        "prompt": "You are Sarah celebrating with Jim. High energy, summarizing the achievement."
    },
    { 
        "index": 26, 
        "time": 198, 
        "speaker": "Jim",
        "text": "Margeaux Siriban in three ten! Strong finish!",
        "subjectId": 9,
        "excitement": "appreciative",
        "voice": "Puck",
        "prompt": "You are Jim acknowledging another runner. Quick, appreciative."
    },
    { 
        "index": 27, 
        "time": 204, 
        "speaker": "Sarah",
        "text": "From Ashford's dominant front-running to Fayerman's brilliant negative split! This is why we watch track, Jim!",
        "subjectId": None,
        "excitement": "celebratory_wrap",
        "voice": "Leda",
        "prompt": "You are Sarah wrapping up with Jim. Celebratory, summarizing the dual storylines."
    },
    { 
        "index": 28, 
        "time": 212, 
        "speaker": "Jim",
        "text": "Absolutely, Sarah! Two different strategies, both executed beautifully! What a race!",
        "subjectId": None,
        "excitement": "final_celebration",
        "voice": "Puck",
        "prompt": "You are Jim agreeing with Sarah's summary. Final celebratory note."
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
    
    # Build prompt
    base_prompt = event.get('prompt', f"You are {event['speaker']}, a professional track commentator.")
    
    # Add pace instruction
    excitement = event.get('excitement', 'normal')
    pace_map = {
        'building': 'Speak with increasing energy.',
        'analytical': 'Measured, clear delivery.',
        'excited': 'Fast, energetic delivery.',
        'very_excited': 'Very fast, high energy.',
        'maximum': 'Maximum energy and speed.',
        'maximum_celebration': 'Absolute peak excitement.',
        'intense': 'Urgent, intense delivery.',
        'celebratory': 'Celebratory, satisfied tone.',
        'appreciative': 'Warm, acknowledging tone.',
        'observational': 'Observational, setting up analysis.',
        'analytical_concern': 'Analytical with slight concern.',
        'building_concern': 'Building tension with concern.',
        'intense_question': 'Intense, asking a question.',
        'excited_discovery': 'Excited by a discovery.',
        'excited_validation': 'Excited, acknowledging someone was right.',
        'analytical_tension': 'Analytical with building tension.',
        'celebratory_wrap': 'Celebratory summary.',
        'final_celebration': 'Final celebratory agreement.'
    }
    pace_instruction = pace_map.get(excitement, 'Speak naturally.')
    
    full_prompt = f"{base_prompt} {pace_instruction}\n\n{event['text']}"
    voice = event.get('voice', 'Puck')
    
    try:
        print(f"[{event['index']:02d}] {event['speaker']:6s} {excitement:20s}: {event['text'][:45]}...", end=" ", flush=True)
        
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
    output_dir = Path("commentary_dual")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Generating {len(COMMENTARY_EVENTS)} dual-commentary clips...")
    print(f"Jim (Play-by-Play) + Sarah (Analyst)")
    print("-" * 80)
    
    success_count = 0
    for i, event in enumerate(COMMENTARY_EVENTS):
        if generate_clip(client, event, output_dir):
            success_count += 1
        if i < len(COMMENTARY_EVENTS) - 1:
            time.sleep(RATE_LIMIT_DELAY)
    
    print("-" * 80)
    print(f"Done! Generated {success_count}/{len(COMMENTARY_EVENTS)} clips")
    print(f"Output: {output_dir}")
    
    # Save manifest
    import json
    manifest = {
        "model": MODEL,
        "version": "dual_commentary",
        "commentators": {"Jim": "Play-by-Play", "Sarah": "Analyst"},
        "total_clips": len(COMMENTARY_EVENTS),
        "generated": success_count,
        "files": [{"index": e["index"], "time": e["time"], "speaker": e["speaker"], 
                   "text": e["text"], "excitement": e["excitement"], "subjectId": e["subjectId"]} 
                  for e in COMMENTARY_EVENTS]
    }
    
    manifest_path = output_dir / "manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"Manifest: {manifest_path}")

if __name__ == "__main__":
    main()
