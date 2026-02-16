export class AudioManager {
  constructor(audioClips, options = {}) {
    this.audioClips = audioClips;
    this.enabled = options.enabled !== false;
    this.audioElements = {};
    this.isPlaying = false;
    this.currentAudioIdx = -1;
    this.onEndedCallback = null;
    this.onErrorCallback = null;

    if (this.enabled) {
      this.preload();
    }
  }

  preload() {
    this.audioClips.forEach((clip, idx) => {
      const audio = new Audio(clip.file);
      audio.preload = "auto";
      audio.onended = () => {
        this.isPlaying = false;
        this.currentAudioIdx = -1;
        if (this.onEndedCallback) this.onEndedCallback();
      };
      audio.onerror = (e) => {
        console.warn(`Audio load error for clip ${idx}:`, e);
        this.isPlaying = false;
        this.currentAudioIdx = -1;
        if (this.onErrorCallback) this.onErrorCallback(e);
      };
      this.audioElements[idx] = audio;
    });
  }

  setOnEnded(callback) {
    this.onEndedCallback = callback;
  }

  setOnError(callback) {
    this.onErrorCallback = callback;
  }

  play(audioIdx) {
    if (!this.enabled) return false;
    if (this.isPlaying) return false;
    if (audioIdx < 0 || audioIdx >= this.audioClips.length) return false;

    const audio = this.audioElements[audioIdx];
    if (!audio) return false;

    this.isPlaying = true;
    this.currentAudioIdx = audioIdx;
    audio.currentTime = 0;
    
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((e) => {
        console.warn("Audio play failed:", e.message);
        this.isPlaying = false;
        this.currentAudioIdx = -1;
      });
    }
    
    return true;
  }

  stop() {
    if (!this.enabled) return;
    
    Object.values(this.audioElements).forEach((audio) => {
      if (!audio.paused) {
        audio.pause();
      }
      audio.currentTime = 0;
    });
    this.isPlaying = false;
    this.currentAudioIdx = -1;
  }

  stopAll() {
    this.stop();
  }

  isCurrentlyPlaying() {
    return this.isPlaying;
  }

  getCurrentAudioIdx() {
    return this.currentAudioIdx;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.stop();
    }
  }

  isEnabled() {
    return this.enabled;
  }
}
