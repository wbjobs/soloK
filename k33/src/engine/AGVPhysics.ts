import { AGV, Position, PathPoint, DWAConfig } from '../types';
import { distance, angleTo, normalizeAngle, clamp } from '../utils/math';

export interface DWAVelocity {
  linear: number;
  angular: number;
}

export interface TrajectoryPoint {
  x: number;
  y: number;
  angle: number;
  time: number;
}

interface AGVPrediction {
  agv: AGV;
  trajectory: TrajectoryPoint[];
  priority: number;
}

export class AGVPhysics {
  private dwaConfig: DWAConfig;
  private static readonly INTERSECTION_ZONE_RADIUS = 5.0;
  private static readonly PRIORITY_GAP = 10;

  constructor(config: DWAConfig) {
    this.dwaConfig = config;
  }

  public update(agv: AGV, dt: number, obstacles: Position[], target: Position | null, allAGVs: AGV[] = []): void {
    if (agv.status === 'fault' || agv.status === 'charging') {
      agv.velocity.linear = 0;
      agv.velocity.angular = 0;
      return;
    }

    if (agv.status === 'loading' || agv.status === 'unloading') {
      agv.velocity.linear = 0;
      agv.velocity.angular = 0;
      return;
    }

    if (agv.status === 'idle') {
      this.decelerate(agv, dt);
      return;
    }

    if (agv.status === 'moving' && target) {
      const otherAGVs = allAGVs.filter(a => a.id !== agv.id && a.status === 'moving');
      const velocity = this.dwaEnhanced(agv, target, obstacles, otherAGVs);
      this.applyVelocity(agv, velocity, dt);
    }
  }

  private dwaEnhanced(agv: AGV, target: Position, obstacles: Position[], otherAGVs: AGV[]): DWAVelocity {
    const { position, velocity } = agv;
    const { maxSpeed, minSpeed, maxAcceleration, maxAngularSpeed, maxAngularAcceleration,
            velocityResolution, angularResolution, timeToPredict, alpha, beta, gamma, obstacleRadius } = this.dwaConfig;

    const minV = Math.max(minSpeed, velocity.linear - maxAcceleration * 0.1);
    const maxV = Math.min(maxSpeed, velocity.linear + maxAcceleration * 0.1);
    const minW = Math.max(-maxAngularSpeed, velocity.angular - maxAngularAcceleration * 0.1);
    const maxW = Math.min(maxAngularSpeed, velocity.angular + maxAngularAcceleration * 0.1);

    let bestVelocity: DWAVelocity = { linear: 0, angular: 0 };
    let bestScore = -Infinity;

    const agvPredictions = this.predictOtherAGVTrajectories(otherAGVs, timeToPredict);

    for (let v = minV; v <= maxV; v += velocityResolution) {
      for (let w = minW; w <= maxW; w += angularResolution) {
        const trajectory = this.predictTrajectoryWithTime(position.x, position.y, position.angle, v, w, timeToPredict);
        
        if (this.checkCollisionWithObstacles(trajectory, obstacles, obstacleRadius)) {
          continue;
        }

        const collisionWithAGV = this.checkCollisionWithAGVs(agv, trajectory, agvPredictions, obstacleRadius * 1.2);
        if (collisionWithAGV.collision) {
          if (collisionWithAGV.hasHigherPriority) {
            continue;
          }
        }

        const headingScore = this.calculateHeadingScore(trajectory, target);
        const velocityScore = v / maxSpeed;
        const clearanceScore = this.calculateClearanceScore(trajectory, obstacles);
        const agvClearanceScore = this.calculateAGVClearanceScore(trajectory, agvPredictions);

        const score = alpha * headingScore + beta * velocityScore + gamma * clearanceScore + 0.3 * agvClearanceScore;

        if (score > bestScore) {
          bestScore = score;
          bestVelocity = { linear: v, angular: w };
        }
      }
    }

    if (bestScore === -Infinity) {
      return { linear: 0, angular: 0 };
    }

    return bestVelocity;
  }

