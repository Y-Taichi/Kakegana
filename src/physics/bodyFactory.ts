import Matter from 'matter-js';
import { SHINGO_DATA, ShinGoCharData, Point } from './shingoData';

const { Bodies, Body } = Matter;

export interface HiraganaBodyData {
  char: string;
  data: ShinGoCharData;
  color: string;
  body: Matter.Body;
  localCenter: Point;
}

/**
 * 新ゴ Regular のグリフ三角形メッシュから複合剛体（Compound Body）を生成する
 */
export function createHiraganaBody(
  char: string,
  x: number,
  y: number,
  angle = 0,
  scale = 1.0
): HiraganaBodyData | null {
  const data = SHINGO_DATA[char];
  if (!data) return null;

  const parts: Matter.Body[] = [];

  for (const tri of data.triangles) {
    const p1 = { x: tri[0] * scale, y: tri[1] * scale };
    const p2 = { x: tri[2] * scale, y: tri[3] * scale };
    const p3 = { x: tri[4] * scale, y: tri[5] * scale };

    const tx = (p1.x + p2.x + p3.x) / 3;
    const ty = (p1.y + p2.y + p3.y) / 3;

    const triBody = Bodies.fromVertices(tx, ty, [[p1, p2, p3]], {
      friction: 0.95,
      frictionStatic: 1.2,
      restitution: 0.0,
      density: 0.003,
    });

    if (triBody) {
      parts.push(triBody);
    }
  }

  if (parts.length === 0) return null;

  const compoundBody = Body.create({
    parts: parts,
    friction: 0.95,
    frictionStatic: 1.2,
    frictionAir: 0.015,
    restitution: 0.0,
    density: 0.003,
  });

  const localCenter: Point = {
    x: compoundBody.position.x,
    y: compoundBody.position.y,
  };

  Body.setPosition(compoundBody, { x, y });
  Body.setAngle(compoundBody, angle);

  (compoundBody as any).gameData = {
    char,
    data,
    scale,
    localCenter,
    color: '#ffffff', // 真っ白
    spawnTime: performance.now(),
    isDragging: false,
  };

  return {
    char,
    data,
    color: '#ffffff',
    body: compoundBody,
    localCenter,
  };
}

/**
 * 支点となる「1つの白の点」
 * 装飾や突起のない、純粋な円形剛体
 */
export function createAnchorPin(x: number, y: number, radius = 12): Matter.Body {
  const pin = Bodies.circle(x, y, radius, {
    isStatic: true,
    friction: 1.0,
    frictionStatic: 1.4,
    restitution: 0.0,
  });

  (pin as any).gameData = {
    isAnchor: true,
    radius: radius,
  };

  return pin;
}
