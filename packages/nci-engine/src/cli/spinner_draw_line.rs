const SPINNER_FRAMES: &[char] = &['|', '/', '-', '\\'];

fn truecolor_foreground(fragment: &str, rgb: (u8, u8, u8)) -> String {
    let (r, g, b) = rgb;
    format!("\x1b[38;2;{r};{g};{b}m{fragment}\x1b[0m")
}

pub(super) fn format_tty_spinner_frame(
    frame_index: usize,
    stderr_supports_spinner_color: bool,
    spinner_foreground_rgb: (u8, u8, u8),
) -> String {
    let spinner_character = SPINNER_FRAMES[frame_index % SPINNER_FRAMES.len()];
    if stderr_supports_spinner_color {
        truecolor_foreground(&spinner_character.to_string(), spinner_foreground_rgb)
    } else {
        spinner_character.to_string()
    }
}

#[cfg(test)]
mod spinner_draw_line_tests {
    use super::*;

    #[test]
    fn spinner_frame_plain_is_single_ascii_glyph() {
        let plain_spinner_line = format_tty_spinner_frame(0, false, (0, 0, 0));
        assert_eq!(plain_spinner_line, "|");
    }

    #[test]
    fn spinner_frame_colored_wraps_glyph() {
        let colored_spinner_line = format_tty_spinner_frame(2, true, (90, 60, 240));
        assert!(colored_spinner_line.contains("\x1b[38;2;"));
        assert!(colored_spinner_line.ends_with("\x1b[0m"));
        assert!(colored_spinner_line.contains('-'));
    }
}
