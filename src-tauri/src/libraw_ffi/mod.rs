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
    let path_str = path
        .as_ref()
        .to_str()
        .ok_or(LibRawError::InvalidPath)?;
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
