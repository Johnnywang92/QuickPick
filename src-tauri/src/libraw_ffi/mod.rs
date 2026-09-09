pub mod bindings;

use bindings::*;
use std::ffi::{CStr, CString};
use std::path::Path;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum LibRawError {
    #[error("初始化 LibRaw 实例失败")]
    InitFailed,
    #[error("文件路径包含非法字符")]
    InvalidPath,
    #[error("打开 RAW 文件失败 (错误码: {0})")]
    OpenFileFailed(i32),
    #[error("解包内嵌缩略图失败 (错误码: {0})")]
    UnpackThumbFailed(i32),
    #[error("生成内嵌图内存对象失败 (错误码: {0})")]
    MakeMemThumbFailed(i32),
    #[error("未能提取到有效缩略图数据")]
    EmptyData,
}
#[derive(Debug, Clone)]
pub struct RawThumbnail {
    pub data: Vec<u8>,
    pub is_jpeg: bool,
    pub width: u32,
    pub height: u32,
}

/// 获取当前动态链接的 LibRaw 库版本号
pub fn get_libraw_version() -> String {
    unsafe {
        let ver = libraw_version();
        if ver.is_null() {
            "Unknown".to_string()
        } else {
            CStr::from_ptr(ver).to_string_lossy().into_owned()
        }
    }
}

/// 安全 RAII 包装器
struct LibRawContext(*mut std::ffi::c_void);

impl LibRawContext {
    fn new() -> Result<Self, LibRawError> {
        let ptr = unsafe { libraw_init(0) };
        if ptr.is_null() {
            Err(LibRawError::InitFailed)
        } else {
            Ok(Self(ptr))
        }
    }

    fn as_ptr(&self) -> *mut std::ffi::c_void {
        self.0
    }
}

impl Drop for LibRawContext {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                libraw_close(self.0);
            }
        }
    }
}

/// 从 RAW 文件中极速提取内嵌预览图（覆盖 Sony ARW, Canon CR3, Nikon NEF 等）
pub fn extract_embedded_thumbnail<P: AsRef<Path>>(path: P) -> Result<RawThumbnail, LibRawError> {
    let path_str = path.as_ref().to_str().ok_or(LibRawError::InvalidPath)?;
    let c_path = CString::new(path_str).map_err(|_| LibRawError::InvalidPath)?;

    let ctx = LibRawContext::new()?;

    // 1. 打开文件
    let ret = unsafe { libraw_open_file(ctx.as_ptr(), c_path.as_ptr()) };
    if ret != 0 {
        return Err(LibRawError::OpenFileFailed(ret));
    }

    // 2. 解包内嵌预览图
    let ret = unsafe { libraw_unpack_thumb(ctx.as_ptr()) };
    if ret != 0 {
        return Err(LibRawError::UnpackThumbFailed(ret));
    }

    // 3. 构造内存缩略图
    let mut errcode: std::ffi::c_int = 0;
    let mem_thumb = unsafe { libraw_dcraw_make_mem_thumb(ctx.as_ptr(), &mut errcode) };
    if mem_thumb.is_null() || errcode != 0 {
        return Err(LibRawError::MakeMemThumbFailed(errcode));
    }

    // 4. 拷贝并释放 C 内存
    let result = unsafe {
        let item = &*mem_thumb;
        if item.data_size == 0 {
            libraw_dcraw_clear_mem(mem_thumb);
            return Err(LibRawError::EmptyData);
        }

        let slice = std::slice::from_raw_parts(item.data.as_ptr(), item.data_size as usize);
        let is_jpeg = item.image_type == LIBRAW_IMAGE_JPEG;
        let data = slice.to_vec();
        let width = item.width as u32;
        let height = item.height as u32;

        libraw_dcraw_clear_mem(mem_thumb);

        RawThumbnail {
            data,
            is_jpeg,
            width,
            height,
        }
    };

    Ok(result)
}

