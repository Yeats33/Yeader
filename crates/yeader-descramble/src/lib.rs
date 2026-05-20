//! 功能型插件:图像分块乱序还原 + 重编码。
//!
//! 核心算法 `stitch_vertical_blocks` 与站点无关 —— 给定 `block_num` 即可还原。
//! `jm_block_num` 是 JM 特定的分块数选择规则,迁移自 Hmanga。

use image::{ImageBuffer, ImageFormat, RgbImage};

use yeader_crypto::md5_hex;
use yeader_sdk::{PluginError, PluginResult};

/// Output format for `process_image` / re-encoding.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputFormat {
    Webp,
    Jpeg,
    Png,
}

impl OutputFormat {
    pub fn extension(self) -> &'static str {
        match self {
            OutputFormat::Webp => "webp",
            OutputFormat::Jpeg => "jpg",
            OutputFormat::Png => "png",
        }
    }

    pub fn mime(self) -> &'static str {
        match self {
            OutputFormat::Webp => "image/webp",
            OutputFormat::Jpeg => "image/jpeg",
            OutputFormat::Png => "image/png",
        }
    }

    pub fn parse(name: &str) -> Self {
        match name.to_ascii_lowercase().as_str() {
            "jpg" | "jpeg" => OutputFormat::Jpeg,
            "png" => OutputFormat::Png,
            _ => OutputFormat::Webp,
        }
    }

    fn image_format(self) -> ImageFormat {
        match self {
            OutputFormat::Webp => ImageFormat::WebP,
            OutputFormat::Jpeg => ImageFormat::Jpeg,
            OutputFormat::Png => ImageFormat::Png,
        }
    }
}

pub struct DescrambledImage {
    pub bytes: Vec<u8>,
    pub extension: &'static str,
    pub mime: &'static str,
}

/// JM-specific block-count rule, ported from Hmanga.
///
/// - `chapter_id < scramble_id` → 0 (not scrambled, pass through).
/// - `< 268_850` → 10 strips.
/// - `< 421_926` → `md5("{chapter_id}{filename}")` last hex char modulo 10, then `*2 + 2`.
/// - otherwise → same formula with modulo 8.
pub fn jm_block_num(scramble_id: i64, chapter_id: i64, filename_stem: &str) -> u32 {
    if chapter_id < scramble_id {
        0
    } else if chapter_id < 268_850 {
        10
    } else {
        let modulus = if chapter_id < 421_926 { 10 } else { 8 };
        let digest = md5_hex(format!("{chapter_id}{filename_stem}"));
        let mut block = digest.chars().last().unwrap_or('0') as u32;
        block %= modulus;
        block * 2 + 2
    }
}

/// Reverse a vertical-strip scramble.
///
/// The site cuts the image into `block_num` horizontal strips and reorders them
/// (first ↔ last). This rebuilds the original by reading strips bottom-up.
/// `block_num == 0` is a pass-through.
pub fn stitch_vertical_blocks(source: &RgbImage, block_num: u32) -> RgbImage {
    if block_num == 0 {
        return source.clone();
    }

    let (width, height) = source.dimensions();
    let mut stitched: RgbImage = ImageBuffer::new(width, height);
    let remainder_height = height % block_num;

    for index in 0..block_num {
        let mut block_height = height / block_num;
        let source_y_start = height - (block_height * (index + 1)) - remainder_height;
        let mut target_y_start = block_height * index;

        if index == 0 {
            block_height += remainder_height;
        } else {
            target_y_start += remainder_height;
        }

        for y in 0..block_height {
            let source_y = source_y_start + y;
            let target_y = target_y_start + y;
            for x in 0..width {
                stitched.put_pixel(x, target_y, *source.get_pixel(x, source_y));
            }
        }
    }

    stitched
}