  private predictOtherAGVTrajectories(otherAGVs: AGV[], timeToPredict: number): AGVPrediction[] {
    const predictions: AGVPrediction[] = [];

    for (const otherAGV of otherAGVs) {
      const target = this.getOtherAGVTarget(otherAGV);
      const trajectory = this.predictTrajectoryWithTime(
        otherAGV.position.x,
        otherAGV.position.y,
        otherAGV.position.angle,
        otherAGV.velocity.linear,
        otherAGV.velocity.angular,
        timeToPredict
      );
      
      predictions.push({
        agv: otherAGV,
        trajectory,
        priority: this.calculateAGVPriority(otherAGV),
      });
    }

    return predictions;
  }

  private getOtherAGVTarget(agv: AGV): Position | null {
    if (agv.path.length > 0 && agv.pathIndex < agv.path.length) {
      return agv.path[Math.min(agv.pathIndex + 2, agv.path.length - 1)];
    }
    return null;
  }

  private calculateAGVPriority(agv: AGV): number {
    let priority = 0;
    
    if (agv.currentTask) {
      priority += agv.currentTask.priority * 100;
    }
    
    if (agv.status === 'loading' || agv.status === 'unloading') {
      priority += 50;
    }
    
    if (agv.battery < 30) {
      priority += 200;
    }
    
    priority += (agv.id.charCodeAt(agv.id.length - 1) % 10);
    
    return priority;
  }

  private predictTrajectoryWithTime(x: number, y: number, theta: number, v: number, w: number, time: number): TrajectoryPoint[] {
    const trajectory: TrajectoryPoint[] = [];
    const dt = 0.1;
    const steps = Math.ceil(time / dt);

    let currentX = x;
    let currentY = y;
    let currentTheta = theta;
    let currentTime = 0;

    for (let i = 0; i < steps; i++) {
      if (Math.abs(w) < 0.001) {
        currentX += v * Math.cos(currentTheta) * dt;
        currentY += v * Math.sin(currentTheta) * dt;
      } else {
        const nextTheta = currentTheta + w * dt;
        currentX += v / w * (Math.sin(nextTheta) - Math.sin(currentTheta));
        currentY += v / w * (Math.cos(currentTheta) - Math.cos(nextTheta));
        currentTheta = nextTheta;
      }
      
      currentTime += dt;
      trajectory.push({ x: currentX, y: currentY, angle: currentTheta, time: currentTime });
    }

    return trajectory;
  }

  private checkCollisionWithObstacles(trajectory: TrajectoryPoint[], obstacles: Position[], radius: number): boolean {
    for (const point of trajectory) {
      for (const obstacle of obstacles) {
        const dist = distance(point, obstacle);
        if (dist < radius) {
          return true;
        }
      }
    }
    return false;
  }

  private checkCollisionWithAGVs(
    agv: AGV, 
    trajectory: TrajectoryPoint[], 
    agvPredictions: AGVPrediction[], 
    radius: number
  ): { collision: boolean; hasHigherPriority: boolean } {
    const agvPriority = this.calculateAGVPriority(agv);

    for (const prediction of agvPredictions) {
      const otherPosition = prediction.agv.position;
      const dist = distance(agv.position, otherPosition);

      if (dist > 15) continue;

      for (const point of trajectory) {
        for (const otherPoint of prediction.trajectory) {
          const timeDiff = Math.abs(point.time - otherPoint.time);
          if (timeDiff > 0.5) continue;

          const dist = distance(point, otherPoint);
          if (dist < radius) {
            const hasHigherPriority = prediction.priority > agvPriority + AGVPhysics.PRIORITY_GAP;
            
            if (hasHigherPriority) {
              return { collision: true, hasHigherPriority: true };
            }
            
            if (Math.abs(prediction.priority - agvPriority) < AGVPhysics.PRIORITY_GAP) {
              const hasRightOfWay = this.checkRightOfWay(agv, prediction.agv);
              if (!hasRightOfWay) {
                return { collision: true, hasHigherPriority: true };
              }
            }
          }
        }
      }
    }

    return { collision: false, hasHigherPriority: false };
  }

  private checkRightOfWay(agv1: AGV, agv2: AGV): boolean {
    const angle1 = agv1.position.angle;
    const angle2 = agv2.position.angle;
    
    const diff = normalizeAngle(angle1 - angle2);
    
    if (diff > 0 && diff < Math.PI) {
      return true;
    }
    
    if (agv1.id < agv2.id) {
      return true;
    }
    
    return false;
  }

