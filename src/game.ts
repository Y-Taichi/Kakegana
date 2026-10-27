import { PhysicsEngine } from './physics/engine';
import { createHiraganaBody, createAnchorPin } from './physics/bodyFactory';
import { SHINGO_DATA, ShinGoCharData } from './physics/shingoData';
import { Drawer } from './ui/drawer';
import { Overlay } from './ui/overlay';
import Matter from 'matter-js';

const { Body } = Matter;

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLElement;

  private physics: PhysicsEngine;
  private drawer!: Drawer;
  private overlay!: Overlay;

  private anchorPin: Matter.Body | null = null;
  private currentScore: number = 0;
  private isDropped: boolean = false;

  // ゴースト状態（半透明の幽霊状態）
  private ghostChar: string | null = null;
  private ghostX: number = 0;
  private ghostY: number = 0;
  private ghostAngle: number = 0;
  private isHoldingGhost: boolean = false;
  private isPointerDown: boolean = false;
  private pointerGrabOffsetX: number = 0;
  private pointerGrabOffsetY: number = 0;

  // カメラ（落下後のスクロール/パン用）
  private cameraX: number = 0;
  private cameraY: number = 0;
  private isPanning: boolean = false;
  private panStartX: number = 0;
  private panStartY: number = 0;
  private panBaseCamX: number = 0;
  private panBaseCamY: number = 0;

  private lastTime: number = 0;
  private animationFrameId: number | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-canvas';
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d', { alpha: false })!;

    // 物理エンジン
    this.physics = new PhysicsEngine({
      subSteps: 12,
      gravityY: 1.25,
    });

    this.initUI();
    this.setupResize();
    this.setupInputEvents();
    this.resetGame();

    this.lastTime = performance.now();
    this.loop = this.loop.bind(this);
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  private initUI() {
    this.drawer = new Drawer(this.container, {
      onSelectChar: (char, startX, startY) => {
        this.selectGhostChar(char, startX - this.cameraX, startY - this.cameraY);
      }
    });

    this.overlay = new Overlay(this.container, {
      onRestart: () => {
        this.resetGame();
      },
      onConfirm: () => {
        this.confirmAndMaterialize();
      },
      onRotate: () => {
        // 30度ずつ時計回りに回転
        this.rotateGhost(Math.PI / 6);
      },
      onShareX: () => {
        this.shareOnX();
      }
    });
    this.overlay.updateScore(this.currentScore);
  }

  private setupResize() {
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;

      this.canvas.width = width * dpr;
      this.canvas.height = height * dpr;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;

      this.ctx.resetTransform?.();
      this.ctx.scale(dpr, dpr);

      if (this.anchorPin) {
        Body.setPosition(this.anchorPin, {
          x: width / 2,
          y: Math.max(110, height * 0.16),
        });
      }
    };

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    resize();
  }

  private resetGame() {
    this.isDropped = false;
    this.ghostChar = null;
    this.isHoldingGhost = false;
    this.isPointerDown = false;
    this.ghostAngle = 0;
    this.currentScore = 0;
    this.cameraX = 0;
    this.cameraY = 0;
    this.isPanning = false;

    this.drawer.resetState();
    this.overlay.onReset();
    this.overlay.updateScore(this.currentScore);

    this.physics.clearAllDynamicBodies();

    if (this.anchorPin) {
      this.physics.removeBody(this.anchorPin);
    }
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.anchorPin = createAnchorPin(width / 2, Math.max(110, height * 0.16), 11);
    this.physics.addBody(this.anchorPin);
  }

  /**
   * 50音表から文字を選んだ時（ゴーストの出現）
   */
  private selectGhostChar(char: string, worldX: number, worldY: number) {
    if (this.isDropped) return;

    this.ghostChar = char;
    this.ghostX = worldX;
    this.ghostY = worldY;
    this.ghostAngle = 0;
    this.isHoldingGhost = true;
    this.isPointerDown = true;
    this.pointerGrabOffsetX = 0;
    this.pointerGrabOffsetY = 0;

    // 操作ボタンのアクティブ化
    this.overlay.setActionControlsActive(true);
  }

  /**
   * 時計回りに回転
   */
  private rotateGhost(angleDelta: number) {
    if (!this.ghostChar) return;
    this.ghostAngle += angleDelta;
  }

  /**
   * 決定ボタン / Enterキー押下で実体化（投下）
   */
  private confirmAndMaterialize() {
    if (this.isDropped || !this.ghostChar) return;

    const char = this.ghostChar;
    const x = this.ghostX;
    const y = this.ghostY;
    const angle = this.ghostAngle;

    // ゴースト状態を解除し、即座に操作不能に
    this.ghostChar = null;
    this.isHoldingGhost = false;
    this.isPointerDown = false;
    this.overlay.setActionControlsActive(false);

    // 物理世界に実体として生成
    const bodyData = createHiraganaBody(char, x, y, angle, 1.0);
    if (bodyData) {
      Body.setVelocity(bodyData.body, { x: 0, y: 0 });
      Body.setAngularVelocity(bodyData.body, 0);
      this.physics.addBody(bodyData.body);

      this.updateScoreCount();
    }
  }

  /**
   * Xで結果をポスト
   */
  private shareOnX() {
    const text = `${this.currentScore}個のひらがなを引っ掛けました！#かけがな `;
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(tweetUrl, '_blank', 'noopener,noreferrer');
  }

  private setupInputEvents() {
    // ポインター座標のヘルパー
    const getPointerWorldPos = (clientX: number, clientY: number) => {
      return {
        x: clientX - this.cameraX,
        y: clientY - this.cameraY,
      };
    };

    // マウス / タッチ共通の開始処理
    const handlePointerDown = (clientX: number, clientY: number) => {
      if (this.isDropped) {
        // 落下後は画面全体のパンスクロール
        this.isPanning = true;
        this.panStartX = clientX;
        this.panStartY = clientY;
        this.panBaseCamX = this.cameraX;
        this.panBaseCamY = this.cameraY;
        return;
      }

      if (this.isHoldingGhost) {
        const p = getPointerWorldPos(clientX, clientY);
        this.isPointerDown = true;
        // ゴーストの中心とタッチ位置のオフセットを記録（自然なドラッグ感）
        this.pointerGrabOffsetX = this.ghostX - p.x;
        this.pointerGrabOffsetY = this.ghostY - p.y;
      }
    };

    // マウス / タッチ共通の移動処理
    const handlePointerMove = (clientX: number, clientY: number) => {
      if (this.isPanning && this.isDropped) {
        this.cameraX = this.panBaseCamX + (clientX - this.panStartX);
        this.cameraY = this.panBaseCamY + (clientY - this.panStartY);
        return;
      }

      if (this.isHoldingGhost && this.isPointerDown) {
        const p = getPointerWorldPos(clientX, clientY);
        this.ghostX = p.x + this.pointerGrabOffsetX;
        this.ghostY = p.y + this.pointerGrabOffsetY;
      }
    };

    // マウス / タッチ共通の終了処理（途中で離しても実体化しない！）
    const handlePointerUp = () => {
      this.isPointerDown = false;
      this.isPanning = false;
    };

    // マウスイベント
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        handlePointerDown(e.clientX, e.clientY);
      }
    });

    window.addEventListener('mousemove', (e) => {
      handlePointerMove(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', () => {
      handlePointerUp();
    });

    // タッチイベント（スマホ対応）
    window.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        handlePointerDown(touch.clientX, touch.clientY);
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        handlePointerMove(touch.clientX, touch.clientY);
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      handlePointerUp();
    }, { passive: true });

    // マウスホイール操作（ゴースト回転 & 落下後の上下スクロール）
    window.addEventListener('wheel', (e) => {
      if (this.isHoldingGhost) {
        e.preventDefault();
        // 30度刻みで回転
        this.rotateGhost(Math.sign(e.deltaY) * (Math.PI / 6));
      } else if (this.isDropped) {
        e.preventDefault();
        this.cameraY -= e.deltaY * 0.8;
      }
    }, { passive: false });
  }

  private updateScoreCount() {
    const bodies = this.physics.getBodies();
    const dynamicBodies = bodies.filter((b) => !b.isStatic);
    this.currentScore = dynamicBodies.length;
    this.overlay.updateScore(this.currentScore);
  }

  private checkDropEvent() {
    if (this.isDropped) return;

    const bodies = this.physics.getBodies();
    const height = window.innerHeight;
    const deadLineY = height + 40;

    for (const body of bodies) {
      if (body.isStatic) continue;

      if (body.position.y > deadLineY) {
        this.triggerDrop();
        break;
      }
    }
  }

  /**
   * ゲームオーバー発生時
   */
  private triggerDrop() {
    this.isDropped = true;
    this.ghostChar = null;
    this.isHoldingGhost = false;

    // 50音表を隠す
    this.drawer.hideOnGameOver();

    // 決定・回転ボタンを隠し、右上にXボタンを表示
    this.overlay.onGameOver();
  }

  private loop(currentTime: number) {
    const deltaMs = currentTime - this.lastTime;
    this.lastTime = currentTime;

    if (!this.isDropped) {
      this.physics.update(deltaMs);
      this.checkDropEvent();
    } else {
      this.physics.update(deltaMs);
    }

    this.render();
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  private render() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const ctx = this.ctx;

    ctx.fillStyle = '#0c0d10';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(this.cameraX, this.cameraY);

    // 支点
    if (this.anchorPin) {
      this.drawAnchorPoint(ctx, this.anchorPin);
    }

    // 実体化された物理文字（純白）
    const bodies = this.physics.getBodies();
    for (const body of bodies) {
      if (body.isStatic) continue;
      this.drawShinGoBody(ctx, body);
    }

    // ゴースト状態の文字（半透明の幽霊状態・干渉なし）
    if (this.ghostChar && this.isHoldingGhost) {
      this.drawGhostChar(ctx, this.ghostChar, this.ghostX, this.ghostY, this.ghostAngle);
    }

    ctx.restore();
  }

  private drawAnchorPoint(ctx: CanvasRenderingContext2D, pin: Matter.Body) {
    const x = pin.position.x;
    const y = pin.position.y;
    const r = (pin as any).gameData?.radius || 11;

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * 実体化された文字の描画
   */
  private drawShinGoBody(ctx: CanvasRenderingContext2D, body: Matter.Body) {
    const data = (body as any).gameData;
    if (!data || !data.data) return;

    const charData: ShinGoCharData = data.data;
    const localCenter = data.localCenter;

    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);
    ctx.translate(-localCenter.x, -localCenter.y);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (const contour of charData.contours) {
      if (contour.length === 0) continue;
      ctx.moveTo(contour[0].x, contour[0].y);
      for (let i = 1; i < contour.length; i++) {
        ctx.lineTo(contour[i].x, contour[i].y);
      }
      ctx.closePath();
    }
    ctx.fill('evenodd');

    ctx.restore();
  }

  /**
   * ゴースト（幽霊状態）の描画: 半透明の白い新ゴ文字
   */
  private drawGhostChar(ctx: CanvasRenderingContext2D, char: string, x: number, y: number, angle: number) {
    const charData = SHINGO_DATA[char];
    if (!charData) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // 半透明（幽霊状態）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.beginPath();
    for (const contour of charData.contours) {
      if (contour.length === 0) continue;
      ctx.moveTo(contour[0].x, contour[0].y);
      for (let i = 1; i < contour.length; i++) {
        ctx.lineTo(contour[i].x, contour[i].y);
      }
      ctx.closePath();
    }
    ctx.fill('evenodd');

    // 繊細な輪郭線
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.stroke();

    ctx.restore();
  }
}