fn c_chars_to_string(slice: &[std::ffi::c_char]) -> Option<String> {
    let bytes: Vec<u8> = slice
        .iter()
        .take_while(|&&c| c != 0)
        .map(|&c| c as u8)
        .collect();
    if bytes.is_empty() {
        return None;
    }
    let s = String::from_utf8_lossy(&bytes);
    crate::engine::exif::clean_string(&s)
}

/// 从已经打开的 LibRaw 上下文中提取 EXIF 拍摄参数
pub(crate) unsafe fn extract_raw_metadata_from_ctx(
    ctx_ptr: *mut std::ffi::c_void,
) -> Option<crate::models::ExifMetadata> {
    if ctx_ptr.is_null() {
        return None;
    }

    unsafe {
        let iparams_ptr = libraw_get_iparams(ctx_ptr);
        let lensinfo_ptr = libraw_get_lensinfo(ctx_ptr);
        let imgother_ptr = libraw_get_imgother(ctx_ptr);

        let (make, model) = if !iparams_ptr.is_null() {
            let iparams = &*iparams_ptr;
            let m = c_chars_to_string(&iparams.make);
            let md = c_chars_to_string(&iparams.model);
            crate::engine::exif::normalize_camera(m.as_deref(), md.as_deref())
        } else {
            (None, None)
        };

        let (lens_model, lens_make, focal_length_35mm) = if !lensinfo_ptr.is_null() {
            let lensinfo = &*lensinfo_ptr;
            let mut l_name = c_chars_to_string(&lensinfo.lens);
            if l_name.is_none() {
                l_name = c_chars_to_string(&lensinfo.makernotes.lens);
            }
            let l_make = c_chars_to_string(&lensinfo.lens_make);
            let fl35 = if lensinfo.focal_length_in_35mm_format > 0 {
                Some(lensinfo.focal_length_in_35mm_format as u32)
            } else {
                None
            };
            (l_name, l_make, fl35)
        } else {
            (None, None, None)
        };

        let (iso, shutter_speed_val, aperture, focal_length, date_time_original) =
            if !imgother_ptr.is_null() {
                let imgother = &*imgother_ptr;
                let iso = if imgother.iso_speed > 0.0 {
                    Some(imgother.iso_speed.round() as u32)
                } else {
                    None
                };
                let shutter = if imgother.shutter > 0.0 {
                    Some(imgother.shutter)
                } else {
                    None
                };
                let ap = if imgother.aperture > 0.0 {
                    Some(imgother.aperture)
                } else {
                    None
                };
                let fl = if imgother.focal_len > 0.0 {
                    Some(imgother.focal_len)
                } else {
                    None
                };
                let dt = if imgother.timestamp > 0 {
                    chrono::DateTime::from_timestamp(imgother.timestamp, 0)
                        .map(|d| d.format("%Y-%m-%d %H:%M:%S").to_string())
                } else {
                    None
                };
                (iso, shutter, ap, fl, dt)
            } else {
                (None, None, None, None, None)
            };

        let shutter_speed = shutter_speed_val.map(crate::engine::exif::format_shutter_speed);

        if make.is_none()
            && model.is_none()
            && lens_model.is_none()
            && aperture.is_none()
            && shutter_speed_val.is_none()
            && iso.is_none()
        {
            return None;
        }

        Some(crate::models::ExifMetadata {
            camera_make: make,
            camera_model: model,
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
}

/// 从 RAW 文件中快速读取机身、镜头、曝光与拍摄参数
pub fn extract_raw_metadata<P: AsRef<Path>>(
    path: P,
) -> Result<crate::models::ExifMetadata, LibRawError> {
    let path_str = path.as_ref().to_str().ok_or(LibRawError::InvalidPath)?;
    let c_path = CString::new(path_str).map_err(|_| LibRawError::InvalidPath)?;

    let ctx = LibRawContext::new()?;
    let ret = unsafe { libraw_open_file(ctx.as_ptr(), c_path.as_ptr()) };
    if ret != 0 {
        return Err(LibRawError::OpenFileFailed(ret));
    }

    unsafe { extract_raw_metadata_from_ctx(ctx.as_ptr()) }.ok_or(LibRawError::EmptyData)
}
