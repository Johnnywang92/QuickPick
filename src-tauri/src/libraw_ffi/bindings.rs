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

/// LibRaw 机身基本参数结构体 (对应 libraw_iparams_t 前部关键字段)
#[repr(C)]
pub struct LibRawIparams {
    pub guard: [c_char; 4],
    pub make: [c_char; 64],
    pub model: [c_char; 64],
    pub software: [c_char; 64],
    pub normalized_make: [c_char; 64],
    pub normalized_model: [c_char; 64],
}

/// LibRaw 厂商私有镜头结构
#[repr(C)]
pub struct LibRawMakernotesLens {
    pub lens_id: u64,
    pub lens: [c_char; 128],
}

/// LibRaw 镜头参数结构体 (对应 libraw_lensinfo_t)
#[repr(C)]
pub struct LibRawLensInfo {
    pub min_focal: f32,
    pub max_focal: f32,
    pub max_ap_4_min_focal: f32,
    pub max_ap_4_max_focal: f32,
    pub exif_max_ap: f32,
    pub lens_make: [c_char; 128],
    pub lens: [c_char; 128],
    pub lens_serial: [c_char; 128],
    pub internal_lens_serial: [c_char; 128],
    pub focal_length_in_35mm_format: u16,
    pub nikon: [u8; 8],
    pub dng: [u8; 16],
    pub makernotes: LibRawMakernotesLens,
}

/// LibRaw 曝光与拍摄信息结构体 (对应 libraw_imgother_t 前部关键字段)
#[repr(C)]
pub struct LibRawImgOther {
    pub iso_speed: f32,
    pub shutter: f32,
    pub aperture: f32,
    pub focal_len: f32,
    pub timestamp: libc::time_t,
}

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

    /// 获取机身参数指针
    pub fn libraw_get_iparams(lr: *mut c_void) -> *mut LibRawIparams;

    /// 获取镜头信息指针
    pub fn libraw_get_lensinfo(lr: *mut c_void) -> *mut LibRawLensInfo;

    /// 获取曝光与其他拍摄信息指针
    pub fn libraw_get_imgother(lr: *mut c_void) -> *mut LibRawImgOther;

    /// 返回当前链接的 LibRaw 库版本号字符串
    pub fn libraw_version() -> *const c_char;

    /// 返回错误代码对应的描述文字
    pub fn libraw_strerror(errorcode: c_int) -> *const c_char;
}
