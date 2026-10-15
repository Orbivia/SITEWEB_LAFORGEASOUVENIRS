# FFmpeg WebAssembly core 0.12.10

Unmodified @ffmpeg/core 0.12.10 (single-threaded UMD build), GPL-2.0-or-later.
Copyright FFmpeg contributors, FFmpeg.wasm contributors and the respective codec authors.
The separate conversion worker communicates with the application through messages.

Upstream package: https://www.npmjs.com/package/@ffmpeg/core/v/0.12.10
Original distribution: https://registry.npmjs.org/@ffmpeg/core/-/core-0.12.10.tgz
Corresponding source and build recipes (packages/core version 0.12.10):
https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v12.15
https://github.com/ffmpegwasm/ffmpeg.wasm/archive/refs/tags/v12.15.tar.gz
The Dockerfile and build scripts identify the source versions of FFmpeg (n5.1.4),
x264 and the other libraries; their original copyright and licence notices apply.
FFmpeg source: https://github.com/FFmpeg/FFmpeg/tree/n5.1.4
Licence text is provided in COPYING.GPLv2.

ffmpeg-core.js is unchanged. Concatenate ffmpeg-core.wasm.part1 through part4
in numeric order to recover the unchanged ffmpeg-core.wasm from the package.
The worker assembles these parts locally. Neither video nor audio is sent to a
conversion service; these static files are downloaded from the application's site.
