#!/usr/bin/env python3
"""
Elite Sportscaster Commentary Generator for Race Replay

High-level coach/sportscaster perspective with:
- Analytical insights on race dynamics
- Varied excitement levels (builds toward finish)
- Coverage of all runners when notable
- Special focus on Skye's racing ability
- Faster speaking pace for realism
- Acknowledgment of PR at finish
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

# Elite sportscaster commentary - builds excitement, analytical insights
COMMENTARY_EVENTS = [
    { 
        "index": 0, 
        "time": 0, 
        "text": "Runners set. Clean start off the waterfall. Melodi Ashford immediately establishing position on the rail.", 
        "subjectId": 1,
        "excitement": "calm",
        "prompt": "You are a professional track and field analyst. Speak with authority and technical knowledge. Calm, measured delivery."
    },
    { 
        "index": 1, 
        "time": 8, 
        "text": "Ashford's out fast. Look at that turnover. She's running this like a four-hundred, risking the negative split but she's got the speed to hold it.", 
        "subjectId": 1,
        "excitement": "analytical",
        "prompt": "You are an elite track coach analyzing race tactics. Professional, knowledgeable tone. Slight uptick in energy."
    },
    { 
        "index": 2, 
        "time": 18, 
        "text": "Field stringing out already. You can see the separation between the front pack and the chase group. This is where eight-hundred meter racing gets tactical.", 
        "subjectId": None,
        "excitement": "analytical",
        "prompt": "You are a professional track analyst explaining race dynamics. Educational but engaging tone."
    },
    { 
        "index": 3, 
        "time": 32, 
        "text": "Thirty-two point nine for Ashford at the two-hundred. That's aggressive pacing. Real question is whether she can maintain this through the middle laps when lactate builds.", 
        "subjectId": 1,
        "excitement": "analytical",
        "prompt": "You are an elite coach analyzing pacing strategy. Technical insight about physiology and race management."
    },
    { 
        "index": 4, 
        "time": 41, 
        "text": "Now looking at Skye Fayerman coming through the first two hundred. Forty-one flat. Smart, controlled start. She's settling into her rhythm, not getting pulled out by the fast early pace. That's mature racing for a ten-year-old.", 
        "subjectId": 8,
        "excitement": "appreciative",
        "prompt": "You are an experienced coach recognizing good tactical decisions. Warm but professional acknowledgment of smart racing."
    },
    { 
        "index": 5, 
        "time": 52, 
        "text": "Middle pack starting to feel the gap. Dabral and Macari trying to hold contact with Ashford but she's pulling away. When someone goes out this hard, you have to make an early decision: go with them or run your own race.", 
        "subjectId": 2,
        "excitement": "analytical",
        "prompt": "You are a track analyst explaining tactical decisions mid-race. Professional, slightly faster pace."
    },
    { 
        "index": 6, 
        "time": 60, 
        "text": "Four hundred meters in. Ashford still commanding but watch her form. Any breakdown in mechanics here will tell us if she went too fast. The chase pack including Dabral, Macari, and Hagen are about five meters back.", 
        "subjectId": 1,
        "excitement": "observational",
        "prompt": "You are an analyst watching for technical breakdowns. Observant, technical, building slight tension."
    },
    { 
        "index": 7, 
        "time": 68, 
        "text": "One oh eight at the bell! Ashford's still rolling but that was a thirty-five second lap. She's slowing. The question now: how much does she have left for the final two hundred?", 
        "subjectId": 1,
        "excitement": "building",
        "prompt": "You are a sportscaster recognizing the race is changing. More energy, faster delivery, building anticipation."
    },
    { 
        "index": 8, 
        "time": 75, 
        "text": "Here's where it gets interesting. Skye Fayerman just split one twenty-eight for the first four hundred. Negative split pacing. While others are fading, she's maintaining. That's diesel engine racing.", 
        "subjectId": 8,
        "excitement": "impressed",
        "prompt": "You are an analyst excited by smart racing tactics. Genuine appreciation, slightly faster pace."
    },
    { 
        "index": 9, 
        "time": 88, 
        "text": "Look at the separation now! The field is completely strung out. This is what happens when someone pushes the pace early. The strong survive, the rest try to hang on. Fayerman sitting in eighth, perfect position to move up.", 
        "subjectId": 8,
        "excitement": "analytical",
        "prompt": "You are explaining race dynamics as the field stretches. Observational but engaged tone."
    },
    { 
        "index": 10, 
        "time": 98, 
        "text": "Six hundred meter mark coming up. This is where the race is decided. Ashford's hurting but she's still leading. Watch for anyone closing the gap.", 
        "subjectId": 1,
        "excitement": "building",
        "prompt": "You are building tension for the final lap. Faster delivery, more energy."
    },
    { 
        "index": 11, 
        "time": 105, 
        "text": "One forty-five for Ashford! She's paying for that early pace but she's still fighting. That's championship mentality. When you commit to a fast start, you have to grit it out.", 
        "subjectId": 1,
        "excitement": "intense",
        "prompt": "You are recognizing competitive spirit. More emotion, genuine respect, faster pace."
    },
    { 
        "index": 12, 
        "time": 115, 
        "text": "Fayerman through six hundred in two sixteen! She's running people down! Look at her closing on the field while others are tying up. This is what aerobic strength looks like in an eight-hundred.", 
        "subjectId": 8,
        "excitement": "excited",
        "prompt": "You are genuinely excited by a strong finish. Higher energy, faster speech, building toward climax."
    },
    { 
        "index": 13, 
        "time": 122, 
        "text": "One hundred meters to go for Ashford. She's gonna win this but watch the clock. Can she break two twenty-two? She's digging deep.", 
        "subjectId": 1,
        "excitement": "intense",
        "prompt": "You are calling the finish with genuine excitement. Fast pace, building to the line."
    },
    { 
        "index": 14, 
        "time": 130, 
        "text": "Skye's flying now! She's passing people! Look at that kick! All that patience early is paying off. She's got another gear!", 
        "subjectId": 8,
        "excitement": "very_excited",
        "prompt": "You are extremely excited by a strong finish. Maximum energy, very fast delivery, genuine enthusiasm."
    },
    { 
        "index": 15, 
        "time": 141, 
        "text": "Two twenty-one fifty-eight for Ashford! Outstanding performance! She held on after going out hard. That's how you run an eight-hundred when you've got the wheels!", 
        "subjectId": 1,
        "excitement": "celebratory",
        "prompt": "You are celebrating an excellent performance. High energy, acknowledging great racing."
    },
    { 
        "index": 16, 
        "time": 148, 
        "text": "But watch Skye Fayerman coming home! She's still moving! Forty-seven second final lap after a controlled start! That's championship racing right there!", 
        "subjectId": 8,
        "excitement": "very_excited",
        "prompt": "You are incredibly excited by tactical brilliance. Maximum enthusiasm, celebrating smart racing."
    },
    { 
        "index": 17, 
        "time": 165, 
        "text": "Fifty meters to go for Skye! She's gutting it out! Look at that form holding together! This is what separates the good from the great!", 
        "subjectId": 8,
        "excitement": "maximum",
        "prompt": "You are at peak excitement for a strong finish. Maximum energy, fastest delivery, genuine thrill."
    },
    { 
        "index": 18, 
        "time": 184, 
        "text": "Three oh four twenty-seven! That's a massive personal record for Skye Fayerman! Twenty second improvement! That negative split strategy was executed to perfection! What a race!", 
        "subjectId": 8,
        "excitement": "maximum",
        "prompt": "You are absolutely thrilled by a huge PR. Maximum excitement, celebrating the achievement, fastest possible delivery."
    },
    { 
        "index": 19, 
        "time": 191, 
        "text": "Margeaux Siriban crosses in three ten. Strong finish, solid closing speed. Good racing from the back of the field.", 
        "subjectId": 9,
        "excitement": "appreciative",
        "prompt": "You are acknowledging a solid performance. Warm but coming down from peak excitement."
    },
    { 
        "index": 20, 
        "time": 198, 
        "text": "What a race! From Ashford's dominant front-running to Fayerman's brilliant negative split! This is why we watch track and field!", 
        "subjectId": None,
        "excitement": "celebratory",
        "prompt": "You are wrapping up with genuine appreciation for great racing. High energy but satisfied."
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
    """Generate a single commentary clip with appropriate personality."""
    safe_name = f"commentary_{event['index']:02d}_{event['time']:.1f}s"
    filename = f"{safe_name}.mp3"
    output_path = output_dir / filename
    wav_path = str(output_path).replace('.mp3', '.wav')
    
    # Build prompt based on excitement level
    base_prompt = event.get('prompt', 'You are a professional track and field sportscaster.')
    
    # Add speaking pace instruction based on excitement
    pace_instructions = {
        'calm': 'Speak at a normal, measured pace.',
        'analytical': 'Speak clearly with slight urgency.',
        'appreciative': 'Warm tone, moderate pace.',
        'observational': 'Engaged, slightly faster pace.',
        'building': 'Building energy, speak faster.',
        'impressed': 'Genuine appreciation, faster delivery.',
        'intense': 'High focus, quick delivery.',
        'excited': 'Fast pace, genuine enthusiasm.',
        'very_excited': 'Very fast pace, maximum energy.',
        'celebratory': 'Celebratory energy, quick delivery.',
        'maximum': 'Absolute maximum energy and speed. Speak as fast as naturally possible while remaining clear.'
    }
    
    excitement = event.get('excitement', 'analytical')
    pace_instruction = pace_instructions.get(excitement, 'Speak naturally.')
    
    full_prompt = f"{base_prompt} {pace_instruction}\n\n{event['text']}"
    
    # Select voice based on excitement level
    # Use different voices for variety
    if excitement in ['maximum', 'very_excited', 'celebratory']:
        voice = "Puck"  # Energetic
    elif excitement in ['intense', 'excited', 'building']:
        voice = "Fenrir"  # Professional but intense
    else:
        voice = "Leda"  # Warm, analytical
    
    try:
        print(f"[{event['index']:02d}] {excitement:15s}: {event['text'][:50]}...", end=" ", flush=True)
        
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
            print("✗ No audio data")
            return False
            
        audio_data = response.candidates[0].content.parts[0].inline_data.data
        
        save_pcm_as_wav(audio_data, wav_path)
        audio = AudioSegment.from_wav(wav_path)
        audio.export(str(output_path), format="mp3")
        os.remove(wav_path)
        
        duration_sec = len(audio) / 1000
        print(f"✓ ({duration_sec:.1f}s) [{voice}]")
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
    output_dir = Path("commentary_audio_v2")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Generating {len(COMMENTARY_EVENTS)} elite sportscaster commentary clips...")
    print(f"Model: {MODEL}")
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
    manifest = {
        "model": MODEL,
        "version": "elite_sportscaster",
        "total_clips": len(COMMENTARY_EVENTS),
        "generated": success_count,
        "files": [{"index": e["index"], "time": e["time"], "text": e["text"], 
                   "excitement": e["excitement"], "subjectId": e["subjectId"]} 
                  for e in COMMENTARY_EVENTS]
    }
    
    manifest_path = output_dir / "manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"Manifest: {manifest_path}")

if __name__ == "__main__":
    main()
