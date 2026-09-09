# Fonts

JetBrains Mono, used by the scorecard renderer. Lambda has no system fonts, so
Skia is handed these files explicitly at runtime.

Committed rather than installed: the build stays hermetic, and
`raw.githubusercontent.com` is unreachable from the network this is built on.

Licensed under the SIL Open Font License 1.1 — see `OFL.txt`. Upstream:
https://github.com/JetBrains/JetBrainsMono
