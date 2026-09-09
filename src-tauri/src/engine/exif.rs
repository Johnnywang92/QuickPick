use crate::models::ExifMetadata;
use std::fs::File;
use std::io::Read;
use std::path::Path;

/// 格式化快门速度为摄影师习惯的友好字符串 (如 1/500s, 0.5s, 2s)
pub fn format_shutter_speed(seconds: f32) -> String {
    if seconds <= 0.0 {
        return "0s".to_string();
    }

    if seconds < 0.35 {
        let denom = (1.0 / seconds).round() as u32;
        format!("1/{}s", denom.max(1))
    } else if (seconds - seconds.round()).abs() < 0.05 {
        format!("{}s", seconds.round() as u32)
    } else {
        format!("{:.1}s", seconds)
    }
}

/// 清洗元数据文本（去除多余首尾空格、控制字符与空字符）
pub fn clean_string(raw: &str) -> Option<String> {
    let cleaned = raw
        .trim_matches(|c: char| c == '\0' || c.is_whitespace())
        .trim();
    if cleaned.is_empty()
        || cleaned.eq_ignore_ascii_case("unknown")
        || cleaned.eq_ignore_ascii_case("none")
        || cleaned.chars().all(|c| c == '0' || c == '-')
    {
        None
    } else {
        Some(cleaned.to_string())
    }
}

/// 标准化相机品牌与机身型号，避免 "SONY" / "ILCE-7RM5" 重复出现冗余
pub fn normalize_camera(
    make: Option<&str>,
    model: Option<&str>,
) -> (Option<String>, Option<String>) {
    let clean_make = make.and_then(clean_string);
    let mut clean_model = model.and_then(clean_string);

    if let (Some(m), Some(mod_str)) = (&clean_make, &clean_model) {
        if mod_str
            .to_lowercase()
            .starts_with(&format!("{} ", m.to_lowercase()))
        {
            let stripped = mod_str[m.len()..].trim().to_string();
            if !stripped.is_empty() {
                clean_model = Some(stripped);
            }
        }
    }

    (clean_make, clean_model)
}

/// 从图像文件中快速提取 EXIF 参数（针对 JPG / JPEG / TIFF）
pub fn extract_image_file_exif<P: AsRef<Path>>(path: P) -> Option<ExifMetadata> {
    let mut file = File::open(path).ok()?;
    let mut header = vec![0u8; 131072]; // 读取前 128KB，绝大多数 EXIF 位于前 64KB 内
    let bytes_read = file.read(&mut header).ok()?;
    if bytes_read < 16 {
        return None;
    }
    header.truncate(bytes_read);

    // 1. JPEG 格式检测 (0xFFD8)
    if header.starts_with(&[0xFF, 0xD8]) {
        return parse_jpeg_app1(&header);
    }

    // 2. TIFF 格式直接检测 (II or MM)
    if header.starts_with(b"II\x2a\x00") || header.starts_with(b"MM\x00\x2a") {
        return parse_tiff_bytes(&header);
    }

    None
}

/// 解析 JPEG APP1 (0xFFE1) 节中的 EXIF
pub fn parse_jpeg_app1(bytes: &[u8]) -> Option<ExifMetadata> {
    let mut idx = 2; // 跳过 SOI (0xFFD8)
    while idx + 4 < bytes.len() {
        if bytes[idx] != 0xFF {
            // 尝试扫描下一个 marker
            if let Some(pos) = bytes[idx..].iter().position(|&b| b == 0xFF) {
                idx += pos;
                if idx + 4 >= bytes.len() {
                    break;
                }
            } else {
                break;
            }
        }

        let marker = bytes[idx + 1];
        if marker == 0xD9 || marker == 0xDA {
            // EOI 或 SOS (图像数据开始，EXIF 只在 SOS 之前)
            break;
        }

        let len = u16::from_be_bytes([bytes[idx + 2], bytes[idx + 3]]) as usize;
        if len < 2 {
            break;
        }

        // 0xE1 即 APP1
        if marker == 0xE1 && idx + 4 + len - 2 <= bytes.len() {
            let app1_data = &bytes[idx + 4..idx + 2 + len];
            // 检查 Exif\0\0 标识 (6 字节)
            if app1_data.starts_with(b"Exif\0\0") && app1_data.len() > 6 {
                let tiff_data = &app1_data[6..];
                return parse_tiff_bytes(tiff_data);
            }
        }

        idx += 2 + len;
    }
    None
}

#[derive(Clone, Copy)]
enum ByteOrder {
    LittleEndian,
    BigEndian,
}

