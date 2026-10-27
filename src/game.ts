import { PhysicsEngine } from './physics/engine';
import { createHiraganaBody, createAnchorPin } from './physics/bodyFactory';
import { SHINGO_DATA, ShinGoCharData, Point } from './physics/shingoData';
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

  // 重なり検知用のセンサー剛体
  private ghostSensorBody: Matter.Body | null = null;
  private ghostLocalCenter: Point = { x: 0, y: 0 };
  private isGhostOverlapping: boolean = false;

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
      onSelectChar: (char, clientX, clientY) => {
        this.selectGhostChar(char, clientX, clientY);
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
    this.ghostSensorBody = null;
    this.ghostLocalCenter = { x: 0, y: 0 };
    this.isHoldingGhost = false;
    this.isPointerDown = false;
    this.isGhostOverlapping = false;
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
   * 50音表から文字を選んだ時
   */
  private selectGhostChar(char: string, clientX: number, clientY: number) {
    if (this.isDropped) return;

    this.ghostChar = char;
    this.ghostAngle = 0;
    this.isHoldingGhost = true;
    this.isPointerDown = false; // ドロワーのタップ/クリック完了時は指が離れている状態

    const width = window.innerWidth;
    const height = window.innerHeight;
    const anchorY = Math.max(110, height * 0.16);

    // ドロワー（画面左端）から選んだ場合は、支点のすぐ下の見やすい中央位置にスポーン
    if (clientX < 340) {
      this.ghostX = width / 2;
      this.ghostY = anchorY + 115;
    } else {
      this.ghostX = clientX - this.cameraX;
      this.ghostY = clientY - this.cameraY;
    }

    this.pointerGrabOffsetX = 0;
    this.pointerGrabOffsetY = 0;

    // 重なり検知用のセンサーボディを作成（ワールドには追加せず衝突判定のみで使用）
    const bodyData = createHiraganaBody(char, this.ghostX, this.ghostY, 0, 1.0);
    if (bodyData) {
      this.ghostSensorBody = bodyData.body;
      (this.ghostSensorBody as any).isSensor = true;
      this.ghostLocalCenter = bodyData.localCenter;
    } else {
      this.ghostLocalCenter = { x: 0, y: 0 };
    }

    this.overlay.setActionControlsActive(true);
    this.checkOverlap();
  }

  /**
   * 時計回りに回転
   */
  private rotateGhost(angleDelta: number) {
    if (!this.ghostChar || !this.ghostSensorBody) return;
    this.ghostAngle += angleDelta;
    this.checkOverlap();
  }

  /**
   * 既存の文字・ピンとの重なりチェック
   */
  private checkOverlap() {
    if (!this.ghostSensorBody) {
      this.isGhostOverlapping = false;
      this.overlay.setConfirmEnabled(true);
      return;
    }

    Body.setPosition(this.ghostSensorBody, { x: this.ghostX, y: this.ghostY });
    Body.setAngle(this.ghostSensorBody, this.ghostAngle);

    const obstacles = this.physics.getBodies();
    this.isGhostOverlapping = this.isBodyOverlapping(this.ghostSensorBody, obstacles);

    // 重なっている時は決定ボタンを無効化
    this.overlay.setConfirmEnabled(!this.isGhostOverlapping);
  }

  /**
   * 複合剛体の実メッシュパーツ（三角形単位）での精密な重なり判定
   * parts[0] の凸包（Convex Hull）を除外することで、文字の空洞やフック部分に
   * ピンや文字が入っても誤判定（赤色警告）が発生しないようにする
   */
  private isBodyOverlapping(ghostBody: Matter.Body, obstacles: Matter.Body[]): boolean {
    const ghostParts = ghostBody.parts.length > 1 ? ghostBody.parts.slice(1) : [ghostBody];

    for (let o = 0; o < obstacles.length; o++) {
      const obstacle = obstacles[o];
      if (obstacle === ghostBody) continue;

      // 剛体全体のバウンディングボックスが交差していなければスキップ
      if (!Matter.Bounds.overlaps(ghostBody.bounds, obstacle.bounds)) {
        continue;
      }

      // 障害物のパーツ（凸包 parts[0] を除外した実パーツ）
      const obstacleParts = obstacle.parts.length > 1 ? obstacle.parts.slice(1) : [obstacle];

      for (let i = 0; i < ghostParts.length; i++) {
        const gp = ghostParts[i];
        for (let j = 0; j < obstacleParts.length; j++) {
          const op = obstacleParts[j];
          if (Matter.Bounds.overlaps(gp.bounds, op.bounds)) {
            const col = Matter.Collision.collides(gp, op, undefined as any);
            if (col && col.collided && col.depth > 0.6) {
              return true; // 実際の画線（ストローク）同士がめり込んでいる
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * 決定ボタン / Enterキー押下で実体化（投下）
   */
  private confirmAndMaterialize() {
    // 重なりがある場合は絶対に配置させない！
    if (this.isDropped || !this.ghostChar || this.isGhostOverlapping) return;

    const char = this.ghostChar;
    const x = this.ghostX;
    const y = this.ghostY;
    const angle = this.ghostAngle;

    // ゴースト状態を解除し、即座に操作不能に
    this.ghostChar = null;
    this.ghostSensorBody = null;
    this.isHoldingGhost = false;
    this.isPointerDown = false;
    this.isGhostOverlapping = false;
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

  private shareOnX() {
    const text = `${this.currentScore}個のひらがなを引っ掛けました！#かけがな `;
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(tweetUrl, '_blank', 'noopener,noreferrer');
  }

  private setupInputEvents() {
    const getPointerWorldPos = (clientX: number, clientY: number) => {
      return {
        x: clientX - this.cameraX,
        y: clientY - this.cameraY,
      };
    };

    const handlePointerDown = (clientX: number, clientY: number) => {
      if (this.isDropped) {
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
        this.pointerGrabOffsetX = this.ghostX - p.x;
        this.pointerGrabOffsetY = this.ghostY - p.y;
      }
    };

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
        this.checkOverlap();
      }
    };

    const handlePointerUp = () => {
      this.isPointerDown = false;
      this.isPanning = false;
    };

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

    window.addEventListener('wheel', (e) => {
      if (this.isHoldingGhost) {
        e.preventDefault();
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

  private triggerDrop() {
    this.isDropped = true;
    this.ghostChar = null;
    this.ghostSensorBody = null;
    this.isHoldingGhost = false;

    this.drawer.hideOnGameOver();
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

    // ゴースト状態の文字（重なり時は薄い赤色、安全時は半透明白）
    if (this.ghostChar && this.isHoldingGhost) {
      this.drawGhostChar(ctx, this.ghostChar, this.ghostX, this.ghostY, this.ghostAngle, this.isGhostOverlapping);
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
   * ゴースト（幽霊状態）の描画
   * 重なっている時は赤色警告、安全な時は美しい半透明白
   */
  private drawGhostChar(
    ctx: CanvasRenderingContext2D,
    char: string,
    x: number,
    y: number,
    angle: number,
    isOverlapping: boolean
  ) {
    const charData = SHINGO_DATA[char];
    if (!charData) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.translate(-this.ghostLocalCenter.x, -this.ghostLocalCenter.y);

    if (isOverlapping) {
      // 重なり警告カラー（配置不可）
      ctx.fillStyle = 'rgba(255, 75, 75, 0.45)';
      ctx.strokeStyle = 'rgba(255, 95, 95, 0.8)';
    } else {
      // 安全な配置可能カラー
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    }

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

    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.restore();
  }
}
