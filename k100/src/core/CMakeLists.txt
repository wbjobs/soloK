add_library(vk浮雕_core STATIC
    logger.cpp
    utils.cpp
    frame.cpp
)

target_link_libraries(vk浮雕_core
    ${Vulkan_LIBRARIES}
    ${FFMPEG_LIBRARIES}
)
