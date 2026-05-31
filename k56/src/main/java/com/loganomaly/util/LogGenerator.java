package com.loganomaly.util;

import com.google.gson.Gson;
import com.loganomaly.model.NginxLog;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringSerializer;

import java.util.Properties;
import java.util.Random;
import java.util.concurrent.TimeUnit;

public class LogGenerator {

    private static final String[] PATHS = {
            "/api/users", "/api/orders", "/api/products",
            "/api/auth/login", "/api/search", "/static/app.js",
            "/health", "/api/payments", "/api/cart", "/api/reviews"
    };

    private static final int[] STATUS_CODES = {200, 200, 200, 200, 200, 301, 400, 404, 500};

    public static void main(String[] args) throws InterruptedException {
        String brokers = args.length > 0 ? args[0] : "localhost:9092";
        String topic = args.length > 1 ? args[1] : "nginx-logs";

        Properties props = new Properties();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, brokers);
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        props.put(ProducerConfig.ACKS_CONFIG, "1");

        KafkaProducer<String, String> producer = new KafkaProducer<>(props);
        Gson gson = new Gson();
        Random random = new Random();

        System.out.println("Starting log generator → " + brokers + " / " + topic);

        try {
            while (true) {
                String ip = "192.168.1." + (random.nextInt(50) + 1);
                long timestamp = System.currentTimeMillis();
                String url = PATHS[random.nextInt(PATHS.length)];
                int statusCode = STATUS_CODES[random.nextInt(STATUS_CODES.length)];
                double responseTime = random.nextDouble() * 500 + 10;

                NginxLog log = new NginxLog(ip, timestamp, url, statusCode, responseTime);
                String json = gson.toJson(log);

                producer.send(new ProducerRecord<>(topic, ip, json));
                System.out.println("Sent: " + json);

                TimeUnit.MILLISECONDS.sleep(random.nextInt(900) + 100);
            }
        } finally {
            producer.close();
        }
    }
}
