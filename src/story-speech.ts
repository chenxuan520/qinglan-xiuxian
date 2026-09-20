export class StorySpeech {
  private utterance: SpeechSynthesisUtterance | null = null;
  private onState: (state: 'speaking' | 'idle' | 'unavailable') => void;
  constructor(onState: (state: 'speaking' | 'idle' | 'unavailable') => void) {
    this.onState = onState;
    if (this.supported) speechSynthesis.getVoices();
  }
  get supported() {
    return (
      typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'
    );
  }
  stop() {
    if (!this.utterance) return;
    this.utterance = null;
    speechSynthesis.cancel();
    this.onState('idle');
  }
  play(text: string, volume: number) {
    this.stop();
    if (!this.supported) return this.onState('unavailable');
    const voices = speechSynthesis.getVoices().filter((voice) => /^zh(?:-|_)/i.test(voice.lang));
    const voice = voices.find((v) => v.lang === 'zh-CN' && v.localService) ?? voices[0];
    if (!voice) return this.onState('unavailable');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.volume = Math.max(0, Math.min(1, volume));
    utterance.rate = 0.9;
    const finish = (state: 'idle' | 'unavailable') => {
      if (this.utterance !== utterance) return;
      this.utterance = null;
      this.onState(state);
    };
    utterance.onend = () => finish('idle');
    utterance.onerror = () => finish('unavailable');
    this.utterance = utterance;
    try {
      this.onState('speaking');
      speechSynthesis.speak(utterance);
    } catch {
      finish('unavailable');
    }
  }
}
