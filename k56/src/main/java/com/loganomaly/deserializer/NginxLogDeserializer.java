package com.loganomaly.deserializer;

import com.google.gson.Gson;
import com.google.gson.JsonSyntaxException;
import com.loganomaly.model.NginxLog;
import org.apache.flink.api.common.serialization.DeserializationSchema;
import org.apache.flink.api.common.typeinfo.TypeInformation;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

public class NginxLogDeserializer implements DeserializationSchema<NginxLog> {

    private static final long serialVersionUID = 1L;
    private final Gson gson = new Gson();

    @Override
    public NginxLog deserialize(byte[] message) throws IOException {
        if (message == null || message.length == 0) {
            return null;
        }
        try {
            String json = new String(message, StandardCharsets.UTF_8);
            return gson.fromJson(json, NginxLog.class);
        } catch (JsonSyntaxException e) {
            return null;
        }
    }

    @Override
    public boolean isEndOfStream(NginxLog nextElement) {
        return false;
    }

    @Override
    public TypeInformation<NginxLog> getProducedType() {
        return TypeInformation.of(NginxLog.class);
    }
}
