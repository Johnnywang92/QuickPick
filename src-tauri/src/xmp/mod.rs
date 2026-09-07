use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use quick_xml::events::Event;
use quick_xml::Reader;
use sha2::{Digest, Sha256};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockMetadata {
    pub client_id: String,
    pub token: String,
    pub timestamp_sec: u64,
    pub lease_ms: u64,
}

#[derive(Debug, Clone, Default)]
pub struct XmpData {
    pub rating: u8,
    pub label: String,
    pub pick_status: String, // "Pick", "Reject", "None"
    pub retouch_status: String, // "clean", "fixable", "fatal", "pending"
    pub defect_tags: String, // comma-separated defect tags
    pub burst_group_id: String,
    pub rev: u64,
    pub content_hash: String,
    /// 读取时完整文档的 SHA-256；仅用于并发冲突检测，不写入 XMP。
    pub source_hash: String,
}

#[derive(Debug, Clone, Copy)]
pub struct XmpUpdate<'a> {
    pub rating: u8,
    pub label: &'a str,
    pub pick_status: &'a str,
    pub client_id: &'a str,
    pub retouch_status: Option<&'a str>,
    pub defect_tags: Option<&'a str>,
    pub burst_group_id: Option<&'a str>,
    /// 完整 XMP 文件在扫描时的 SHA-256。传入后可阻止覆盖外部修改。
    pub expected_source_hash: Option<&'a str>,
    /// 仅供用户明确选择“保留本地结果”或兼容旧接口时绕过基线检查。
    pub force: bool,
}

const LOCK_LEASE_MS: u64 = 8_000;

struct LockGuard {
    path: PathBuf,
    token: String,
}

impl Drop for LockGuard {
    fn drop(&mut self) {
        let owns_lock = fs::read_to_string(&self.path)
            .ok()
            .and_then(|content| serde_json::from_str::<LockMetadata>(&content).ok())
            .is_some_and(|metadata| metadata.token == self.token);
        if owns_lock {
            let _ = fs::remove_file(&self.path);
        }
    }
}

/// 获取同级 XMP 伴侣文件路径: photo.ARW -> photo.xmp
pub fn get_xmp_path<P: AsRef<Path>>(photo_path: P) -> PathBuf {
    let mut xmp_path = photo_path.as_ref().to_path_buf();
    xmp_path.set_extension("xmp");
    xmp_path
}

/// 获取哨兵锁文件路径: photo.xmp -> .photo.xmp.lock
pub fn get_lock_path<P: AsRef<Path>>(xmp_path: P) -> PathBuf {
    let p = xmp_path.as_ref();
    let file_name = p.file_name().unwrap_or_default().to_string_lossy();
    p.with_file_name(format!(".{}.lock", file_name))
}

fn get_lock_coordinator_path(lock_path: &Path) -> PathBuf {
    lock_path.with_extension("lock.coordinator")
}

fn unix_time_sec() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn lock_is_reclaimable(lock_path: &Path, now_sec: u64) -> bool {
    if let Ok(content) = fs::read_to_string(lock_path) {
        if let Ok(metadata) = serde_json::from_str::<LockMetadata>(&content) {
            let lease_sec = metadata.lease_ms.div_ceil(1_000).max(8);
            return now_sec >= metadata.timestamp_sec.saturating_add(lease_sec);
        }
    }

    // 写到一半或内容损坏的锁只在足够陈旧后接管，避免把正在创建的锁当成坏锁。
    fs::metadata(lock_path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| SystemTime::now().duration_since(modified).ok())
        .is_some_and(|age| age.as_millis() >= u128::from(LOCK_LEASE_MS))
}

fn create_owned_lock(lock_path: &Path, metadata: &LockMetadata) -> Result<LockGuard, String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(lock_path)
        .map_err(|error| error.to_string())?;
    let json = serde_json::to_string(metadata).map_err(|error| error.to_string())?;
    if let Err(error) = file.write_all(json.as_bytes()).and_then(|_| file.sync_all()) {
        let _ = fs::remove_file(lock_path);
        return Err(error.to_string());
    }
    Ok(LockGuard {
        path: lock_path.to_path_buf(),
        token: metadata.token.clone(),
    })
}

