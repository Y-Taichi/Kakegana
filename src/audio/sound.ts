/**
 * 音は絶対にならない仕様のため、完全なダミークラス
 */
export class SoundManager {
  public toggleMute(): boolean { return true; }
  public getMuted(): boolean { return true; }
  public playHit(_intensity?: number) {}
  public playPickup() {}
  public playDrop() {}
  public playRotateTick() {}
  public playScoreMilestone() {}
  public playGameOver() {}
}
