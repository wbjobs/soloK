#pragma once

#include "common.h"
#include <functional>
#include <mutex>
#include <string>

class StateMachine {
public:
    using StateCallback = std::function<void(SystemState)>;

    StateMachine();

    void transitionTo(SystemState new_state);
    SystemState getCurrentState() const;
    std::string getStateString() const;

    void setStateChangeCallback(StateCallback callback);

    bool startAcquisition();
    bool stopAcquisition();
    void emergencyStop();

private:
    bool isValidTransition(SystemState from, SystemState to) const;

    SystemState current_state_;
    StateCallback state_callback_;
    mutable std::mutex mutex_;
};
