import { Point, AttackDirection, PlayerMark, HomographyMatrix } from '../types';
import { transformPoint, inverseHomography } from './homography';

export function calculateOffsideLine(
  defenders: PlayerMark[],
  attackDirection: AttackDirection,
  homographyMatrix: HomographyMatrix | null,
  canvasWidth: number
): number | null {
  if (defenders.length < 2) return null;

  let sortedDefenders: PlayerMark[];
  
  if (homographyMatrix) {
    const inverseH = inverseHomography(homographyMatrix);
    if (inverseH) {
      const defendersWithRealX = defenders.map(d => {
        const realPoint = transformPoint(d.position, inverseH);
        return { ...d, realX: realPoint.x };
      });
    
      if (attackDirection === 'left-to-right') {
        sortedDefenders = defendersWithRealX.sort((a, b) => b.realX - a.realX);
      } else {
        sortedDefenders = defendersWithRealX.sort((a, b) => a.realX - b.realX);
      }
    } else {
      if (attackDirection === 'left-to-right') {
        sortedDefenders = [...defenders].sort((a, b) => b.position.x - a.position.x);
      } else {
        sortedDefenders = [...defenders].sort((a, b) => a.position.x - b.position.x);
      }
    }
  } else {
    if (attackDirection === 'left-to-right') {
      sortedDefenders = [...defenders].sort((a, b) => b.position.x - a.position.x);
    } else {
      sortedDefenders = [...defenders].sort((a, b) => a.position.x - b.position.x);
    }
  }

  const secondLastDefender = sortedDefenders[1];
  
  const halfFieldX = canvasWidth / 2;
  
  if (attackDirection === 'left-to-right') {
    return Math.max(secondLastDefender.position.x, halfFieldX);
  } else {
    return Math.min(secondLastDefender.position.x, halfFieldX);
  }
}

export function checkOffside(
  attacker: PlayerMark,
  offsideLineX: number,
  attackDirection: AttackDirection,
  homographyMatrix: HomographyMatrix | null
): boolean {
  if (homographyMatrix) {
    const inverseH = inverseHomography(homographyMatrix);
    if (inverseH) {
      const attackerReal = transformPoint(attacker.position, inverseH);
      const offsideLinePoint = { x: offsideLineX, y: attacker.position.y };
      const offsideLineReal = transformPoint(offsideLinePoint, inverseH);
      
      if (attackDirection === 'left-to-right') {
        return attackerReal.x > offsideLineReal.x;
      } else {
        return attackerReal.x < offsideLineReal.x;
      }
    }
  }
  
  if (attackDirection === 'left-to-right') {
    return attacker.position.x > offsideLineX;
  } else {
    return attacker.position.x < offsideLineX;
  }
}

export function getRealWorldCoordinates(
  point: Point,
  homographyMatrix: HomographyMatrix | null
): Point | null {
  if (!homographyMatrix) return null;
  
  const inverseH = inverseHomography(homographyMatrix);
  if (!inverseH) return null;
  return transformPoint(point, inverseH);
}
