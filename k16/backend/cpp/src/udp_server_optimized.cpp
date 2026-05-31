#include "udp_server_optimized.h"
#include <iostream>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/udp.h>

UDPServerOptimized::UDPServerOptimized(uint16_t pressure_port,
                                       uint16_t balance_port,
                                       uint16_t mic_port,
                                       size_t buffer_capacity)
    : batch_size_(64)
    , pressure_socket_(pressure_io_context_)
    , balance_socket_(balance_io_context_)
    , mic_socket_(mic_io_context_)
    , pressure_buffer_(buffer_capacity)
    , balance_buffer_(buffer_capacity)
    , mic_buffer_(buffer_capacity)
    , running_(false) {

    setupSocket(pressure_socket_, pressure_port);
    setupSocket(balance_socket_, balance_port);
    setupSocket(mic_socket_, mic_port);
}

UDPServerOptimized::~UDPServerOptimized() {
    stop();
}

void UDPServerOptimized::setupSocket(udp::socket& socket, uint16_t port) {
    socket.open(udp::v4());
    socket.bind(udp::endpoint(udp::v4(), port));

    boost::asio::socket_base::receive_buffer_size option(16 * 1024 * 1024);
    socket.set_option(option);

    boost::asio::socket_base::non_blocking_io non_blocking(true);
    socket.io_control(non_blocking);
}

void UDPServerOptimized::setPressureCallback(PressureCallback callback) {
    pressure_callback_ = callback;
}

void UDPServerOptimized::setBalanceCallback(BalanceCallback callback) {
    balance_callback_ = callback;
}

void UDPServerOptimized::setMicCallback(MicCallback callback) {
    mic_callback_ = callback;
}

void UDPServerOptimized::setBatchSize(size_t size) {
    batch_size_ = size;
}

void UDPServerOptimized::start() {
    running_ = true;

    pressure_receive_thread_ = std::thread([this]() {
        receiveLoop(pressure_socket_, pressure_buffer_, pressure_stats_, "pressure");
    });

    balance_receive_thread_ = std::thread([this]() {
        receiveLoop(balance_socket_, balance_buffer_, balance_stats_, "balance");
    });

    mic_receive_thread_ = std::thread([this]() {
        receiveLoop(mic_socket_, mic_buffer_, mic_stats_, "mic");
    });

    pressure_process_thread_ = std::thread([this]() {
        processLoop(pressure_buffer_, pressure_callback_, pressure_stats_, "pressure");
    });

    balance_process_thread_ = std::thread([this]() {
        processLoop(balance_buffer_, balance_callback_, balance_stats_, "balance");
    });

    mic_process_thread_ = std::thread([this]() {
        processLoop(mic_buffer_, mic_callback_, mic_stats_, "mic");
    });
}

void UDPServerOptimized::stop() {
    running_ = false;

    pressure_socket_.close();
    balance_socket_.close();
    mic_socket_.close();

    if (pressure_receive_thread_.joinable()) pressure_receive_thread_.join();
    if (balance_receive_thread_.joinable()) balance_receive_thread_.join();
    if (mic_receive_thread_.joinable()) mic_receive_thread_.join();

    if (pressure_process_thread_.joinable()) pressure_process_thread_.join();
    if (balance_process_thread_.joinable()) balance_process_thread_.join();
    if (mic_process_thread_.joinable()) mic_process_thread_.join();
}

template <typename T>
void UDPServerOptimized::receiveLoop(udp::socket& socket,
                                     LockFreeRingBuffer<T>& buffer,
                                     ReceiverStats& stats,
                                     const std::string& name) {
    std::vector<uint8_t> recv_buffer(sizeof(T) * 32);
    udp::endpoint remote_endpoint;
    boost::system::error_code ec;

    while (running_) {
        size_t bytes_transferred = socket.receive_from(
            boost::asio::buffer(recv_buffer),
            remote_endpoint,
            0,
            ec
        );

        if (ec && ec != boost::asio::error::would_block) {
            if (running_) {
                std::cerr << name << " receive error: " << ec.message() << std::endl;
            }
            break;
        }

        if (bytes_transferred > 0 && bytes_transferred % sizeof(T) == 0) {
            size_t packet_count = bytes_transferred / sizeof(T);
            T* packets = reinterpret_cast<T*>(recv_buffer.data());

            for (size_t i = 0; i < packet_count; ++i) {
                if (!buffer.emplace(packets[i])) {
                    stats.dropped.fetch_add(1, std::memory_order_relaxed);
                } else {
                    stats.received.fetch_add(1, std::memory_order_relaxed);
                }
            }
        }
    }
}

template <typename T>
void UDPServerOptimized::processLoop(LockFreeRingBuffer<T>& buffer,
                                     std::function<void(const std::vector<T>&)> callback,
                                     ReceiverStats& stats,
                                     const std::string& name) {
    std::vector<T> batch;
    batch.reserve(batch_size_);

    while (running_) {
        T item;
        while (buffer.pop(item)) {
            batch.push_back(std::move(item));
            
            if (batch.size() >= batch_size_) {
                if (callback) {
                    callback(batch);
                }
                batch.clear();
            }
        }

        if (!batch.empty()) {
            if (callback) {
                callback(batch);
            }
            batch.clear();
        }

        std::this_thread::sleep_for(std::chrono::microseconds(100));
    }

    while (buffer.pop(item)) {
        batch.push_back(std::move(item));
    }
    if (!batch.empty() && callback) {
        callback(batch);
    }
}

uint64_t UDPServerOptimized::getPressurePacketsReceived() const {
    return pressure_stats_.received.load(std::memory_order_relaxed);
}

uint64_t UDPServerOptimized::getBalancePacketsReceived() const {
    return balance_stats_.received.load(std::memory_order_relaxed);
}

uint64_t UDPServerOptimized::getMicPacketsReceived() const {
    return mic_stats_.received.load(std::memory_order_relaxed);
}

uint64_t UDPServerOptimized::getPressurePacketsDropped() const {
    return pressure_stats_.dropped.load(std::memory_order_relaxed);
}

uint64_t UDPServerOptimized::getBalancePacketsDropped() const {
    return balance_stats_.dropped.load(std::memory_order_relaxed);
}

uint64_t UDPServerOptimized::getMicPacketsDropped() const {
    return mic_stats_.dropped.load(std::memory_order_relaxed);
}

double UDPServerOptimized::getPressureDropRate() const {
    uint64_t received = getPressurePacketsReceived();
    uint64_t dropped = getPressurePacketsDropped();
    uint64_t total = received + dropped;
    return total > 0 ? static_cast<double>(dropped) / total : 0.0;
}

double UDPServerOptimized::getBalanceDropRate() const {
    uint64_t received = getBalancePacketsReceived();
    uint64_t dropped = getBalancePacketsDropped();
    uint64_t total = received + dropped;
    return total > 0 ? static_cast<double>(dropped) / total : 0.0;
}

double UDPServerOptimized::getMicDropRate() const {
    uint64_t received = getMicPacketsReceived();
    uint64_t dropped = getMicPacketsDropped();
    uint64_t total = received + dropped;
    return total > 0 ? static_cast<double>(dropped) / total : 0.0;
}
