export class MidiAdapter {
    deviceManager;
    midiListener;
    messageUnsubscribe = null;
    learnUnsubscribe = null;
    constructor(deviceManager, midiListener) {
        this.deviceManager = deviceManager;
        this.midiListener = midiListener;
    }
    async getDevices() {
        return this.deviceManager.getDevices();
    }
    async connectDevice(deviceId) {
        const device = this.deviceManager.getDeviceById(deviceId);
        if (!device) {
            return false;
        }
        const input = this.deviceManager.getDeviceInput(deviceId);
        if (!input) {
            return false;
        }
        return this.midiListener.connect(device, input);
    }
    async disconnectDevice(deviceId) {
        this.midiListener.disconnectDevice(deviceId);
    }
    async disconnectAll() {
        this.midiListener.disconnect();
    }
    getConnectedDevices() {
        return this.midiListener.getConnectedDevices();
    }
    isDeviceConnected(deviceId) {
        return this.midiListener.isDeviceConnected(deviceId);
    }
    onMessage(callback) {
        return this.midiListener.on('message', callback);
    }
    async start() {
        this.deviceManager.startMonitoring();
    }
    async stop() {
        this.midiListener.disconnect();
        this.deviceManager.stopMonitoring();
    }
    isRunning() {
        return this.midiListener.getConnectedDevices().length > 0;
    }
    startLearn(timeoutMs = 5000, deviceId) {
        this.midiListener.startLearn(timeoutMs, deviceId);
    }
    stopLearn() {
        this.midiListener.stopLearn();
    }
    isInLearnMode() {
        return this.midiListener.isInLearnMode();
    }
    onLearn(callback) {
        return this.midiListener.on('learned', callback);
    }
}
export default MidiAdapter;
