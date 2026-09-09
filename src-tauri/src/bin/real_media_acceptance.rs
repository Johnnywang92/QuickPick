use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::env;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::time::{Instant, UNIX_EPOCH};

const SCAN_LIMIT_MS: f64 = 2_000.0;
const FIRST_PREVIEW_LIMIT_MS: f64 = 1_000.0;
const PREVIEW_P95_LIMIT_MS: f64 = 100.0;

#[derive(Debug)]
struct Options {
    root: PathBuf,
    min_count: usize,
    limit: Option<usize>,
    full_hash: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SourceEntry {
    kind: &'static str,
    size: u64,
    modified_nanos: Option<u128>,
    readonly: bool,
    unix_mode: Option<u32>,
    sha256: Option<String>,
    symlink_target: Option<PathBuf>,
}

fn usage() -> &'static str {
    "用法: npm run accept:media -- <照片目录> [--min-count N] [--limit N] [--metadata-only]\n\
     默认对目录内所有文件做前后 SHA-256 快照，并对所有支持的照片执行只读扫描、EXIF/RAW 元数据和预览提取。"
}

fn parse_usize(flag: &str, value: Option<String>) -> Result<usize, String> {
    value
        .ok_or_else(|| format!("{flag} 缺少数值"))?
        .parse::<usize>()
        .map_err(|_| format!("{flag} 必须是非负整数"))
}

fn parse_options() -> Result<Options, String> {
    let mut args = env::args().skip(1);
    let root = match args.next() {
        Some(value) if value == "-h" || value == "--help" => return Err(usage().to_string()),
        Some(value) => PathBuf::from(value),
        None => return Err(usage().to_string()),
    };
    let mut options = Options {
        root,
        min_count: 1,
        limit: None,
        full_hash: true,
    };

    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--min-count" => options.min_count = parse_usize(&flag, args.next())?,
            "--limit" => options.limit = Some(parse_usize(&flag, args.next())?),
            "--metadata-only" => options.full_hash = false,
            "-h" | "--help" => return Err(usage().to_string()),
            _ => return Err(format!("未知参数: {flag}\n{}", usage())),
        }
    }

    if options.limit == Some(0) {
        return Err("--limit 必须大于 0".to_string());
    }
    Ok(options)
}

fn sha256_file(path: &Path) -> io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn source_entry(path: &Path, full_hash: bool) -> Result<SourceEntry, String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("无法读取源条目元数据 {}: {error}", path.display()))?;
    let file_type = metadata.file_type();
    let kind = if file_type.is_file() {
        "file"
    } else if file_type.is_dir() {
        "directory"
    } else if file_type.is_symlink() {
        "symlink"
    } else {
        "other"
    };
    let modified_nanos = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos());
    #[cfg(unix)]
    let unix_mode = {
        use std::os::unix::fs::PermissionsExt;
        Some(metadata.permissions().mode())
    };
    #[cfg(not(unix))]
    let unix_mode = None;
    let sha256 = if full_hash && file_type.is_file() {
        Some(
            sha256_file(path)
                .map_err(|error| format!("无法计算源文件 SHA-256 {}: {error}", path.display()))?,
        )
    } else {
        None
    };
    let symlink_target = if file_type.is_symlink() {
        Some(
            fs::read_link(path)
                .map_err(|error| format!("无法读取符号链接 {}: {error}", path.display()))?,
        )
    } else {
        None
    };

    Ok(SourceEntry {
        kind,
        size: metadata.len(),
        modified_nanos,
        readonly: metadata.permissions().readonly(),
        unix_mode,
        sha256,
        symlink_target,
    })
}

fn snapshot_source(root: &Path, full_hash: bool) -> Result<BTreeMap<String, SourceEntry>, String> {
    let mut snapshot = BTreeMap::new();
    snapshot.insert(".".to_string(), source_entry(root, false)?);
    let entries = fs::read_dir(root)
        .map_err(|error| format!("无法读取照片目录 {}: {error}", root.display()))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("枚举源目录失败: {error}"))?;
        snapshot.insert(
            entry.file_name().to_string_lossy().to_string(),
            source_entry(&entry.path(), full_hash)?,
        );
    }
    Ok(snapshot)
}

fn percentile_95(values: &mut [f64]) -> f64 {
    values.sort_by(|left, right| left.total_cmp(right));
    values[(values.len() - 1) * 95 / 100]
}

