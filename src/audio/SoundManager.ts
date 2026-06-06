const BASE_URL = import.meta.env.BASE_URL || '/';

/**
 * サウンド再生を管理するクラス (Web Audio API を使用して低遅延化)
 */
export class SoundManager {
  private static context: AudioContext | null = null;
  private static buffers: Map<string, AudioBuffer> = new Map();

  static async init() {
    if (this.context) return;
    
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // ロードする音源リスト
    const sounds = [
      { key: 'gako',  path: 'wav/gako.wav' },
      { key: 'bet',   path: 'wav/bet.mp3' },
      { key: 'start', path: 'wav/start.mp3' },
      { key: 'stop',  path: 'wav/stop.mp3' },
    ];

    for (const sound of sounds) {
      try {
        const response = await fetch(`${BASE_URL}${sound.path}`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
        this.buffers.set(sound.key, audioBuffer);
        console.log(`[SoundManager] ${sound.key} sound loaded.`);
      } catch (e) {
        console.error(`[SoundManager] Failed to load sound (${sound.key}):`, e);
      }
    }
  }

  /**
   * 指定したキーの音声を再生する
   */
  private static play(key: string) {
    if (!this.context || !this.buffers.has(key)) {
      // 未初期化の場合は初期化を試みる
      this.init();
      return;
    }

    if (this.context.state === 'suspended') {
      this.context.resume();
    }

    const source = this.context.createBufferSource();
    source.buffer = this.buffers.get(key)!;
    source.connect(this.context.destination);
    source.start(0);
  }

  /** ガコッ音を再生する */
  static playGako() {
    this.play('gako');
  }

  /** ベット音を再生する */
  static playBet() {
    this.play('bet');
  }

  /** レバーON音を再生する */
  static playStart() {
    this.play('start');
  }

  /** リール停止音を再生する */
  static playStop() {
    this.play('stop');
  }
}