/// Decode → optionally descramble → re-encode pipeline.
///
/// GIFs are returned untouched (Hmanga behavior — JM serves animated covers as
/// GIF and they are never scrambled). Other formats are decoded as RGB,
/// stitched if `block_num > 0`, and re-encoded as `format`.
pub fn process_image(
    bytes: Vec<u8>,
    block_num: u32,
    format: OutputFormat,
) -> PluginResult<DescrambledImage> {
    let detected =
        image::guess_format(&bytes).map_err(|err| PluginError::Parse(err.to_string()))?;
    if detected == ImageFormat::Gif {
        return Ok(DescrambledImage {
            bytes,
            extension: "gif",
            mime: "image/gif",
        });
    }

    let source = image::load_from_memory(&bytes)
        .map_err(|err| PluginError::Parse(err.to_string()))?
        .to_rgb8();
    let output = stitch_vertical_blocks(&source, block_num);

    let mut encoded = Vec::new();
    image::DynamicImage::ImageRgb8(output)
        .write_to(
            &mut std::io::Cursor::new(&mut encoded),
            format.image_format(),
        )
        .map_err(|err| PluginError::Other(err.to_string()))?;

    Ok(DescrambledImage {
        bytes: encoded,
        extension: format.extension(),
        mime: format.mime(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgb;

    fn gradient_image(width: u32, height: u32) -> RgbImage {
        let mut img: RgbImage = ImageBuffer::new(width, height);
        for y in 0..height {
            for x in 0..width {
                img.put_pixel(x, y, Rgb([y as u8, x as u8, 0]));
            }
        }
        img
    }

    fn scramble_vertical_blocks(source: &RgbImage, block_num: u32) -> RgbImage {
        // Inverse of stitch_vertical_blocks: shuffle "natural" order back into
        // the on-the-wire order. Used by the round-trip test below.
        let (width, height) = source.dimensions();
        let mut scrambled: RgbImage = ImageBuffer::new(width, height);
        let remainder_height = height % block_num;

        for index in 0..block_num {
            let mut block_height = height / block_num;
            let target_y_start = height - (block_height * (index + 1)) - remainder_height;
            let mut source_y_start = block_height * index;

            if index == 0 {
                block_height += remainder_height;
            } else {
                source_y_start += remainder_height;
            }

            for y in 0..block_height {
                let target_y = target_y_start + y;
                let source_y = source_y_start + y;
                for x in 0..width {
                    scrambled.put_pixel(x, target_y, *source.get_pixel(x, source_y));
                }
            }
        }
        scrambled
    }

    #[test]
    fn block_num_zero_returns_clone() {
        let img = gradient_image(4, 8);
        let out = stitch_vertical_blocks(&img, 0);
        assert_eq!(out, img);
    }

    #[test]
    fn stitch_inverts_scramble_even_split() {
        let original = gradient_image(8, 40);
        let scrambled = scramble_vertical_blocks(&original, 10);
        let recovered = stitch_vertical_blocks(&scrambled, 10);
        assert_eq!(recovered, original);
    }

    #[test]
    fn stitch_inverts_scramble_with_remainder() {
        let original = gradient_image(8, 47);
        let scrambled = scramble_vertical_blocks(&original, 10);
        let recovered = stitch_vertical_blocks(&scrambled, 10);
        assert_eq!(recovered, original);
    }

    #[test]
    fn jm_block_num_pre_scramble_id_is_zero() {
        assert_eq!(jm_block_num(220_980, 200_000, "00001"), 0);
    }

    #[test]
    fn jm_block_num_pre_268850_is_ten() {
        assert_eq!(jm_block_num(220_980, 260_000, "00001"), 10);
    }

    #[test]
    fn jm_block_num_uses_md5_last_hex_modulo_8_after_threshold() {
        // 421_926 ≤ id → modulus 8, then *2 + 2 → even number in 2..=16
        let n = jm_block_num(220_980, 500_000, "00001");
        assert!((2..=16).contains(&n));
        assert!(n % 2 == 0);
    }

    #[test]
    fn output_format_parse_defaults_to_webp() {
        assert_eq!(OutputFormat::parse("webp"), OutputFormat::Webp);
        assert_eq!(OutputFormat::parse("JPG"), OutputFormat::Jpeg);
        assert_eq!(OutputFormat::parse("png"), OutputFormat::Png);
        assert_eq!(OutputFormat::parse("unknown"), OutputFormat::Webp);
    }
}
