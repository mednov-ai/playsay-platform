#!/bin/sh
# Run in the disposable Alpine download stage for the target architecture.
set -eu
case "$(uname -m)" in
  x86_64) archive_arch=x64; sha=2edef9e4f81ec5ee426d023336d4cfbd7b4644e99884e7a73a6a867b70b17acf ;;
  aarch64) archive_arch=aarch64; sha=c6161dcfb365024fbfbcda265343d562d6f821c78dd8e7aeaeaf294893f6ff8b ;;
  ppc64le) archive_arch=ppc64le; sha=cd4e122c3d32cf0d4a19cf283ab06a99a0bf6694b7d11444c0ea046aaa17faa7 ;;
  s390x) archive_arch=s390x; sha=4bc1628ef796f26aa31b98698fb1d0a222b20e1c264665d4761646902855acca ;;
  *) echo "Unsupported Temurin architecture" >&2; exit 1 ;;
esac
release=https://github.com/adoptium/temurin25-binaries/releases/download/jdk-25.0.5.1%2B2
wget -q -O /tmp/jre.tar.gz "$release/OpenJDK25U-jre_${archive_arch}_linux_hotspot_25.0.5.1_2.tar.gz"
printf '%s  %s\n' "$sha" /tmp/jre.tar.gz | sha256sum -c -
mkdir -p /opt/temurin
tar -xzf /tmp/jre.tar.gz -C /opt/temurin --strip-components=1
rm /tmp/jre.tar.gz
