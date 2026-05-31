#pragma once

#include "common.h"
#include "lockfree_ringbuffer.h"
#include <boost/asio.hpp>
#include <functional>
#include <vector>
#include <thread>
#include <atomic>
#include <memory>
#include <chrono>

using boost::asio::ip::udp;

class UDPServerOptimized {
public:
    using PressureCallback = std::function<void(const std::vector<PressureData>&)>;
    using BalanceCallback = std::function<void(const std::vector<BalanceData>&)>;
    using MicCallback = std::function<void(const std::vector<MicData>&)>;

    UDPServerOptimized(uint16_t pressure_port = 5000,
                       uint16_t balance_port = 5001,
                       uint16_t mic_port = 5002,
                       size_t buffer_capacity = 8192);

    ~UDPServerOptimized();

    void setPressureCallback(PressureCallback callback);
    void setBalanceCallback(BalanceCallback callback);
    void setMicCallback(MicCallback callback);

    void setBatchSize(size_t size);

    void start();
    void stop();

    uint64_t getPressurePacketsReceived() const;
    uint64_t getBalancePacketsReceived() const;
    uint64_t getMicPacketsReceived() const;

    uint64_t getPressurePacketsDropped() const;
    uint64_t getBalancePacketsDropped() const;
    uint64_t getMicPacketsDropped() const;

    double getPressureDropRate() const;
    double getBalanceDropRate() const;
    double getMicDropRate() const;

private:
    struct ReceiverStats {
        std::atomic<uint64_t> received{0};
        std::atomic<uint64_t> dropped{0};
    };

    template <typename T>
    void receiveLoop(udp::socket& socket, 
                     LockFreeRingBuffer<T>& buffer,
                     ReceiverStats& stats,
                     const std::string& name);

    template <typename T>
    void processLoop(LockFreeRingBuffer<T>& buffer,
                     std::function<void(const std::vector<T>&)> callback,
                     ReceiverStats& stats,
                     const std::string& name);

    void setupSocket(udp::socket& socket, uint16_t port);

    size_t batch_size_;

    boost::asio::io_context pressure_io_context_;
    boost::asio::io_context balance_io_context_;
    boost::asio::io_context mic_io_context_;

    udp::socket pressure_socket_;
    udp::socket balance_socket_;
    udp::socket mic_socket_;

    LockFreeRingBuffer<PressureData> pressure_buffer_;
    LockFreeRingBuffer<BalanceData> balance_buffer_;
    LockFreeRingBuffer<MicData> mic_buffer_;

    PressureCallback pressure_callback_;
    BalanceCallback balance_callback_;
    MicCallback mic_callback_;

    ReceiverStats pressure_stats_;
    ReceiverStats balance_stats_;
    ReceiverStats mic_stats_;

    std::thread pressure_receive_thread_;
    std::thread balance_receive_thread_;
    std::thread mic_receive_thread_;

    std::thread pressure_process_thread_;
    std::thread balance_process_thread_;
    std::thread mic_process_thread_;

    std::atomic<bool> running_;
};
