package com.loganomaly;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class LogAnomalyApplication {

    public static void main(String[] args) {
        SpringApplication.run(LogAnomalyApplication.class, args);
    }
}