struct TiffReader<'a> {
    data: &'a [u8],
    order: ByteOrder,
}

impl<'a> TiffReader<'a> {
    fn new(data: &'a [u8]) -> Option<Self> {
        if data.len() < 8 {
            return None;
        }
        let order = if &data[0..2] == b"II" {
            ByteOrder::LittleEndian
        } else if &data[0..2] == b"MM" {
            ByteOrder::BigEndian
        } else {
            return None;
        };

        let r = Self { data, order };
        if r.u16_at(2)? != 42 {
            return None;
        }
        Some(r)
    }

    fn u16_at(&self, offset: usize) -> Option<u16> {
        if offset + 2 > self.data.len() {
            return None;
        }
        let bytes: [u8; 2] = [self.data[offset], self.data[offset + 1]];
        Some(match self.order {
            ByteOrder::LittleEndian => u16::from_le_bytes(bytes),
            ByteOrder::BigEndian => u16::from_be_bytes(bytes),
        })
    }

    fn u32_at(&self, offset: usize) -> Option<u32> {
        if offset + 4 > self.data.len() {
            return None;
        }
        let bytes: [u8; 4] = [
            self.data[offset],
            self.data[offset + 1],
            self.data[offset + 2],
            self.data[offset + 3],
        ];
        Some(match self.order {
            ByteOrder::LittleEndian => u32::from_le_bytes(bytes),
            ByteOrder::BigEndian => u32::from_be_bytes(bytes),
        })
    }

    fn rational_at(&self, offset: usize) -> Option<f32> {
        let num = self.u32_at(offset)?;
        let denom = self.u32_at(offset + 4)?;
        if denom == 0 {
            None
        } else {
            Some(num as f32 / denom as f32)
        }
    }

    fn string_at(&self, offset: usize, count: usize) -> Option<String> {
        let end = offset.checked_add(count)?;
        if end > self.data.len() {
            return None;
        }
        let slice = &self.data[offset..end];
        let s = String::from_utf8_lossy(slice);
        clean_string(&s)
    }
}

/// 解析 TIFF 字节流中的 IFD0 与 Exif SubIFD
pub fn parse_tiff_bytes(tiff_data: &[u8]) -> Option<ExifMetadata> {
    let reader = TiffReader::new(tiff_data)?;
    let ifd0_offset = reader.u32_at(4)? as usize;

    let mut make = None;
    let mut model = None;
    let mut exif_subifd_offset = None;

    parse_ifd(
        &reader,
        ifd0_offset,
        |tag, type_id, count, val_or_offset| {
            match tag {
                0x010F => {
                    // Make
                    make = read_string_value(&reader, type_id, count, val_or_offset);
                }
                0x0110 => {
                    // Model
                    model = read_string_value(&reader, type_id, count, val_or_offset);
                }
                0x8769 => {
                    // ExifIFDPointer
                    exif_subifd_offset = Some(val_or_offset as usize);
                }
                _ => {}
            }
        },
    );

    let mut lens_model = None;
    let mut lens_make = None;
    let mut aperture = None;
    let mut shutter_speed_val = None;
    let mut iso = None;
    let mut focal_length = None;
    let mut focal_length_35mm = None;
    let mut date_time_original = None;

    if let Some(sub_offset) = exif_subifd_offset {
        parse_ifd(&reader, sub_offset, |tag, type_id, count, val_or_offset| {
            match tag {
                0x829A => {
                    // ExposureTime (RATIONAL)
                    if type_id == 5 {
                        shutter_speed_val = reader.rational_at(val_or_offset as usize);
                    }
                }
                0x829D => {
                    // FNumber (RATIONAL)
                    if type_id == 5 {
                        aperture = reader.rational_at(val_or_offset as usize);
                    }
                }
                0x8827 => {
                    // PhotographicSensitivity / ISOSpeedRatings (SHORT)
                    if type_id == 3 {
                        iso = Some(val_or_offset);
                    }
                }
                0x9003 | 0x9004 => {
                    // DateTimeOriginal / DateTimeDigitized
                    if date_time_original.is_none() {
                        if let Some(mut dt) =
                            read_string_value(&reader, type_id, count, val_or_offset)
                        {
                            // 将 "2026:08:15 14:30:00" 转换为 "2026-08-15 14:30:00"
                            if dt.len() >= 10 && &dt[4..5] == ":" && &dt[7..8] == ":" {
                                dt.replace_range(4..5, "-");
                                dt.replace_range(7..8, "-");
                            }
                            date_time_original = Some(dt);
                        }
                    }
                }
                0x920A => {
                    // FocalLength (RATIONAL)
                    if type_id == 5 {
                        focal_length = reader.rational_at(val_or_offset as usize);
                    }
                }
                0xA405 => {
                    // FocalLengthIn35mmFilm (SHORT)
                    if type_id == 3 && val_or_offset > 0 {
                        focal_length_35mm = Some(val_or_offset);
                    }
                }
                0xA433 => {
                    // LensMake
                    lens_make = read_string_value(&reader, type_id, count, val_or_offset);
                }
                0xA434 => {
                    // LensModel
                    lens_model = read_string_value(&reader, type_id, count, val_or_offset);
                }
                _ => {}
            }
        });
    }

    let (camera_make, camera_model) = normalize_camera(make.as_deref(), model.as_deref());
    let shutter_speed = shutter_speed_val.map(format_shutter_speed);

    // 如果所有关键字段全部为空，返回 None
    if camera_make.is_none()
        && camera_model.is_none()
        && lens_model.is_none()
        && aperture.is_none()
        && shutter_speed_val.is_none()
        && iso.is_none()
    {
        return None;
    }

    Some(ExifMetadata {
        camera_make,
        camera_model,
        lens_model,
        lens_make,
        focal_length,
        focal_length_35mm,
        aperture,
        shutter_speed,
        shutter_speed_value: shutter_speed_val,
        iso,
        date_time_original,
    })
}

