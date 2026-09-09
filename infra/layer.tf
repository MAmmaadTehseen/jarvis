# The scorecard renderer: @napi-rs/canvas ships a ~29 MB Skia binary, plus the
# fonts Lambda does not otherwise have. Kept out of the function so CI deploys
# stay a few hundred kilobytes, and because this changes about never.
#
# Build it with `npm run build:layer` before applying.

data "archive_file" "layer" {
  type        = "zip"
  source_dir  = "${path.module}/../dist/layer"
  output_path = "${path.module}/.build/layer.zip"
}

resource "aws_lambda_layer_version" "canvas" {
  layer_name          = "${local.name}-canvas"
  description         = "Skia (@napi-rs/canvas) + JetBrains Mono, for rendering the weekly scorecard."
  filename            = data.archive_file.layer.output_path
  source_code_hash    = data.archive_file.layer.output_base64sha256
  compatible_runtimes = ["nodejs22.x"]

  compatible_architectures = ["arm64"]
}
