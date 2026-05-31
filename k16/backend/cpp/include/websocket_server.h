#pragma once

#include "common.h"
#include <boost/beast/core.hpp>
#include <boost/beast/websocket.hpp>
#include <boost/asio/strand.hpp>
#include <boost/asio/ip/tcp.hpp>
#include <nlohmann/json.hpp>
#include <vector>
#include <memory>
#include <mutex>
#include <unordered_set>

namespace beast = boost::beast;
namespace websocket = beast::websocket;
namespace net = boost::asio;
using tcp = boost::asio::ip::tcp;
using json = nlohmann::json;

class WebSocketSession : public std::enable_shared_from_this<WebSocketSession> {
public:
    WebSocketSession(tcp::socket socket);
    ~WebSocketSession();

    void run();
    void send(const std::string& message);

private:
    void on_accept(beast::error_code ec);
    void do_read();
    void on_read(beast::error_code ec, std::size_t bytes_transferred);
    void on_write(beast::error_code ec, std::size_t bytes_transferred);

    websocket::stream<beast::tcp_stream> ws_;
    beast::flat_buffer buffer_;
};

class WebSocketServer {
public:
    WebSocketServer(net::io_context& ioc, uint16_t port = 8080);
    ~WebSocketServer();

    void start();
    void stop();

    void broadcastPressure(const PressureData& data);
    void broadcastBalance(const BalanceData& data);
    void broadcastAeroCoefficients(const AeroCoefficients& coeffs);
    void broadcastStateChange(SystemState state);
    void broadcastFFT(const std::vector<float>& fft_data, double sample_rate);
    void broadcastQualityMetrics(const QualityMetrics& metrics);
    void broadcastAlert(const std::string& level, const std::string& message);

private:
    void do_accept();
    void on_accept(beast::error_code ec, tcp::socket socket);
    void addSession(std::shared_ptr<WebSocketSession> session);
    void removeSession(WebSocketSession* session);
    void broadcast(const std::string& message);

    net::io_context& ioc_;
    tcp::acceptor acceptor_;
    std::unordered_set<std::shared_ptr<WebSocketSession>> sessions_;
    std::mutex sessions_mutex_;
    bool running_;
};
