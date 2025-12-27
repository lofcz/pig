#![cfg(windows)]

use crossbeam_channel::Sender;
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use std::ptr::null_mut;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, INVALID_HANDLE_VALUE};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, ReadDirectoryChangesW, FILE_ACTION_ADDED, FILE_ACTION_MODIFIED,
    FILE_ACTION_REMOVED, FILE_ACTION_RENAMED_NEW_NAME, FILE_ACTION_RENAMED_OLD_NAME,
    FILE_FLAG_BACKUP_SEMANTICS, FILE_LIST_DIRECTORY, FILE_NOTIFY_CHANGE_CREATION,
    FILE_NOTIFY_CHANGE_DIR_NAME, FILE_NOTIFY_CHANGE_FILE_NAME, FILE_NOTIFY_CHANGE_LAST_WRITE,
    FILE_NOTIFY_CHANGE_SIZE, FILE_NOTIFY_INFORMATION, FILE_SHARE_DELETE, FILE_SHARE_READ,
    FILE_SHARE_WRITE, OPEN_EXISTING
};

const BUFFER_SIZE: usize = 8192;

#[derive(Debug, Clone)]
pub enum WatchEventKind {
    Create,
    Remove,
    Modify,
    Rename,
}

#[derive(Debug, Clone)]
pub struct WatchEvent {
    pub path: String,
    pub kind: WatchEventKind,
}

pub struct WinWatcher {
    stop_flag: Arc<AtomicBool>,
    thread_handle: Option<JoinHandle<()>>,
}

unsafe impl Send for WinWatcher {}
unsafe impl Sync for WinWatcher {}

impl WinWatcher {
    pub fn new<P: AsRef<Path>>(
        path: P,
        recursive: bool,
        event_sender: Sender<WatchEvent>,
    ) -> Result<Self, String> {
        let path_str = path.as_ref().to_string_lossy().to_string();
        let stop_flag = Arc::new(AtomicBool::new(false));
        let stop_flag_clone = stop_flag.clone();

        let thread_handle = thread::spawn(move || {
            Self::watch_thread(path_str, recursive, event_sender, stop_flag_clone);
        });

        Ok(WinWatcher {
            stop_flag,
            thread_handle: Some(thread_handle),
        })
    }

    fn watch_thread(
        path: String,
        recursive: bool,
        event_sender: Sender<WatchEvent>,
        stop_flag: Arc<AtomicBool>,
    ) {
        let wide_path: Vec<u16> = OsStr::new(&path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            let dir_handle = CreateFileW(
                wide_path.as_ptr(),
                FILE_LIST_DIRECTORY,
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                null_mut(),
                OPEN_EXISTING,
                FILE_FLAG_BACKUP_SEMANTICS,
                null_mut(),
            );

            if dir_handle == INVALID_HANDLE_VALUE {
                eprintln!(
                    "WinWatcher: Failed to open directory: error {}",
                    GetLastError()
                );
                return;
            }

            let mut buffer: Vec<u8> = vec![0u8; BUFFER_SIZE];

            println!("WinWatcher: Starting watch loop on {}", path);
            
            // Main watch loop
            while !stop_flag.load(Ordering::Relaxed) {
                let mut bytes_returned: u32 = 0;

                // Blocking call - will wait until changes occur
                let result = ReadDirectoryChangesW(
                    dir_handle,
                    buffer.as_mut_ptr() as *mut _,
                    BUFFER_SIZE as u32,
                    if recursive { 1 } else { 0 },
                    FILE_NOTIFY_CHANGE_FILE_NAME
                        | FILE_NOTIFY_CHANGE_DIR_NAME
                        | FILE_NOTIFY_CHANGE_SIZE
                        | FILE_NOTIFY_CHANGE_LAST_WRITE
                        | FILE_NOTIFY_CHANGE_CREATION,
                    &mut bytes_returned,
                    null_mut(), // No OVERLAPPED - blocking
                    None,
                );

                if result == 0 {
                    let err = GetLastError();
                    // Error 995 = operation aborted (expected on shutdown)
                    if err != 995 {
                        eprintln!("WinWatcher: ReadDirectoryChangesW failed: {}", err);
                    }
                    break;
                }

                if bytes_returned == 0 {
                    continue;
                }

                // Process changes
                let mut offset: usize = 0;
                loop {
                    let info = &*(buffer.as_ptr().add(offset) as *const FILE_NOTIFY_INFORMATION);

                    // Extract filename
                    let filename_len = info.FileNameLength as usize / 2;
                    let filename_ptr = info.FileName.as_ptr();
                    let filename_slice = std::slice::from_raw_parts(filename_ptr, filename_len);
                    let filename = String::from_utf16_lossy(filename_slice);

                    // Build full path
                    let full_path = if path.ends_with('\\') || path.ends_with('/') {
                        format!("{}{}", path, filename)
                    } else {
                        format!("{}\\{}", path, filename)
                    };

                    let kind = match info.Action {
                        FILE_ACTION_ADDED => WatchEventKind::Create,
                        FILE_ACTION_REMOVED => WatchEventKind::Remove,
                        FILE_ACTION_RENAMED_OLD_NAME => WatchEventKind::Rename,
                        FILE_ACTION_RENAMED_NEW_NAME => WatchEventKind::Rename,
                        FILE_ACTION_MODIFIED => WatchEventKind::Modify,
                        _ => WatchEventKind::Modify,
                    };

                    println!("WinWatcher: Event detected - {} ({:?})", full_path, kind);
                    let _ = event_sender.send(WatchEvent {
                        path: full_path.clone(),
                        kind,
                    });

                    if info.NextEntryOffset == 0 {
                        break;
                    }
                    offset += info.NextEntryOffset as usize;
                }
            }

            CloseHandle(dir_handle);
        }
    }

    pub fn stop(&mut self) {
        self.stop_flag.store(true, Ordering::Relaxed);
        if let Some(handle) = self.thread_handle.take() {
            drop(handle);
        }
    }
}

impl Drop for WinWatcher {
    fn drop(&mut self) {
        self.stop();
    }
}
