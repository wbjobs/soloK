export class AlertAudioService {
  private audioContext: AudioContext | null = null;
  private volume: number = 0.5;
  private isPlaying: boolean = false;

  initialize() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  playAlert(type: string) {
    if (!this.audioContext) {
      this.initialize();
    }

    if (!this.audioContext || this.isPlaying) return;

    this.isPlaying = true;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    switch (type) {
      case 'fall':
        oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, this.audioContext.currentTime + 0.5);
        break;
      case 'retrograde':
        oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime);
        oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime + 0.25);
        oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.5);
        break;
      default:
        oscillator.frequency.setValueAtTime(700, this.audioContext.currentTime);
    }

    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(this.volume * 0.3, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 1);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 1);

    oscillator.onended = () => {
      this.isPlaying = false;
    };
  }

  speak(text: string) {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.volume = this.volume;
      utterance.rate = 1;
      window.speechSynthesis.speak(utterance);
    }
  }

  destroy() {
    this.audioContext?.close();
    this.audioContext = null;
  }
}
