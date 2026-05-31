#include "common.h"
#include "udp_server.h"
#include "websocket_server.h"
#include "state_machine.h"
#include "quality_control.h"
#include "data_processor.h"
#include <iostream>
#include <thread>
#include <chrono>
#include <signal.h>

std::atomic<bool> g_running(true);

void signal_handler(int signal) {
    g_running = false;
}

int main(int argc, char* argv[]) {
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    try {
        boost::asio::io_context io_context;

        UDPServer udp_server(io_context, 5000, 5001, 5002);
        WebSocketServer ws_server(io_context, 8080);
        StateMachine state_machine;
        QualityControl quality_control(100, 3.0f);
        DataProcessor data_processor(1024);

        std::vector<PressureData> pressure_buffer;
        const size_t BUFFER_SIZE = 2000;

        state_machine.setStateChangeCallback([&ws_server](SystemState state) {
            std::cout << "State changed to: " << static_cast<int>(state) << std::endl;
            ws_server.broadcastStateChange(state);
        });

        udp_server.setPressureCallback([&](const PressureData& data) {
            if (state_machine.getCurrentState() == SystemState::ACQUIRING) {
                auto metrics = quality_control.processPressureData(data);
                ws_server.broadcastPressure(data);
                ws_server.broadcastQualityMetrics(metrics);

                pressure_buffer.push_back(data);
                if (pressure_buffer.size() > BUFFER_SIZE) {
                    pressure_buffer.erase(pressure_buffer.begin());
                }

                static size_t fft_counter = 0;
                if (++fft_counter >= 100) {
                    fft_counter = 0;
                    if (!pressure_buffer.empty()) {
                        std::vector<float> signal;
                        for (const auto& d : pressure_buffer) {
                            signal.push_back(d.values[0]);
                        }
                        auto psd = data_processor.computePSD(signal, SAMPLE_RATE);
                        ws_server.broadcastFFT(psd, SAMPLE_RATE);
                    }
                }
            }
        });

        udp_server.setBalanceCallback([&](const BalanceData& data) {
            if (state_machine.getCurrentState() == SystemState::ACQUIRING) {
                ws_server.broadcastBalance(data);

                double air_density = 1.225;
                double velocity = 50.0;
                double reference_area = 0.1;
                double chord_length = 0.15;

                auto coeffs = data_processor.calculateAeroCoefficients(
                    data, air_density, velocity, reference_area, chord_length
                );
                ws_server.broadcastAeroCoefficients(coeffs);
            }
        });

        udp_server.start();
        ws_server.start();

        std::cout << "Wind Tunnel Data Server started" << std::endl;
        std::cout << "UDP Ports: 5000 (pressure), 5001 (balance), 5002 (mic)" << std::endl;
        std::cout << "WebSocket Port: 8080" << std::endl;

        std::thread io_thread([&io_context]() {
            io_context.run();
        });

        while (g_running) {
            auto state = state_machine.getCurrentState();
            
            if (state == SystemState::STARTING) {
                std::this_thread::sleep_for(std::chrono::seconds(2));
                state_machine.transitionTo(SystemState::STABILIZING);
            } else if (state == SystemState::STABILIZING) {
                std::this_thread::sleep_for(std::chrono::seconds(3));
                state_machine.transitionTo(SystemState::ACQUIRING);
            } else if (state == SystemState::STOPPING) {
                std::this_thread::sleep_for(std::chrono::seconds(1));
                state_machine.transitionTo(SystemState::IDLE);
            }

            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }

        std::cout << "Shutting down..." << std::endl;
        udp_server.stop();
        ws_server.stop();
        io_context.stop();
        io_thread.join();

    } catch (const std::exception& e) {
        std::cerr << "Exception: " << e.what() << std::endl;
        return 1;
    }

    return 0;
}
