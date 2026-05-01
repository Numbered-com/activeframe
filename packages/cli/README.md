# @numbered/activeframe-cli

Transcode any video into the `.af` format consumed by [`@numbered/activeframe`](../core/README.md).

Part of the [ActiveFrame project](../../README.md).

No install required:

```bash
bunx @numbered/activeframe-cli <input> <output.af> [maxWidth] [h264|h265] [gop] [crf] [fps]
```

```bash
npx @numbered/activeframe-cli input.mp4 out.af 1080 h264 5 28
```

## Arguments

| Arg        | Default            | Notes                                                                            |
| ---------- | ------------------ | -------------------------------------------------------------------------------- |
| `maxWidth` | 1080               | Source is downscaled to fit; aspect ratio preserved                              |
| `type`     | h264               | `h264` (broad support) or `h265` (~50% smaller at same quality)                  |
| `gop`     | 5                  | Group of Pictures size. Lower = better random-access scrub, larger file          |
| `crf`     | 28                 | Quality. Lower = better quality + bigger file. h264: 20–28, h265: 26–32          |
| `fps`     | (preserve input)   | Resamples output to this fps. Affects scroll feel more than file size            |

The CLI ships its own `ffmpeg` via `ffmpeg-static` — no system install needed.
