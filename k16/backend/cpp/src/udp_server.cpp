#include "udp_server.h"
#include <iostream>

UDPServer::UDPServer(boost::asio::io_context& io_context,
                     uint16_t pressure_port,
                     uint16_t balance_port,
                     uint16_t mic_port)
    : io_context_(io_context)
    , pressure_socket_(io_context, udp::endpoint(udp::v4(), pressure_port))
    , balance_socket_(io_context, udp::endpoint(udp::v4(), balance_port))
    , mic_socket_(io_context, udp::endpoint(udp::v4(), mic_port))
    , pressure_buffer_(sizeof(PressureData))
    , balance_buffer_(sizeof(BalanceData))
    , mic_buffer_(sizeof(MicData))
    , pressure_packets_(0)
    , balance_packets_(0)
    , mic_packets_(0) {}

void UDPServer::setPressureCallback(PressureCallback callback) {
    pressure_callback_ = callback;
}

void UDPServer::setBalanceCallback(BalanceCallback callback) {
    balance_callback_ = callback;
}

void UDPServer::setMicCallback(MicCallback callback) {
    mic_callback_ = callback;
}

void UDPServer::start() {
    receivePressure();
    receiveBalance();
    receiveMic();
}

void UDPServer::stop() {
    pressure_socket_.close();
    balance_socket_.close();
    mic_socket_.close();
}

uint64_t UDPServer::getPressurePacketsReceived() const {
    std::lock_guard<std::mutex> lock(stats_mutex_);
    return pressure_packets_;
}

uint64_t UDPServer::getBalancePacketsReceived() const {
    std::lock_guard<std::mutex> lock(stats_mutex_);
    return balance_packets_;
}

uint64_t UDPServer::getMicPacketsReceived() const {
    std::lock_guard<std::mutex> lock(stats_mutex_);
    return mic_packets_;
}

void UDPServer::receivePressure() {
    pressure_socket_.async_receive_from(
        boost::asio::buffer(pressure_buffer_),
        pressure_remote_endpoint_,
        [this](boost::system::error_code ec, std::size_t bytes_recvd) {
            if (!ec && bytes_recvd == sizeof(PressureData)) {
                PressureData data;
                std::memcpy(&data, pressure_buffer_.data(), sizeof(PressureData));
                if (pressure_callback_) {
                    pressure_callback_(data);
                }
                {
                    std::lock_guard<std::mutex> lock(stats_mutex_);
                    pressure_packets_++;
                }
            }
            receivePressure();
        }
    );
}

void UDPServer::receiveBalance() {
    balance_socket_.async_receive_from(
        boost::asio::buffer(balance_buffer_),
        balance_remote_endpoint_,
        [this](boost::system::error_code ec, std::size_t bytes_recvd) {
            if (!ec && bytes_recvd == sizeof(BalanceData)) {
                BalanceData data;
                std::memcpy(&data, balance_buffer_.data(), sizeof(BalanceData));
                if (balance_callback_) {
                    balance_callback_(data);
                }
                {
                    std::lock_guard<std::mutex> lock(stats_mutex_);
                    balance_packets_++;
                }
            }
            receiveBalance();
        }
    );
}

void UDPServer::receiveMic() {
    mic_socket_.async_receive_from(
        boost::asio::buffer(mic_buffer_),
        mic_remote_endpoint_,
        [this](boost::system::error_code ec, std::size_t bytes_recvd) {
            if (!ec && bytes_recvd == sizeof(MicData)) {
                MicData data;
                std::memcpy(&data, mic_buffer_.data(), sizeof(MicData));
                if (mic_callback_) {
                    mic_callback_(data);
                }
                {
                    std::lock_guard<std::mutex> lock(stats_mutex_);
                    mic_packets_++;
                }
            }
            receiveMic();
        }
    );
}
