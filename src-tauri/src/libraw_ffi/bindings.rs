use std::ffi::{c_char, c_int, c_uint, c_void};

/// LibRaw 处理后图像结构 (对应 libraw_processed_image_t)
#[repr(C)]
pub struct LibRawProcessedImage {
    /// 图像格式类型: 1 = LIBRAW_IMAGE_JPEG, 2 = LIBRAW_IMAGE_BITMAP
    pub image_type: u32,
    pub height: u16,
    pub width: u16,
    pub colors: u16,
    pub bits: u16,
    pub data_size: u32,
    pub data: [u8; 1],
}

pub const LIBRAW_IMAGE_JPEG: u32 = 1;
pub const LIBRAW_IMAGE_BITMAP: u32 = 2;

extern "C" {
    /// 初始化 LibRaw 句柄
    pub fn libraw_init(flags: c_uint) -> *mut c_void;

    /// 释放 LibRaw 句柄
    pub fn libraw_close(lr: *mut c_void);

    /// 打开指定路径的 RAW 图像文件
    pub fn libraw_open_file(lr: *mut c_void, file: *const c_char) -> c_int;

    /// 解包内嵌缩略图/预览图数据
    pub fn libraw_unpack_thumb(lr: *mut c_void) -> c_int;

    /// 将内嵌预览图转换为内存缓冲区
    pub fn libraw_dcraw_make_mem_thumb(
        lr: *mut c_void,
        errcode: *mut c_int,
    ) -> *mut LibRawProcessedImage;

    /// 释放 LibRaw 内部申请的内存图像缓冲区
    pub fn libraw_dcraw_clear_mem(mem: *mut LibRawProcessedImage);

    /// 返回当前链接的 LibRaw 库版本号字符串
    pub fn libraw_version() -> *const c_char;

    /// 返回错误代码对应的描述文字
    pub fn libraw_strerror(errorcode: c_int) -> *const c_char;
}
