class SoundManager {
  constructor() {
    this.enabled = true;
    this.context = null;
    this.sounds = {};

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContext();
      this.initializeSounds();
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
      this.enabled = false;
    }
  }

  initializeSounds() {
    this.sounds = {
      buzz: () => this.createTone(800, 0.1, 'sine'),
      correct: () => this.createTone(523.25, 0.2, 'sine', true),
      incorrect: () => this.createTone(200, 0.3, 'sawtooth'),
      timer: () => this.createTone(440, 0.05, 'square'),
      reveal: () => this.createSweep(200, 800, 0.3),
      dailyDouble: () => this.createArpeggio([523.25, 659.25, 783.99], 0.15),
      finalJeopardy: () => this.createArpeggio([392, 493.88, 587.33, 783.99], 0.2),
      join: () => this.createTone(659.25, 0.1, 'sine'),
      select: () => this.createTone(440, 0.05, 'sine')
    };
  }

  createTone(frequency, duration, type = 'sine', withHarmony = false) {
    if (!this.enabled || !this.context) return;

    const oscillator = this.context.createOscillator();
    const gainNode = this.context.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.context.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    gainNode.gain.setValueAtTime(0.3, this.context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration);

    oscillator.start(this.context.currentTime);
    oscillator.stop(this.context.currentTime + duration);

    if (withHarmony) {
      const harmony = this.context.createOscillator();
      const harmonyGain = this.context.createGain();

      harmony.connect(harmonyGain);
      harmonyGain.connect(this.context.destination);

      harmony.frequency.value = frequency * 1.5;
      harmony.type = 'sine';

      harmonyGain.gain.setValueAtTime(0.15, this.context.currentTime);
      harmonyGain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration);

      harmony.start(this.context.currentTime);
      harmony.stop(this.context.currentTime + duration);
    }
  }

  createSweep(startFreq, endFreq, duration) {
    if (!this.enabled || !this.context) return;

    const oscillator = this.context.createOscillator();
    const gainNode = this.context.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.context.destination);

    oscillator.frequency.setValueAtTime(startFreq, this.context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(endFreq, this.context.currentTime + duration);

    gainNode.gain.setValueAtTime(0.3, this.context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration);

    oscillator.start(this.context.currentTime);
    oscillator.stop(this.context.currentTime + duration);
  }

  createArpeggio(frequencies, duration) {
    if (!this.enabled || !this.context) return;

    frequencies.forEach((freq, index) => {
      setTimeout(() => {
        this.createTone(freq, duration, 'sine');
      }, index * 50);
    });
  }

  play(soundName) {
    if (this.enabled && this.sounds[soundName]) {
      if (this.context.state === 'suspended') {
        this.context.resume();
      }
      this.sounds[soundName]();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}

const soundManager = new SoundManager();