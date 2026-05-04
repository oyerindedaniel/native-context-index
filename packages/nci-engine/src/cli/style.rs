use std::io::{self, IsTerminal, Write};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use super::spinner_draw_line::format_tty_spinner_frame;
use dialoguer::{
    console::{Color, Style, style},
    theme::ColorfulTheme,
};
use supports_color::{Stream, on as supports_color_on};

const CLI_BRAND_LINE: &str = concat!("Native Context Index · v", env!("CARGO_PKG_VERSION"));
const CLI_BANNER_FILLED_LINES: [&str; 6] = [
    "███╗   ██╗ ██████╗██╗",
    "████╗  ██║██╔════╝██║",
    "██╔██╗ ██║██║     ██║",
    "██║╚██╗██║██║     ██║",
    "██║ ╚████║╚██████╗██║",
    "╚═╝  ╚═══╝ ╚═════╝╚═╝",
];
const BANNER_PRIMARY_RGB: (u8, u8, u8) = (0x5A, 0x3C, 0xF0);
const BANNER_DARK_RGB: (u8, u8, u8) = (0x44, 0x29, 0xC6);
const BANNER_LIGHT_RGB: (u8, u8, u8) = (0x7A, 0x63, 0xF5);
/// Gradient applied top-to-bottom to [`CLI_BANNER_FILLED_LINES`] (cycles if line count changes).
const BANNER_LINE_PALETTE: [(u8, u8, u8); 6] = [
    BANNER_DARK_RGB,
    BANNER_PRIMARY_RGB,
    BANNER_LIGHT_RGB,
    BANNER_LIGHT_RGB,
    BANNER_PRIMARY_RGB,
    BANNER_DARK_RGB,
];
const DONE_RGB: (u8, u8, u8) = (0x02, 0x75, 0x82);
const WARN_RGB: (u8, u8, u8) = (0xE8, 0xB9, 0x3A);
const ERROR_RGB: (u8, u8, u8) = (0xE0, 0x5A, 0x5A);
const STEP_TAG: &str = "==>";
const NOTE_TAG: &str = "[~]";
const DONE_TAG: &str = "[ok]";
const WARN_TAG: &str = "[!]";
const ERROR_TAG: &str = "[x]";
const SUMMARY_TAG: &str = "[#]";

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub(crate) enum ProgressTone {
    Step,
    Note,
    Done,
    Warn,
    Error,
    Summary,
}

fn should_color(stream: Stream) -> bool {
    if std::env::var("NO_COLOR").is_ok_and(|value| !value.trim().is_empty()) {
        return false;
    }
    if std::env::var("CLICOLOR").is_ok_and(|value| value.trim() == "0") {
        return false;
    }
    if std::env::var("CLICOLOR_FORCE")
        .is_ok_and(|value| !value.trim().is_empty() && value.trim() != "0")
    {
        return true;
    }
    supports_color_on(stream).is_some()
}

fn colorize_line(line: &str, rgb: (u8, u8, u8)) -> String {
    let (red, green, blue) = rgb;
    format!("\x1b[38;2;{red};{green};{blue}m{line}\x1b[0m")
}

fn progress_tag(tone: ProgressTone) -> &'static str {
    match tone {
        ProgressTone::Step => STEP_TAG,
        ProgressTone::Note => NOTE_TAG,
        ProgressTone::Done => DONE_TAG,
        ProgressTone::Warn => WARN_TAG,
        ProgressTone::Error => ERROR_TAG,
        ProgressTone::Summary => SUMMARY_TAG,
    }
}

fn progress_tag_color(tone: ProgressTone) -> (u8, u8, u8) {
    match tone {
        ProgressTone::Step => BANNER_PRIMARY_RGB,
        ProgressTone::Note => BANNER_LIGHT_RGB,
        ProgressTone::Done => DONE_RGB,
        ProgressTone::Warn => WARN_RGB,
        ProgressTone::Error => ERROR_RGB,
        ProgressTone::Summary => BANNER_DARK_RGB,
    }
}

pub(crate) fn format_elapsed(elapsed: Duration) -> String {
    let elapsed_ms = elapsed.as_millis();
    if elapsed_ms < 1_000 {
        return format!("{elapsed_ms}ms");
    }
    let elapsed_seconds = elapsed.as_secs_f64();
    if elapsed_seconds < 10.0 {
        return format!("{elapsed_seconds:.2}s");
    }
    if elapsed_seconds < 60.0 {
        return format!("{elapsed_seconds:.1}s");
    }
    let whole_minutes = (elapsed_seconds / 60.0).floor() as u64;
    let remainder_seconds = elapsed_seconds - (whole_minutes as f64 * 60.0);
    format!("{whole_minutes}m {remainder_seconds:.1}s")
}

