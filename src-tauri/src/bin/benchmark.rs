use std::fs;
use std::path::Path;
use std::time::Instant;

fn main() {
    println!("=== QuickPick 核心管线性能基准压测 ===");

    let fixtures_dir = Path::new("test_fixtures");
    if !fixtures_dir.exists() {
        eprintln!("未找到测试样本目录 test_fixtures/");
        std::process::exit(1);
    }

    let files: Vec<_> = fs::read_dir(fixtures_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.extension()
                .is_some_and(|ext| ext == "jpg" || ext == "jpeg" || ext == "ARW")
        })
        .collect();

    if files.is_empty() {
        eprintln!("测试样本目录中无照片文件");
        std::process::exit(1);
    }

    // 1. EXIF 提取吞吐量基准测试
    let exif_iterations = 1000;
    let exif_start = Instant::now();
    for i in 0..exif_iterations {
        let path = &files[i % files.len()];
        let _ = quickpick_lib::engine::exif::extract_image_file_exif(path);
    }
    let exif_elapsed = exif_start.elapsed().as_secs_f64();
    let exif_throughput = exif_iterations as f64 / exif_elapsed;
    println!(
        "• EXIF 解析吞吐: {:.1} 张/秒 (耗时 {:.3}s, {} 轮)",
        exif_throughput, exif_elapsed, exif_iterations
    );

    // 2. 预览图加载延迟基准测试
    let preview_iterations = 50;
    let mut preview_latencies = Vec::with_capacity(preview_iterations);
    for i in 0..preview_iterations {
        let path = &files[i % files.len()];
        let t0 = Instant::now();
        let _ = quickpick_lib::engine::load_photo_preview(path);
        preview_latencies.push(t0.elapsed().as_secs_f64() * 1000.0);
    }
    preview_latencies.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let avg_preview = preview_latencies.iter().sum::<f64>() / preview_latencies.len() as f64;
    let p95_preview = preview_latencies[(preview_latencies.len() as f64 * 0.95) as usize];
    println!(
        "• 预览提取延迟: 平均 {:.2} ms, P95 {:.2} ms",
        avg_preview, p95_preview
    );

    // 基准红线断言
    let mut failed = false;
    if exif_throughput < 500.0 {
        eprintln!(
            "❌ 性能红线违规: EXIF 吞吐量 {:.1} < 500 张/秒",
            exif_throughput
        );
        failed = true;
    }
    if avg_preview > 50.0 {
        eprintln!(
            "❌ 性能红线违规: 预览提取平均延迟 {:.2}ms > 50ms",
            avg_preview
        );
        failed = true;
    }
    if failed {
        std::process::exit(1);
    } else {
        println!("✨ 核心管线全部性能指标达到质量红线！");
    }
}