fn try_acquire_owned_lock(
    lock_path: &Path,
    metadata: &LockMetadata,
) -> Result<Option<LockGuard>, String> {
    // 所有新客户端在检查与接管哨兵锁时先持有短期 OS 文件锁。进程崩溃后
    // 操作系统会自动释放它，避免“删除超时锁”与“创建新锁”之间的竞态窗口。
    let coordinator = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(get_lock_coordinator_path(lock_path))
        .map_err(|error| format!("打开锁协调文件失败: {error}"))?;
    coordinator
        .lock()
        .map_err(|error| format!("获取锁协调权失败: {error}"))?;

    if lock_path.exists() {
        if !lock_is_reclaimable(lock_path, unix_time_sec()) {
            return Ok(None);
        }
        fs::remove_file(lock_path)
            .map_err(|remove_error| format!("清理超时锁失败: {remove_error}"))?;
    }
    create_owned_lock(lock_path, metadata)
        .map(Some)
        .map_err(|error| format!("创建 XMP 锁失败: {error}"))
}

/// 计算数据 SHA-256 前 20 位 Hex
pub fn calculate_content_hash(rating: u8, label: &str, pick_status: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("{}:{}:{}", rating, label, pick_status).as_bytes());
    let result = hasher.finalize();
    format!("{:x}", result)[..20].to_string()
}

