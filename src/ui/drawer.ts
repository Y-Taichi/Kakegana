import { HIRAGANA_GRID } from '../physics/shingoData';

export interface DrawerCallbacks {
  onSelectChar: (char: string, startX: number, startY: number) => void;
}

export class Drawer {
  private container: HTMLElement;
  private drawerEl!: HTMLElement;
  private handleEl!: HTMLElement;
  private isOpen: boolean = false;
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
      <div class="drawer-handle" id="drawer-handle" role="button" aria-label="五十音表">
        <div class="handle-bar"></div>
      </div>
    `;

    this.container.appendChild(this.drawerEl);
    this.handleEl = this.drawerEl.querySelector('#drawer-handle')!;
  }

  private bindEvents() {
    // 1. PC向けホバー開閉 (マウス操作時)
    this.drawerEl.addEventListener('mouseenter', () => {
      if (this.isLocked) return;
      this.isOpen = true;
      this.updateOpenState();
    });

    this.drawerEl.addEventListener('mouseleave', () => {
      if (!this.isLocked) {
        this.isOpen = false;
        this.updateOpenState();
      }
    });

    // 2. スマホ＆クリック対応: 引き手（縦線）をタップ/クリックでトグル開閉
    // touchend/clickの二重発火やミリ秒差の誤トグルを完全に防止するデバウンス制御
    let lastToggleTs = 0;
    const handleToggle = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      const now = performance.now();
      if (now - lastToggleTs < 350) return;
      lastToggleTs = now;

      if (this.isLocked) return;
      this.isOpen = !this.isOpen;
      this.updateOpenState();
    };

    this.handleEl.addEventListener('pointerdown', handleToggle);
    this.handleEl.addEventListener('click', handleToggle);

    // ドロワー内部のタッチ・ポインター操作が背面のゲームキャンバス（ドラッグやスクロール）に貫通するのを防ぐ
    const stopPropagation = (e: Event) => {
      e.stopPropagation();
    };
    this.drawerEl.addEventListener('pointerdown', stopPropagation);
    this.drawerEl.addEventListener('mousedown', stopPropagation);
    this.drawerEl.addEventListener('touchstart', stopPropagation, { passive: true });

    // 3. 文字アイテムの選択（クリック & タッチ）
    const kanaItems = this.drawerEl.querySelectorAll<HTMLElement>('.kana-item');
    kanaItems.forEach((item) => {
      let lastSelectTs = 0;
      const selectChar = (e: Event, clientX: number, clientY: number) => {
        e.preventDefault();
        e.stopPropagation();
        const now = performance.now();
        if (now - lastSelectTs < 350) return;
        lastSelectTs = now;

        if (this.isLocked) return;
        const char = item.getAttribute('data-char');
        if (char) {
          this.callbacks.onSelectChar(char, clientX, clientY);
          this.close();
        }
      };

      item.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.button !== -1) return;
        selectChar(e, e.clientX, e.clientY);
      });

      item.addEventListener('click', (e) => {
        selectChar(e, e.clientX, e.clientY);
      });
    });

    // 4. 画面のどこかをタップ/クリックしたらドロワーを閉じる（スマホで閉じやすいように）
    const handleOutside = (e: Event) => {
      if (!this.isOpen || this.isLocked) return;
      const target = e.target as HTMLElement;
      if (target && !this.drawerEl.contains(target)) {
        this.close();
      }
    };
    window.addEventListener('pointerdown', handleOutside);
  }

  private updateOpenState() {
    if (this.isOpen && !this.isLocked) {
      this.drawerEl.classList.add('open');
    } else {
      this.drawerEl.classList.remove('open');
    }
  }

  public close() {
    this.isOpen = false;
    this.drawerEl.classList.remove('open');
  }

  public hideOnGameOver() {
    this.isLocked = true;
    this.isOpen = false;
    this.drawerEl.classList.remove('open');
    this.drawerEl.classList.add('game-over-hide');
  }

  public resetState() {
    this.isLocked = false;
    this.isOpen = false;
    this.drawerEl.classList.remove('open');
    this.drawerEl.classList.remove('game-over-hide');
  }
}
