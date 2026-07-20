FROM mwader/static-ffmpeg:7.1.1 AS ffmpeg

FROM alpine:3.23 AS youtube-tools
WORKDIR /tools
ADD https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/yt-dlp_linux /tools/yt-dlp
ADD https://github.com/denoland/deno/releases/download/v2.6.9/deno-x86_64-unknown-linux-gnu.zip /tools/deno.zip
ADD https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases/download/1.3.1/bgutil-ytdlp-pot-provider.zip /tools/bgutil-provider.zip
RUN echo "6bbb3d314cde4febe36e5fa1d55462e29c974f63444e707871834f6d8cc210ae  /tools/yt-dlp" | sha256sum -c - \
    && echo "8a677a4b0cea1a25aaecfc70d6c6a288f9ad69af0a92e9e9d513cabaaf3c688f  /tools/deno.zip" | sha256sum -c - \
    && echo "b8ceec7f76143da172aaf5ebeec0c2d218e5680c063b931586bca48567069b38  /tools/bgutil-provider.zip" | sha256sum -c - \
    && chmod 0755 /tools/yt-dlp \
    && unzip /tools/deno.zip -d /tools/deno \
    && chmod 0755 /tools/deno/deno \
    && mkdir -p /tools/yt-dlp-plugins \
    && unzip /tools/bgutil-provider.zip -d /tools/yt-dlp-plugins

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=youtube-tools /tools/yt-dlp /usr/local/bin/yt-dlp
COPY --from=youtube-tools /tools/deno/deno /usr/local/bin/deno
COPY --from=youtube-tools /tools/yt-dlp-plugins /usr/local/lib/yt-dlp-plugins
COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg
RUN addgroup --system playsay && adduser --system --ingroup playsay playsay
COPY media-service/build/libs/*.jar /app/app.jar
USER playsay
EXPOSE 8082
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
