#include "state_machine.h"

StateMachine::StateMachine() 
    : current_state_(SystemState::IDLE) {}

void StateMachine::transitionTo(SystemState new_state) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (isValidTransition(current_state_, new_state)) {
        current_state_ = new_state;
        if (state_callback_) {
            state_callback_(current_state_);
        }
    }
}

SystemState StateMachine::getCurrentState() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return current_state_;
}

std::string StateMachine::getStateString() const {
    std::lock_guard<std::mutex> lock(mutex_);
    switch (current_state_) {
        case SystemState::IDLE: return "IDLE";
        case SystemState::STARTING: return "STARTING";
        case SystemState::STABILIZING: return "STABILIZING";
        case SystemState::ACQUIRING: return "ACQUIRING";
        case SystemState::STOPPING: return "STOPPING";
        default: return "UNKNOWN";
    }
}

void StateMachine::setStateChangeCallback(StateCallback callback) {
    std::lock_guard<std::mutex> lock(mutex_);
    state_callback_ = callback;
}

bool StateMachine::startAcquisition() {
    if (getCurrentState() == SystemState::IDLE) {
        transitionTo(SystemState::STARTING);
        return true;
    }
    return false;
}

bool StateMachine::stopAcquisition() {
    auto state = getCurrentState();
    if (state == SystemState::ACQUIRING || state == SystemState::STABILIZING) {
        transitionTo(SystemState::STOPPING);
        return true;
    }
    return false;
}

void StateMachine::emergencyStop() {
    transitionTo(SystemState::IDLE);
}

bool StateMachine::isValidTransition(SystemState from, SystemState to) const {
    switch (from) {
        case SystemState::IDLE:
            return to == SystemState::STARTING;
        case SystemState::STARTING:
            return to == SystemState::STABILIZING || to == SystemState::IDLE;
        case SystemState::STABILIZING:
            return to == SystemState::ACQUIRING || to == SystemState::STOPPING;
        case SystemState::ACQUIRING:
            return to == SystemState::STOPPING;
        case SystemState::STOPPING:
            return to == SystemState::IDLE;
        default:
            return false;
    }
}
