import { AGV, QuayCrane, InterferenceEvent } from '../types';
import { generateId, randomRange } from '../utils/math';

export class InterferenceManager {
  private agvFaultRate: number;
  private agvFaultDuration: number;
  private quayCraneTimeVariation: number;
  private activeEvents: InterferenceEvent[] = [];
  private eventHistory: InterferenceEvent[] = [];

  constructor(
    agvFaultRate: number = 0.001,
    agvFaultDuration: number = 30,
    quayCraneTimeVariation: number = 0.2
  ) {
    this.agvFaultRate = agvFaultRate;
    this.agvFaultDuration = agvFaultDuration;
    this.quayCraneTimeVariation = quayCraneTimeVariation;
  }

  public update(dt: number, currentTime: number, agvs: AGV[], quayCranes: QuayCrane[]): void {
    this.activeEvents = this.activeEvents.filter(event => {
      if (currentTime >= event.endTime) {
        event.active = false;
        this.eventHistory.push(event);
        this.resolveEvent(event, agvs, quayCranes);
        return false;
      }
      return true;
    });

    agvs.forEach(agv => {
      if (agv.status !== 'fault' && Math.random() < this.agvFaultRate * dt) {
        this.triggerAGVFault(agv, currentTime);
      }
    });

    this.updateAGVFaultTimers(agvs, dt);
  }

  private triggerAGVFault(agv: AGV, currentTime: number): void {
    const duration = this.agvFaultDuration * randomRange(0.5, 1.5);
    const event: InterferenceEvent = {
      id: generateId('event-'),
      type: 'agv_fault',
      targetId: agv.id,
      startTime: currentTime,
      endTime: currentTime + duration,
      duration,
      description: `${agv.name} 发生故障，预计恢复时间 ${duration.toFixed(0)} 秒`,
      active: true,
    };

    agv.status = 'fault';
    agv.faultTimer = duration;
    agv.velocity.linear = 0;
    agv.velocity.angular = 0;

    this.activeEvents.push(event);
    this.eventHistory.push(event);
  }

  private resolveEvent(event: InterferenceEvent, agvs: AGV[], quayCranes: QuayCrane[]): void {
    if (event.type === 'agv_fault') {
      const agv = agvs.find(a => a.id === event.targetId);
      if (agv && agv.status === 'fault') {
        agv.status = 'idle';
        agv.faultTimer = 0;
      }
    }
  }

  private updateAGVFaultTimers(agvs: AGV[], dt: number): void {
    agvs.forEach(agv => {
      if (agv.status === 'fault' && agv.faultTimer > 0) {
        agv.faultTimer -= dt;
        if (agv.faultTimer <= 0) {
          agv.status = 'idle';
          agv.faultTimer = 0;
        }
      }
    });
  }

  public getAdjustedOperationTime(baseTime: number): number {
    const variation = baseTime * this.quayCraneTimeVariation;
    return baseTime + randomRange(-variation, variation);
  }

  public getActiveEvents(): InterferenceEvent[] {
    return [...this.activeEvents];
  }

  public getEventHistory(): InterferenceEvent[] {
    return [...this.eventHistory];
  }

  public getFaultCount(): number {
    return this.eventHistory.filter(e => e.type === 'agv_fault').length;
  }

  public clear(): void {
    this.activeEvents = [];
    this.eventHistory = [];
  }

  public setAGVFaultRate(rate: number): void {
    this.agvFaultRate = rate;
  }

  public setAGVFaultDuration(duration: number): void {
    this.agvFaultDuration = duration;
  }

  public setQuayCraneTimeVariation(variation: number): void {
    this.quayCraneTimeVariation = variation;
  }

  public manuallyTriggerFault(agvId: string, currentTime: number): InterferenceEvent | null {
    const event: InterferenceEvent = {
      id: generateId('event-'),
      type: 'agv_fault',
      targetId: agvId,
      startTime: currentTime,
      endTime: currentTime + this.agvFaultDuration,
      duration: this.agvFaultDuration,
      description: `手动触发故障`,
      active: true,
    };

    this.activeEvents.push(event);
    this.eventHistory.push(event);

    return event;
  }
}