  private calculateHeadingScore(trajectory: TrajectoryPoint[], target: Position): number {
    const endPoint = trajectory[trajectory.length - 1];
    const targetAngle = angleTo(endPoint, target);
    const angleDiff = Math.abs(normalizeAngle(targetAngle - endPoint.angle));
    return 1 - angleDiff / Math.PI;
  }

  private calculateClearanceScore(trajectory: TrajectoryPoint[], obstacles: Position[]): number {
    if (obstacles.length === 0) return 1.0;

    let minDist = Infinity;
    for (const point of trajectory) {
      for (const obstacle of obstacles) {
        const dist = distance(point, obstacle);
        minDist = Math.min(minDist, dist);
      }
    }

    return Math.min(1.0, minDist / 5.0);
  }

  private calculateAGVClearanceScore(trajectory: TrajectoryPoint[], agvPredictions: AGVPrediction[]): number {
    if (agvPredictions.length === 0) return 1.0;

    let minDist = Infinity;
    for (const point of trajectory) {
      for (const prediction of agvPredictions) {
        for (const otherPoint of prediction.trajectory) {
          const dist = distance(point, otherPoint);
          minDist = Math.min(minDist, dist);
        }
      }
    }

    return Math.min(1.0, minDist / 3.0);
  }

  private applyVelocity(agv: AGV, velocity: DWAVelocity, dt: number): void {
    agv.velocity.linear = clamp(velocity.linear, 0, agv.maxSpeed);
    agv.velocity.angular = clamp(velocity.angular, -this.dwaConfig.maxAngularSpeed, this.dwaConfig.maxAngularSpeed);

    const v = agv.velocity.linear;
    const w = agv.velocity.angular;

    if (Math.abs(w) < 0.001) {
      agv.position.x += v * Math.cos(agv.position.angle) * dt;
      agv.position.y += v * Math.sin(agv.position.angle) * dt;
    } else {
      const nextTheta = agv.position.angle + w * dt;
      agv.position.x += v / w * (Math.sin(nextTheta) - Math.sin(agv.position.angle));
      agv.position.y += v / w * (Math.cos(agv.position.angle) - Math.cos(nextTheta));
      agv.position.angle = nextTheta;
    }

    agv.position.angle = normalizeAngle(agv.position.angle);
    agv.totalDistance += v * dt / 1000;
  }

  private decelerate(agv: AGV, dt: number): void {
    const deceleration = agv.maxAcceleration;
    
    if (agv.velocity.linear > 0) {
      agv.velocity.linear = Math.max(0, agv.velocity.linear - deceleration * dt);
    } else if (agv.velocity.linear < 0) {
      agv.velocity.linear = Math.min(0, agv.velocity.linear + deceleration * dt);
    }

    if (agv.velocity.angular > 0) {
      agv.velocity.angular = Math.max(0, agv.velocity.angular - this.dwaConfig.maxAngularAcceleration * dt);
    } else if (agv.velocity.angular < 0) {
      agv.velocity.angular = Math.min(0, agv.velocity.angular + this.dwaConfig.maxAngularAcceleration * dt);
    }
  }

  public getTargetFromPath(agv: AGV, lookahead: number = 2): Position | null {
    if (agv.path.length === 0 || agv.pathIndex >= agv.path.length) {
      return null;
    }

    const targetIndex = Math.min(agv.pathIndex + lookahead, agv.path.length - 1);
    return agv.path[targetIndex];
  }

  public checkPathProgress(agv: AGV, arrivalThreshold: number = 1.0): boolean {
    if (agv.path.length === 0 || agv.pathIndex >= agv.path.length) {
      return true;
    }

    const currentTarget = agv.path[agv.pathIndex];
    const dist = distance(agv.position, currentTarget);

    if (dist < arrivalThreshold) {
      agv.pathIndex++;
      return agv.pathIndex >= agv.path.length;
    }

    return false;
  }

  public updateBattery(agv: AGV, dt: number, consumptionPerKm: number): void {
    if (agv.status === 'charging') {
      agv.battery = Math.min(agv.batteryCapacity, agv.battery + 10 * dt / 60);
    } else if (agv.velocity.linear > 0) {
      const distanceKm = (agv.velocity.linear * dt) / 1000;
      agv.battery = Math.max(0, agv.battery - distanceKm * consumptionPerKm);
    }
  }

  public needsCharging(agv: AGV, threshold: number): boolean {
    return agv.battery < threshold && agv.status !== 'charging';
  }
}
