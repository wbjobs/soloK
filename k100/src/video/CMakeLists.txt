add_library(vk浮雕_video STATIC
    video_reader.cpp
    video_writer.cpp
    camera_reader.cpp
)

target_link_libraries(vk浮雕_video
    vk浮雕_core
    ${FFMPEG_LIBRARIES}
)