pub(crate) fn emit_progress_line(scope: &str, tone: ProgressTone, message: &str) {
    let tag = if should_color(Stream::Stderr) {
        colorize_line(progress_tag(tone), progress_tag_color(tone))
    } else {
        progress_tag(tone).to_string()
    };
    eprintln!("{tag} {scope}: {message}");
    let _ = io::stderr().flush();
}

pub(crate) struct TtyProgressSpinner {
    stop_flag: Arc<AtomicBool>,
    spinner_thread_join: Option<JoinHandle<()>>,
}

const HIDE_CURSOR: &str = "\x1b[?25l";
const SHOW_CURSOR: &str = "\x1b[?25h";
const ERASE_LINE: &str = "\r\x1b[2K";

impl TtyProgressSpinner {
    pub fn try_start() -> Option<Self> {
        if !io::stderr().is_terminal() {
            return None;
        }
        let stderr_supports_ansi_color = should_color(Stream::Stderr);
        let spinner_foreground_rgb = progress_tag_color(ProgressTone::Step);
        let stop_flag = Arc::new(AtomicBool::new(false));
        let stop_flag_for_thread = Arc::clone(&stop_flag);
        let _ignored = write!(io::stderr(), "{HIDE_CURSOR}");
        let _ignored = io::stderr().flush();
        let spinner_thread_join = thread::spawn(move || {
            let frame_duration = Duration::from_millis(80);
            let mut next_tick = Instant::now() + frame_duration;
            let mut frame_index = 0usize;
            while !stop_flag_for_thread.load(Ordering::Relaxed) {
                let drawable_line = format_tty_spinner_frame(
                    frame_index,
                    stderr_supports_ansi_color,
                    spinner_foreground_rgb,
                );
                let _ignored = write!(io::stderr(), "{ERASE_LINE}{drawable_line}");
                let _ignored = io::stderr().flush();
                frame_index = frame_index.wrapping_add(1);
                let now = Instant::now();
                if next_tick > now {
                    thread::sleep(next_tick - now);
                }
                next_tick += frame_duration;
            }
            let _ignored = write!(io::stderr(), "{ERASE_LINE}");
            let _ignored = io::stderr().flush();
        });
        Some(Self {
            stop_flag,
            spinner_thread_join: Some(spinner_thread_join),
        })
    }

    /// Joins the ticker thread and clears the stderr line (via [`Drop`]).
    pub fn finish(self) {
        drop(self);
    }

    fn stop_and_join_thread(&mut self) {
        self.stop_flag.store(true, Ordering::Relaxed);
        if let Some(join_handle) = self.spinner_thread_join.take() {
            let _ignored = join_handle.join();
        }
        let _ignored = write!(io::stderr(), "{ERASE_LINE}{SHOW_CURSOR}");
        let _ignored = io::stderr().flush();
    }
}

impl Drop for TtyProgressSpinner {
    fn drop(&mut self) {
        self.stop_and_join_thread();
    }
}

pub(crate) fn emit_ui_line_stdout(tone: ProgressTone, scope: &str, message: &str) {
    let tag = if should_color(Stream::Stdout) {
        colorize_line(progress_tag(tone), progress_tag_color(tone))
    } else {
        progress_tag(tone).to_string()
    };
    println!("{tag} {scope}: {message}");
}

pub(crate) fn init_prompt_theme() -> ColorfulTheme {
    let success_prefix_text = if should_color(Stream::Stdout) && io::stdout().is_terminal() {
        colorize_line(DONE_TAG, DONE_RGB)
    } else {
        DONE_TAG.to_string()
    };
    ColorfulTheme {
        prompt_prefix: style("[]".to_string()).dim(),
        success_prefix: style(success_prefix_text),
        // Nearest 6×6×6 xterm-256 slot for accent `#027582` (`console::Color` has no RGB in this dependency graph).
        values_style: Style::new().fg(Color::Color256(31)),
        ..ColorfulTheme::default()
    }
}

pub(crate) fn print_banner() {
    if should_color(Stream::Stdout) && io::stdout().is_terminal() {
        for (line_index, banner_line) in CLI_BANNER_FILLED_LINES.iter().enumerate() {
            let palette_rgb = BANNER_LINE_PALETTE[line_index % BANNER_LINE_PALETTE.len()];
            println!("{}", colorize_line(banner_line, palette_rgb));
        }
        println!("{}", colorize_line(CLI_BRAND_LINE, BANNER_PRIMARY_RGB));
        return;
    }

    for banner_line in CLI_BANNER_FILLED_LINES {
        println!("{banner_line}");
    }
    println!("{CLI_BRAND_LINE}");
}
