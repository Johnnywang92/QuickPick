fn main() {
    // 动态探测与链接系统 LibRaw 动态共享库 (LGPL 2.1 / 3.0 合规)
    let explicit_lib_dir = std::env::var("LIBRAW_LIB_DIR").or_else(|_| std::env::var("LIBRAW_DIR"));

    if let Ok(ref dir) = explicit_lib_dir {
        println!("cargo:rustc-link-search=native={}", dir);
        #[cfg(target_os = "macos")]
        println!("cargo:rustc-link-arg=-Wl,-rpath,{}", dir);
    }

    #[cfg(target_os = "macos")]
    {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_default();
        let bundled_frameworks = std::path::Path::new(&manifest_dir).join("Frameworks");
        if bundled_frameworks.exists() {
            println!(
                "cargo:rustc-link-search=native={}",
                bundled_frameworks.display()
            );
        }

        // 1. 本地标准库与 Homebrew 路径搜寻 (兼容 Apple Silicon 与 Intel Mac)
        let search_paths = [
            "/opt/homebrew/lib",
            "/opt/homebrew/opt/little-cms2/lib",
            "/usr/local/lib",
            "/usr/local/opt/little-cms2/lib",
            "/usr/lib",
        ];

        for path in search_paths {
            if std::path::Path::new(path).exists() {
                println!("cargo:rustc-link-search=native={}", path);
            }
        }

        // 2. 动态链接共享库与 C++ 运行时
        println!("cargo:rustc-link-lib=dylib=raw");
        println!("cargo:rustc-link-lib=dylib=c++");

        // 3. Tauri 的 bundle.macOS.frameworks 会为发布包注入 Contents/Frameworks RPATH。
        // Homebrew 目录只用于链接期搜索，不能写入发布二进制的 LC_RPATH。
        println!("cargo:rustc-link-arg=-Wl,-rpath,@loader_path");
    }

    #[cfg(not(target_os = "macos"))]
    {
        let found = if explicit_lib_dir.is_ok() {
            true
        } else {
            pkg_config::Config::new()
                .atleast_version("0.20.0")
                .probe("libraw")
                .is_ok()
        };

        if !found {
            eprintln!("pkg-config libraw failed or not found. Falling back to default dylib=raw");
            println!("cargo:rustc-link-lib=dylib=raw");
        }
    }

    tauri_build::build();
}
