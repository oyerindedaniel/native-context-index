use std::io::{self, IsTerminal, Write};
use std::time::Duration;

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
    let minutes = (elapsed_seconds / 60.0).floor() as u64;
    let seconds = elapsed_seconds - (minutes as f64 * 60.0);
    format!("{minutes}m {seconds:.1}s")
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
        let palette = [
            BANNER_DARK_RGB,
            BANNER_PRIMARY_RGB,
            BANNER_LIGHT_RGB,
            BANNER_LIGHT_RGB,
            BANNER_PRIMARY_RGB,
            BANNER_DARK_RGB,
        ];
        for (line, color) in CLI_BANNER_FILLED_LINES.iter().zip(palette.iter()) {
            println!("{}", colorize_line(line, *color));
        }
        println!("{}", colorize_line(CLI_BRAND_LINE, BANNER_PRIMARY_RGB));
        return;
    }

    for line in CLI_BANNER_FILLED_LINES {
        println!("{line}");
    }
    println!("{CLI_BRAND_LINE}");
}
