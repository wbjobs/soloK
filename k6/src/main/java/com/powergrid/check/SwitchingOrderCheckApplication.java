package com.powergrid.check;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.neo4j.repository.config.EnableNeo4jRepositories;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableNeo4jRepositories
@EnableAsync
public class SwitchingOrderCheckApplication {

    public static void main(String[] args) {
        SpringApplication.run(SwitchingOrderCheckApplication.class, args);
    }
}
