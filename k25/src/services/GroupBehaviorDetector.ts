import { PoseResult } from '../types';
import { calculateBoundingBox } from '../utils/geometry';
import { FlowVector } from '../utils/opticalFlow';

export type GroupEventType = 'overcrowding' | 'pushing' | 'panic';

export interface GroupEvent {
  type: GroupEventType;
  timestamp: number;
  confidence: number;
  personCount: number;
  density: number;
  description: string;
  boundingBox: { x: number; y: number; width: number; height: number };
}

interface PersonVelocity {
  personId: string;
  centerX: number;
  centerY: number;
  vx: number;
  vy: number;
  speed: number;
}

export class GroupBehaviorDetector {
  private personHistory: Map<string, { x: number; y: number; timestamp: number }[]> = new Map();
  private lastGroupAlertTime: number = 0;
  private groupAlertCooldown: number = 10000;

  private settings = {
    maxDensityPerSqm: 3,
    pushSpeedThreshold: 1.5,
    pushAccelerationThreshold: 2.0,
    chaosThreshold: 0.6,
    minPeopleForGroup: 2,
    frameArea: 1.0
  };

  updateSettings(settings: Partial<typeof this.settings>) {
    this.settings = { ...this.settings, ...settings };
  }

  detect(
    poses: PoseResult[],
    flowVectors: FlowVector[],
    frameWidth: number,
    frameHeight: number
  ): GroupEvent | null {
    const now = Date.now();

    if (now - this.lastGroupAlertTime < this.groupAlertCooldown) {
      return null;
    }

    if (poses.length < this.settings.minPeopleForGroup) {
      return null;
    }

    const personPositions = poses.map((pose, index) => {
      const bbox = calculateBoundingBox(pose.keypoints);
      return {
        id: `person_${index}`,
        centerX: bbox.x + bbox.width / 2,
        centerY: bbox.y + bbox.height / 2,
        keypoints: pose.keypoints,
        bbox
      };
    });

    const velocities = this.calculateVelocities(personPositions);

    const density = this.calculateDensity(personPositions, frameWidth, frameHeight);

    if (density > this.settings.maxDensityPerSqm) {
      const overcrowdingEvent: GroupEvent = {
        type: 'overcrowding',
        timestamp: now,
        confidence: Math.min(1, density / (this.settings.maxDensityPerSqm * 2)),
        personCount: poses.length,
        density,
        description: `人群密度过高: ${density.toFixed(1)}人/㎡`,
        boundingBox: this.getGroupBoundingBox(personPositions)
      };

      this.lastGroupAlertTime = now;
      return overcrowdingEvent;
    }

    const pushingResult = this.detectPushing(velocities, personPositions);
    if (pushingResult) {
      this.lastGroupAlertTime = now;
      return pushingResult;
    }

    const panicResult = this.detectPanic(flowVectors, velocities, personPositions);
    if (panicResult) {
      this.lastGroupAlertTime = now;
      return panicResult;
    }

    return null;
  }

  private calculateVelocities(
    positions: { id: string; centerX: number; centerY: number }[]
  ): PersonVelocity[] {
    const now = Date.now();
    const velocities: PersonVelocity[] = [];

    positions.forEach(pos => {
      const history = this.personHistory.get(pos.id) || [];
      
      history.push({ x: pos.centerX, y: pos.centerY, timestamp: now });
      
      if (history.length > 10) {
        history.shift();
      }

      this.personHistory.set(pos.id, history);

      if (history.length >= 2) {
        const recent = history.slice(-5);
        let totalVx = 0;
        let totalVy = 0;
        let validPoints = 0;

        for (let i = 1; i < recent.length; i++) {
          const dt = (recent[i].timestamp - recent[i - 1].timestamp) / 1000;
          if (dt > 0) {
            totalVx += (recent[i].x - recent[i - 1].x) / dt;
            totalVy += (recent[i].y - recent[i].y) / dt;
            validPoints++;
          }
        }

        if (validPoints > 0) {
          const vx = totalVx / validPoints;
          const vy = totalVy / validPoints;
          const speed = Math.sqrt(vx * vx + vy * vy);

          velocities.push({
            personId: pos.id,
            centerX: pos.centerX,
            centerY: pos.centerY,
            vx,
            vy,
            speed
          });
        }
      }
    });

    return velocities;
  }

  private calculateDensity(
    _positions: { id: string; centerX: number; centerY: number; bbox: { width: number; height: number } }[],
    frameWidth: number,
    frameHeight: number
  ): number {
    if (_positions.length === 0) return 0;

    const frameArea = frameWidth * frameHeight;

    const estimatedSqm = this.settings.frameArea * (frameArea / (frameHeight * frameHeight));

    return _positions.length / Math.max(estimatedSqm, 0.1);
  }