fn parse_ifd<F>(reader: &TiffReader, offset: usize, mut on_entry: F)
where
    F: FnMut(u16, u16, u32, u32),
{
    let count = match reader.u16_at(offset) {
        Some(c) => c as usize,
        None => return,
    };

    let entries_start = offset + 2;
    for i in 0..count {
        let entry_offset = match entries_start.checked_add(i * 12) {
            Some(o) => o,
            None => break,
        };
        let tag = match reader.u16_at(entry_offset) {
            Some(t) => t,
            None => break,
        };
        let type_id = match reader.u16_at(entry_offset + 2) {
            Some(t) => t,
            None => break,
        };
        let item_count = match reader.u32_at(entry_offset + 4) {
            Some(c) => c,
            None => break,
        };
        let val_or_offset = match reader.u32_at(entry_offset + 8) {
            Some(v) => v,
            None => break,
        };

        on_entry(tag, type_id, item_count, val_or_offset);
    }
}

fn read_string_value(
    reader: &TiffReader,
    type_id: u16,
    count: u32,
    val_or_offset: u32,
) -> Option<String> {
    if type_id != 2 || count == 0 {
        return None;
    }
    let count_usize = count as usize;
    if count_usize <= 4 {
        // 短字符串直接存储在 offset 字段的 4 字节内
        let le_bytes = val_or_offset.to_le_bytes();
        let be_bytes = val_or_offset.to_be_bytes();
        let raw_slice = match reader.order {
            ByteOrder::LittleEndian => &le_bytes[0..count_usize],
            ByteOrder::BigEndian => &be_bytes[0..count_usize],
        };
        let s = String::from_utf8_lossy(raw_slice);
        clean_string(&s)
    } else {
        reader.string_at(val_or_offset as usize, count_usize)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_shutter_speed() {
        assert_eq!(format_shutter_speed(0.002), "1/500s");
        assert_eq!(format_shutter_speed(0.000125), "1/8000s");
        assert_eq!(format_shutter_speed(0.04), "1/25s");
        assert_eq!(format_shutter_speed(0.5), "0.5s");
        assert_eq!(format_shutter_speed(1.0), "1s");
        assert_eq!(format_shutter_speed(2.0), "2s");
        assert_eq!(format_shutter_speed(2.5), "2.5s");
        assert_eq!(format_shutter_speed(30.0), "30s");
    }

    #[test]
    fn test_clean_string() {
        assert_eq!(clean_string("  Sony  \0"), Some("Sony".to_string()));
        assert_eq!(clean_string("   "), None);
        assert_eq!(clean_string("Unknown"), None);
        assert_eq!(clean_string("000000"), None);
    }

    #[test]
    fn test_normalize_camera() {
        let (make, model) = normalize_camera(Some("Sony"), Some("Sony ILCE-7RM5"));
        assert_eq!(make, Some("Sony".to_string()));
        assert_eq!(model, Some("ILCE-7RM5".to_string()));

        let (make, model) = normalize_camera(Some("Canon"), Some("EOS R5"));
        assert_eq!(make, Some("Canon".to_string()));
        assert_eq!(model, Some("EOS R5".to_string()));
    }

    #[test]
    fn test_parse_synthetic_tiff_and_jpeg() {
        let mut buf = Vec::new();
        // 1. TIFF Header (Little Endian)
        buf.extend_from_slice(b"II\x2a\x00");
        buf.extend_from_slice(&8u32.to_le_bytes()); // IFD0 at offset 8

        // IFD0: 3 entries
        // entry 0: Make (0x010F), ASCII (2), count 5, offset data_make
        // entry 1: Model (0x0110), ASCII (2), count 10, offset data_model
        // entry 2: ExifIFDPointer (0x8769), LONG (4), count 1, offset subifd_offset
        buf.extend_from_slice(&3u16.to_le_bytes()); // 3 entries

        // IFD0 starts at 8, count is 2 bytes (8..10).
        // 3 entries * 12 bytes = 36 bytes (10..46).
        // next IFD = 4 bytes (46..50).
        // SubIFD offset = 50.
        let subifd_offset = 50u32;
        // Data area starts after SubIFD.
        // SubIFD: 7 entries:
        // count = 2 bytes (50..52).
        // 7 entries * 12 bytes = 84 bytes (52..136).
        // next IFD = 4 bytes (136..140).
        // Data area starts at 140!
        let data_make_offset = 140u32;
        let data_model_offset = data_make_offset + 8; // 148
        let data_exp_offset = data_model_offset + 12; // 160
        let data_fn_offset = data_exp_offset + 8; // 168
        let data_dt_offset = data_fn_offset + 8; // 176
        let data_fl_offset = data_dt_offset + 20; // 196
        let data_lens_offset = data_fl_offset + 8; // 204

        // Entry 0: Make
        buf.extend_from_slice(&0x010Fu16.to_le_bytes());
        buf.extend_from_slice(&2u16.to_le_bytes());
        buf.extend_from_slice(&5u32.to_le_bytes());
        buf.extend_from_slice(&data_make_offset.to_le_bytes());

        // Entry 1: Model
        buf.extend_from_slice(&0x0110u16.to_le_bytes());
        buf.extend_from_slice(&2u16.to_le_bytes());
        buf.extend_from_slice(&10u32.to_le_bytes());
        buf.extend_from_slice(&data_model_offset.to_le_bytes());

        // Entry 2: ExifIFDPointer
        buf.extend_from_slice(&0x8769u16.to_le_bytes());
        buf.extend_from_slice(&4u16.to_le_bytes());
        buf.extend_from_slice(&1u32.to_le_bytes());
        buf.extend_from_slice(&subifd_offset.to_le_bytes());

        // IFD0 next pointer
        buf.extend_from_slice(&0u32.to_le_bytes());

        // SubIFD (offset 50)
        assert_eq!(buf.len(), 50);
        buf.extend_from_slice(&7u16.to_le_bytes()); // 7 entries

        // SubIFD Entry 0: ExposureTime 0x829A (RATIONAL: 1/500s)
        buf.extend_from_slice(&0x829Au16.to_le_bytes());
        buf.extend_from_slice(&5u16.to_le_bytes());
        buf.extend_from_slice(&1u32.to_le_bytes());
        buf.extend_from_slice(&data_exp_offset.to_le_bytes());

        // SubIFD Entry 1: FNumber 0x829D (RATIONAL: 28/10 = 2.8)
        buf.extend_from_slice(&0x829Du16.to_le_bytes());
        buf.extend_from_slice(&5u16.to_le_bytes());
        buf.extend_from_slice(&1u32.to_le_bytes());
        buf.extend_from_slice(&data_fn_offset.to_le_bytes());

        // SubIFD Entry 2: ISO 0x8827 (SHORT: 100 in value field)
        buf.extend_from_slice(&0x8827u16.to_le_bytes());
        buf.extend_from_slice(&3u16.to_le_bytes());
        buf.extend_from_slice(&1u32.to_le_bytes());
        buf.extend_from_slice(&100u32.to_le_bytes());

        // SubIFD Entry 3: DateTimeOriginal 0x9003 (ASCII: "2026:08:15 14:30:00\0")
        buf.extend_from_slice(&0x9003u16.to_le_bytes());
        buf.extend_from_slice(&2u16.to_le_bytes());
        buf.extend_from_slice(&20u32.to_le_bytes());
        buf.extend_from_slice(&data_dt_offset.to_le_bytes());

        // SubIFD Entry 4: FocalLength 0x920A (RATIONAL: 50/1)
        buf.extend_from_slice(&0x920Au16.to_le_bytes());
        buf.extend_from_slice(&5u16.to_le_bytes());
        buf.extend_from_slice(&1u32.to_le_bytes());
        buf.extend_from_slice(&data_fl_offset.to_le_bytes());

        // SubIFD Entry 5: FocalLengthIn35mmFilm 0xA405 (SHORT: 50)
        buf.extend_from_slice(&0xA405u16.to_le_bytes());
        buf.extend_from_slice(&3u16.to_le_bytes());
        buf.extend_from_slice(&1u32.to_le_bytes());
        buf.extend_from_slice(&50u32.to_le_bytes());

        // SubIFD Entry 6: LensModel 0xA434 (ASCII: "FE 24-70mm F2.8 GM II\0")
        buf.extend_from_slice(&0xA434u16.to_le_bytes());
        buf.extend_from_slice(&2u16.to_le_bytes());
        buf.extend_from_slice(&22u32.to_le_bytes());
        buf.extend_from_slice(&data_lens_offset.to_le_bytes());

        // SubIFD next pointer
        buf.extend_from_slice(&0u32.to_le_bytes());

        assert_eq!(buf.len(), 140);
        // Data area:
        // Make: "SONY\0" (5 bytes + 3 padding)
        buf.extend_from_slice(b"SONY\0\0\0\0");
        // Model: "ILCE-7RM5\0" (12 bytes: 9 chars + 3 padding)
        buf.extend_from_slice(b"ILCE-7RM5\0\0\0");
        // ExposureTime: 1 / 500
        buf.extend_from_slice(&1u32.to_le_bytes());
        buf.extend_from_slice(&500u32.to_le_bytes());
        // FNumber: 28 / 10
        buf.extend_from_slice(&28u32.to_le_bytes());
        buf.extend_from_slice(&10u32.to_le_bytes());
        // DateTimeOriginal: "2026:08:15 14:30:00\0" (20 bytes)
        buf.extend_from_slice(b"2026:08:15 14:30:00\0");
        // FocalLength: 50 / 1
        buf.extend_from_slice(&50u32.to_le_bytes());
        buf.extend_from_slice(&1u32.to_le_bytes());
        // LensModel: "FE 24-70mm F2.8 GM II\0"
        buf.extend_from_slice(b"FE 24-70mm F2.8 GM II\0");

        // 1. 测试纯 TIFF 字节解析
        let exif = parse_tiff_bytes(&buf).expect("Should parse synthetic TIFF exif");
        assert_eq!(exif.camera_make.as_deref(), Some("SONY"));
        assert_eq!(exif.camera_model.as_deref(), Some("ILCE-7RM5"));
        assert_eq!(exif.lens_model.as_deref(), Some("FE 24-70mm F2.8 GM II"));
        assert_eq!(exif.shutter_speed.as_deref(), Some("1/500s"));
        assert_eq!(exif.aperture, Some(2.8));
        assert_eq!(exif.iso, Some(100));
        assert_eq!(exif.focal_length, Some(50.0));
        assert_eq!(exif.focal_length_35mm, Some(50));
        assert_eq!(
            exif.date_time_original.as_deref(),
            Some("2026-08-15 14:30:00")
        );

        // 2. 测试封装在 JPEG APP1 节中的解析
        let mut jpeg = Vec::new();
        jpeg.extend_from_slice(&[0xFF, 0xD8]); // SOI
        jpeg.extend_from_slice(&[0xFF, 0xE1]); // APP1 marker
        let app1_len = (buf.len() + 6 + 2) as u16; // payload + Exif\0\0 (6) + length bytes (2)
        jpeg.extend_from_slice(&app1_len.to_be_bytes());
        jpeg.extend_from_slice(b"Exif\0\0");
        jpeg.extend_from_slice(&buf);
        jpeg.extend_from_slice(&[0xFF, 0xDA]); // SOS

        let jpeg_exif = parse_jpeg_app1(&jpeg).expect("Should parse synthetic JPEG APP1 exif");
        assert_eq!(jpeg_exif.camera_make.as_deref(), Some("SONY"));
        assert_eq!(jpeg_exif.camera_model.as_deref(), Some("ILCE-7RM5"));
        assert_eq!(
            jpeg_exif.lens_model.as_deref(),
            Some("FE 24-70mm F2.8 GM II")
        );
        assert_eq!(jpeg_exif.aperture, Some(2.8));
        assert_eq!(jpeg_exif.iso, Some(100));
    }
}
