fn main() {
    // 动态探测与链接系统 LibRaw 动态共享库 (LGPL 合规)
    #[cfg(target_os = "macos")]
    {
        // macOS 下动态链接 libraw 与系统的 libc++
        println!("cargo:rustc-link-search=native=/opt/homebrew/lib");
        println!("cargo:rustc-link-search=native=/opt/homebrew/opt/little-cms2/lib");
        println!("cargo:rustc-link-search=native=/usr/local/lib");
        println!("cargo:rustc-link-lib=dylib=raw");
        println!("cargo:rustc-link-lib=dylib=c++");
        println!("cargo:rustc-link-arg=-Wl,-rpath,/opt/homebrew/lib");
    }

    #[cfg(not(target_os = "macos"))]
    {
        if let Err(e) = pkg_config::Config::new().atleast_version("0.20.0").probe("libraw") {
            eprintln!("pkg-config libraw failed: {}. Falling back to default dylib=raw", e);
            println!("cargo:rustc-link-lib=dylib=raw");
        }
    }

    tauri_build::build();
}
