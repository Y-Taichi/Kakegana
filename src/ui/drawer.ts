import { HIRAGANA_GRID } from '../physics/shingoData';

export interface DrawerCallbacks {
  onSelectChar: (char: string, startX: number, startY: number) => void;
}

export class Drawer {
  private container: HTMLElement;
  private drawerEl!: HTMLElement;
  private isHovered: boolean = false;
  private callbacks: DrawerCallbacks;
  private isLocked: boolean = false;

  constructor(container: HTMLElement, callbacks: DrawerCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.render();
    this.bindEvents();
  }

  private render() {
    this.drawerEl = document.createElement('div');
    this.drawerEl.className = 'drawer-container';

    let gridHtml = '';
    for (let c = 0; c < HIRAGANA_GRID.length; c++) {
      const col = HIRAGANA_GRID[c];
      gridHtml += `<div class="kana-col">`;
      for (let r = 0; r < col.length; r++) {
        const char = col[r];
        if (char) {
          gridHtml += `<div class="kana-item" data-char="${char}">${char}</div>`;
        } else {
          gridHtml += `<div class="kana-empty"></div>`;
        }
      }
      gridHtml += `</div>`;
    }

    this.drawerEl.innerHTML = `
      <div class="drawer-panel">
        <div class="drawer-grid">
          ${gridHtml}
        </div>
      </div>
      <div class="drawer-handle" id="drawer-handle">
        <div class="handle-bar"></div>
      </div>
    `;

    this.container.appendChild(this.drawerEl);
  }

  private bindEvents() {
    this.drawerEl.addEventListener('mouseenter', () => {
      if (this.isLocked) return;
      this.isHovered = true;
      this.updateOpenState();
    });

    this.drawerEl.addEventListener('mouseleave', () => {
      this.isHovered = false;
      this.updateOpenState();
    });

    const kanaItems = this.drawerEl.querySelectorAll<HTMLElement>('.kana-item');
    kanaItems.forEach((item) => {
      item.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || this.isLocked) return;
        const char = item.getAttribute('data-char');
        if (char) {
          e.preventDefault();
          this.callbacks.onSelectChar(char, e.clientX, e.clientY);
          this.close();
        }
      });

      item.addEventListener('touchstart', (e) => {
        if (this.isLocked) return;
        const touch = e.touches[0];
        const char = item.getAttribute('data-char');
        if (char && touch) {
          e.preventDefault();
          this.callbacks.onSelectChar(char, touch.clientX, touch.clientY);
          this.close();
        }
      }, { passive: false });
    });
  }

  private updateOpenState() {
    if (this.isHovered && !this.isLocked) {
      this.drawerEl.classList.add('open');
    } else {
      this.drawerEl.classList.remove('open');
    }
  }

  public close() {
    this.isHovered = false;
    this.drawerEl.classList.remove('open');
  }

  /**
   * ゲームオーバー時に線ごとすべて左側に隠れて見えなくなるようにアニメーション
   */
  public hideOnGameOver() {
    this.isLocked = true;
    this.isHovered = false;
    this.drawerEl.classList.remove('open');
    this.drawerEl.classList.add('game-over-hide');
  }

  /**
   * リセット時に再表示
   */
  public resetState() {
    this.isLocked = false;
    this.isHovered = false;
    this.drawerEl.classList.remove('open');
    this.drawerEl.classList.remove('game-over-hide');
  }
}
