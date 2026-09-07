use std::env;
use std::path::Path;
use std::time::Duration;
use quickpick_lib::engine::cache::{build_folder_cache, DEFAULT_PROXY_MAX_EDGE};

#[tokio::main]
async fn main() {
    println!("================================================================");
    println!("  QuickPick Studio NAS Daemon (v0.1.0)");
    println!("  Headless Background 2K Proxy & Catalog Engine for Synology/QNAP");
    println!("================================================================");

    let args: Vec<String> = env::args().collect();
    let mut watch_dirs: Vec<String> = Vec::new();
    let mut interval_secs: u64 = 30;
    let mut run_once = false;
    let mut max_edge = DEFAULT_PROXY_MAX_EDGE;

    // 优先读取环境变量 (Docker 容器传参规范)
    if let Ok(env_dirs) = env::var("WATCH_DIRS") {
        for d in env_dirs.split([':', ',', ';']) {
            let trimmed = d.trim();
            if !trimmed.is_empty() {
                watch_dirs.push(trimmed.to_string());
            }
        }
    }

    if let Ok(env_interval) = env::var("SCAN_INTERVAL") {
        if let Ok(secs) = env_interval.parse::<u64>() {
            interval_secs = secs;
        }
    }

    if let Ok(env_edge) = env::var("PROXY_MAX_EDGE") {
        if let Ok(edge) = env_edge.parse::<u32>() {
            max_edge = edge;
        }
    }

    // 解析命令行参数
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--watch" => {
                if i + 1 < args.len() {
                    watch_dirs.push(args[i + 1].clone());
                    i += 1;
                }
            }
            "--interval" => {
                if i + 1 < args.len() {
                    if let Ok(s) = args[i + 1].parse::<u64>() {
                        interval_secs = s;
                    }
                    i += 1;
                }
            }
            "--max-edge" => {
                if i + 1 < args.len() {
                    if let Ok(edge) = args[i + 1].parse::<u32>() {
                        max_edge = edge;
                    }
                    i += 1;
                }
            }
            "--once" => {
                run_once = true;
            }
            "--help" | "-h" => {
                println!("用法: quickpick-server [选项]");
                println!("  --watch <DIR>        指定监听或构建缓存的相册目录");
                println!("  --interval <SECS>    相册自动扫描轮询间隔 (秒，默认 30)");
                println!("  --max-edge <PIXELS>  2K 代理长边分辨率上限 (默认 2048)");
                println!("  --once               仅执行一次扫描并退出 (适用于 CI/定时任务)");
                println!("  环境变量支持: WATCH_DIRS=/photos, SCAN_INTERVAL=30, PROXY_MAX_EDGE=2048");
                return;
            }
            _ => {
                if !args[i].starts_with('-') && watch_dirs.is_empty() {
                    watch_dirs.push(args[i].clone());
                }
            }
        }
        i += 1;
    }

    if watch_dirs.is_empty() {
        println!("[WARN] 未指定监听相册目录！默认监听当前工作目录.");
        watch_dirs.push(".".to_string());
    }

    println!("[INFO] 监听相册目录列表: {:?}", watch_dirs);
    println!("[INFO] 2K 代理分辨率上限: {}px", max_edge);
    println!("[INFO] 守护进程已就绪，按 Ctrl+C 安全退出.\n");

    loop {
        for dir_str in &watch_dirs {
            let p = Path::new(dir_str);
            if !p.is_dir() {
                eprintln!("[WARN] 目录不存在或无法访问: {}", dir_str);
                continue;
            }

            println!("[SCAN] 正在扫描相册目录: {}", dir_str);
            let start = std::time::Instant::now();

            match build_folder_cache(p, max_edge) {
                Ok(catalog) => {
                    let elapsed = start.elapsed();
                    println!(
                        "[SUCCESS] 相册 [{}] 缓存构建完成！共 {} 张照片, 耗时 {:.2?}",
                        dir_str, catalog.photo_count, elapsed
                    );
                }
                Err(e) => {
                    eprintln!("[ERROR] 相册 [{}] 处理跳过/失败: {}", dir_str, e);
                }
            }
        }

        if run_once {
            println!("[INFO] --once 单次执行完毕，进程安全退出.");
            break;
        }

        println!("[SLEEP] 等待下一次周期巡检 ({} 秒后)...", interval_secs);
        tokio::time::sleep(Duration::from_secs(interval_secs)).await;
    }
}
