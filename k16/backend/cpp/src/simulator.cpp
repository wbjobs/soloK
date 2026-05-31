#include "common.h"
#include <boost/asio.hpp>
#include <iostream>
#include <chrono>
#include <random>
#include <thread>

using boost::asio::ip::udp;

class Simulator {
public:
    Simulator(boost::asio::io_context& io_context, const std::string& host = "127.0.0.1")
        : io_context_(io_context)
        , pressure_socket_(io_context)
        , balance_socket_(io_context)
        , mic_socket_(io_context)
        , pressure_endpoint_(boost::asio::ip::address::from_string(host), 5000)
        , balance_endpoint_(boost::asio::ip::address::from_string(host), 5001)
        , mic_endpoint_(boost::asio::ip::address::from_string(host), 5002)
        , gen_(std::random_device{}())
        , dist_norm_(0.0, 1.0)
        , timestamp_(0) {
        pressure_socket_.open(udp::v4());
        balance_socket_.open(udp::v4());
        mic_socket_.open(udp::v4());
    }

    void sendPressureData() {
        PressureData data;
        data.timestamp = timestamp_;

        for (size_t i = 0; i < PRESSURE_CHANNELS; ++i) {
            double t = timestamp_ * 0.001;
            double base = 100000.0 + 500.0 * sin(0.5 * t + i * 0.1);
            double noise = dist_norm_(gen_) * 10.0;
            data.values[i] = static_cast<float>(base + noise);
        }

        pressure_socket_.send_to(
            boost::asio::buffer(&data, sizeof(PressureData)),
            pressure_endpoint_
        );
    }

    void sendBalanceData() {
        BalanceData data;
        data.timestamp = timestamp_;

        double t = timestamp_ * 0.001;
        double Fx = 100.0 + 10.0 * sin(0.3 * t) + dist_norm_(gen_) * 2.0;
        double Fy = 5.0 + dist_norm_(gen_) * 1.0;
        double Fz = 500.0 + 50.0 * sin(0.2 * t) + dist_norm_(gen_) * 5.0;
        double Mx = 10.0 + dist_norm_(gen_) * 0.5;
        double My = 20.0 + 5.0 * sin(0.15 * t) + dist_norm_(gen_) * 1.0;
        double Mz = 2.0 + dist_norm_(gen_) * 0.3;

        data.values[0] = static_cast<float>(Fx);
        data.values[1] = static_cast<float>(Fy);
        data.values[2] = static_cast<float>(Fz);
        data.values[3] = static_cast<float>(Mx);
        data.values[4] = static_cast<float>(My);
        data.values[5] = static_cast<float>(Mz);

        balance_socket_.send_to(
            boost::asio::buffer(&data, sizeof(BalanceData)),
            balance_endpoint_
        );
    }

    void sendMicData() {
        MicData data;
        data.timestamp = timestamp_;

        for (size_t i = 0; i < MIC_CHANNELS; ++i) {
            data.values[i] = static_cast<float>(dist_norm_(gen_) * 0.1);
        }

        mic_socket_.send_to(
            boost::asio::buffer(&data, sizeof(MicData)),
            mic_endpoint_
        );
    }

    void run() {
        std::cout << "Simulator started, sending data..." << std::endl;
        
        auto interval = std::chrono::microseconds(500);
        
        while (true) {
            sendPressureData();
            if (timestamp_ % 10 == 0) {
                sendBalanceData();
            }
            if (timestamp_ % 5 == 0) {
                sendMicData();
            }
            
            timestamp_++;
            std::this_thread::sleep_for(interval);
        }
    }

private:
    boost::asio::io_context& io_context_;
    udp::socket pressure_socket_;
    udp::socket balance_socket_;
    udp::socket mic_socket_;
    udp::endpoint pressure_endpoint_;
    udp::endpoint balance_endpoint_;
    udp::endpoint mic_endpoint_;
    
    std::mt19937 gen_;
    std::normal_distribution<double> dist_norm_;
    uint64_t timestamp_;
};

int main() {
    try {
        boost::asio::io_context io_context;
        Simulator sim(io_context);
        sim.run();
    } catch (const std::exception& e) {
        std::cerr << "Exception: " << e.what() << std::endl;
        return 1;
    }
    return 0;
}
