#pragma once

#include "common.h"
#include <boost/asio.hpp>
#include <functional>
#include <vector>
#include <thread>
#include <mutex>

using boost::asio::ip::udp;

class UDPServer {
public:
    using PressureCallback = std::function<void(const PressureData&)>;
    using BalanceCallback = std::function<void(const BalanceData&)>;
    using MicCallback = std::function<void(const MicData&)>;

    UDPServer(boost::asio::io_context& io_context, 
              uint16_t pressure_port = 5000,
              uint16_t balance_port = 5001,
              uint16_t mic_port = 5002);

    void setPressureCallback(PressureCallback callback);
    void setBalanceCallback(BalanceCallback callback);
    void setMicCallback(MicCallback callback);

    void start();
    void stop();

    uint64_t getPressurePacketsReceived() const;
    uint64_t getBalancePacketsReceived() const;
    uint64_t getMicPacketsReceived() const;

private:
    void receivePressure();
    void receiveBalance();
    void receiveMic();

    boost::asio::io_context& io_context_;
    udp::socket pressure_socket_;
    udp::socket balance_socket_;
    udp::socket mic_socket_;
    udp::endpoint pressure_remote_endpoint_;
    udp::endpoint balance_remote_endpoint_;
    udp::endpoint mic_remote_endpoint_;

    std::vector<uint8_t> pressure_buffer_;
    std::vector<uint8_t> balance_buffer_;
    std::vector<uint8_t> mic_buffer_;

    PressureCallback pressure_callback_;
    BalanceCallback balance_callback_;
    MicCallback mic_callback_;

    mutable std::mutex stats_mutex_;
    uint64_t pressure_packets_;
    uint64_t balance_packets_;
    uint64_t mic_packets_;
};
