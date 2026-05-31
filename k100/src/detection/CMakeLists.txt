add_library(vk浮雕_detection
    object_detector.cpp
    yolo_detector.cpp
    light_tracker.cpp
)

target_include_directories(vk浮雕_detection PUBLIC
    ${CMAKE_SOURCE_DIR}/include
)

if(USE_ONNXRUNTIME)
    find_package(OnnxRuntime REQUIRED)
    target_compile_definitions(vk浮雕_detection PUBLIC USE_ONNXRUNTIME)
    target_include_directories(vk浮雕_detection PUBLIC ${OnnxRuntime_INCLUDE_DIRS})
    target_link_libraries(vk浮雕_detection PUBLIC ${OnnxRuntime_LIBRARIES})
endif()

target_link_libraries(vk浮雕_detection
    vk浮雕_core
)
