export interface OverlayCallbacks {
  onRestart: () => void;
}

export class Overlay {
  private container: HTMLElement;
  private rootEl!: HTMLElement;
  private scoreEl!: HTMLElement;
  private resetBtnEl!: HTMLElement;
  private callbacks: OverlayCallbacks;

  constructor(container: HTMLElement, callbacks: OverlayCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.render();
    this.bindEvents();
  }

  private render() {
    this.rootEl = document.createElement('div');
    this.rootEl.className = 'overlay-container';

    this.rootEl.innerHTML = `
      <!-- 上部: 今かかっている数字 (72px ボールド) -->
      <div class="score-display" id="score-display">0</div>

      <!-- 下端: クルクルしたアイコン + Space丸枠 -->
      <div class="bottom-reset-btn" id="bottom-reset-btn" role="button" tabindex="0">
        <svg class="reset-icon" viewBox="0 0 24 24" width="18" height="18">
          <path fill="currentColor" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
        </svg>
        <span class="space-capsule">Space</span>
      </div>
    `;

    this.container.appendChild(this.rootEl);
    this.scoreEl = this.rootEl.querySelector('#score-display')!;
    this.resetBtnEl = this.rootEl.querySelector('#bottom-reset-btn')!;
  }

  private bindEvents() {
    this.resetBtnEl.addEventListener('click', () => {
      this.callbacks.onRestart();
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this.callbacks.onRestart();
      }
    });
  }

  public updateScore(score: number) {
    this.scoreEl.textContent = score.toString();
  }

  /**
   * ゲームオーバー演出: 1.5倍即拡大 ＋ 一瞬真っ赤から徐々に白へ
   */
  public triggerGameOverAnim() {
    this.scoreEl.classList.remove('game-over-anim');
    void this.scoreEl.offsetWidth; // リフローを強制してアニメーション即時開始
    this.scoreEl.classList.add('game-over-anim');
  }

  /**
   * アニメーションのリセット
   */
  public resetScoreAnim() {
    this.scoreEl.classList.remove('game-over-anim');
  }
}