fn round_ms(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn run(options: Options) -> Result<bool, String> {
    let root = fs::canonicalize(&options.root)
        .map_err(|error| format!("照片目录不可用 {}: {error}", options.root.display()))?;
    if !root.is_dir() {
        return Err(format!("不是照片目录: {}", root.display()));
    }

    eprintln!("正在创建源目录前置快照（不计入扫描性能）……");
    let before = snapshot_source(&root, options.full_hash)?;

    let scan_started = Instant::now();
    let photos = quickpick_lib::engine::scan_directory_fast(&root)?;
    let scan_ms = scan_started.elapsed().as_secs_f64() * 1_000.0;
    if photos.is_empty() {
        return Err("目录中没有 QuickPick 支持的照片".to_string());
    }

    let tested_count = options.limit.unwrap_or(photos.len()).min(photos.len());
    let tested = &photos[..tested_count];
    let mut format_counts = BTreeMap::<String, usize>::new();
    for photo in &photos {
        let extension = Path::new(&photo.path)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("unknown")
            .to_ascii_lowercase();
        *format_counts.entry(extension).or_default() += 1;
    }

    let first_preview_started = Instant::now();
    let first_preview_error =
        quickpick_lib::engine::load_source_photo_preview(&tested[0].path).err();
    let first_preview_ms = first_preview_started.elapsed().as_secs_f64() * 1_000.0;

    let mut preview_latencies = Vec::with_capacity(tested_count);
    let mut preview_failures = Vec::new();
    let mut raw_metadata_failures = Vec::new();
    let mut metadata_found = 0_usize;
    for photo in tested {
        let preview_started = Instant::now();
        if let Err(error) = quickpick_lib::engine::load_source_photo_preview(&photo.path) {
            preview_failures.push(format!("{}: {error}", photo.filename));
        }
        preview_latencies.push(preview_started.elapsed().as_secs_f64() * 1_000.0);

        if photo.is_raw {
            if quickpick_lib::libraw_ffi::extract_raw_metadata(&photo.path).is_ok() {
                metadata_found += 1;
            } else {
                raw_metadata_failures.push(photo.filename.clone());
            }
        } else if quickpick_lib::engine::exif::extract_image_file_exif(&photo.path).is_some() {
            metadata_found += 1;
        }
    }

    let preview_average_ms = preview_latencies.iter().sum::<f64>() / preview_latencies.len() as f64;
    let preview_p95_ms = percentile_95(&mut preview_latencies);

    eprintln!("正在创建源目录后置快照……");
    let after = snapshot_source(&root, options.full_hash)?;
    let source_unchanged = before == after;
    let count_ok = photos.len() >= options.min_count;
    let scan_ok = scan_ms <= SCAN_LIMIT_MS;
    let first_preview_ok =
        first_preview_error.is_none() && first_preview_ms <= FIRST_PREVIEW_LIMIT_MS;
    let preview_p95_ok = preview_p95_ms <= PREVIEW_P95_LIMIT_MS;
    let previews_ok = preview_failures.is_empty();
    let raw_metadata_ok = raw_metadata_failures.is_empty();
    let passed = source_unchanged
        && count_ok
        && scan_ok
        && first_preview_ok
        && preview_p95_ok
        && previews_ok
        && raw_metadata_ok;

    let report = json!({
        "kind": "quickpick_real_media_acceptance",
        "root": root,
        "photo_count": photos.len(),
        "tested_count": tested_count,
        "format_counts": format_counts,
        "metadata_found": metadata_found,
        "first_preview_error": first_preview_error.map(|error| format!("{}: {error}", tested[0].filename)),
        "preview_failures": preview_failures,
        "raw_metadata_failures": raw_metadata_failures,
        "source_integrity": {
            "unchanged": source_unchanged,
            "full_content_sha256": options.full_hash,
        },
        "metrics_ms": {
            "fast_scan": round_ms(scan_ms),
            "first_preview": round_ms(first_preview_ms),
            "preview_average": round_ms(preview_average_ms),
            "preview_p95": round_ms(preview_p95_ms),
        },
        "thresholds": {
            "minimum_photo_count": options.min_count,
            "fast_scan_max_ms": SCAN_LIMIT_MS,
            "first_preview_max_ms": FIRST_PREVIEW_LIMIT_MS,
            "preview_p95_max_ms": PREVIEW_P95_LIMIT_MS,
        },
        "passed": passed,
    });
    println!(
        "{}",
        serde_json::to_string_pretty(&report).map_err(|error| error.to_string())?
    );
    Ok(passed)
}

fn main() {
    let options = match parse_options() {
        Ok(options) => options,
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(2);
        }
    };
    match run(options) {
        Ok(true) => {}
        Ok(false) => std::process::exit(1),
        Err(error) => {
            eprintln!("真实素材验收失败: {error}");
            std::process::exit(1);
        }
    }
}
