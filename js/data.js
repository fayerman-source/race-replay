export const PRE_RACE_START_SECONDS = -46;

// Runner Data: anonymized demo data (first names only)
export const RUNNERS = [
  { id: 1, name: "MA", fullName: "Melodi", team: "Team Blue", age: 13, bib: 2, color: "#3B82F6", splits: [0, 32.94, 68.67, 105.05, 141.58] },
  { id: 2, name: "PD", fullName: "Parvati", team: "Team Red", age: 13, bib: 3, color: "#60A5FA", splits: [0, 33.86, 70.82, 108.62, 146.73] },
  { id: 3, name: "RM", fullName: "Reid", team: "Team Green", age: 13, bib: 5, color: "#93C5FD", splits: [0, 33.63, 71.49, 111.25, 149.88] },
  { id: 4, name: "EH", fullName: "Ephie", team: "Team Blue", age: 14, bib: 4, color: "#93C5FD", splits: [0, 34.52, 72.14, 110.78, 150.0] },
  { id: 5, name: "UD", fullName: "Uma", team: "Team Red", age: 13, bib: 6, color: "#6B7280", splits: [0, 35.31, 76.86, 122.48, 168.78] },
  { id: 6, name: "DW", fullName: "Demi", team: "Team Yellow", age: 13, bib: 8, color: "#6B7280", splits: [0, 38.74, 85.49, 135.17, 174.25] },
  { id: 7, name: "JR", fullName: "Jahzara", team: "Team Purple", age: 11, bib: 7, color: "#6B7280", splits: [0, 34.85, 76.55, 125.96, 178.73] },
  { id: 8, name: "SF", fullName: "Skye", team: "Flyers TC", age: 10, bib: 10, color: "#F97316", splits: [0, 41.53, 88.55, 136.83, 184.27], highlight: true },
  { id: 9, name: "MS", fullName: "Margeaux", team: "Team Orange", age: 10, bib: 9, color: "#9CA3AF", splits: [0, 42.87, 91.37, 144.0, 190.71] },
  { id: 10, name: "CH", fullName: "Cato", team: "Team Green", age: 10, bib: 11, color: "#9CA3AF", splits: [0, 42.25, 91.72, 144.35, 192.25] },
  { id: 11, name: "EM", fullName: "Emma", team: "Team Orange", age: 10, bib: 12, color: "#4B5563", splits: [0, 41.91, 92.76, 148.49, 206.0] }
];

