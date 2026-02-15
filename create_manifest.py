import json
import os

manifest = {
    "model": "gemini-2.5-pro-preview-tts",
    "version": "elite_sportscaster",
    "total_clips": 21,
    "generated": 21,
    "files": [
        {"index": 0, "time": 0, "text": "Runners set. Clean start off the waterfall. Melodi Ashford immediately establishing position on the rail.", "excitement": "calm", "subjectId": 1},
        {"index": 1, "time": 8, "text": "Ashford's out fast. Look at that turnover. She's running this like a four-hundred, risking the negative split but she's got the speed to hold it.", "excitement": "analytical", "subjectId": 1},
        {"index": 2, "time": 18, "text": "Field stringing out already. You can see the separation between the front pack and the chase group. This is where eight-hundred meter racing gets tactical.", "excitement": "analytical", "subjectId": None},
        {"index": 3, "time": 32, "text": "Thirty-two point nine for Ashford at the two-hundred. That's aggressive pacing. Real question is whether she can maintain this through the middle laps when lactate builds.", "excitement": "analytical", "subjectId": 1},
        {"index": 4, "time": 41, "text": "Now looking at Skye Fayerman coming through the first two hundred. Forty-one flat. Smart, controlled start. She's settling into her rhythm, not getting pulled out by the fast early pace. That's mature racing for a ten-year-old.", "excitement": "appreciative", "subjectId": 8},
        {"index": 5, "time": 52, "text": "Middle pack starting to feel the gap. Dabral and Macari trying to hold contact with Ashford but she's pulling away. When someone goes out this hard, you have to make an early decision: go with them or run your own race.", "excitement": "analytical", "subjectId": 2},
        {"index": 6, "time": 60, "text": "Four hundred meters in. Ashford still commanding but watch her form. Any breakdown in mechanics here will tell us if she went too fast. The chase pack including Dabral, Macari, and Hagen are about five meters back.", "excitement": "observational", "subjectId": 1},
        {"index": 7, "time": 68, "text": "One oh eight at the bell! Ashford's still rolling but that was a thirty-five second lap. She's slowing. The question now: how much does she have left for the final two hundred?", "excitement": "building", "subjectId": 1},
        {"index": 8, "time": 75, "text": "Here's where it gets interesting. Skye Fayerman just split one twenty-eight for the first four hundred. Negative split pacing. While others are fading, she's maintaining. That's diesel engine racing.", "excitement": "impressed", "subjectId": 8},
        {"index": 9, "time": 88, "text": "Look at the separation now! The field is completely strung out. This is what happens when someone pushes the pace early. The strong survive, the rest try to hang on. Fayerman sitting in eighth, perfect position to move up.", "excitement": "analytical", "subjectId": 8},
        {"index": 10, "time": 98, "text": "Six hundred meter mark coming up. This is where the race is decided. Ashford's hurting but she's still leading. Watch for anyone closing the gap.", "excitement": "building", "subjectId": 1},
        {"index": 11, "time": 105, "text": "One forty-five for Ashford! She's paying for that early pace but she's still fighting. That's championship mentality. When you commit to a fast start, you have to grit it out.", "excitement": "intense", "subjectId": 1},
        {"index": 12, "time": 115, "text": "Fayerman through six hundred in two sixteen! She's running people down! Look at her closing on the field while others are tying up. This is what aerobic strength looks like in an eight-hundred.", "excitement": "excited", "subjectId": 8},
        {"index": 13, "time": 122, "text": "One hundred meters to go for Ashford. She's gonna win this but watch the clock. Can she break two twenty-two? She's digging deep.", "excitement": "intense", "subjectId": 1},
        {"index": 14, "time": 130, "text": "Skye's flying now! She's passing people! Look at that kick! All that patience early is paying off. She's got another gear!", "excitement": "very_excited", "subjectId": 8},
        {"index": 15, "time": 141, "text": "Two twenty-one fifty-eight for Ashford! Outstanding performance! She held on after going out hard. That's how you run an eight-hundred when you've got the wheels!", "excitement": "celebratory", "subjectId": 1},
        {"index": 16, "time": 148, "text": "But watch Skye Fayerman coming home! She's still moving! Forty-seven second final lap after a controlled start! That's championship racing right there!", "excitement": "very_excited", "subjectId": 8},
        {"index": 17, "time": 165, "text": "Fifty meters to go for Skye! She's gutting it out! Look at that form holding together! This is what separates the good from the great!", "excitement": "maximum", "subjectId": 8},
        {"index": 18, "time": 184, "text": "Three oh four twenty-seven! That's a massive personal record for Skye Fayerman! Twenty second improvement! That negative split strategy was executed to perfection! What a race!", "excitement": "maximum", "subjectId": 8},
        {"index": 19, "time": 191, "text": "Margeaux Siriban crosses in three ten. Strong finish, solid closing speed. Good racing from the back of the field.", "excitement": "appreciative", "subjectId": 9},
        {"index": 20, "time": 198, "text": "What a race! From Ashford's dominant front-running to Fayerman's brilliant negative split! This is why we watch track and field!", "excitement": "celebratory", "subjectId": None}
    ]
}

with open("/home/elidev/.openclaw/workspace/circuit-race-replay/commentary_audio_v2/manifest.json", "w") as f:
    json.dump(manifest, f, indent=2)

print("Manifest created successfully!")
print(f"Total clips: {manifest['total_clips']}")
print(f"Generated: {manifest['generated']}")
