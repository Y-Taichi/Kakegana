import { PhysicsEngine } from './physics/engine';
import { createHiraganaBody, createAnchorPin } from './physics/bodyFactory';
import { ShinGoCharData } from './physics/shingoData';
import { Drawer } from './ui/drawer';
import { Overlay } from './ui/overlay';
import Matter from 'matter-js';

const { Body, Query } = Matter;

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

  // ドラッグ操作の状態
  private isDragging: boolean = false;
  private draggingChar: string | null = null;
  private draggingBody: Matter.Body | null = null;
  private dragTargetX: number = 0;
  private dragTargetY: number = 0;
  private prevDragX: number = 0;
  private prevDragY: number = 0;
  private dragAngle: number = 0;

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
      onSelectChar: (char, startX, startY) => {
        this.startDrag(char, startX - this.cameraX, startY - this.cameraY);
      }
    });

    this.overlay = new Overlay(this.container, {
      onRestart: () => {
        this.resetGame();
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
          y: Math.max(120, height * 0.16),
        });
      }
    };

    window.addEventListener('resize', resize);
    resize();
  }

  private resetGame() {
    this.isDropped = false;
    this.isDragging = false;
    this.draggingChar = null;
    this.draggingBody = null;
    this.dragAngle = 0;
    this.currentScore = 0;
    this.cameraX = 0;
    this.cameraY = 0;
    this.isPanning = false;

    this.drawer.resetState();
    this.overlay.resetScoreAnim();
    this.overlay.updateScore(this.currentScore);

    this.physics.clearAllDynamicBodies();

    if (this.anchorPin) {
      this.physics.removeBody(this.anchorPin);
    }
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.anchorPin = createAnchorPin(width / 2, Math.max(120, height * 0.16), 11);
    this.physics.addBody(this.anchorPin);
  }

  private setupInputEvents() {
    window.addEventListener('mousemove', (e) => {
      if (this.isDragging && this.draggingBody) {
        this.dragTargetX = e.clientX - this.cameraX;
        this.dragTargetY = e.clientY - this.cameraY;
      } else if (this.isPanning && this.isDropped) {
        this.cameraX = this.panBaseCamX + (e.clientX - this.panStartX);
        this.cameraY = this.panBaseCamY + (e.clientY - this.panStartY);
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (this.isDropped && !this.isDragging && e.button === 0) {
        this.isPanning = true;
        this.panStartX = e.clientX;
        this.panStartY = e.clientY;
        this.panBaseCamX = this.cameraX;
        this.panBaseCamY = this.cameraY;
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.dropChar();
      }
      this.isPanning = false;
    });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        if (this.isDragging && this.draggingBody) {
          this.dragTargetX = touch.clientX - this.cameraX;
          this.dragTargetY = touch.clientY - this.cameraY;
        } else if (this.isPanning && this.isDropped) {
          this.cameraX = this.panBaseCamX + (touch.clientX - this.panStartX);
          this.cameraY = this.panBaseCamY + (touch.clientY - this.panStartY);
        }
      }
    }, { passive: false });

    window.addEventListener('touchend', () => {
      if (this.isDragging) {
        this.dropChar();
      }
      this.isPanning = false;
    });

    // 角度が変わるのはマウスホイールを回した時だけ
    window.addEventListener('wheel', (e) => {
      if (this.isDragging && this.draggingBody) {
        e.preventDefault();
        this.dragAngle += Math.sign(e.deltaY) * 0.12;
        Body.setAngle(this.draggingBody, this.dragAngle);
      } else if (this.isDropped) {
        e.preventDefault();
        this.cameraY -= e.deltaY * 0.8;
      }
    }, { passive: false });
  }

  private startDrag(char: string, worldX: number, worldY: number) {
    if (this.isDropped) return;

    this.isDragging = true;
    this.draggingChar = char;
    this.dragTargetX = worldX;
    this.dragTargetY = worldY;
    this.prevDragX = worldX;
    this.prevDragY = worldY;
    this.dragAngle = 0;

    const bodyData = createHiraganaBody(char, worldX, worldY, 0, 1.0);
    if (bodyData) {
      this.draggingBody = bodyData.body;
      (this.draggingBody as any).gameData.isDragging = true;
      this.physics.addBody(this.draggingBody);
    }
  }

  /**
   * 【滑らかでいいかんじのドラッグ物理】
   * 固まって動かなくなったり下にずれたりせず、
   * 障害物のカーブに沿って滑らかに滑り、マウスを引けば自由に離れられる。
   */
  private updateDraggingPhysics() {
    if (!this.isDragging || !this.draggingBody) return;

    const body = this.draggingBody;
    const obstacles = this.physics.getBodies().filter((b) => b !== body);

    const targetX = this.dragTargetX;
    const targetY = this.dragTargetY;
    const dx = targetX - body.position.x;
    const dy = targetY - body.position.y;
    const dist = Math.hypot(dx, dy);

    // 障害物との接触状況を確認
    const cols = Query.collides(body, obstacles);
    const isTouching = cols.some((c) => c.depth > 0.05);

    if (!isTouching) {
      // 障害物に当たっていない自由空間では、直接キビキビとマウスに追従
      const followRatio = Math.min(dist * 0.45, 1.0);
      Body.setPosition(body, {
        x: body.position.x + dx * followRatio,
        y: body.position.y + dy * followRatio,
      });
      Body.setVelocity(body, {
        x: Math.max(Math.min(dx * 0.4, 16), -16),
        y: Math.max(Math.min(dy * 0.4, 16), -16),
      });
    } else {
      // 障害物に接触している時は、速度誘導（Velocity Spring）によって
      // 相手の輪郭のカーブに沿って滑らかに滑らせる！
      // 速度上限を15pxに制限することで、1サブステップあたり約1.2pxとなり壁を突き抜けて中に入ることは絶対に起きない
      const maxSpd = 15;
      const vx = Math.max(Math.min(dx * 0.45, maxSpd), -maxSpd);
      const vy = Math.max(Math.min(dy * 0.45, maxSpd), -maxSpd);
      Body.setVelocity(body, { x: vx, y: vy });

      // わずかなソフト分離（めり込みを滑らかに解消）
      for (const c of cols) {
        if (c.depth > 0.8) {
          const isA = (c.bodyA === body || c.bodyA.parent === body);
          const sign = isA ? 0.3 : -0.3;
          Body.setPosition(body, {
            x: body.position.x + c.normal.x * c.depth * sign,
            y: body.position.y + c.normal.y * c.depth * sign,
          });
        }
      }
    }

    Body.setAngle(body, this.dragAngle);
    Body.setAngularVelocity(body, 0);

    this.prevDragX = body.position.x;
    this.prevDragY = body.position.y;
  }

  private dropChar() {
    if (!this.isDragging || !this.draggingBody) return;

    const body = this.draggingBody;
    this.isDragging = false;
    this.draggingChar = null;
    this.draggingBody = null;

    (body as any).gameData.isDragging = false;

    // リリース時の初速を適度に落ち着かせる
    const vx = Math.max(Math.min(body.velocity.x * 0.3, 2), -2);
    const vy = Math.max(Math.min(body.velocity.y * 0.3, 2), -2);
    Body.setVelocity(body, { x: vx, y: vy });
    Body.setAngularVelocity(body, 0);

    this.updateScoreCount();
  }

  private updateScoreCount() {
    const bodies = this.physics.getBodies();
    const dynamicBodies = bodies.filter((b) => !b.isStatic && !(b as any).gameData?.isDragging);
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
    this.drawer.hideOnGameOver();
    this.overlay.triggerGameOverAnim();
  }

  private loop(currentTime: number) {
    const deltaMs = currentTime - this.lastTime;
    this.lastTime = currentTime;

    if (this.isDragging) {
      this.updateDraggingPhysics();
    }

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

    if (this.anchorPin) {
      this.drawAnchorPoint(ctx, this.anchorPin);
    }

    const bodies = this.physics.getBodies();
    for (const body of bodies) {
      if (body.isStatic) continue;
      this.drawShinGoBody(ctx, body);
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
}
