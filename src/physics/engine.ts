import Matter from 'matter-js';

const { Engine, World, Composite, Body } = Matter;

export interface PhysicsEngineOptions {
  subSteps?: number;
  gravityY?: number;
  onCollision?: (impactVelocity: number, charA?: string, charB?: string) => void;
}

export class PhysicsEngine {
  public engine: Matter.Engine;
  public world: Matter.World;
  public subSteps: number;
  private onCollision?: (impactVelocity: number, charA?: string, charB?: string) => void;

  constructor(options: PhysicsEngineOptions = {}) {
    this.subSteps = options.subSteps || 12;
    this.onCollision = options.onCollision;

    this.engine = Engine.create({
      gravity: {
        x: 0,
        y: options.gravityY !== undefined ? options.gravityY : 1.1, // 適度な自然な重力
        scale: 0.001,
      },
      positionIterations: 24,
      velocityIterations: 24,
      constraintIterations: 10,
      enableSleeping: false, // 自前の速度減衰で制御
    });

    this.world = this.engine.world;
    this.setupCollisionEvents();
  }

  private setupCollisionEvents(): void {
    Matter.Events.on(this.engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        // 相対衝突速度の計算
        const relVelX = bodyA.velocity.x - bodyB.velocity.x;
        const relVelY = bodyA.velocity.y - bodyB.velocity.y;
        const impactSpeed = Math.hypot(relVelX, relVelY);

        if (impactSpeed > 0.4 && this.onCollision) {
          const charA = (bodyA.parent as any)?.gameData?.char;
          const charB = (bodyB.parent as any)?.gameData?.char;
          this.onCollision(impactSpeed, charA, charB);
        }
      }
    });
  }

  /**
   * 1フレーム分の物理更新（多重サブステップとフェイルセーフクランプ）
   */
  public update(deltaTimeMs: number): void {
    // 予期せぬ巨大フレーム飛び（ブラウザタブバックグラウンド等）の保護
    const clampedDelta = Math.min(deltaTimeMs, 34); // 最大約30fps相当までに制限
    const stepDt = clampedDelta / this.subSteps;

    for (let i = 0; i < this.subSteps; i++) {
      Engine.update(this.engine, stepDt);
      this.clampAndDampBodies();
    }
  }

  /**
   * 物理発散・激しい振動・どこかへ吹っ飛ぶ挙動を完全に防ぐフェイルセーフ処理
   */
  private clampAndDampBodies(): void {
    const bodies = Composite.allBodies(this.world);
    const MAX_VELOCITY = 20.0;       // 1サブステップあたりの最大移動速度
    const MAX_ANGULAR_VEL = 0.15;    // 最大角速度

    for (const body of bodies) {
      if (body.isStatic) continue;

      // 速度のクランプ
      const vx = body.velocity.x;
      const vy = body.velocity.y;
      const speed = Math.hypot(vx, vy);

      if (speed > MAX_VELOCITY) {
        const factor = MAX_VELOCITY / speed;
        Body.setVelocity(body, { x: vx * factor, y: vy * factor });
      }

      // 角速度のクランプ
      if (Math.abs(body.angularVelocity) > MAX_ANGULAR_VEL) {
        Body.setAngularVelocity(
          body,
          Math.sign(body.angularVelocity) * MAX_ANGULAR_VEL
        );
      }

      // 微小速度時のジッター防止（しっとりとした静止）
      if (speed < 0.04 && Math.abs(body.angularVelocity) < 0.002) {
        Body.setVelocity(body, { x: vx * 0.85, y: vy * 0.85 });
        Body.setAngularVelocity(body, body.angularVelocity * 0.85);
      }
    }
  }

  public addBody(body: Matter.Body): void {
    Composite.add(this.world, body);
  }

  public removeBody(body: Matter.Body): void {
    Composite.remove(this.world, body);
  }

  public clearAllDynamicBodies(): void {
    const bodies = Composite.allBodies(this.world);
    for (const b of bodies) {
      if (!b.isStatic) {
        Composite.remove(this.world, b);
      }
    }
  }

  public getBodies(): Matter.Body[] {
    return Composite.allBodies(this.world);
  }
}