/// 计算完整 XMP 文档的 SHA-256，用作扫描基线和写前冲突比较。
pub fn calculate_document_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn validate_xml(content: &str) -> Result<(), String> {
    let mut reader = Reader::from_str(content);
    loop {
        match reader.read_event() {
            Ok(Event::Eof) => return Ok(()),
            Ok(_) => {}
            Err(error) => return Err(format!("XMP XML 无效，已拒绝覆盖: {error}")),
        }
    }
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn xml_unescape(value: &str) -> String {
    value
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

fn extract_element(content: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = content.find(&open)? + open.len();
    let end = content[start..].find(&close)? + start;
    Some(xml_unescape(content[start..end].trim()))
}

fn extract_attribute(content: &str, attribute: &str) -> Option<String> {
    let mut search_from = 0;
    while let Some(relative_start) = content[search_from..].find(attribute) {
        let start = search_from + relative_start;
        let before_ok = start == 0
            || content.as_bytes()[start - 1].is_ascii_whitespace()
            || content.as_bytes()[start - 1] == b'<';
        let mut cursor = start + attribute.len();
        while cursor < content.len() && content.as_bytes()[cursor].is_ascii_whitespace() {
            cursor += 1;
        }
        if before_ok && content.as_bytes().get(cursor) == Some(&b'=') {
            cursor += 1;
            while cursor < content.len() && content.as_bytes()[cursor].is_ascii_whitespace() {
                cursor += 1;
            }
            let quote = *content.as_bytes().get(cursor)?;
            if quote == b'\'' || quote == b'"' {
                let value_start = cursor + 1;
                let value_end = content[value_start..]
                    .find(quote as char)
                    .map(|offset| value_start + offset)?;
                return Some(xml_unescape(&content[value_start..value_end]));
            }
        }
        search_from = start + attribute.len();
    }
    None
}

fn read_field(content: &str, name: &str) -> Option<String> {
    extract_element(content, name).or_else(|| extract_attribute(content, name))
}

fn replace_attribute(content: &mut String, attribute: &str, value: &str) -> bool {
    let mut search_from = 0;
    while let Some(relative_start) = content[search_from..].find(attribute) {
        let start = search_from + relative_start;
        let before_ok = start == 0
            || content.as_bytes()[start - 1].is_ascii_whitespace()
            || content.as_bytes()[start - 1] == b'<';
        let mut cursor = start + attribute.len();
        while cursor < content.len() && content.as_bytes()[cursor].is_ascii_whitespace() {
            cursor += 1;
        }
        if before_ok && content.as_bytes().get(cursor) == Some(&b'=') {
            cursor += 1;
            while cursor < content.len() && content.as_bytes()[cursor].is_ascii_whitespace() {
                cursor += 1;
            }
            let quote = match content.as_bytes().get(cursor) {
                Some(b'\'') => '\'',
                Some(b'"') => '"',
                _ => {
                    search_from = start + attribute.len();
                    continue;
                }
            };
            let value_start = cursor + 1;
            if let Some(relative_end) = content[value_start..].find(quote) {
                let value_end = value_start + relative_end;
                content.replace_range(value_start..value_end, &xml_escape(value));
                return true;
            }
        }
        search_from = start + attribute.len();
    }
    false
}

fn replace_element(content: &mut String, tag: &str, value: &str) -> bool {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let Some(start) = content.find(&open).map(|index| index + open.len()) else {
        return false;
    };
    let Some(end) = content[start..].find(&close).map(|index| start + index) else {
        return false;
    };
    content.replace_range(start..end, &xml_escape(value));
    true
}

fn ensure_description_container(content: &mut String) -> Result<(), String> {
    if content.contains("</rdf:Description>") {
        return Ok(());
    }

    let start = content
        .find("<rdf:Description")
        .ok_or_else(|| "XMP 中缺少 rdf:Description，已拒绝覆盖".to_string())?;
    let end = content[start..]
        .find('>')
        .map(|offset| start + offset)
        .ok_or_else(|| "XMP rdf:Description 未闭合，已拒绝覆盖".to_string())?;
    let opening = &content[start..=end];
    if !opening.trim_end().ends_with("/>") {
        return Err("XMP rdf:Description 缺少结束标签，已拒绝覆盖".to_string());
    }

    let slash = content[start..end]
        .rfind('/')
        .map(|offset| start + offset)
        .ok_or_else(|| "XMP rdf:Description 无法展开".to_string())?;
    content.remove(slash);
    content.insert_str(end, "</rdf:Description>");
    Ok(())
}

fn ensure_quickpick_namespace(content: &mut String) -> Result<(), String> {
    let start = content
        .find("<rdf:Description")
        .ok_or_else(|| "XMP 中缺少 rdf:Description，已拒绝覆盖".to_string())?;
    let end = content[start..]
        .find('>')
        .map(|offset| start + offset)
        .ok_or_else(|| "XMP rdf:Description 未闭合，已拒绝覆盖".to_string())?;
    if !content[start..end].contains("xmlns:quickpick=") {
        content.insert_str(end, " xmlns:quickpick=\"http://quickpick.local/ns/1.0/\"");
    }
    Ok(())
}

fn upsert_field(content: &mut String, tag: &str, value: &str) -> Result<(), String> {
    let attribute_updated = replace_attribute(content, tag, value);
    let element_updated = replace_element(content, tag, value);
    if attribute_updated || element_updated {
        return Ok(());
    }

    let insertion_point = content
        .find("</rdf:Description>")
        .ok_or_else(|| "XMP 中缺少 rdf:Description 结束标签，已拒绝覆盖".to_string())?;
    content.insert_str(
        insertion_point,
        &format!("\n   <{tag}>{}</{tag}>", xml_escape(value)),
    );
    Ok(())
}

fn merge_xmp_content(original: &str, data: &XmpData) -> Result<String, String> {
    validate_xml(original)?;
    let mut merged = original.to_string();
    ensure_description_container(&mut merged)?;
    ensure_quickpick_namespace(&mut merged)?;

    for (tag, value) in [
        ("xmp:Rating", data.rating.to_string()),
        ("xmp:Label", data.label.clone()),
        ("quickpick:pickStatus", data.pick_status.clone()),
        ("quickpick:retouchStatus", data.retouch_status.clone()),
        ("quickpick:defectTags", data.defect_tags.clone()),
        ("quickpick:burstGroupId", data.burst_group_id.clone()),
        ("quickpick:rev", data.rev.to_string()),
        ("quickpick:contentHash", data.content_hash.clone()),
    ] {
        upsert_field(&mut merged, tag, &value)?;
    }

    validate_xml(&merged)?;
    Ok(merged)
}

/// 读取并解析 XMP 文件中的评分、色标与 AI 诊断标记
pub fn read_xmp<P: AsRef<Path>>(xmp_path: P) -> Option<XmpData> {
    let path = xmp_path.as_ref();
    if !path.exists() {
        return None;
    }

    let mut content = String::new();
    if File::open(path).and_then(|mut f| f.read_to_string(&mut content)).is_err() {
        return None;
    }

    let mut data = XmpData::default();

    if let Some(value) = read_field(&content, "xmp:Rating") {
        if let Ok(rating) = value.parse::<u8>() {
            data.rating = rating.min(5);
        }
    }

    data.label = read_field(&content, "xmp:Label").unwrap_or_default();
    data.pick_status = read_field(&content, "quickpick:pickStatus").unwrap_or_default();
    data.retouch_status = read_field(&content, "quickpick:retouchStatus").unwrap_or_default();
    data.defect_tags = read_field(&content, "quickpick:defectTags").unwrap_or_default();
    data.burst_group_id = read_field(&content, "quickpick:burstGroupId").unwrap_or_default();
    data.rev = read_field(&content, "quickpick:rev")
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or_default();

    data.content_hash = calculate_content_hash(data.rating, &data.label, &data.pick_status);
    data.source_hash = calculate_document_hash(&content);
    Some(data)
}

/// 生成 Adobe 兼容的标准 XMP RDF XML (含 QuickPick 智能诊断标签)
pub fn generate_xmp_content(data: &XmpData) -> String {
    format!(
        r#"<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:quickpick="http://quickpick.local/ns/1.0/">
   <xmp:Rating>{}</xmp:Rating>
   <xmp:Label>{}</xmp:Label>
   <quickpick:pickStatus>{}</quickpick:pickStatus>
   <quickpick:retouchStatus>{}</quickpick:retouchStatus>
   <quickpick:defectTags>{}</quickpick:defectTags>
   <quickpick:burstGroupId>{}</quickpick:burstGroupId>
   <quickpick:rev>{}</quickpick:rev>
   <quickpick:contentHash>{}</quickpick:contentHash>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>"#,
        data.rating,
        data.label,
        data.pick_status,
        data.retouch_status,
        data.defect_tags,
        data.burst_group_id,
        data.rev,
        data.content_hash
    )
}

/// 带租约哨兵锁保护的原子 XMP 写入 (兼容基础接口)
pub fn write_xmp_atomic<P: AsRef<Path>>(
    photo_path: P,
    rating: u8,
    label: &str,
    pick_status: &str,
    client_id: &str,
) -> Result<String, String> {
    write_xmp_atomic_full(photo_path, XmpUpdate {
        rating,
        label,
        pick_status,
        client_id,
        retouch_status: None,
        defect_tags: None,
        burst_group_id: None,
        expected_source_hash: None,
        force: true,
    })
}

/// 带租约哨兵锁保护的原子 XMP 全量写入 (含 AI 诊断字段)
pub fn write_xmp_atomic_full<P: AsRef<Path>>(
    photo_path: P,
    update: XmpUpdate<'_>,
) -> Result<String, String> {
    let xmp_path = get_xmp_path(&photo_path);
    let lock_path = get_lock_path(&xmp_path);
    let token = uuid::Uuid::new_v4().to_string();

    let lock_meta = LockMetadata {
        client_id: update.client_id.to_string(),
        token: token.clone(),
        timestamp_sec: unix_time_sec(),
        lease_ms: LOCK_LEASE_MS,
    };

    // 1. 在短期 OS 协调锁内检查并原子创建哨兵锁。
    let mut guard = None;
    for _ in 0..3 {
        guard = try_acquire_owned_lock(&lock_path, &lock_meta)?;
        if guard.is_some() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(40));
    }

    let _guard = if let Some(guard) = guard {
        guard
    } else {
        return Err("获取文件锁超时，另一客户端正在修改或网络延迟".to_string());
    };

    // 2. 锁内重读完整文档，比较扫描基线并合并字段。
    let original_content = if xmp_path.exists() {
        let content = fs::read_to_string(&xmp_path)
            .map_err(|error| format!("读取现有 XMP 失败，已拒绝覆盖: {error}"))?;
        validate_xml(&content)?;
        if let Some(expected_hash) = update.expected_source_hash {
            let disk_hash = calculate_document_hash(&content);
            if !update.force && disk_hash != expected_hash {
                return Err("XMP_CONFLICT:XMP 已被其他应用修改，请选择处理方式".to_string());
            }
        } else if !update.force {
            return Err("XMP_CONFLICT:XMP 在扫描后由其他应用创建，请选择处理方式".to_string());
        }
        Some(content)
    } else {
        if !update.force && update.expected_source_hash.is_some() {
            return Err("XMP_CONFLICT:XMP 在扫描后被删除，请选择处理方式".to_string());
        }
        None
    };

    let prev_data = read_xmp(&xmp_path).unwrap_or_default();
    let new_data = XmpData {
        rating: update.rating,
        label: update.label.to_string(),
        pick_status: update.pick_status.to_string(),
        retouch_status: update.retouch_status
            .map(|s| s.to_string())
            .unwrap_or(prev_data.retouch_status),
        defect_tags: update.defect_tags
            .map(|s| s.to_string())
            .unwrap_or(prev_data.defect_tags),
        burst_group_id: update.burst_group_id
            .map(|s| s.to_string())
            .unwrap_or(prev_data.burst_group_id),
        rev: prev_data.rev + 1,
        content_hash: calculate_content_hash(update.rating, update.label, update.pick_status),
        source_hash: String::new(),
    };

    let xml_content = match &original_content {
        Some(content) => merge_xmp_content(content, &new_data)?,
        None => generate_xmp_content(&new_data),
    };
    validate_xml(&xml_content)?;

    // 首次接管外部 XMP 时保留一次可恢复原件。
    if original_content.is_some() {
        let backup_path = xmp_path.with_extension("xmp.quickpick-backup");
        if !backup_path.exists() {
            fs::copy(&xmp_path, &backup_path)
                .map_err(|error| format!("创建 XMP 安全备份失败，已取消写入: {error}"))?;
        }
    }

    // 3. 使用 Token 隔离临时文件，避免异常恢复时互相覆盖。
    let tmp_path = xmp_path.with_extension(format!("xmp.{token}.tmp"));
    {
        let mut tmp_file = File::create(&tmp_path).map_err(|e| e.to_string())?;
        tmp_file.write_all(xml_content.as_bytes()).map_err(|e| e.to_string())?;
        tmp_file.sync_all().map_err(|e| e.to_string())?;
    }

    // 4. 防僵尸检测并原子替换
    let owns_lock = fs::read_to_string(&lock_path)
        .ok()
        .and_then(|content| serde_json::from_str::<LockMetadata>(&content).ok())
        .is_some_and(|metadata| metadata.token == token);
    if !owns_lock {
        let _ = fs::remove_file(&tmp_path);
        return Err("租约丢失或锁文件损坏，操作已取消".to_string());
    }

    fs::rename(&tmp_path, &xmp_path).map_err(|e| e.to_string())?;
    Ok(calculate_document_hash(&xml_content))
}

/// 将发生冲突时的本地选择写入唯一副本，不修改当前标准 XMP。
pub fn write_xmp_conflict_copy_full<P: AsRef<Path>>(
    photo_path: P,
    update: XmpUpdate<'_>,
) -> Result<String, String> {
    let xmp_path = get_xmp_path(photo_path);
    let original_content = if xmp_path.exists() {
        let content = fs::read_to_string(&xmp_path)
            .map_err(|error| format!("读取冲突 XMP 失败: {error}"))?;
        validate_xml(&content)?;
        Some(content)
    } else {
        None
    };
    let previous = read_xmp(&xmp_path).unwrap_or_default();
    let data = XmpData {
        rating: update.rating,
        label: update.label.to_string(),
        pick_status: update.pick_status.to_string(),
        retouch_status: update
            .retouch_status
            .map(str::to_string)
            .unwrap_or(previous.retouch_status),
        defect_tags: update
            .defect_tags
            .map(str::to_string)
            .unwrap_or(previous.defect_tags),
        burst_group_id: update
            .burst_group_id
            .map(str::to_string)
            .unwrap_or(previous.burst_group_id),
        rev: previous.rev + 1,
        content_hash: calculate_content_hash(update.rating, update.label, update.pick_status),
        source_hash: String::new(),
    };
    let content = match original_content {
        Some(original) => merge_xmp_content(&original, &data)?,
        None => generate_xmp_content(&data),
    };
    validate_xml(&content)?;

    let parent = xmp_path
        .parent()
        .ok_or_else(|| "无法确定 XMP 副本目录".to_string())?;
    let stem = xmp_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("photo");
    let token = uuid::Uuid::new_v4().simple().to_string();
    let destination = parent.join(format!("{stem}.quickpick-local-{}.xmp", &token[..8]));
    let temporary = parent.join(format!(".{stem}.quickpick-local-{token}.tmp"));
    let write_result = (|| -> Result<(), String> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| format!("创建 XMP 副本临时文件失败: {error}"))?;
        file.write_all(content.as_bytes())
            .and_then(|_| file.sync_all())
            .map_err(|error| format!("写入 XMP 副本失败: {error}"))?;
        fs::rename(&temporary, &destination)
            .map_err(|error| format!("提交 XMP 副本失败: {error}"))?;
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    write_result?;
    Ok(destination.to_string_lossy().to_string())
}

#[cfg(test)]
mod lock_tests {
    use super::*;
    use std::sync::{Arc, Barrier};

    fn temp_photo(name: &str) -> (PathBuf, PathBuf) {
        let directory = std::env::temp_dir().join(format!(
            "quickpick_xmp_{name}_{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&directory).unwrap();
        let photo = directory.join("frame.ARW");
        fs::write(&photo, b"raw").unwrap();
        (directory, photo)
    }

    #[test]
    fn stale_lock_is_safely_reclaimed_after_resume() {
        let (directory, photo) = temp_photo("stale_lock");
        let lock_path = get_lock_path(get_xmp_path(&photo));
        let stale = LockMetadata {
            client_id: "crashed-client".to_string(),
            token: "stale-token".to_string(),
            timestamp_sec: 1,
            lease_ms: LOCK_LEASE_MS,
        };
        fs::write(&lock_path, serde_json::to_vec(&stale).unwrap()).unwrap();

        write_xmp_atomic(&photo, 5, "Green", "Pick", "recovery-client").unwrap();

        assert!(!lock_path.exists());
        assert_eq!(read_xmp(get_xmp_path(&photo)).unwrap().rating, 5);
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn recent_malformed_lock_is_not_reclaimed() {
        let (directory, photo) = temp_photo("malformed_lock");
        let lock_path = get_lock_path(get_xmp_path(&photo));
        fs::write(&lock_path, b"incomplete lock metadata").unwrap();

        let result = write_xmp_atomic(&photo, 5, "Green", "Pick", "waiting-client");

        assert!(result.is_err());
        assert!(lock_path.exists());
        assert!(!get_xmp_path(&photo).exists());
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn lock_guard_never_deletes_another_owners_lock() {
        let (directory, photo) = temp_photo("lock_owner");
        let lock_path = get_lock_path(get_xmp_path(&photo));
        let replacement = LockMetadata {
            client_id: "new-client".to_string(),
            token: "new-token".to_string(),
            timestamp_sec: unix_time_sec(),
            lease_ms: LOCK_LEASE_MS,
        };
        fs::write(&lock_path, serde_json::to_vec(&replacement).unwrap()).unwrap();

        let guard = LockGuard {
            path: lock_path.clone(),
            token: "old-token".to_string(),
        };
        drop(guard);

        assert!(lock_path.exists());
        let remaining: LockMetadata =
            serde_json::from_slice(&fs::read(&lock_path).unwrap()).unwrap();
        assert_eq!(remaining.token, "new-token");
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn concurrent_clients_cannot_silently_overwrite_each_other() {
        let (directory, photo) = temp_photo("concurrent");
        write_xmp_atomic(&photo, 1, "", "None", "seed-client").unwrap();
        let baseline = read_xmp(get_xmp_path(&photo)).unwrap().source_hash;
        let barrier = Arc::new(Barrier::new(3));

        let handles: Vec<_> = [(5, "Green", "Pick"), (2, "Red", "Reject")]
            .into_iter()
            .map(|(rating, label, pick_status)| {
                let photo = photo.clone();
                let baseline = baseline.clone();
                let barrier = Arc::clone(&barrier);
                std::thread::spawn(move || {
                    barrier.wait();
                    write_xmp_atomic_full(
                        photo,
                        XmpUpdate {
                            rating,
                            label,
                            pick_status,
                            client_id: label,
                            retouch_status: None,
                            defect_tags: None,
                            burst_group_id: None,
                            expected_source_hash: Some(&baseline),
                            force: false,
                        },
                    )
                })
            })
            .collect();
        barrier.wait();

        let results: Vec<_> = handles
            .into_iter()
            .map(|handle| handle.join().unwrap())
            .collect();
        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert_eq!(results.iter().filter(|result| result.is_err()).count(), 1);

        let xmp_path = get_xmp_path(&photo);
        let content = fs::read_to_string(&xmp_path).unwrap();
        validate_xml(&content).unwrap();
        assert!(!get_lock_path(&xmp_path).exists());
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn conflict_copy_keeps_standard_xmp_untouched() {
        let (directory, photo) = temp_photo("conflict_copy");
        write_xmp_atomic(&photo, 2, "Blue", "None", "external-client").unwrap();
        let xmp_path = get_xmp_path(&photo);
        let original = fs::read_to_string(&xmp_path).unwrap();

        let copy_path = write_xmp_conflict_copy_full(
            &photo,
            XmpUpdate {
                rating: 5,
                label: "Green",
                pick_status: "Pick",
                client_id: "local-client",
                retouch_status: Some("clean"),
                defect_tags: Some("clean_prime"),
                burst_group_id: None,
                expected_source_hash: None,
                force: false,
            },
        )
        .unwrap();

        assert_eq!(fs::read_to_string(&xmp_path).unwrap(), original);
        let copy = read_xmp(copy_path).unwrap();
        assert_eq!(copy.rating, 5);
        assert_eq!(copy.pick_status, "Pick");
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn xmp_created_after_scan_requires_explicit_overwrite() {
        let (directory, photo) = temp_photo("created_after_scan");
        write_xmp_atomic(&photo, 2, "Blue", "None", "external-client").unwrap();

        let update = |force| XmpUpdate {
            rating: 5,
            label: "Green",
            pick_status: "Pick",
            client_id: "local-client",
            retouch_status: None,
            defect_tags: None,
            burst_group_id: None,
            expected_source_hash: None,
            force,
        };
        let conflict = write_xmp_atomic_full(&photo, update(false));
        assert!(conflict
            .unwrap_err()
            .contains("XMP_CONFLICT:"));
        assert_eq!(read_xmp(get_xmp_path(&photo)).unwrap().rating, 2);

        write_xmp_atomic_full(&photo, update(true)).unwrap();
        assert_eq!(read_xmp(get_xmp_path(&photo)).unwrap().rating, 5);
        let _ = fs::remove_dir_all(directory);
    }
}
