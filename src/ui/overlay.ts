export interface OverlayCallbacks {
  onRestart: () => void;
  onConfirm: () => void;
  onRotate: () => void;
  onShareX: () => void;
}

export class Overlay {
  private container: HTMLElement;
  private rootEl!: HTMLElement;
  private scoreEl!: HTMLElement;
  private resetBtnEl!: HTMLElement;
  private confirmBtnEl!: HTMLElement;
  private rotateBtnEl!: HTMLElement;
  private actionControlsEl!: HTMLElement;
  private xShareBtnEl!: HTMLElement;
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
      <!-- 左上: 今かかっている数字 (72px ボールド) -->
      <div class="score-display" id="score-display">0</div>

      <!-- 右上: X (旧Twitter) シェアボタン (ゲームオーバー時に表示) -->
      <button class="x-share-btn hidden" id="x-share-btn" title="Xで結果を共有">
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      </button>

      <!-- 右下: 回転ボタン & 決定ボタン (ゲームオーバー時に隠れる) -->
      <div class="action-controls" id="action-controls">
        <button class="action-btn rotate-btn" id="rotate-btn" title="時計回りに30°回転">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path fill="currentColor" d="M15.55 5.55L11 1v3.07C7.06 4.56 4 7.92 4 12s3.05 7.44 7 7.93v-2.02c-2.84-.48-5-2.94-5-5.91s2.16-5.43 5-5.91V10l4.55-4.45zM19.93 11c-.17-1.39-.72-2.67-1.55-3.71l-1.42 1.42c.54.72.9 1.58 1.02 2.52h2.02c-.07-.08-.07-.15-.07-.23zm-2.97 5.29l1.42 1.42c.83-1.04 1.38-2.32 1.55-3.71h-2.02c-.12.94-.48 1.8-1.02 2.52s-.07.07.07-.23z"/>
          </svg>
          <span class="btn-subtext">30°</span>
        </button>
        <button class="action-btn confirm-btn" id="confirm-btn" title="実体化 (Enter)">
          <svg viewBox="0 0 24 24" width="24" height="24">
            <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          <span class="btn-subtext">決定</span>
        </button>
      </div>

      <!-- 下端: クルクルしたアイコン + Space丸枠 (最初から) -->
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
    this.confirmBtnEl = this.rootEl.querySelector('#confirm-btn')!;
    this.rotateBtnEl = this.rootEl.querySelector('#rotate-btn')!;
    this.actionControlsEl = this.rootEl.querySelector('#action-controls')!;
    this.xShareBtnEl = this.rootEl.querySelector('#x-share-btn')!;
  }

  private bindEvents() {
    // リセット
    this.resetBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onRestart();
    });

    // 決定
    this.confirmBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onConfirm();
    });

    // 回転
    this.rotateBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onRotate();
    });

    // X共有
    this.xShareBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onShareX();
    });

    // キーボード操作 (Space: リセット, Enter: 決定)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this.callbacks.onRestart();
      } else if (e.code === 'Enter') {
        e.preventDefault();
        this.callbacks.onConfirm();
      }
    });
  }

  public updateScore(score: number) {
    this.scoreEl.textContent = score.toString();
  }

  /**
   * ゴースト文字を保持している時の操作ボタンのアクティブ化
   */
  public setActionControlsActive(active: boolean) {
    if (active) {
      this.actionControlsEl.classList.add('active');
    } else {
      this.actionControlsEl.classList.remove('active');
    }
  }

  /**
   * ゲームオーバー時：
   * 決定ボタンと回転ボタンを隠し、右上にXボタンを表示
   */
  public onGameOver() {
    this.scoreEl.classList.remove('game-over-anim');
    void this.scoreEl.offsetWidth;
    this.scoreEl.classList.add('game-over-anim');

    // 右下のボタンを隠す
    this.actionControlsEl.classList.add('hidden');

    // 右上のXボタンを表示
    this.xShareBtnEl.classList.remove('hidden');
  }

  /**
   * リセット時
   */
  public onReset() {
    this.scoreEl.classList.remove('game-over-anim');
    this.actionControlsEl.classList.remove('hidden');
    this.actionControlsEl.classList.remove('active');
    this.xShareBtnEl.classList.add('hidden');
  }
}