// Audio clip metadata (indexed by audioIdx)
// Bib numbers: Melodi=2, Parvati=3, Reid=5, Skye=10, Margeaux=9
export const AUDIO_CLIPS = [
  { file: "commentary_anonymized/commentary_00_-5s.mp3", text: "Welcome to the 800 meter championship heat. Eleven runners on the line, ages 10 to 14. Watch for Melodi (2), the top seed. And Skye (10), just 10 years old racing against older athletes.", subjectId: null },
  { file: "commentary_anonymized/commentary_01_0s.mp3", text: "Runners set. Clean start. Melodi (2) immediately establishing position on the rail.", subjectId: null },
  { file: "commentary_anonymized/commentary_02_8s.mp3", text: "Melodi (2) out fast through the first hundred. Committing to a front-running strategy.", subjectId: 1 },
  { file: "commentary_anonymized/commentary_03_18s.mp3", text: "Field stringing out. Separation between front pack and chase group. This is where tactical decisions matter.", subjectId: null },
  { file: "commentary_anonymized/commentary_04_32s.mp3", text: "Thirty-two nine for Melodi (2) at the two hundred. Aggressive pacing. The question is whether she can hold this through the middle.", subjectId: 1 },
  { file: "commentary_anonymized/commentary_05_41s.mp3", text: "Now Skye (10) coming through the first two hundred. Forty-one flat. Smart controlled start. Eight seconds back, not pulled out by the fast early pace.", subjectId: 8 },
  { file: "commentary_anonymized/commentary_06_52s.mp3", text: "Middle pack feeling the gap. Parvati (3) and Reid (5) trying to hold contact with Melodi (2) but she's pulling away. Decision point: go with the leader or run your own race.", subjectId: 2 },
  { file: "commentary_anonymized/commentary_07_60s.mp3", text: "Four hundred meters. Melodi (2) still commanding at one oh eight. The chase pack about five meters back.", subjectId: 1 },
  { file: "commentary_anonymized/commentary_08_68s.mp3", text: "One oh eight at the bell for Melodi (2). That was a thirty-five second lap. She's slowing. How much does she have left?", subjectId: 1 },
  { file: "commentary_anonymized/commentary_09_75s.mp3", text: "Here's where it gets interesting. Skye (10) just split one twenty-eight for the first four hundred. Negative split pacing. While others fade, she's maintaining.", subjectId: 8 },
  { file: "commentary_anonymized/commentary_10_88s.mp3", text: "Look at the separation. The field is completely strung out. Skye (10) sitting in eighth, twenty meters off the lead but perfect position to move up.", subjectId: 8 },
  { file: "commentary_anonymized/commentary_11_98s.mp3", text: "Six hundred meter mark. This is where the race is decided. Melodi's lead shrinking but she's still out front.", subjectId: null },
  { file: "commentary_anonymized/commentary_12_105s.mp3", text: "One forty-five for Melodi (2) through six hundred. She's paying for that early pace but still fighting. Can she hold on?", subjectId: 1 },
  { file: "commentary_anonymized/commentary_13_115s.mp3", text: "Skye (10) through six hundred in two sixteen. She's running people down. Closing on the field while others are tying up.", subjectId: 8 },
  { file: "commentary_anonymized/commentary_14_122s.mp3", text: "One hundred meters to go for Melodi (2). She's going to win this but watch the clock. Can she break two twenty-two?", subjectId: 1 },
  { file: "commentary_anonymized/commentary_15_130s.mp3", text: "Skye (10) flying now. Passing people. All that patience early is paying off. Moved up to eighth and still closing.", subjectId: 8 },
  { file: "commentary_anonymized/commentary_16_141s.mp3", text: "Two twenty-one fifty-eight for Melodi (2). Outstanding performance. She held on after going out hard.", subjectId: 1 },
  { file: "commentary_anonymized/commentary_17_148s.mp3", text: "But watch Skye (10) coming home. Still moving. Forty-seven second final lap after a controlled start. That's how you negative split an eight hundred.", subjectId: 8 },
  { file: "commentary_anonymized/commentary_18_165s.mp3", text: "Fifty meters to go for Skye (10). She's gutting it out. Holding her pace while the early leaders are done.", subjectId: 8 },
  { file: "commentary_anonymized/commentary_19_184s.mp3", text: "Three oh four twenty-seven. Massive personal record for Skye (10). Twenty second improvement. That negative split strategy executed perfectly.", subjectId: 8 },
  { file: "commentary_anonymized/commentary_20_191s.mp3", text: "Margeaux (9) crosses in three ten. Strong finish from the chase pack.", subjectId: 9 },
  { file: "commentary_anonymized/commentary_21_198s.mp3", text: "What a race. From Melodi's dominant front-running to Skye's brilliant negative split. Two different strategies, both executed beautifully.", subjectId: null }
];

// Runner checkpoint queue templates
export const RUNNER_CHECKPOINTS_TEMPLATE = {
  1: [
    { distance: 0, audioIdx: 1, desc: "Start" },
    { distance: 100, audioIdx: 2, desc: "First 100m" },
    { distance: 200, audioIdx: 4, desc: "200m split" },
    { distance: 380, audioIdx: 7, desc: "Approaching 400m" },
    { distance: 400, audioIdx: 8, desc: "400m bell" },
    { distance: 580, audioIdx: 11, desc: "600m approaching" },
    { distance: 600, audioIdx: 12, desc: "600m split" },
    { distance: 700, audioIdx: 14, desc: "Final 100m" },
    { distance: 800, audioIdx: 16, desc: "Finish" }
  ],
  8: [
    { distance: 200, audioIdx: 5, desc: "200m split" },
    { distance: 400, audioIdx: 9, desc: "400m split" },
    { distance: 600, audioIdx: 13, desc: "600m split" },
    { distance: 720, audioIdx: 15, desc: "Closing" },
    { distance: 750, audioIdx: 17, desc: "Final analysis" },
    { distance: 750, audioIdx: 18, desc: "50m to go" },
    { distance: 800, audioIdx: 19, desc: "Finish PR" }
  ],
  9: [
    { distance: 800, audioIdx: 20, desc: "Finish" }
  ]
};

// Global events template
export const GLOBAL_EVENTS_TEMPLATE = [
  { type: "time", trigger: PRE_RACE_START_SECONDS, audioIdx: 0, desc: "Pre-race intro" },
  { type: "distance", trigger: 130, audioIdx: 3, desc: "Field separation" },
  { type: "distance", trigger: 250, audioIdx: 6, desc: "Middle pack analysis" },
  { type: "distance", trigger: 450, audioIdx: 10, desc: "Field strung out" },
  { type: "time", trigger: 198, audioIdx: 21, desc: "Race summary" }
];