  private detectPushing(
    velocities: PersonVelocity[],
    _positions: { id: string; centerX: number; centerY: number }[]
  ): GroupEvent | null {
    if (velocities.length < 2) return null;

    for (let i = 0; i < velocities.length; i++) {
      for (let j = i + 1; j < velocities.length; j++) {
        const v1 = velocities[i];
        const v2 = velocities[j];

        const distance = Math.sqrt(
          Math.pow(v1.centerX - v2.centerX, 2) + 
          Math.pow(v1.centerY - v2.centerY, 2)
        );

        if (distance < 0.15) {
          const relativeSpeed = Math.sqrt(
            Math.pow(v1.vx - v2.vx, 2) + 
            Math.pow(v1.vy - v2.vy, 2)
          );

          if (relativeSpeed > this.settings.pushSpeedThreshold) {
            return {
              type: 'pushing',
              timestamp: Date.now(),
              confidence: Math.min(1, relativeSpeed / 4),
              personCount: velocities.length,
              density: velocities.length,
              description: `检测到推挤行为: 相对速度${relativeSpeed.toFixed(1)}`,
              boundingBox: {
                x: Math.min(v1.centerX, v2.centerX) - 0.1,
                y: Math.min(v1.centerY, v2.centerY) - 0.1,
                width: Math.abs(v1.centerX - v2.centerX) + 0.2,
                height: Math.abs(v1.centerY - v2.centerY) + 0.2
              }
            };
          }
        }
      }
    }

    return null;
  }

  private detectPanic(
    flowVectors: FlowVector[],
    velocities: PersonVelocity[],
    positions: { id: string; centerX: number; centerY: number }[]
  ): GroupEvent | null {
    if (flowVectors.length === 0 || velocities.length < 2) return null;

    const directionVectors: { x: number; y: number }[] = [];

    flowVectors.forEach(vec => {
      const magnitude = Math.sqrt(vec.u * vec.u + vec.v * vec.v);
      if (magnitude > 5) {
        directionVectors.push({ x: vec.u / magnitude, y: vec.v / magnitude });
      }
    });

    velocities.forEach(v => {
      const magnitude = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
      if (magnitude > 0.5) {
        directionVectors.push({ x: v.vx / magnitude, y: v.vy / magnitude });
      }
    });

    if (directionVectors.length < 5) return null;

    let totalAngleVariance = 0;
    let count = 0;

    for (let i = 0; i < directionVectors.length; i++) {
      for (let j = i + 1; j < directionVectors.length; j++) {
        const dot = directionVectors[i].x * directionVectors[j].x + 
                    directionVectors[i].y * directionVectors[j].y;
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        totalAngleVariance += angle;
        count++;
      }
    }

    const avgAngleVariance = count > 0 ? totalAngleVariance / count : 0;
    const chaos = avgAngleVariance / Math.PI;

    if (chaos > this.settings.chaosThreshold) {
      return {
        type: 'panic',
        timestamp: Date.now(),
        confidence: Math.min(1, chaos / 0.8),
        personCount: velocities.length,
        density: velocities.length,
        description: `检测到恐慌逃散: 混乱度${(chaos * 100).toFixed(0)}%`,
        boundingBox: this.getGroupBoundingBox(positions)
      };
    }

    return null;
  }

  private getGroupBoundingBox(
    positions: { id: string; centerX: number; centerY: number }[]
  ): { x: number; y: number; width: number; height: number } {
    if (positions.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const minX = Math.min(...positions.map(p => p.centerX));
    const maxX = Math.max(...positions.map(p => p.centerX));
    const minY = Math.min(...positions.map(p => p.centerY));
    const maxY = Math.max(...positions.map(p => p.centerY));

    return {
      x: Math.max(0, minX - 0.05),
      y: Math.max(0, minY - 0.05),
      width: Math.min(1, maxX - minX + 0.1),
      height: Math.min(1, maxY - minY + 0.1)
    };
  }

  getEventTypeName(type: GroupEventType): string {
    const names: Record<GroupEventType, string> = {
      overcrowding: '人群密度过高',
      pushing: '推挤行为',
      panic: '恐慌逃散'
    };
    return names[type];
  }

  getEventTypeColor(type: GroupEventType): string {
    const colors: Record<GroupEventType, string> = {
      overcrowding: '#F59E0B',
      pushing: '#DC2626',
      panic: '#991B1B'
    };
    return colors[type];
  }

  clearHistory() {
    this.personHistory.clear();
    this.lastGroupAlertTime = 0;
  }
}
